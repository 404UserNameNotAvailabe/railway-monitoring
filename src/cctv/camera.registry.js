/**
 * Camera Registry
 * 
 * Maintains registry of all CCTV cameras.
 * Stores camera metadata and status.
 * RTSP URLs are stored securely and never exposed to clients.
 * 
 * Architecture: In-memory, Redis-ready
 */

import { logInfo, logWarn, logError, logDebug } from '../utils/logger.js';

// Camera registry: Map<cameraId, cameraConfig>
const cameras = new Map();

/**
 * Camera configuration
 * @typedef {Object} CameraConfig
 * @property {string} cameraId - Unique camera identifier
 * @property {string} rtspUrl - RTSP URL (e.g., rtsp://user:pass@ip:port/stream)
 * @property {string} location - Camera location description
 * @property {boolean} enabled - Whether camera is enabled
 * @property {Date} registeredAt - When camera was registered
 * @property {string} status - 'ONLINE' | 'OFFLINE' | 'ERROR' (updated by gateway)
 * @property {Date} lastStatusUpdate - Last time status was updated
 */

/**
 * Register a camera
 * 
 * @param {Object} config - Camera configuration
 * @param {string} config.cameraId - Unique camera identifier
 * @param {string} config.rtspUrl - RTSP URL
 * @param {string} config.location - Location description
 * @param {boolean} config.enabled - Whether enabled (default: true)
 * @returns {Object} Registered camera data (without RTSP URL)
 */
export const registerCamera = (config) => {
  if (!config.cameraId || !config.rtspUrl) {
    throw new Error('cameraId and rtspUrl are required');
  }

  // Validate RTSP URL format
  if (!config.rtspUrl.startsWith('rtsp://')) {
    throw new Error('rtspUrl must start with rtsp://');
  }

  // Check if camera already exists
  if (cameras.has(config.cameraId)) {
    throw new Error(`Camera ${config.cameraId} already registered`);
  }

  const cameraData = {
    cameraId: config.cameraId,
    rtspUrl: config.rtspUrl, // Stored securely, never exposed
    location: config.location || 'Unknown',
    enabled: config.enabled !== false, // Default to enabled
    registeredAt: new Date(),
    status: 'OFFLINE', // Will be updated by gateway health reports
    lastStatusUpdate: new Date()
  };

  cameras.set(config.cameraId, cameraData);

  logInfo('CameraRegistry', 'Camera registered', {
    cameraId: config.cameraId,
    location: config.location,
    enabled: cameraData.enabled
  });

  // Return camera data without RTSP URL (security)
  return {
    cameraId: cameraData.cameraId,
    location: cameraData.location,
    enabled: cameraData.enabled,
    registeredAt: cameraData.registeredAt,
    status: cameraData.status
  };
};

/**
 * Get camera by ID (without RTSP URL)
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {Object|null} Camera config (without RTSP URL for security)
 */
export const getCamera = (cameraId) => {
  if (!cameraId) {
    return null;
  }

  const camera = cameras.get(cameraId);
  if (!camera) {
    return null;
  }

  // Return camera data without RTSP URL (security)
  return {
    cameraId: camera.cameraId,
    location: camera.location,
    enabled: camera.enabled,
    registeredAt: camera.registeredAt,
    status: camera.status,
    lastStatusUpdate: camera.lastStatusUpdate
  };
};

/**
 * Get all cameras (without RTSP URLs)
 * 
 * @param {boolean} enabledOnly - If true, return only enabled cameras
 * @returns {Array<Object>} Array of camera configs
 */
export const getAllCameras = (enabledOnly = false) => {
  const allCameras = Array.from(cameras.values()).map(camera => ({
    cameraId: camera.cameraId,
    location: camera.location,
    enabled: camera.enabled,
    registeredAt: camera.registeredAt,
    status: camera.status,
    lastStatusUpdate: camera.lastStatusUpdate
  }));

  if (enabledOnly) {
    return allCameras.filter(camera => camera.enabled);
  }

  return allCameras;
};

/**
 * Get enabled cameras only
 * 
 * @returns {Array<Object>} Array of enabled camera configs
 */
export const getEnabledCameras = () => {
  return getAllCameras(true);
};

/**
 * Get RTSP URL for a camera (INTERNAL USE ONLY - never expose to clients)
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {string|null} RTSP URL or null if not found
 */
export const getRTSPUrl = (cameraId) => {
  const camera = cameras.get(cameraId);
  return camera ? camera.rtspUrl : null;
};

/**
 * Update camera status (called by gateway health reports)
 * 
 * @param {string} cameraId - Camera identifier
 * @param {string} status - 'ONLINE' | 'OFFLINE' | 'ERROR'
 * @returns {boolean} True if updated, false if camera not found
 */
export const updateCameraStatus = (cameraId, status) => {
  if (!cameraId || !status) {
    return false;
  }

  const validStatuses = ['ONLINE', 'OFFLINE', 'ERROR'];
  if (!validStatuses.includes(status)) {
    logWarn('CameraRegistry', 'Invalid status', { cameraId, status });
    return false;
  }

  const camera = cameras.get(cameraId);
  if (!camera) {
    logWarn('CameraRegistry', 'Camera not found for status update', { cameraId });
    return false;
  }

  const previousStatus = camera.status;
  camera.status = status;
  camera.lastStatusUpdate = new Date();

  logDebug('CameraRegistry', 'Camera status updated', {
    cameraId,
    previousStatus,
    newStatus: status
  });

  return true;
};

/**
 * Enable/disable a camera
 * 
 * @param {string} cameraId - Camera identifier
 * @param {boolean} enabled - Whether to enable
 * @returns {boolean} True if updated, false if camera not found
 */
export const setCameraEnabled = (cameraId, enabled) => {
  const camera = cameras.get(cameraId);
  if (!camera) {
    return false;
  }

  camera.enabled = enabled;
  logInfo('CameraRegistry', 'Camera enabled/disabled', { cameraId, enabled });
  return true;
};

/**
 * Remove a camera
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {boolean} True if removed, false if not found
 */
export const removeCamera = (cameraId) => {
  const existed = cameras.delete(cameraId);
  if (existed) {
    logInfo('CameraRegistry', 'Camera removed', { cameraId });
  }
  return existed;
};

/**
 * Check if camera exists
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {boolean}
 */
export const hasCamera = (cameraId) => {
  return cameras.has(cameraId);
};

/**
 * Check if camera is enabled
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {boolean}
 */
export const isCameraEnabled = (cameraId) => {
  const camera = cameras.get(cameraId);
  return camera ? camera.enabled : false;
};

/**
 * Get camera count
 * 
 * @returns {Object} { total, enabled, online, offline, error }
 */
export const getCameraStats = () => {
  const all = Array.from(cameras.values());
  return {
    total: all.length,
    enabled: all.filter(c => c.enabled).length,
    online: all.filter(c => c.status === 'ONLINE').length,
    offline: all.filter(c => c.status === 'OFFLINE').length,
    error: all.filter(c => c.status === 'ERROR').length
  };
};
