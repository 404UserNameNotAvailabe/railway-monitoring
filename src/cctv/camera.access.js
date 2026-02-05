/**
 * Camera Access Control
 * 
 * Handles authorization and stream token generation for CCTV camera access.
 * Only MONITOR role can request stream tokens.
 * Tokens are short-lived, camera-specific, and single-use.
 * 
 * Architecture: Token-based, time-limited access
 */

import jwt from 'jsonwebtoken';
import { logInfo, logWarn, logError } from '../utils/logger.js';
import { getCamera, isCameraEnabled } from './camera.registry.js';
import { ROLES } from '../auth/auth.middleware.js';

// JWT secret - must match CCTV gateway's secret
const JWT_SECRET = process.env.JWT_SECRET || process.env.STREAM_TOKEN_SECRET || 'demo-secret-key-change-in-production';

// Stream token expiry (seconds) - configurable, default 60 seconds
const STREAM_TOKEN_TTL = parseInt(process.env.STREAM_TOKEN_TTL || '60', 10);

/**
 * Generate a stream token for camera access
 * 
 * @param {string} cameraId - Camera identifier
 * @param {string} monitorId - Monitor identifier (for logging/audit)
 * @returns {Object} { token: string, expiresAt: Date, cameraId: string }
 * @throws {Error} If camera not found or disabled
 */
export const generateStreamToken = (cameraId, monitorId) => {
  // Validate camera exists
  const camera = getCamera(cameraId);
  if (!camera) {
    throw new Error(`Camera ${cameraId} not found`);
  }

  // Validate camera is enabled
  if (!isCameraEnabled(cameraId)) {
    throw new Error(`Camera ${cameraId} is disabled`);
  }

  // Create token payload
  const now = new Date();
  const expiresAt = new Date(now.getTime() + STREAM_TOKEN_TTL * 1000);
  
  const payload = {
    cameraId,
    expiresAt: expiresAt.toISOString(),
    permissions: ['VIEW'], // View-only access (no PTZ, no control)
    issuedAt: now.toISOString(),
    monitorId, // For audit logging (optional)
    iat: Math.floor(now.getTime() / 1000) // JWT standard claim
  };

  // Sign token with expiry
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: STREAM_TOKEN_TTL
  });

  logInfo('CameraAccess', 'Stream token generated', {
    cameraId,
    monitorId,
    expiresAt: expiresAt.toISOString(),
    ttl: STREAM_TOKEN_TTL
  });

  return {
    token,
    expiresAt,
    cameraId
  };
};

/**
 * Validate monitor access to a camera
 * 
 * @param {string} cameraId - Camera identifier
 * @param {string} role - Client role (must be MONITOR)
 * @returns {Object} { allowed: boolean, error?: string }
 */
export const validateCameraAccess = (cameraId, role) => {
  // Only MONITOR can access cameras
  if (role !== ROLES.MONITOR) {
    return {
      allowed: false,
      error: 'Only MONITOR role can access cameras'
    };
  }

  // Check camera exists
  const camera = getCamera(cameraId);
  if (!camera) {
    return {
      allowed: false,
      error: `Camera ${cameraId} not found`
    };
  }

  // Check camera is enabled
  if (!isCameraEnabled(cameraId)) {
    return {
      allowed: false,
      error: `Camera ${cameraId} is disabled`
    };
  }

  return {
    allowed: true
  };
};

/**
 * Get stream token TTL
 * 
 * @returns {number} Token TTL in seconds
 */
export const getStreamTokenTTL = () => {
  return STREAM_TOKEN_TTL;
};
