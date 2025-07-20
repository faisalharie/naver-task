// index.js
// Refactored entry point utama untuk web scraping dan API dengan SOLID principles
import dotenv from 'dotenv';
import { createLogger } from './utils/logger.js';

dotenv.config();

// Configuration constants
const CONFIG = {
  DEFAULT_MODE: 'api',
  LOG_MESSAGES: {
    STARTING_SCRAPING: 'Memulai proses scraping...',
    SCRAPING_COMPLETE: 'Scraping selesai.',
    FATAL_ERROR: 'Terjadi error fatal:'
  }
};

/**
 * Manages application mode selection
 */
class ModeManager {
  static getMode() {
    return process.argv[2] || CONFIG.DEFAULT_MODE;
  }

  static isAPIMode() {
    return this.getMode() === 'api';
  }

  static isBatchMode() {
    return this.getMode() === 'batch';
  }
}

/**
 * Manages API server execution
 */
class APIServerManager {
  static async start() {
    try {
      await import('./src/api.js');
    } catch (error) {
      throw new Error(`Failed to start API server: ${error.message}`);
    }
  }
}

/**
 * Manages batch scraping execution
 */
class BatchScrapingManager {
  constructor(logger) {
    this.logger = logger;
  }

  async execute() {
    try {
      this.logger.info(CONFIG.LOG_MESSAGES.STARTING_SCRAPING);
      
      const { scrapeAll } = await import('./src/main.js');
      await scrapeAll(this.logger);
      
      this.logger.info(CONFIG.LOG_MESSAGES.SCRAPING_COMPLETE);
    } catch (error) {
      this.logger.error(`${CONFIG.LOG_MESSAGES.FATAL_ERROR} ${error.message}`);
      throw error;
    }
  }
}

/**
 * Main application orchestrator
 */
class ApplicationOrchestrator {
  constructor() {
    this.logger = createLogger();
  }

  async run() {
    try {
      if (ModeManager.isAPIMode()) {
        await APIServerManager.start();
      } else {
        const batchManager = new BatchScrapingManager(this.logger);
        await batchManager.execute();
      }
    } catch (error) {
      this.logger.error(`Application error: ${error.message}`);
      // Don't exit, let the application continue running
      this.logger.error('Application will continue running despite the error');
    }
  }
}

// Start the application
const app = new ApplicationOrchestrator();
app.run(); 