/**
 * Health Check Manager
 * 
 * Monitors camera health and reports to main backend:
 * - Stream status (ONLINE/OFFLINE/ERROR)
 * - FFmpeg process health
 * - Periodic health reports
 * - HTTP callback to main backend
 * 
 * Architecture: Reports to main backend, never polls RTSP directly
 */

import { logInfo, logWarn, logError, logDebug } from '../utils/logger.js';
import { getStreamHealth, getActiveCameras, getStream, getAllStreamHealth } from '../streams/rtsp.manager.js';

// Main backend health callback URL
const HEALTH_CALLBACK_URL = process.env.HEALTH_CALLBACK_URL || process.env.MAIN_BACKEND_URL 
  ? `${process.env.MAIN_BACKEND_URL}/api/cctv/health-callback`
  : null;

// Gateway secret for health callbacks (optional, for additional security)
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || null;

// Health check interval (milliseconds)
const HEALTH_CHECK_INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10);

/**
 * Get health status for all cameras
 * 
 * @returns {Array<Object>}
 */
export const getAllCameraHealth = () => {
  const cameras = getActiveCameras();
  const healthStatus = [];

  for (const cameraId of cameras) {
    const stream = getStream(cameraId);
    const health = getStreamHealth(cameraId);

    healthStatus.push({
      cameraId,
      status: health?.status || 'UNKNOWN',
      message: health?.message || 'No health data',
      lastSeen: health?.lastSeen?.toISOString() || null,
      streamStatus: stream?.status || 'STOPPED',
      viewerCount: stream?.viewerCount || 0,
      uptime: stream?.startedAt ? Date.now() - stream.startedAt.getTime() : 0
    });
  }

  // Also include cameras that are registered but not currently streaming
  const allHealth = getAllStreamHealth();
  for (const health of allHealth) {
    if (!healthStatus.find(h => h.cameraId === health.cameraId)) {
      healthStatus.push({
        cameraId: health.cameraId,
        status: health.status,
        message: health.message,
        lastSeen: health.lastSeen?.toISOString() || null,
        streamStatus: 'STOPPED',
        viewerCount: 0,
        uptime: 0
      });
    }
  }

  return healthStatus;
};

/**
 * Report health to main backend (if callback URL configured)
 * 
 * @param {Array<Object>} healthStatus - Health status array
 */
const reportHealthToBackend = async (healthStatus) => {
  if (!HEALTH_CALLBACK_URL) {
    logDebug('Health', 'Health callback URL not configured, skipping report');
    return; // No callback configured
  }

  try {
    // Prepare request body
    const requestBody = {
      cameras: healthStatus.map(h => ({
        cameraId: h.cameraId,
        status: h.status,
        message: h.message || `${h.status} - ${h.streamStatus}`,
        lastSeen: h.lastSeen
      }))
    };

    // Prepare headers
    const headers = {
      'Content-Type': 'application/json'
    };

    // Add gateway secret if configured
    if (GATEWAY_SECRET) {
      headers['X-Gateway-Secret'] = GATEWAY_SECRET;
    }

    // In a real implementation, you'd use fetch or axios
    // For now, we log the request that would be made
    logDebug('Health', 'Reporting health to main backend', {
      callbackUrl: HEALTH_CALLBACK_URL,
      cameraCount: healthStatus.length,
      cameras: healthStatus.map(h => ({ cameraId: h.cameraId, status: h.status }))
    });

    // Example fetch implementation (uncomment when ready):
    /*
    const response = await fetch(HEALTH_CALLBACK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Health callback failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    logDebug('Health', 'Health callback successful', {
      updated: result.updated,
      errors: result.errors
    });
    */

  } catch (error) {
    logError('Health', 'Failed to report health to backend', {
      error: error.message,
      callbackUrl: HEALTH_CALLBACK_URL
    });
  }
};

/**
 * Initialize health check monitoring
 */
export const initializeHealthCheck = () => {
  logInfo('Health', 'Health check manager initialized', {
    interval: HEALTH_CHECK_INTERVAL,
    callbackUrl: HEALTH_CALLBACK_URL || 'none',
    gatewaySecret: GATEWAY_SECRET ? 'configured' : 'not configured'
  });

  // Periodic health check
  setInterval(() => {
    const healthStatus = getAllCameraHealth();
    
    logDebug('Health', 'Health check completed', {
      cameraCount: healthStatus.length,
      online: healthStatus.filter(h => h.status === 'ONLINE').length,
      offline: healthStatus.filter(h => h.status === 'OFFLINE').length,
      error: healthStatus.filter(h => h.status === 'ERROR').length
    });

    // Report to main backend if configured
    reportHealthToBackend(healthStatus);

  }, HEALTH_CHECK_INTERVAL);
};
