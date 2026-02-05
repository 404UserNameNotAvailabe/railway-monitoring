/**
 * HLS Manager (Fallback)
 * 
 * Provides HLS (HTTP Live Streaming) fallback when WebRTC fails.
 * Generates .m3u8 playlists and .ts segments from RTSP streams.
 * 
 * Note: HLS has higher latency than WebRTC but is more compatible.
 * 
 * Architecture: Fallback only, used when WebRTC unavailable
 */

import { spawn } from 'child_process';
import { logInfo, logWarn, logError, logDebug } from '../utils/logger.js';
import { getCameraRegistry } from '../streams/rtsp.manager.js';

// HLS streams: Map<cameraId, hlsInfo>
const hlsStreams = new Map();

// HLS output directory (should be served as static files)
const HLS_OUTPUT_DIR = process.env.HLS_OUTPUT_DIR || './hls-output';

/**
 * HLS stream information
 * @typedef {Object} HLSInfo
 * @property {string} cameraId - Camera identifier
 * @property {Object} ffmpegProcess - FFmpeg child process
 * @property {Date} startedAt - When HLS stream started
 * @property {string} status - 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'ERROR'
 * @property {string} playlistPath - Path to .m3u8 playlist file
 */

/**
 * Start HLS stream for a camera
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {Promise<Object>}
 */
export const startHLSStream = async (cameraId) => {
  // Check if HLS stream already exists
  if (hlsStreams.has(cameraId)) {
    const existing = hlsStreams.get(cameraId);
    if (existing.status === 'RUNNING') {
      logDebug('HLS', 'HLS stream already active', { cameraId });
      return existing;
    }
  }

  // Get camera RTSP URL from registry
  const cameraRegistry = getCameraRegistry();
  const camera = cameraRegistry.get(cameraId);
  
  if (!camera) {
    throw new Error(`Camera ${cameraId} not found`);
  }

  logInfo('HLS', 'Starting HLS stream', { cameraId });

  const hlsInfo = {
    cameraId,
    ffmpegProcess: null,
    startedAt: new Date(),
    status: 'STARTING',
    playlistPath: `${HLS_OUTPUT_DIR}/${cameraId}/playlist.m3u8`
  };

  hlsStreams.set(cameraId, hlsInfo);

  try {
    // FFmpeg command to generate HLS
    const ffmpegArgs = [
      '-rtsp_transport', 'tcp',
      '-i', camera.rtspUrl,
      '-c:v', 'libx264',
      '-c:a', 'aac', // Audio codec (if audio exists)
      '-hls_time', '2', // Segment duration (2 seconds)
      '-hls_list_size', '5', // Keep 5 segments in playlist
      '-hls_flags', 'delete_segments', // Delete old segments
      '-hls_segment_filename', `${HLS_OUTPUT_DIR}/${cameraId}/segment_%03d.ts`,
      '-f', 'hls',
      hlsInfo.playlistPath
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    hlsInfo.ffmpegProcess = ffmpegProcess;
    hlsInfo.status = 'RUNNING';

    // Handle FFmpeg output
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      logDebug('HLS', 'FFmpeg output', { cameraId, output: output.substring(0, 100) });
    });

    // Handle process exit
    ffmpegProcess.on('exit', (code, signal) => {
      logWarn('HLS', 'FFmpeg process exited', {
        cameraId,
        code,
        signal
      });

      if (hlsInfo.status !== 'STOPPING') {
        hlsInfo.status = 'ERROR';
        // Auto-restart logic could go here if needed
      } else {
        hlsInfo.status = 'STOPPED';
        hlsStreams.delete(cameraId);
      }
    });

    // Handle process errors
    ffmpegProcess.on('error', (error) => {
      logError('HLS', 'FFmpeg process error', {
        cameraId,
        error: error.message
      });
      hlsInfo.status = 'ERROR';
    });

    logInfo('HLS', 'HLS stream started', {
      cameraId,
      playlistPath: hlsInfo.playlistPath
    });

    return hlsInfo;

  } catch (error) {
    hlsInfo.status = 'ERROR';
    logError('HLS', 'Failed to start HLS stream', {
      cameraId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Stop HLS stream for a camera
 * 
 * @param {string} cameraId - Camera identifier
 */
export const stopHLSStream = (cameraId) => {
  const hlsInfo = hlsStreams.get(cameraId);
  
  if (!hlsInfo) {
    return;
  }

  logInfo('HLS', 'Stopping HLS stream', { cameraId });
  hlsInfo.status = 'STOPPING';

  if (hlsInfo.ffmpegProcess) {
    hlsInfo.ffmpegProcess.kill('SIGTERM');
    
    setTimeout(() => {
      if (hlsInfo.ffmpegProcess && !hlsInfo.ffmpegProcess.killed) {
        hlsInfo.ffmpegProcess.kill('SIGKILL');
      }
    }, 5000);
  }
};

/**
 * Get HLS playlist URL for a camera
 * 
 * @param {string} cameraId - Camera identifier
 * @returns {string|null}
 */
export const getHLSPlaylistUrl = (cameraId) => {
  const hlsInfo = hlsStreams.get(cameraId);
  
  if (!hlsInfo || hlsInfo.status !== 'RUNNING') {
    return null;
  }

  // Return URL that can be used by HLS player
  // This should be served as a static file by Express
  return `/hls/${cameraId}/playlist.m3u8`;
};

/**
 * Get all active HLS streams
 * 
 * @returns {Array<Object>}
 */
export const getActiveHLSStreams = () => {
  return Array.from(hlsStreams.values());
};

/**
 * Initialize HLS manager
 * 
 * @param {Object} httpServer - HTTP server instance
 */
export const initializeHLS = (httpServer) => {
  logInfo('HLS', 'HLS Manager initialized', {
    outputDir: HLS_OUTPUT_DIR
  });

  // Note: In production, you'd want to:
  // 1. Create output directories for each camera
  // 2. Serve HLS files as static content via Express
  // 3. Implement segment cleanup (old segments should be deleted)
  // 4. Add CORS headers for HLS playback
  // 5. Set up proper MIME types for .m3u8 and .ts files
};
