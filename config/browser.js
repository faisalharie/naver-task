import { executablePath } from 'puppeteer';

// config/browser.js
// Refactored konfigurasi browser dan target scraping dengan SOLID principles

// Configuration constants
const CONFIG = {
  BROWSER: {
    DEFAULT_HEADLESS: false,
    DEFAULT_TIMEOUT: 30000,
    WINDOW_SIZE: '1920,1080',
      ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-field-trial-config',
    '--disable-ipc-flooding-protection',
    '--disable-hang-monitor',
    '--disable-prompt-on-repost',
    '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--safebrowsing-disable-auto-update',
    '--ignore-certificate-errors',
    '--ignore-ssl-errors',
    '--ignore-certificate-errors-spki-list'
  ]
  },
  TARGET: {
    DEFAULT_BASE_URL: 'https://smartstore.naver.com/',
    DEFAULT_CATEGORIES: []
  }
};

/**
 * Manages browser configuration
 */
class BrowserConfigManager {
  static getConfig() {
    return {
      headless: this.getHeadlessMode(),
      executablePath: executablePath(),
      args: this.getBrowserArgs(),
      timeout: CONFIG.BROWSER.DEFAULT_TIMEOUT,
    };
  }

  static getHeadlessMode() {
    return process.env.HEADLESS === 'true' || CONFIG.BROWSER.DEFAULT_HEADLESS;
  }

  static getBrowserArgs() {
    return [
      ...CONFIG.BROWSER.ARGS,
      `--window-size=${CONFIG.BROWSER.WINDOW_SIZE}`,
    ];
  }

  static getCustomArgs() {
    const customArgs = process.env.BROWSER_ARGS;
    return customArgs ? customArgs.split(',').map(arg => arg.trim()) : [];
  }
}

/**
 * Manages target configuration
 */
class TargetConfigManager {
  static getConfig() {
    return {
      baseUrl: this.getBaseUrl(),
    };
  }

  static getBaseUrl() {
    return process.env.TARGET_URL || CONFIG.TARGET.DEFAULT_BASE_URL;
  }

  static validateUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Manages configuration validation
 */
class ConfigValidator {
  static validateBrowserConfig(config) {
    const required = ['headless', 'executablePath', 'args', 'timeout'];
    const missing = required.filter(key => !(key in config));
    
    if (missing.length > 0) {
      throw new Error(`Missing required browser config: ${missing.join(', ')}`);
    }

    if (typeof config.timeout !== 'number' || config.timeout <= 0) {
      throw new Error('Browser timeout must be a positive number');
    }

    return true;
  }

  static validateTargetConfig(config) {
    if (!TargetConfigManager.validateUrl(config.baseUrl)) {
      throw new Error('Invalid target URL');
    }

    return true;
  }
}

// Export functions with validation
export function getBrowserConfig() {
  const config = BrowserConfigManager.getConfig();
  ConfigValidator.validateBrowserConfig(config);
  return config;
}

export function getTargetConfig() {
  const config = TargetConfigManager.getConfig();
  ConfigValidator.validateTargetConfig(config);
  return config;
}

// Export classes for testing and advanced usage
export { BrowserConfigManager, TargetConfigManager, ConfigValidator }; 