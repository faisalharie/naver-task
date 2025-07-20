// src/api.js
// Refactored API server dengan SOLID principles
import express from 'express';
import dotenv from 'dotenv';
import pLimit from 'p-limit';
import { createLogger } from '../utils/logger.js';
import { getProxies } from '../config/proxy.js';
import { getBrowserConfig } from '../config/browser.js';
import { scrapeNaverProduct, initializeCookies } from './naverProductScraper.js';
import { randomDelay } from '../utils/delay.js';
import fs from 'fs';

dotenv.config();

// Configuration constants
const CONFIG = {
  PORT: process.env.PORT || 3001, // Change default port to 3001
  MAX_CONCURRENT: parseInt(process.env.MAX_CONCURRENT || '1', 10),
  DELAY_RANGE: { min: 1000, max: 5000 }
};

// Function to find available port
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    import('net').then(net => {
      const server = net.default.createServer();
      
      server.listen(startPort, () => {
        const { port } = server.address();
        server.close(() => resolve(port));
      });
      
      server.on('error', () => {
        resolve(findAvailablePort(startPort + 1));
      });
    }).catch(error => {
      // Fallback to next port if import fails
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

/**
 * Manages proxy selection and rotation
 */
class ProxySelector {
  constructor() {
    this.proxies = getProxies();
  }

  getRandomProxy() {
    if (this.proxies.length === 0) return '';
    return this.proxies[Math.floor(Math.random() * this.proxies.length)];
  }

  hasProxies() {
    return this.proxies.length > 0;
  }
}

/**
 * Manages request rate limiting
 */
class RateLimiter {
  constructor(maxConcurrent) {
    this.limit = pLimit(maxConcurrent);
  }

  async executeWithLimit(operation) {
    return await this.limit(operation);
  }
}

/**
 * Manages request validation
 */
class RequestValidator {
  static validateProductUrl(req, res) {
  const { productUrl } = req.query;
    
    if (!productUrl) {
      return {
        valid: false,
        error: 'productUrl is required',
        statusCode: 400
      };
    }

    if (!this.isValidNaverUrl(productUrl)) {
      return {
        valid: false,
        error: 'Invalid Naver SmartStore URL',
        message: 'URL must be a valid Naver SmartStore product URL',
        statusCode: 400
      };
    }

    return { valid: true };
  }

  static isValidNaverUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('smartstore.naver.com') || 
             urlObj.hostname.includes('ader.naver.com');
    } catch {
      return false;
    }
  }
}

/**
 * Manages scraping request execution
 */
class ScrapingRequestHandler {
  constructor(proxySelector, rateLimiter, logger) {
    this.proxySelector = proxySelector;
    this.rateLimiter = rateLimiter;
    this.logger = logger;
    this.browserConfig = getBrowserConfig();
  }

  async handleRequest(productUrl) {
    const proxy = this.proxySelector.getRandomProxy();
    this.logger.info(`Processing request for: ${productUrl} (proxy: ${proxy || 'none'})`);

    await randomDelay(CONFIG.DELAY_RANGE.min, CONFIG.DELAY_RANGE.max);

    return await this.rateLimiter.executeWithLimit(() =>
      scrapeNaverProduct({
      productUrl,
      proxy,
        browserConfig: this.browserConfig,
        logger: this.logger,
      })
    );
  }

  processResponse(data) {
    if (data && data.error) {
      this.logger.error(`Scraper error: ${data.error} - ${data.message}`);
      return {
        success: false,
        error: data.error,
        message: data.message,
        productUrl: data.productUrl
      };
    }

    if (!data) {
      return {
        success: false,
        error: 'Failed to extract __PRELOADED_STATE__'
      };
    }

    return {
      success: true,
      preloadedState: data
    };
  }
}

/**
 * Manages API response formatting
 */
class ResponseFormatter {
  static formatSuccess(data) {
    return { preloadedState: data };
  }

  static formatError(error, message, productUrl = null) {
    const response = { error, message };
    if (productUrl) response.productUrl = productUrl;
    return response;
  }
}

/**
 * Main API server class
 */
class NaverScraperAPI {
  constructor() {
    this.app = express();
    this.logger = createLogger();
    this.proxySelector = new ProxySelector();
    this.rateLimiter = new RateLimiter(CONFIG.MAX_CONCURRENT);
    this.scrapingHandler = new ScrapingRequestHandler(
      this.proxySelector, 
      this.rateLimiter, 
      this.logger
    );
  }

  setupRoutes() {
    // Add request logging middleware
    this.app.use((req, res, next) => {
      this.logger.info(`📥 ${req.method} ${req.url} - ${new Date().toISOString()}`);
      next();
    });
    
    this.app.get('/naver', this.handleNaverRequest.bind(this));
    this.app.get('/', this.handleRootRequest.bind(this));
  }

  async handleNaverRequest(req, res) {
    try {
      // Validate request
      const validation = RequestValidator.validateProductUrl(req, res);
      if (!validation.valid) {
        return res.status(validation.statusCode).json(
          ResponseFormatter.formatError(validation.error, validation.message)
        );
      }

      
      // Load NA_CO cookie from file
      let naCoCookie = null;
      try {
        const naCoData = JSON.parse(fs.readFileSync('na_co_cookie.json', 'utf8'));
        if (naCoData && naCoData.cookie && naCoData.cookie.value) {
          naCoCookie = naCoData.cookie;
          this.logger.info(`NA_CO cookie loaded: ${naCoCookie.value}`);
        } else {
          this.logger.warn('NA_CO cookie file exists but has invalid structure');
        }
      } catch (error) {
        this.logger.warn(`Failed to load NA_CO cookie: ${error.message}`);
      }

      let productUrl = req.query.productUrl;
      
      // Add NA_CO cookie to URL if available
      if (naCoCookie && naCoCookie.value) {
        const separator = productUrl.includes('?') ? '&' : '?';
        productUrl = `${productUrl}${separator}site_preference=device&NaPm=${naCoCookie.value}`;
        this.logger.info(`URL with NA_CO cookie: ${productUrl}`);
      } else {
        this.logger.warn('NA_CO cookie not available, using original URL');
      }

      // Execute scraping
      const data = await this.scrapingHandler.handleRequest(productUrl);
      const result = this.scrapingHandler.processResponse(data);

      // Send response
      if (result.success) {
        res.json(ResponseFormatter.formatSuccess(result.preloadedState));
      } else {
        res.status(400).json(
          ResponseFormatter.formatError(result.error, result.message, result.productUrl)
        );
      }
  } catch (err) {
      this.logger.error(`API error: ${err.message}`);
      this.logger.error(`Error stack: ${err.stack}`);
      res.status(500).json(ResponseFormatter.formatError('Internal server error', err.message));
  }
  }

  handleRootRequest(req, res) {
    res.send(`
      <h1>Naver SmartStore Scraper API</h1>
      <p><strong>Endpoints:</strong></p>
      <ul>
        <li><code>GET /naver?productUrl=...</code> - Scrape product data</li>
      </ul>
      <p><strong>Example:</strong></p>
      <code>GET /naver?productUrl=https://smartstore.naver.com/store/products/123456</code>
      <p><strong>Note:</strong> Cookies are automatically initialized at startup</p>
    `);
  }

  async start() {
    try {
      this.setupRoutes();
      
      // Start HTTP server FIRST
      const availablePort = await findAvailablePort(CONFIG.PORT);
      
      if (availablePort !== CONFIG.PORT) {
        this.logger.warn(`⚠️ Port ${CONFIG.PORT} is in use, using port ${availablePort} instead`);
      }
      
      const server = this.app.listen(availablePort, () => {
        this.logger.info(`API server listening on port ${availablePort}`);
        this.logger.info(`🚀 Server is ready to accept requests!`);
        this.logger.info(`📡 Try: GET http://localhost:${availablePort}/naver?productUrl=YOUR_URL`);
      });
      
      // Add error handling for server
      server.on('error', (error) => {
        this.logger.error(`Server error: ${error.message}`);
        this.logger.warn('Server will continue running despite the error');
      });
      
      // Add connection logging
      server.on('connection', () => {
        this.logger.info('🔗 New connection established');
      });
      
      // Log server status periodically
      setInterval(() => {
        this.logger.info('💚 Server is still running and ready for requests...');
      }, 30000); // Log every 30 seconds
      
      // Check if NA_CO cookie already exists
      let naCoCookieExists = false;
      try {
        const naCoData = JSON.parse(fs.readFileSync('na_co_cookie.json', 'utf8'));
        if (naCoData && naCoData.cookie && naCoData.cookie.value) {
          naCoCookieExists = true;
          this.logger.info('✅ NA_CO cookie already exists, skipping initialization');
        }
      } catch (error) {
        this.logger.info('📝 NA_CO cookie not found, will initialize...');
      }

      // THEN initialize cookies only if NA_CO cookie doesn't exist
      if (!naCoCookieExists) {
        try {
          this.logger.info('🚀 Starting cookie initialization...');
          const proxy = this.proxySelector.getRandomProxy();
          const browserConfig = getBrowserConfig();
          
          const initSuccess = await initializeCookies({ proxy, browserConfig, logger: this.logger });
          
          if (initSuccess) {
            this.logger.info('✅ Cookie initialization completed successfully');
          } else {
            this.logger.warn('⚠️ Cookie initialization failed, API will work without cookies');
          }
        } catch (error) {
          this.logger.error(`❌ Cookie initialization error: ${error.message}`);
          this.logger.warn('⚠️ API will start without cookies');
        }
      } else {
        this.logger.info('⏭️ Skipping cookie initialization - NA_CO cookie already available');
      }
      
    } catch (error) {
      this.logger.error(`❌ Failed to start API server: ${error.message}`);
      // Don't throw error, let the application continue
      this.logger.warn('⚠️ API server will continue running despite startup issues');
    }
  }
}

// Start the API server
const api = new NaverScraperAPI();

// Add proper error handling to prevent app from crashing
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Application will continue running...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('Application will continue running...');
});

api.start().catch(error => {
  console.error('Failed to start API server:', error);
  console.error('API server will continue running despite the error');
}); 