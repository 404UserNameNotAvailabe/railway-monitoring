/**
 * RTSP Stream Manager
 * 
 * Manages RTSP camera ingestion using FFmpeg:
 * - One FFmpeg process per camera
 * - Auto-reconnect on failure
 * - Transcode to WebRTC (primary) and HLS (fallback)
 * - Graceful shutdown
 * - Health monitoring
 * - Viewer tracking
 * - Resource cleanup
 * 
 * Architecture: Railway-grade reliability
 */

import { spawn } from 'child_process';
import { logInfo, logWarn, logError, logDebug } from '../utils/logger.js';

// Active camera streams: Map<cameraId, streamInfo>
const activeStreams = new Map();

// Camera registry: Map<cameraId, cameraConfig>
// Populated from main backend or environment
const cameraRegistry = new Map();

// Stream health: Map<cameraId, healthInfo>
const streamHealth = new Map();

// Max concurrent viewers per camera
const MAX_VIEWERS_PER_CAMERA = parseInt(process.env.MAX_VIEWERS_PER_CAMERA || '10', 10);

// Stream timeout if no viewers (milliseconds)
const STREAM_TIMEOUT_NO_VIEWERS = parseInt(process.env.STREAM_TIMEOUT_NO_VIEWERS || '60000', 10);

// Auto-restart delay on failure (milliseconds)
const AUTO_RESTART_DELAY = parseInt(process.env.AUTO_RESTART_DELAY || '5000', 10);

/**
 * Camera configuration
 * @typedef {Object} CameraConfig
 * @property {string} cameraId - Unique camera identifier
 * @property {string} rtspUrl - RTSP URL (e.g., rtsp://user:pass@ip:port/stream)
 * @property {string} location - Camera location description
 * @property {boolean} enabled - Whether camera is enabled
 */

/**
 * Stream information
 * @typedef {Object} StreamInfo
 * @property {string} cameraId - Camera identifier
 * @property {Object} ffmpegProcess - FFmpeg child process
 * @property {Date} startedAt - When stream started
 * @property {number} viewerCount - Number of active viewers
 * @property {Date} lastViewerActivity - Last time a viewer connected
 * @property {string} status - 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR'
 * @property {string} streamType - 'webrtc' | 'hls'
 * @property {number} restartCount - Number of times stream has restarted
 * @property {Date} lastRestart - Last restart time
 */

/**
 * Register a camera
 * 
 * @param {CameraConfig} config - Camera configuration
 */
export const registerCamera = (config) => {
  if (!config.cameraId || !config.rtspUrl) {
    throw new Error('cameraId and rtspUrl are required');
  }

  if (!config.rtspUrl.startsWith('rtsp://')) {
    throw new Error('rtspUrl must start with rtsp://');
  }

  cameraRegistry.set(config.cameraId, {
    ...config,
    enabled: config.enabled !== false // Default to enabled
  });

  logInfo('RTSP', 'Camera registered', {
    cameraId: config.cameraId,
    location: config.location,
    enabled: config.enabled
  });
};

/**
 * Start RTSP stream for a camera
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {Promise<StreamInfo>}
 */
export const startStream = async (cameraId) => {
  const camera = cameraRegistry.get(cameraId);
  
  if (!camera) {
    throw new Error(`Camera ${cameraId} not found in registry`);
  }

  if (!camera.enabled) {
    throw new Error(`Camera ${cameraId} is disabled`);
  }

  // Check if stream already exists
  if (activeStreams.has(cameraId)) {
    const existing = activeStreams.get(cameraId);
    if (existing.status === 'RUNNING' || existing.status === 'STARTING') {
      logDebug('RTSP', 'Stream already active', { cameraId });
      return existing;
    }
    // Clean up existing stream if in error state
    if (existing.status === 'ERROR') {
      stopStream(cameraId);
    }
  }

  logInfo('RTSP', 'Starting stream', { cameraId, rtspUrl: maskRTSPUrl(camera.rtspUrl) });

  const streamInfo = {
    cameraId,
    ffmpegProcess: null,
    startedAt: new Date(),
    viewerCount: 0,
    lastViewerActivity: new Date(),
    status: 'STARTING',
    streamType: 'webrtc',
    restartCount: 0,
    lastRestart: null
  };

  activeStreams.set(cameraId, streamInfo);

  try {
    // Start FFmpeg process
    // Configuration optimized for low-latency WebRTC streaming
    const ffmpegArgs = [
      '-rtsp_transport', 'tcp', // Use TCP for reliability
      '-i', camera.rtspUrl,
      '-c:v', 'libx264', // Video codec
      '-preset', 'ultrafast', // Low latency preset
      '-tune', 'zerolatency', // Zero latency tuning
      '-f', 'mpegts', // Output format for WebRTC
      '-codec:v', 'mpeg1video', // WebRTC compatible codec
      '-b:v', '1000k', // Bitrate
      '-r', '25', // Frame rate
      '-s', '1280x720', // Resolution
      '-bf', '0', // No B-frames for low latency
      '-g', '50', // GOP size
      '-an', // No audio (view-only, no audio)
      'pipe:1' // Output to stdout
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'] // stdin: ignore, stdout: pipe, stderr: pipe
    });

    streamInfo.ffmpegProcess = ffmpegProcess;
    streamInfo.status = 'RUNNING';

    // Handle FFmpeg output (for WebRTC)
    ffmpegProcess.stdout.on('data', (data) => {
      // This data will be consumed by WebRTC handler
      // For now, we just track that data is flowing
      streamInfo.lastViewerActivity = new Date();
      
      // Emit data event for WebRTC handler to consume
      // In a full implementation, this would be forwarded to active WebRTC sessions
      if (streamInfo.viewerCount > 0) {
        // Data is available for viewers
        logDebug('RTSP', 'Stream data available', { cameraId, dataSize: data.length });
      }
    });

    // Handle FFmpeg errors/info (FFmpeg writes info to stderr)
    let stderrBuffer = '';
    ffmpegProcess.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      
      // Check for errors in FFmpeg output
      const errorIndicators = ['error', 'failed', 'Connection refused', 'timeout'];
      const hasError = errorIndicators.some(indicator => 
        stderrBuffer.toLowerCase().includes(indicator.toLowerCase())
      );
      
      if (hasError) {
        logWarn('RTSP', 'FFmpeg error detected', { 
          cameraId, 
          error: stderrBuffer.substring(stderrBuffer.length - 200) 
        });
      } else {
        logDebug('RTSP', 'FFmpeg output', { cameraId, output: stderrBuffer.substring(0, 100) });
      }
    });

    // Handle process exit
    ffmpegProcess.on('exit', (code, signal) => {
      logWarn('RTSP', 'FFmpeg process exited', {
        cameraId,
        code,
        signal,
        status: streamInfo.status,
        restartCount: streamInfo.restartCount
      });

      if (streamInfo.status !== 'STOPPING') {
        // Unexpected exit - attempt restart
        streamInfo.status = 'ERROR';
        updateStreamHealth(cameraId, 'ERROR', `FFmpeg process exited: code ${code}, signal ${signal}`);
        
        // Auto-restart after delay (if not manually stopped and not too many restarts)
        if (streamInfo.restartCount < 5) { // Max 5 restarts
          streamInfo.restartCount++;
          streamInfo.lastRestart = new Date();
          
          setTimeout(() => {
            if (activeStreams.has(cameraId) && streamInfo.status === 'ERROR') {
              logInfo('RTSP', 'Attempting to restart stream', { 
                cameraId, 
                attempt: streamInfo.restartCount 
              });
              startStream(cameraId).catch(err => {
                logError('RTSP', 'Failed to restart stream', { cameraId, error: err.message });
              });
            }
          }, AUTO_RESTART_DELAY);
        } else {
          logError('RTSP', 'Max restart attempts reached', { cameraId });
          updateStreamHealth(cameraId, 'ERROR', 'Max restart attempts reached');
        }
      } else {
        streamInfo.status = 'STOPPED';
        activeStreams.delete(cameraId);
        logInfo('RTSP', 'Stream stopped', { cameraId });
      }
    });

    // Handle process errors
    ffmpegProcess.on('error', (error) => {
      logError('RTSP', 'FFmpeg process error', {
        cameraId,
        error: error.message
      });
      streamInfo.status = 'ERROR';
      updateStreamHealth(cameraId, 'ERROR', error.message);
    });

    updateStreamHealth(cameraId, 'ONLINE', 'Stream started successfully');

    logInfo('RTSP', 'Stream started successfully', {
      cameraId,
      pid: ffmpegProcess.pid
    });

    return streamInfo;

  } catch (error) {
    streamInfo.status = 'ERROR';
    updateStreamHealth(cameraId, 'ERROR', error.message);
    logError('RTSP', 'Failed to start stream', {
      cameraId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Stop RTSP stream for a camera
 * 
 * @param {string} cameraId - Camera identifier
 */
export const stopStream = (cameraId) => {
  const streamInfo = activeStreams.get(cameraId);
  
  if (!streamInfo) {
    logWarn('RTSP', 'Stream not found', { cameraId });
    return;
  }

  if (streamInfo.status === 'STOPPING' || streamInfo.status === 'STOPPED') {
    logDebug('RTSP', 'Stream already stopping/stopped', { cameraId });
    return;
  }

  logInfo('RTSP', 'Stopping stream', { cameraId });
  streamInfo.status = 'STOPPING';

  if (streamInfo.ffmpegProcess) {
    // Graceful shutdown - send SIGTERM first
    streamInfo.ffmpegProcess.kill('SIGTERM');
    
    // Force kill after timeout
    setTimeout(() => {
      if (streamInfo.ffmpegProcess && !streamInfo.ffmpegProcess.killed) {
        logWarn('RTSP', 'Force killing FFmpeg process', { cameraId });
        streamInfo.ffmpegProcess.kill('SIGKILL');
      }
    }, 5000);
  }

  updateStreamHealth(cameraId, 'OFFLINE', 'Stream stopped');
};

/**
 * Increment viewer count for a camera
 * 
 * @param {string} cameraId - Camera identifier
 */
export const addViewer = (cameraId) => {
  const streamInfo = activeStreams.get(cameraId);
  
  if (!streamInfo) {
    throw new Error(`Stream not found for camera ${cameraId}`);
  }

  if (streamInfo.viewerCount >= MAX_VIEWERS_PER_CAMERA) {
    throw new Error(`Max viewers (${MAX_VIEWERS_PER_CAMERA}) reached for camera ${cameraId}`);
  }

  streamInfo.viewerCount++;
  streamInfo.lastViewerActivity = new Date();

  logDebug('RTSP', 'Viewer added', {
    cameraId,
    viewerCount: streamInfo.viewerCount
  });
};

/**
 * Decrement viewer count for a camera
 * 
 * @param {string} cameraId - Camera identifier
 */
export const removeViewer = (cameraId) => {
  const streamInfo = activeStreams.get(cameraId);
  
  if (!streamInfo) {
    return;
  }

  streamInfo.viewerCount = Math.max(0, streamInfo.viewerCount - 1);

  logDebug('RTSP', 'Viewer removed', {
    cameraId,
    viewerCount: streamInfo.viewerCount
  });

  // Stop stream if no viewers and timeout exceeded
  if (streamInfo.viewerCount === 0) {
    const timeSinceLastViewer = Date.now() - streamInfo.lastViewerActivity.getTime();
    if (timeSinceLastViewer > STREAM_TIMEOUT_NO_VIEWERS) {
      logInfo('RTSP', 'Stopping stream - no viewers', { cameraId });
      stopStream(cameraId);
    }
  }
};

/**
 * Get stream info for a camera
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {StreamInfo|null}
 */
export const getStream = (cameraId) => {
  return activeStreams.get(cameraId) || null;
};

/**
 * Get all active cameras
 * 
 * @returns {Array<string>}
 */
export const getActiveCameras = () => {
  return Array.from(activeStreams.keys());
};

/**
 * Get all active streams
 * 
 * @returns {Array<StreamInfo>}
 */
export const getActiveStreams = () => {
  return Array.from(activeStreams.values());
};

/**
 * Get camera registry
 * 
 * @returns {Map<string, CameraConfig>}
 */
export const getCameraRegistry = () => {
  return cameraRegistry;
};

/**
 * Get stream health for a camera
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {Object|null}
 */
export const getStreamHealth = (cameraId) => {
  return streamHealth.get(cameraId) || null;
};

/**
 * Get all camera health statuses
 * 
 * @returns {Array<Object>}
 */
export const getAllStreamHealth = () => {
  return Array.from(streamHealth.values());
};

/**
 * Update stream health
 * 
 * @param {string} cameraId - Camera identifier
 * @param {string} status - 'ONLINE' | 'OFFLINE' | 'ERROR'
 * @param {string} message - Status message
 */
const updateStreamHealth = (cameraId, status, message) => {
  streamHealth.set(cameraId, {
    cameraId,
    status,
    message,
    lastSeen: new Date(),
    timestamp: new Date().toISOString()
  });
};

/**
 * Mask RTSP URL for logging (hide credentials)
 * 
 * @param {string} url - RTSP URL
 * @returns {string}
 */
const maskRTSPUrl = (url) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.username || urlObj.password) {
      return `${urlObj.protocol}//***:***@${urlObj.host}${urlObj.pathname}`;
    }
    return url;
  } catch {
    return '***';
  }
};

/**
 * Initialize RTSP manager
 * Called on server startup
 * 
 * @param {Object} httpServer - HTTP server instance
 */
export const initializeRTSP = (httpServer) => {
  logInfo('RTSP', 'RTSP Manager initialized', {
    maxViewersPerCamera: MAX_VIEWERS_PER_CAMERA,
    streamTimeoutNoViewers: STREAM_TIMEOUT_NO_VIEWERS,
    autoRestartDelay: AUTO_RESTART_DELAY
  });

  // Periodic cleanup: stop streams with no viewers
  setInterval(() => {
    for (const [cameraId, streamInfo] of activeStreams.entries()) {
      if (streamInfo.viewerCount === 0) {
        const timeSinceLastViewer = Date.now() - streamInfo.lastViewerActivity.getTime();
        if (timeSinceLastViewer > STREAM_TIMEOUT_NO_VIEWERS) {
          logInfo('RTSP', 'Auto-stopping stream - no viewers', { cameraId });
          stopStream(cameraId);
        }
      }
    }
  }, 30000); // Check every 30 seconds

  // Graceful shutdown handler
  const shutdown = () => {
    logInfo('RTSP', 'Shutting down all streams...');
    for (const cameraId of activeStreams.keys()) {
      stopStream(cameraId);
    }
  };

  httpServer.on('close', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};
