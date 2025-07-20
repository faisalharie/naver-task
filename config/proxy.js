// config/proxy.js
// Refactored proxy management dengan SOLID principles

// Configuration constants
const CONFIG = {
  PROXY: {
    DEFAULT_PROXY: '',
    SEPARATOR: ',',
    VALIDATION: {
      MIN_PROXY_LENGTH: 5,
      MAX_PROXY_LENGTH: 200
    }
  }
};

/**
 * Manages proxy parsing and formatting
 */
class ProxyParser {
  static parseProxyString(proxyString) {
    if (!proxyString || typeof proxyString !== 'string') {
      return CONFIG.PROXY.DEFAULT_PROXY;
    }

    return proxyString.trim();
  }

  static parseProxyList(proxyList) {
    if (!Array.isArray(proxyList)) {
      return [CONFIG.PROXY.DEFAULT_PROXY];
    }

    return proxyList
      .map(proxy => this.parseProxyString(proxy))
      .filter(proxy => proxy.length > 0);
  }

  static parseEnvironmentProxies(envValue) {
    if (!envValue) {
      return [CONFIG.PROXY.DEFAULT_PROXY];
    }

    const proxyStrings = envValue.split(CONFIG.PROXY.SEPARATOR);
    return this.parseProxyList(proxyStrings);
  }

  static formatProxyForBrowser(proxy) {
    if (!proxy || proxy === CONFIG.PROXY.DEFAULT_PROXY) {
      return '';
    }

    // Handle different proxy formats
    if (proxy.includes('://')) {
      return proxy; // Already formatted
    }

    // Assume HTTP proxy if no protocol specified
    return `http://${proxy}`;
  }
}

/**
 * Manages proxy validation
 */
class ProxyValidator {
  static validateProxy(proxy) {
    if (!proxy || proxy === CONFIG.PROXY.DEFAULT_PROXY) {
      return { valid: true, isDirect: true };
    }

    if (proxy.length < CONFIG.PROXY.VALIDATION.MIN_PROXY_LENGTH) {
      return { valid: false, error: 'Proxy string too short' };
    }

    if (proxy.length > CONFIG.PROXY.VALIDATION.MAX_PROXY_LENGTH) {
      return { valid: false, error: 'Proxy string too long' };
    }

    // Basic format validation
    const proxyPattern = /^(https?:\/\/)?([^:]+):(\d+)(:([^:]+):(.+))?$/;
    if (!proxyPattern.test(proxy)) {
      return { valid: false, error: 'Invalid proxy format' };
    }

    return { valid: true, isDirect: false };
  }

  static validateProxyList(proxies) {
    const results = proxies.map(proxy => ({
      proxy,
      ...this.validateProxy(proxy)
    }));

    const validProxies = results.filter(result => result.valid);
    const invalidProxies = results.filter(result => !result.valid);

    return {
      valid: validProxies,
      invalid: invalidProxies,
      total: proxies.length,
      validCount: validProxies.length
    };
  }
}

/**
 * Manages proxy selection and rotation
 */
class ProxySelector {
  constructor(proxies) {
    this.proxies = proxies;
    this.currentIndex = 0;
  }

  getNextProxy() {
    if (this.proxies.length === 0) {
      return CONFIG.PROXY.DEFAULT_PROXY;
    }

    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  getRandomProxy() {
    if (this.proxies.length === 0) {
      return CONFIG.PROXY.DEFAULT_PROXY;
    }

    const randomIndex = Math.floor(Math.random() * this.proxies.length);
    return this.proxies[randomIndex];
  }

  getProxyByIndex(index) {
    if (this.proxies.length === 0) {
      return CONFIG.PROXY.DEFAULT_PROXY;
    }

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
 * Main proxy manager class
 */
class ProxyManager {
  constructor() {
    this.proxies = this.loadProxies();
    this.selector = new ProxySelector(this.proxies);
  }

  loadProxies() {
    const envProxies = process.env.PROXIES;
    const proxyList = ProxyParser.parseEnvironmentProxies(envProxies);
    
    // Validate proxies
    const validation = ProxyValidator.validateProxyList(proxyList);
    
    if (validation.invalid.length > 0) {
      console.warn(`Warning: ${validation.invalid.length} invalid proxy(ies) found:`, 
        validation.invalid.map(p => p.proxy));
    }

    return validation.valid.map(p => p.proxy);
  }

  getProxies() {
    return [...this.proxies];
  }

  getNextProxy() {
    return this.selector.getNextProxy();
  }

  getRandomProxy() {
    return this.selector.getRandomProxy();
  }

  getProxyByIndex(index) {
    return this.selector.getProxyByIndex(index);
  }

  getProxyCount() {
    return this.selector.getProxyCount();
  }

  hasProxies() {
    return this.selector.hasProxies();
  }

  validateProxy(proxy) {
    return ProxyValidator.validateProxy(proxy);
  }
}

// Create singleton instance
const proxyManager = new ProxyManager();

// Export main function for backward compatibility
export function getProxies() {
  return proxyManager.getProxies();
}

// Export classes for advanced usage
export { ProxyManager, ProxyParser, ProxyValidator, ProxySelector };

// Export singleton instance
export { proxyManager }; 