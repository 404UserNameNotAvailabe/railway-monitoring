/**
 * CCTV Stream Gateway Server
 * 
 * Separate service that:
 * - Pulls CCTV feeds via RTSP
 * - Converts to WebRTC (primary) or HLS (fallback)
 * - Serves video streams to MONITOR clients
 * 
 * Architecture:
 * - NO Socket.IO (uses WebSocket directly for WebRTC)
 * - NO shared state with main backend
 * - Communicates via signed tokens only
 * - View-only, no camera control
 * - Railway-grade reliability
 */

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { logInfo, logWarn, logError } from './utils/logger.js';
import { validateStreamToken } from './auth/stream.token.js';
import { initializeWebRTC } from './webrtc/webrtc.session.js';
import { initializeHLS } from './hls/hls.manager.js';
import { initializeRTSP, getActiveCameras, getActiveStreams, registerCamera, getCameraRegistry } from './streams/rtsp.manager.js';
import { initializeHealthCheck } from './health/health.check.js';

const app = express();
const server = createServer(app);

// Configure CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  const activeCameras = getActiveCameras();
  const activeStreams = getActiveStreams();
  
  res.json({
    status: 'OK',
    activeCameras: activeCameras.length,
    activeStreams: activeStreams.length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'cctv-stream-gateway'
  });
});

// Stream token validation endpoint (for health checks from main backend)
app.post('/validate-token', (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({
      valid: false,
      error: 'Token required'
    });
  }
  
  const validation = validateStreamToken(token);
  
  res.json({
    valid: validation.valid,
    cameraId: validation.cameraId,
    expiresAt: validation.expiresAt,
    error: validation.error
  });
});

// Camera registration endpoint (for main backend to register cameras)
// In production, this should be secured with gateway secret
app.post('/register-camera', (req, res) => {
  try {
    const { cameraId, rtspUrl, location, enabled } = req.body;

    if (!cameraId || !rtspUrl) {
      return res.status(400).json({
        success: false,
        error: 'cameraId and rtspUrl are required'
      });
    }

    registerCamera({
      cameraId,
      rtspUrl,
      location: location || 'Unknown',
      enabled: enabled !== false
    });

    logInfo('Gateway', 'Camera registered', { cameraId, location });

    res.json({
      success: true,
      cameraId,
      message: 'Camera registered successfully'
    });
  } catch (error) {
    logError('Gateway', 'Failed to register camera', {
      error: error.message,
      cameraId: req.body?.cameraId
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List registered cameras (for debugging/admin)
app.get('/cameras', (req, res) => {
  const registry = getCameraRegistry();
  const cameras = Array.from(registry.values()).map(camera => ({
    cameraId: camera.cameraId,
    location: camera.location,
    enabled: camera.enabled
    // RTSP URL intentionally excluded for security
  }));

  res.json({
    success: true,
    cameras,
    count: cameras.length
  });
});

// Initialize services
logInfo('Gateway', 'Initializing CCTV Stream Gateway...');

// Initialize RTSP manager (must be first - manages camera streams)
initializeRTSP(server);

// Initialize WebRTC handler
initializeWebRTC(server);

// Initialize HLS fallback
initializeHLS(server);

// Initialize health monitoring
initializeHealthCheck();

const PORT = process.env.CCTV_GATEWAY_PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || process.env.STREAM_TOKEN_SECRET || 'demo-secret-key-change-in-production';

// Validate JWT_SECRET is set
if (!process.env.JWT_SECRET && !process.env.STREAM_TOKEN_SECRET) {
  logWarn('Gateway', 'JWT_SECRET not set, using default (NOT FOR PRODUCTION)');
}

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   CCTV Stream Gateway (Separate Service)                  ║
║   Port: ${PORT}                                                  ║
║                                                           ║
║   Architecture:                                           ║
║   • RTSP → WebRTC/HLS conversion                         ║
║   • Token-based authorization                            ║
║   • View-only, no camera control                         ║
║   • NO video through main backend                        ║
║                                                           ║
║   Features:                                               ║
║   • Auto-reconnect on RTSP failure                       ║
║   • Health monitoring                                    ║
║   • Rate limiting                                        ║
║   • Graceful shutdown                                    ║
╚═══════════════════════════════════════════════════════════╝
  `);
  logInfo('Gateway', 'CCTV Stream Gateway started successfully', { 
    port: PORT,
    healthCheck: `http://localhost:${PORT}/health`,
    webrtcPath: `ws://localhost:${PORT}/webrtc`
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logInfo('Gateway', 'SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logInfo('Gateway', 'Gateway closed successfully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logInfo('Gateway', 'SIGINT received, shutting down gracefully...');
  server.close(() => {
    logInfo('Gateway', 'Gateway closed successfully');
    process.exit(0);
  });
});

// Log unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  logError('Gateway', 'Unhandled promise rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logError('Gateway', 'Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});
