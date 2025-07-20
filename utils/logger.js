// utils/logger.js
// Refactored Winston logger setup dengan SOLID principles
import winston from 'winston';

// Configuration constants
const CONFIG = {
  LOGGER: {
    DEFAULT_LEVEL: 'info',
    LOG_FILE: 'data/scraper.log',
    FORMAT: {
      TIMESTAMP: 'YYYY-MM-DD HH:mm:ss',
      COLORS: {
        error: 'red',
        warn: 'yellow',
        info: 'green',
        debug: 'blue'
      }
    }
  }
};

/**
 * Manages logger format configuration
 */
class LoggerFormatManager {
  static getTimestampFormat() {
    return winston.format.timestamp({
      format: CONFIG.LOGGER.FORMAT.TIMESTAMP
    });
  }

  static getConsoleFormat() {
    return winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => 
        `${timestamp} [${level}]: ${message}`
      )
    );
  }

  static getFileFormat() {
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) => 
        `${timestamp} [${level}]: ${message}`
      )
    );
  }

  static getJsonFormat() {
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    );
  }
}

/**
 * Manages logger transport configuration
 */
class LoggerTransportManager {
  static getConsoleTransport() {
    return new winston.transports.Console({
      format: LoggerFormatManager.getConsoleFormat()
    });
  }

  static getFileTransport(filename = CONFIG.LOGGER.LOG_FILE) {
    return new winston.transports.File({
      filename,
      format: LoggerFormatManager.getFileFormat()
    });
  }

  static getErrorFileTransport(filename = 'data/error.log') {
    return new winston.transports.File({
      filename,
      level: 'error',
      format: LoggerFormatManager.getFileFormat()
    });
  }

  static getJsonFileTransport(filename = 'data/logs.json') {
    return new winston.transports.File({
      filename,
      format: LoggerFormatManager.getJsonFormat()
    });
  }
}

/**
 * Manages logger level configuration
 */
class LoggerLevelManager {
  static getLogLevel() {
    return process.env.LOG_LEVEL || CONFIG.LOGGER.DEFAULT_LEVEL;
  }

  static isValidLevel(level) {
    const validLevels = ['error', 'warn', 'info', 'debug'];
    return validLevels.includes(level);
  }

  static setLogLevel(logger, level) {
    if (this.isValidLevel(level)) {
      logger.level = level;
      return true;
    }
    return false;
  }
}

/**
 * Manages logger instance creation
 */
class LoggerFactory {
  static createBasicLogger() {
    return winston.createLogger({
      level: LoggerLevelManager.getLogLevel(),
      format: LoggerFormatManager.getFileFormat(),
      transports: [
        LoggerTransportManager.getConsoleTransport(),
        LoggerTransportManager.getFileTransport()
      ]
    });
  }

  static createAdvancedLogger(options = {}) {
    const {
      level = LoggerLevelManager.getLogLevel(),
      transports = [],
      format = LoggerFormatManager.getFileFormat()
    } = options;

    const defaultTransports = [
      LoggerTransportManager.getConsoleTransport(),
      LoggerTransportManager.getFileTransport()
    ];

    return winston.createLogger({
      level,
      format,
      transports: [...defaultTransports, ...transports]
    });
  }

  static createErrorLogger() {
    return winston.createLogger({
      level: 'error',
      format: LoggerFormatManager.getFileFormat(),
      transports: [
        LoggerTransportManager.getErrorFileTransport()
      ]
    });
  }

  static createJsonLogger() {
    return winston.createLogger({
      level: LoggerLevelManager.getLogLevel(),
      format: LoggerFormatManager.getJsonFormat(),
      transports: [
        LoggerTransportManager.getConsoleTransport(),
        LoggerTransportManager.getJsonFileTransport()
      ]
    });
  }
}

/**
 * Main logger manager class
 */
class LoggerManager {
  constructor() {
    this.logger = null;
  }

  getLogger() {
    if (!this.logger) {
      this.logger = LoggerFactory.createBasicLogger();
    }
    return this.logger;
  }

  setLogger(logger) {
    this.logger = logger;
  }

  setLevel(level) {
    if (this.logger) {
      return LoggerLevelManager.setLogLevel(this.logger, level);
    }
    return false;
  }

  addTransport(transport) {
    if (this.logger) {
      this.logger.add(transport);
      return true;
    }
    return false;
  }

  removeTransport(transport) {
    if (this.logger) {
      this.logger.remove(transport);
      return true;
    }
    return false;
  }
}

// Create singleton instance
const loggerManager = new LoggerManager();

// Export main function for backward compatibility
export function createLogger() {
  return loggerManager.getLogger();
}

// Export classes for advanced usage
export { 
  LoggerManager, 
  LoggerFactory, 
  LoggerFormatManager, 
  LoggerTransportManager, 
  LoggerLevelManager 
};

// Export singleton instance
export { loggerManager }; 