/**
 * Logger Utility
 * 
 * Structured logging for CCTV Gateway
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLevel = process.env.LOG_LEVEL === 'DEBUG' ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

const formatMessage = (level, category, message, data = {}) => {
  const timestamp = new Date().toISOString();
  return {
    timestamp,
    level,
    category,
    message,
    ...data
  };
};

export const logDebug = (category, message, data = {}) => {
  if (currentLevel <= LOG_LEVELS.DEBUG) {
    console.debug(JSON.stringify(formatMessage('DEBUG', category, message, data)));
  }
};

export const logInfo = (category, message, data = {}) => {
  if (currentLevel <= LOG_LEVELS.INFO) {
    console.log(JSON.stringify(formatMessage('INFO', category, message, data)));
  }
};

export const logWarn = (category, message, data = {}) => {
  if (currentLevel <= LOG_LEVELS.WARN) {
    console.warn(JSON.stringify(formatMessage('WARN', category, message, data)));
  }
};

export const logError = (category, message, data = {}) => {
  if (currentLevel <= LOG_LEVELS.ERROR) {
    console.error(JSON.stringify(formatMessage('ERROR', category, message, data)));
  }
};
