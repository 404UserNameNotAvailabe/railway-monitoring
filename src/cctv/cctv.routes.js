/**
 * CCTV API Routes
 * 
 * Handles camera listing, stream token generation, and health callbacks.
 * Only MONITOR role can access cameras.
 * 
 * Architecture: Control-plane only, no video processing
 */

import express from 'express';
import { logInfo, logWarn, logError, logDebug } from '../utils/logger.js';
import { getAllCameras, getEnabledCameras, registerCamera, getCamera, updateCameraStatus } from './camera.registry.js';
import { generateStreamToken, validateCameraAccess } from './camera.access.js';
import { ROLES } from '../auth/auth.middleware.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// JWT secret for token verification
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-key-change-in-production';

// Gateway secret for health callbacks (optional, for additional security)
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || null;

/**
 * Middleware to authenticate requests
 * Extracts and validates JWT token from Authorization header
 */
const authenticateRequest = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header required (Bearer token)'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        clientId: decoded.clientId,
        role: decoded.role
      };
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired'
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
  } catch (error) {
    logError('CCTV', 'Authentication error', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Middleware to check MONITOR role
 */
const requireMonitor = (req, res, next) => {
  if (req.user.role !== ROLES.MONITOR) {
    return res.status(403).json({
      success: false,
      error: 'Only MONITOR role can access cameras'
    });
  }
  next();
};

/**
 * Middleware to validate gateway secret (for health callbacks)
 */
const validateGatewaySecret = (req, res, next) => {
  if (!GATEWAY_SECRET) {
    // Gateway secret not configured, skip validation
    return next();
  }

  const providedSecret = req.headers['x-gateway-secret'] || req.body.secret;
  if (providedSecret !== GATEWAY_SECRET) {
    logWarn('CCTV', 'Invalid gateway secret', { ip: req.ip });
    return res.status(401).json({
      success: false,
      error: 'Invalid gateway secret'
    });
  }
  next();
};

/**
 * GET /api/cctv/cameras
 * 
 * List all cameras (MONITOR only)
 * Returns camera metadata without RTSP URLs (security)
 */
router.get('/cameras', authenticateRequest, requireMonitor, (req, res) => {
  try {
    const { enabled } = req.query;
    
    let cameras;
    if (enabled === 'true') {
      cameras = getEnabledCameras();
    } else {
      cameras = getAllCameras();
    }

    logInfo('CCTV', 'Cameras list requested', {
      monitorId: req.user.clientId,
      count: cameras.length,
      enabledOnly: enabled === 'true'
    });

    res.json({
      success: true,
      cameras,
      count: cameras.length
    });
  } catch (error) {
    logError('CCTV', 'Failed to list cameras', {
      error: error.message,
      monitorId: req.user?.clientId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to list cameras'
    });
  }
});

/**
 * GET /api/cctv/cameras/:cameraId
 * 
 * Get specific camera details (MONITOR only)
 */
router.get('/cameras/:cameraId', authenticateRequest, requireMonitor, (req, res) => {
  try {
    const { cameraId } = req.params;
    const camera = getCamera(cameraId);

    if (!camera) {
      return res.status(404).json({
        success: false,
        error: `Camera ${cameraId} not found`
      });
    }

    logInfo('CCTV', 'Camera details requested', {
      monitorId: req.user.clientId,
      cameraId
    });

    res.json({
      success: true,
      camera
    });
  } catch (error) {
    logError('CCTV', 'Failed to get camera', {
      error: error.message,
      cameraId: req.params.cameraId,
      monitorId: req.user?.clientId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get camera'
    });
  }
});

/**
 * POST /api/cctv/stream-token
 * 
 * Generate a short-lived stream token for camera access (MONITOR only)
 * 
 * Request Body:
 * {
 *   "cameraId": "CCTV_01"
 * }
 */
router.post('/stream-token', authenticateRequest, requireMonitor, (req, res) => {
  try {
    const { cameraId } = req.body;

    if (!cameraId) {
      return res.status(400).json({
        success: false,
        error: 'cameraId is required'
      });
    }

    // Validate access
    const access = validateCameraAccess(cameraId, req.user.role);
    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        error: access.error
      });
    }

    // Generate stream token
    const tokenData = generateStreamToken(cameraId, req.user.clientId);

    logInfo('CCTV', 'Stream token generated', {
      monitorId: req.user.clientId,
      cameraId,
      expiresAt: tokenData.expiresAt.toISOString()
    });

    res.json({
      success: true,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt.toISOString(),
      cameraId: tokenData.cameraId
    });
  } catch (error) {
    logError('CCTV', 'Failed to generate stream token', {
      error: error.message,
      cameraId: req.body?.cameraId,
      monitorId: req.user?.clientId
    });
    
    if (error.message.includes('not found') || error.message.includes('disabled')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to generate stream token'
    });
  }
});

/**
 * POST /api/cctv/health-callback
 * 
 * Health callback endpoint for CCTV Gateway to report camera status
 * This endpoint receives health updates from the gateway and updates camera status
 * 
 * Request Body:
 * {
 *   "cameras": [
 *     {
 *       "cameraId": "CCTV_01",
 *       "status": "ONLINE",
 *       "message": "Stream running normally"
 *     }
 *   ]
 * }
 */
router.post('/health-callback', validateGatewaySecret, (req, res) => {
  try {
    const { cameras } = req.body;

    if (!cameras || !Array.isArray(cameras)) {
      return res.status(400).json({
        success: false,
        error: 'cameras array is required'
      });
    }

    let updated = 0;
    let errors = 0;

    for (const cameraHealth of cameras) {
      const { cameraId, status } = cameraHealth;

      if (!cameraId || !status) {
        logWarn('CCTV', 'Invalid health report', { cameraHealth });
        errors++;
        continue;
      }

      const success = updateCameraStatus(cameraId, status);
      if (success) {
        updated++;
        logDebug('CCTV', 'Camera status updated from gateway', {
          cameraId,
          status,
          message: cameraHealth.message
        });
      } else {
        errors++;
        logWarn('CCTV', 'Failed to update camera status', { cameraId, status });
      }
    }

    logInfo('CCTV', 'Health callback processed', {
      total: cameras.length,
      updated,
      errors
    });

    res.json({
      success: true,
      updated,
      errors,
      total: cameras.length
    });
  } catch (error) {
    logError('CCTV', 'Health callback error', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: 'Failed to process health callback'
    });
  }
});

/**
 * POST /api/cctv/cameras (Admin - for camera registration)
 * 
 * Register a new camera
 * Note: In production, this should be protected with admin role
 */
router.post('/cameras', authenticateRequest, (req, res) => {
  try {
    const { cameraId, rtspUrl, location, enabled } = req.body;

    if (!cameraId || !rtspUrl) {
      return res.status(400).json({
        success: false,
        error: 'cameraId and rtspUrl are required'
      });
    }

    // Register camera
    const camera = registerCamera({
      cameraId,
      rtspUrl,
      location: location || 'Unknown',
      enabled: enabled !== false
    });

    logInfo('CCTV', 'Camera registered', {
      registeredBy: req.user.clientId,
      cameraId,
      location: camera.location
    });

    res.status(201).json({
      success: true,
      camera: {
        cameraId: camera.cameraId,
        location: camera.location,
        enabled: camera.enabled,
        status: camera.status
      }
    });
  } catch (error) {
    logError('CCTV', 'Failed to register camera', {
      error: error.message,
      cameraId: req.body?.cameraId,
      registeredBy: req.user?.clientId
    });

    if (error.message.includes('required') || error.message.includes('rtsp://') || error.message.includes('already')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to register camera'
    });
  }
});

export default router;
