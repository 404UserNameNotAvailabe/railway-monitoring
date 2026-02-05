/**
 * Stream Token Validation
 * 
 * Validates short-lived stream tokens issued by main backend.
 * Tokens contain cameraId, expiry, and permissions.
 * 
 * Architecture: NO shared state with main backend
 * - Validates token signature only
 * - Checks expiry
 * - Returns cameraId and permissions
 * - Prevents token reuse (replay protection)
 */

import jwt from 'jsonwebtoken';
import { logInfo, logWarn, logError } from '../utils/logger.js';

// JWT secret - MUST match main backend's JWT_SECRET or STREAM_TOKEN_SECRET
const JWT_SECRET = process.env.JWT_SECRET || process.env.STREAM_TOKEN_SECRET || 'demo-secret-key-change-in-production';

// Track used tokens to prevent reuse (in-memory, cleared on expiry)
// In production, use Redis with TTL
const usedTokens = new Map();

// Cleanup used tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of usedTokens.entries()) {
    if (expiresAt < now) {
      usedTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

/**
 * Validate stream token
 * 
 * @param {string} token - JWT token from main backend
 * @returns {Object} { valid: boolean, cameraId?: string, expiresAt?: Date, permissions?: string[], error?: string }
 */
export const validateStreamToken = (token) => {
  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      error: 'Token required'
    };
  }

  // Check if token was already used (prevent replay)
  if (usedTokens.has(token)) {
    logWarn('StreamToken', 'Token reuse detected', { token: token.substring(0, 20) + '...' });
    return {
      valid: false,
      error: 'Token already used'
    };
  }

  try {
    // Verify token signature and decode
    const decoded = jwt.verify(token, JWT_SECRET);

    // Validate required fields
    if (!decoded.cameraId) {
      return {
        valid: false,
        error: 'Token missing cameraId'
      };
    }

    if (!decoded.expiresAt) {
      return {
        valid: false,
        error: 'Token missing expiresAt'
      };
    }

    // Check expiry
    const expiresAt = new Date(decoded.expiresAt);
    const now = new Date();
    
    if (expiresAt < now) {
      logWarn('StreamToken', 'Token expired', {
        cameraId: decoded.cameraId,
        expiresAt: expiresAt.toISOString()
      });
      return {
        valid: false,
        error: 'Token expired',
        cameraId: decoded.cameraId,
        expiresAt
      };
    }

    // Mark token as used (prevent reuse)
    usedTokens.set(token, expiresAt.getTime());

    // Extract permissions (default to VIEW if not specified)
    const permissions = decoded.permissions || ['VIEW'];

    logInfo('StreamToken', 'Token validated successfully', {
      cameraId: decoded.cameraId,
      expiresAt: expiresAt.toISOString(),
      permissions
    });

    return {
      valid: true,
      cameraId: decoded.cameraId,
      expiresAt,
      permissions
    };

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      logWarn('StreamToken', 'Invalid token signature', { error: error.message });
      return {
        valid: false,
        error: 'Invalid token signature'
      };
    }
    if (error.name === 'TokenExpiredError') {
      logWarn('StreamToken', 'Token expired', { error: error.message });
      return {
        valid: false,
        error: 'Token expired'
      };
    }
    
    logError('StreamToken', 'Token validation error', { error: error.message });
    return {
      valid: false,
      error: 'Token validation failed'
    };
  }
};

/**
 * Check if token has required permission
 * 
 * @param {Object} validationResult - Result from validateStreamToken
 * @param {string} permission - Required permission (e.g., 'VIEW')
 * @returns {boolean}
 */
export const hasPermission = (validationResult, permission) => {
  if (!validationResult.valid) {
    return false;
  }
  return validationResult.permissions?.includes(permission) || false;
};
