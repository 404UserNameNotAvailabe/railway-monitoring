/**
 * WebRTC Session Handler
 * 
 * Handles WebRTC connections for CCTV streams:
 * - One-way video only (no audio, no data channel)
 * - Low latency streaming
 * - Token-based authorization
 * - Automatic cleanup on disconnect
 * - Stream forwarding from FFmpeg to WebRTC
 * 
 * Architecture: View-only, no camera control
 */

import { WebSocketServer } from 'ws';
import { logInfo, logWarn, logError, logDebug } from '../utils/logger.js';
import { validateStreamToken, hasPermission } from '../auth/stream.token.js';
import { getStream, addViewer, removeViewer, startStream } from '../streams/rtsp.manager.js';

// WebSocket server for WebRTC signaling
let wss = null;

// Active WebRTC sessions: Map<sessionId, sessionInfo>
const activeSessions = new Map();

/**
 * Session information
 * @typedef {Object} SessionInfo
 * @property {string} sessionId - Unique session identifier
 * @property {string} cameraId - Camera identifier
 * @property {Object} ws - WebSocket connection
 * @property {Date} connectedAt - Connection timestamp
 * @property {Date} lastActivity - Last activity timestamp
 */

/**
 * Initialize WebRTC handler
 * 
 * @param {Object} httpServer - HTTP server instance
 */
export const initializeWebRTC = (httpServer) => {
  wss = new WebSocketServer({
    server: httpServer,
    path: '/webrtc',
    verifyClient: (info, callback) => {
      // Extract token from query string
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        logWarn('WebRTC', 'WebSocket connection rejected: No token', {
          ip: info.req.socket.remoteAddress
        });
        return callback(false, 401, 'Token required');
      }

      // Validate token
      const validation = validateStreamToken(token);
      
      if (!validation.valid) {
        logWarn('WebRTC', 'WebSocket connection rejected: Invalid token', {
          ip: info.req.socket.remoteAddress,
          error: validation.error
        });
        return callback(false, 401, validation.error || 'Invalid token');
      }

      if (!hasPermission(validation, 'VIEW')) {
        logWarn('WebRTC', 'WebSocket connection rejected: No VIEW permission', {
          ip: info.req.socket.remoteAddress,
          cameraId: validation.cameraId
        });
        return callback(false, 403, 'No VIEW permission');
      }

      // Attach validation result to request for later use
      info.req.tokenValidation = validation;
      
      logDebug('WebRTC', 'WebSocket connection authorized', {
        cameraId: validation.cameraId,
        ip: info.req.socket.remoteAddress
      });

      callback(true);
    }
  });

  wss.on('connection', (ws, req) => {
    const validation = req.tokenValidation;
    const cameraId = validation.cameraId;
    const sessionId = `${cameraId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    logInfo('WebRTC', 'WebSocket connection established', {
      sessionId,
      cameraId,
      ip: req.socket.remoteAddress
    });

    // Ensure stream is running for this camera
    let streamInfo = getStream(cameraId);
    
    if (!streamInfo || streamInfo.status !== 'RUNNING') {
      logInfo('WebRTC', 'Starting stream for camera', { cameraId });
      startStream(cameraId)
        .then(stream => {
          streamInfo = stream;
          try {
            addViewer(cameraId);
          } catch (err) {
            logError('WebRTC', 'Failed to add viewer', { cameraId, error: err.message });
            ws.close(1011, err.message);
            return;
          }
        })
        .catch(err => {
          logError('WebRTC', 'Failed to start stream', { cameraId, error: err.message });
          ws.close(1011, 'Failed to start camera stream');
          return;
        });
    } else {
      try {
        addViewer(cameraId);
      } catch (err) {
        logError('WebRTC', 'Failed to add viewer', { cameraId, error: err.message });
        ws.close(1011, err.message);
        return;
      }
    }

    // Create session info
    const sessionInfo = {
      sessionId,
      cameraId,
      ws,
      connectedAt: new Date(),
      lastActivity: new Date()
    };

    activeSessions.set(sessionId, sessionInfo);

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      sessionId,
      cameraId,
      timestamp: new Date().toISOString()
    }));

    // Handle WebSocket messages
    ws.on('message', (message) => {
      try {
        sessionInfo.lastActivity = new Date();
        
        const data = JSON.parse(message.toString());
        logDebug('WebRTC', 'WebSocket message received', {
          sessionId,
          cameraId,
          type: data.type
        });

        // Handle WebRTC signaling messages
        // Note: This is a simplified example
        // In production, you'd implement full WebRTC offer/answer/ICE candidate handling
        // For now, we just acknowledge and track activity
        
        if (data.type === 'ping') {
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
        }

        // Add more WebRTC signaling handlers as needed
        // This would typically include:
        // - offer/answer exchange
        // - ICE candidate exchange
        // - Stream data forwarding from FFmpeg to WebRTC peer connection
        // 
        // Example structure:
        // if (data.type === 'offer') {
        //   // Handle WebRTC offer
        //   // Create answer
        //   // Send answer back
        // }
        // if (data.type === 'ice-candidate') {
        //   // Handle ICE candidate
        //   // Forward to peer connection
        // }

      } catch (error) {
        logError('WebRTC', 'Error handling WebSocket message', {
          sessionId,
          cameraId,
          error: error.message
        });
      }
    });

    // Handle WebSocket close
    ws.on('close', (code, reason) => {
      logInfo('WebRTC', 'WebSocket connection closed', {
        sessionId,
        cameraId,
        code,
        reason: reason.toString()
      });

      // Remove viewer
      removeViewer(cameraId);

      // Remove session
      activeSessions.delete(sessionId);
    });

    // Handle WebSocket errors
    ws.on('error', (error) => {
      logError('WebRTC', 'WebSocket error', {
        sessionId,
        cameraId,
        error: error.message
      });

      removeViewer(cameraId);
      activeSessions.delete(sessionId);
    });
  });

  logInfo('WebRTC', 'WebRTC handler initialized', {
    path: '/webrtc'
  });
};

/**
 * Get active WebRTC sessions
 * 
 * @returns {Array<Object>}
 */
export const getActiveSessions = () => {
  return Array.from(activeSessions.values());
};

/**
 * Get session count for a camera
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {number}
 */
export const getSessionCount = (cameraId) => {
  return Array.from(activeSessions.values())
    .filter(session => session.cameraId === cameraId)
    .length;
};

/**
 * Close all sessions for a camera
 * 
 * @param {string} cameraId - Camera identifier
 */
export const closeSessionsForCamera = (cameraId) => {
  const sessionsToClose = Array.from(activeSessions.values())
    .filter(session => session.cameraId === cameraId);

  for (const session of sessionsToClose) {
    session.ws.close(1000, 'Camera stream stopped');
    activeSessions.delete(session.sessionId);
    removeViewer(cameraId);
  }

  logInfo('WebRTC', 'Closed sessions for camera', {
    cameraId,
    count: sessionsToClose.length
  });
};
