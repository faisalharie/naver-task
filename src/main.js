// src/main.js
// Refactored main module untuk mengatur flow scraping dengan SOLID principles
import pLimit from 'p-limit';
import { getProxies } from '../config/proxy.js';
import { getBrowserConfig } from '../config/browser.js';
import { randomDelay } from '../utils/delay.js';

// Configuration constants
const CONFIG = {
  MAX_CONCURRENT: parseInt(process.env.MAX_CONCURRENT || '3', 10),
  DELAY_RANGE: { min: 1000, max: 5000 }
};

/**
 * Manages proxy rotation and selection
 */
class ProxyManager {
  constructor() {
    this.proxies = getProxies();
  }

  getProxy(index) {
    return this.proxies[index % this.proxies.length];
  }

  getProxyCount() {
    return this.proxies.length;
  }

  hasProxies() {
    return this.proxies.length > 0;
  }
}

/**
 * Manages scraping configuration
 */
class ScrapingConfig {
  constructor() {
    this.browserConfig = getBrowserConfig();
  }

  getBrowserConfig() {
    return this.browserConfig;
  }
}

/**
 * Manages concurrent execution with rate limiting
 */
class ConcurrencyManager {
  constructor(maxConcurrent) {
    this.limit = pLimit(maxConcurrent);
  }

  async executeWithLimit(operation) {
    return await this.limit(operation);
  }
}

/**
 * Manages data persistence
 */
class DataManager {
  constructor(logger) {
    this.logger = logger;
  }

  combineResults(results) {
    return results.flat();
  }
}

/**
 * Manages individual product scraping tasks
 */
class ProductScrapingTask {
  constructor(productUrl, proxy, browserConfig, logger) {
    this.productUrl = productUrl;
    this.proxy = proxy;
    this.browserConfig = browserConfig;
    this.logger = logger;
  }

  async execute() {
    await randomDelay(CONFIG.DELAY_RANGE.min, CONFIG.DELAY_RANGE.max);
    const { scrapeNaverProduct } = await import('./naverProductScraper.js');
    return await scrapeNaverProduct({
      productUrl: this.productUrl,
      proxy: this.proxy,
      browserConfig: this.browserConfig,
      logger: this.logger,
    });
  }
}

/**
 * Main scraping orchestrator
 */
class ScrapingOrchestrator {
  constructor(logger) {
    this.logger = logger;
    this.proxyManager = new ProxyManager();
    this.scrapingConfig = new ScrapingConfig();
    this.concurrencyManager = new ConcurrencyManager(CONFIG.MAX_CONCURRENT);
    this.dataManager = new DataManager(logger);
  }

  async execute() {
    this.logger.info(`Menggunakan ${this.proxyManager.getProxyCount()} proxy, max ${CONFIG.MAX_CONCURRENT} instance paralel.`);

    // For now, this is a placeholder for batch mode
    // You can add a list of product URLs here
    const productUrls = [
      // Add your Naver SmartStore product URLs here
      // Example: 'https://smartstore.naver.com/example/product/123'
    ];
    
    if (productUrls.length === 0) {
      this.logger.warn('No product URLs configured for batch mode. Use API mode instead.');
      return [];
    }

    const browserConfig = this.scrapingConfig.getBrowserConfig();

    const results = await Promise.all(
      productUrls.map((productUrl, idx) => {
        const proxy = this.proxyManager.getProxy(idx);
        const task = new ProductScrapingTask(productUrl, proxy, browserConfig, this.logger);
        return this.concurrencyManager.executeWithLimit(() => task.execute());
      })
    );

    const allProducts = this.dataManager.combineResults(results);
    this.logger.info(`Total produk di-scrape: ${allProducts.length}`);
    
    return allProducts;
  }
}

/**
 * Main function untuk menjalankan semua scraping
 * @param {import('winston').Logger} logger
 */
export async function scrapeAll(logger) {
  const orchestrator = new ScrapingOrchestrator(logger);
  return await orchestrator.execute();
} 