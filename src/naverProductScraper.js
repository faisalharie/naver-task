// src/naverProductScraper.js
// Scraper untuk mengambil __PRELOADED_STATE__ dari halaman produk SmartStore Naver
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AnonymizeUAPlugin from 'puppeteer-extra-plugin-anonymize-ua';
import { randomDelay } from '../utils/delay.js';
import fs from 'fs';

puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUAPlugin());

const MAX_RETRIES = 3;
const COOKIES_FILE = 'naver_cookies.json';

// Configuration constants
const CONFIG = {
  TIMEOUTS: {
    NAVIGATION: 60000,
    NETWORK_IDLE: 30000,
    DOM_CONTENT: 15000,
    FUNCTION_WAIT: 10000,
    TAB_WAIT: 10000
  },
  DELAYS: {
    SHORT: { min: 500, max: 1500 },
    MEDIUM: { min: 2000, max: 4000 },
    LONG: { min: 4000, max: 7000 }
  },
  SELECTORS: {
    SHOPPING_LINK: 'li.shortcut_item a.link_service[href*="shopping.naver.com"]',
    PRODUCT_LINK: 'a[href*="smartstore"], a[href*="ader"], a[href*="product"], div[class*="product"] a, a[class*="product"]',
    BODY: 'body'
  },
  URLS: {
    NAVER: 'https://www.naver.com',
    SHOPPING: 'https://shopping.naver.com/ns/home'
  }
};

// Error detection patterns
const ERROR_PATTERNS = {
  CAPTCHA: ['캡차', 'Captcha', 'captcha', 'CAPTCHA', '인증', 'verification', 'Verification'],
  ERROR: ['[에러]', '에러페이지', '시스템오류', 'Error', '404', '500']
};

/**
 * Proxy configuration class
 */
class ProxyConfig {
  constructor(proxyString) {
    this.server = '';
    this.auth = null;
    this.parseProxy(proxyString);
  }

  parseProxy(proxyString) {
    if (!proxyString) return;
    
    const parts = proxyString.split(':');
        if (parts.length === 4) {
      this.server = `${parts[0]}:${parts[1]}`;
      this.auth = { username: parts[2], password: parts[3] };
        } else {
      this.server = proxyString;
    }
  }

  getBrowserArgs() {
    return this.server ? [`--proxy-server=${this.server}`] : [];
  }
}

/**
 * Referer manager class
 */
class RefererManager {
  constructor() {
    this.currentUrl = null;
    this.previousUrl = null;
  }

  setCurrentUrl(url) {
    this.previousUrl = this.currentUrl;
    this.currentUrl = url;
  }

  getReferer() {
    return this.previousUrl || 'https://www.google.com/';
  }

  getHeaders() {
    return {
      'Referer': this.getReferer(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };
  }

  updateHeadersForUrl(url) {
    this.setCurrentUrl(url);
    return this.getHeaders();
  }
}

/**
 * Browser manager class
 */
class BrowserManager {
  constructor(browserConfig, proxyConfig, logger) {
    this.browserConfig = browserConfig;
    this.proxyConfig = proxyConfig;
    this.refererManager = new RefererManager();
    this.logger = logger;
  }

  async launch() {
    const args = [
      ...this.browserConfig.args,
      ...this.proxyConfig.getBrowserArgs()
    ].filter(Boolean);

    return await puppeteer.launch({
      ...this.browserConfig,
      args,
      protocolTimeout: 60000 // Increase protocol timeout to 60 seconds
    });
  }

  async setupPage(browser) {
    const page = await browser.newPage();
    
    if (this.proxyConfig.auth) {
      await page.authenticate(this.proxyConfig.auth);
    }
    
    // Let stealth plugin handle user agent
    // await page.setUserAgent(this.getRandomUserAgent());
    await page.setViewport(this.getRandomViewport());
    
    // Debug: check if stealth is working
    const userAgent = await page.evaluate(() => navigator.userAgent);
    this.logger?.info(`Stealth User Agent: ${userAgent}`);
    
    return page;
  }

  async closeBrowser(browser) {
    if (browser) {
      try {
        // Close all pages first
        const pages = await browser.pages();
        await Promise.all(pages.map(page => page.close()));
        
        // Then close browser
      await browser.close();
        this.logger?.info('Browser closed successfully');
      } catch (error) {
        this.logger?.warn(`Error closing browser: ${error.message}`);
        try {
      await browser.close();
        } catch (e) {
          // Force close if needed
        }
      }
    }
  }

  async navigateWithReferer(page, url, options = {}) {
    const headers = this.refererManager.updateHeadersForUrl(url);
    
    // Set extra headers for this navigation
    await page.setExtraHTTPHeaders(headers);
    
    const navigationOptions = {
      // waitUntil: 'networkidle2',
      timeout: CONFIG.TIMEOUTS.NAVIGATION,
      ...options
    };

    this.logger?.info(`Navigating to: ${url} with referer: ${headers.Referer}`);
    
    return await page.goto(url, navigationOptions);
  }

  getRandomUserAgent() {
  const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

  getRandomViewport() {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
      { width: 1280, height: 800 }
  ];
  return viewports[Math.floor(Math.random() * viewports.length)];
} 
}

/**
 * Human behavior simulator class
 */
class HumanBehaviorSimulator {
  constructor(logger) {
    this.logger = logger;
  }

  async simulateBehavior(page) {
    this.logger.info('Memulai simulasi perilaku manusia...');
    
    await randomDelay(CONFIG.DELAYS.MEDIUM.min, CONFIG.DELAYS.MEDIUM.max);
    await this.scrollDown(page);
    await this.simulateMouseMove(page);
    await this.simulateRandomClicks(page);
    await this.closeDropdownsAndOverlays(page);
    await this.scrollUp(page);
    
    this.logger.info('Simulasi perilaku manusia selesai');
  }

  async simulateExtendedBehavior(page) {
    this.logger.info('Memulai extended human behavior simulation...');
    
    try {
      // Check if page is still valid
      const pageTitle = await page.title();
      this.logger.info(`Page title: ${pageTitle}`);
      
      // Multiple scroll sessions with longer delays
      for (let i = 0; i < 3; i++) {
        this.logger.info(`Scroll session ${i + 1}/3...`);
        try {
          await this.scrollDown(page);
          this.logger.info(`✅ Scroll down ${i + 1} selesai`);
          await randomDelay(3000, 6000); // Longer delays
          
          await this.simulateMouseMove(page);
          this.logger.info(`✅ Mouse move ${i + 1} selesai`);
          await randomDelay(2000, 4000);
        } catch (error) {
          this.logger.warn(`Error dalam scroll session ${i + 1}: ${error.message}`);
        }
      }
      
      // More mouse movements
      this.logger.info('Additional mouse movements...');
      try {
        await this.simulateMouseMove(page);
        this.logger.info('✅ Additional mouse movements selesai');
      } catch (error) {
        this.logger.warn(`Error dalam additional mouse movements: ${error.message}`);
      }
      await randomDelay(2000, 4000);
      
      // Random clicks with longer intervals
      this.logger.info('Random clicks...');
      try {
        await this.simulateRandomClicks(page);
        this.logger.info('✅ Random clicks selesai');
      } catch (error) {
        this.logger.warn(`Error dalam random clicks: ${error.message}`);
      }
      await randomDelay(3000, 5000);
      
      // Close any dropdowns/overlays
      this.logger.info('Closing dropdowns/overlays...');
      try {
        await this.closeDropdownsAndOverlays(page);
        this.logger.info('✅ Dropdowns/overlays closed');
      } catch (error) {
        this.logger.warn(`Error dalam closing dropdowns: ${error.message}`);
      }
      await randomDelay(2000, 4000);
      
      // Final scroll up
      this.logger.info('Final scroll up...');
      try {
        await this.scrollUp(page);
        this.logger.info('✅ Final scroll up selesai');
      } catch (error) {
        this.logger.warn(`Error dalam final scroll up: ${error.message}`);
      }
      await randomDelay(2000, 4000);
      
      this.logger.info('✅ Extended human behavior simulation selesai');
    } catch (error) {
      this.logger.error(`❌ Error dalam extended human behavior: ${error.message}`);
      throw error;
    }
  }

  async scrollDown(page) {
    this.logger.info('Scrolling down...');
    try {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
          const distance = 150 + Math.random() * 100;
          const maxSteps = 8 + Math.floor(Math.random() * 5);
      let steps = 0;
          
      const scrollDown = setInterval(() => {
        window.scrollBy(0, distance);
        steps++;
        if (steps >= maxSteps) {
          clearInterval(scrollDown);
              resolve();
            }
          }, 200 + Math.random() * 300);
        });
      });
      this.logger.info('✅ Scroll down completed');
    } catch (error) {
      this.logger.warn(`Error dalam scroll down: ${error.message}`);
    }
  }

  async scrollUp(page) {
    this.logger.info('Scrolling up...');
    try {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          const distance = 100 + Math.random() * 80;
          const maxSteps = 5 + Math.floor(Math.random() * 3);
          let steps = 0;
          
          const scrollUp = setInterval(() => {
            window.scrollBy(0, -distance);
            steps++;
            if (steps >= maxSteps) {
              clearInterval(scrollUp);
              resolve();
            }
          }, 150 + Math.random() * 200);
    });
  });
      this.logger.info('✅ Scroll up completed');
    } catch (error) {
      this.logger.warn(`Error dalam scroll up: ${error.message}`);
    }
} 

  async simulateMouseMove(page) {
    this.logger.info('Simulating mouse movements...');
    try {
  const moves = [
    { x: 100 + Math.random() * 100, y: 100 + Math.random() * 50 },
    { x: 150 + Math.random() * 100, y: 150 + Math.random() * 50 },
        { x: 200 + Math.random() * 100, y: 200 + Math.random() * 50 }
  ];
      
      for (let i = 0; i < moves.length; i++) {
        const pos = moves[i];
        this.logger.info(`Mouse move ${i + 1}/${moves.length} to (${Math.round(pos.x)}, ${Math.round(pos.y)})`);
    await page.mouse.move(pos.x, pos.y, { steps: 15 + Math.floor(Math.random() * 10) });
        await this.wait(150 + Math.random() * 200);
      }
      this.logger.info('✅ Mouse movements completed');
    } catch (error) {
      this.logger.warn(`Error dalam mouse movements: ${error.message}`);
    }
  }

  async simulateRandomClicks(page) {
    this.logger.info('Simulating random clicks...');
    
    const safeSelectors = [
      'button[type="button"]:not([class*="search"]):not([class*="Search"])',
      '.btn:not([class*="search"]):not([class*="Search"])',
      '.button:not([class*="search"]):not([class*="Search"])',
      'a[href="#"]:not([class*="search"]):not([class*="Search"])',
      'span[role="button"]:not([class*="search"]):not([class*="Search"])'
    ];

    const excludeSelectors = [
      'input[type="text"]', 'input[type="search"]', 'textarea', 'select',
      '[class*="search"]', '[class*="Search"]', '[class*="dropdown"]', '[class*="Dropdown"]',
      '[class*="suggestion"]', '[class*="Suggestion"]', '[class*="autocomplete"]', '[class*="Autocomplete"]',
      '[class*="overlay"]', '[class*="Overlay"]', '[class*="modal"]', '[class*="Modal"]',
      '[class*="popup"]', '[class*="Popup"]'
    ];

    let clickPerformed = false;
    
    for (let i = 0; i < safeSelectors.length; i++) {
      const selector = safeSelectors[i];
      try {
        this.logger.info(`Trying selector ${i + 1}/${safeSelectors.length}: ${selector}`);
        const elements = await page.$$(selector);
        this.logger.info(`Found ${elements.length} elements with selector: ${selector}`);
        
        if (elements.length > 0) {
          const filteredElements = await this.filterElements(elements, excludeSelectors);
          this.logger.info(`After filtering: ${filteredElements.length} elements`);
          
          if (filteredElements.length > 0) {
            const randomIndex = Math.floor(Math.random() * Math.min(filteredElements.length, 3));
            const element = filteredElements[randomIndex];
            
            const isVisible = await element.evaluate(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && 
                     window.getComputedStyle(el).display !== 'none' &&
                     window.getComputedStyle(el).visibility !== 'hidden';
            });
            
            if (isVisible) {
              this.logger.info(`✅ Clicking element ${randomIndex + 1}/${filteredElements.length}`);
              await element.hover();
              await randomDelay(CONFIG.DELAYS.SHORT.min, CONFIG.DELAYS.SHORT.max);
              await element.click();
              await randomDelay(CONFIG.DELAYS.MEDIUM.min, CONFIG.DELAYS.MEDIUM.max);
              clickPerformed = true;
              this.logger.info('✅ Random click completed');
              break;
            } else {
              this.logger.info(`Element ${randomIndex + 1} not visible`);
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Error with selector ${selector}: ${error.message}`);
        continue;
      }
    }
    
    if (!clickPerformed) {
      this.logger.warn('⚠️ No suitable element found for random click');
    }
  }

  async filterElements(elements, excludeSelectors) {
    const filteredElements = [];
    
    for (const element of elements) {
      const isExcluded = await element.evaluate(el => {
        for (const excludeSelector of excludeSelectors) {
          if (el.matches(excludeSelector) || el.closest(excludeSelector)) {
            return true;
          }
        }
        return false;
      });
      
      if (!isExcluded) {
        filteredElements.push(element);
      }
    }
    
    return filteredElements;
  }

  async closeDropdownsAndOverlays(page) {
    try {
      this.logger.info('Checking for dropdowns/overlays to close...');
      
      const closeSelectors = [
        '[class*="suggestion"]', '[class*="Suggestion"]', '[class*="autocomplete"]', '[class*="Autocomplete"]',
        '[class*="dropdown"]', '[class*="Dropdown"]', '[class*="overlay"]', '[class*="Overlay"]',
        '[class*="modal"]', '[class*="Modal"]', '[class*="popup"]', '[class*="Popup"]',
        '.search_suggestion', '.searchSuggestion', '.autocomplete_list', '.dropdown_menu', '.overlay_background',
        '[class*="close"]', '[class*="Close"]', '[class*="cancel"]', '[class*="Cancel"]',
        '[aria-label*="close"]', '[aria-label*="Close"]', 'body'
      ];
      
      for (const selector of closeSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            for (const element of elements) {
              const isVisible = await element.evaluate(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return rect.width > 0 && rect.height > 0 && 
                       style.display !== 'none' && 
                       style.visibility !== 'hidden' &&
                       style.opacity !== '0';
              });
              
              if (isVisible) {
                if (selector === 'body') {
                  await page.keyboard.press('Escape');
                  this.logger.info('Pressed ESC key to close dropdown/overlay');
                  await randomDelay(500, 1000);
                } else {
                  await element.click();
                  this.logger.info(`Clicked element to close: ${selector}`);
                  await randomDelay(500, 1000);
                }
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
      
      try {
        await page.mouse.click(10, 10);
        this.logger.info('Clicked outside to close any open dropdowns');
        await randomDelay(500, 1000);
      } catch (error) {
        // Ignore error
      }
      
      this.logger.info('Dropdown/overlay cleanup completed');
    } catch (error) {
      this.logger.warn(`Error closing dropdowns/overlays: ${error.message}`);
    }
  }

  async wait(ms) {
  return new Promise(res => setTimeout(res, ms));
  }
}

/**
 * Page validator class
 */
class PageValidator {
  static isCaptchaPage(pageTitle, url) {
    const captchaPatterns = [
      '캡차', 'Captcha', 'captcha', 'CAPTCHA', '인증', 'verification', 'Verification',
      '보안', 'Security', 'security', '확인', 'Confirm', 'confirm',
      '로봇', 'Robot', 'robot', '자동화', 'Automation', 'automation'
    ];
    
    return captchaPatterns.some(pattern => 
      pageTitle.toLowerCase().includes(pattern.toLowerCase()) || 
      url.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  static isErrorPage(pageTitle, url) {
    const errorPatterns = [
      '[에러]', '에러페이지', '시스템오류', 'Error', '404', '500',
      '페이지를 찾을 수 없습니다', 'Page Not Found', 'Not Found',
      '접근할 수 없습니다', 'Access Denied', 'Forbidden', '403',
      '서버 오류', 'Server Error', 'Internal Server Error',
      '오류', '에러', 'error', 'Error', 'ERROR'
    ];
    
    return errorPatterns.some(pattern => 
      pageTitle.toLowerCase().includes(pattern.toLowerCase()) || 
      url.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  static isSmartStoreOrAder(url) {
    return url.includes('smartstore.naver.com') || url.includes('ader.naver.com');
  }
  
  static isBlockedPage(pageTitle, url) {
    const blockPatterns = [
      '차단', 'Blocked', 'blocked', '제한', 'Limited', 'limited',
      '일시적', 'Temporary', 'temporary', '정지', 'Suspended', 'suspended',
      '비정상', 'Abnormal', 'abnormal', '의심', 'Suspicious', 'suspicious'
    ];
    
    return blockPatterns.some(pattern => 
      pageTitle.toLowerCase().includes(pattern.toLowerCase()) || 
      url.toLowerCase().includes(pattern.toLowerCase())
    );
  }
}

/**
 * Cookie manager class
 */
class CookieManager {
  constructor(logger) {
    this.logger = logger;
  }

  async findXWtmCookie(page) {
    const cookies = await page.cookies();
    return cookies.find(cookie => cookie.name === 'X-Wtm-Cpt-Tk');
  }

  async saveCookies(cookies) {
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    this.logger.info(`Cookies disimpan ke ${COOKIES_FILE} (total: ${cookies.length})`);
  }

  async loadCookies() {
    return JSON.parse(fs.readFileSync(COOKIES_FILE));
  }

  async setCookiesToPage(page, cookies) {
    await page.setCookie(...cookies);
    this.logger.info(`Cookies di-set ke page (${cookies.length} cookies)`);
  }
}

/**
 * Main scraper class
 */
class NaverProductScraper {
  constructor(logger) {
    this.logger = logger;
    this.humanSimulator = new HumanBehaviorSimulator(logger);
    this.cookieManager = new CookieManager(logger);
    this.browserManager = null;
  }

  async scrape({ productUrl, proxy, browserConfig, options = {} }) {
    let attempt = 0;
    let result = null;

    while (attempt < MAX_RETRIES && !result) {
      attempt++;
      let browser;

      if (attempt == 2) {
        //split productUrl by ?
        const urlParts = productUrl.split('?');
        productUrl = urlParts[0];
      }
      
      try {
        const proxyConfig = new ProxyConfig(proxy);
        this.browserManager = new BrowserManager(browserConfig, proxyConfig, this.logger);
        
        // Step 1: Direct access to product URL with cookies from file
        browser = await this.browserManager.launch();
        const productPage = await this.browserManager.setupPage(browser);
        
        result = await this.accessProductPageWithCookies(productPage, productUrl, attempt);
        await this.browserManager.closeBrowser(browser);
        
      } catch (err) {
        this.logger.warn(`Percobaan ${attempt} gagal: ${err.message}`);
        if (browser) await this.browserManager.closeBrowser(browser);
        await randomDelay(1000, 5000);
        
        if (attempt >= MAX_RETRIES) {
          this.logger.error(`Gagal scrape ${productUrl} setelah ${MAX_RETRIES} percobaan.`);
        }
      }
    }

    if (!result) {
      return {
        error: 'SMARTSTORE_ACCESS_FAILED',
        message: 'Tidak bisa akses smartstore atau cookie X-Wtm-Cpt-Tk tidak ditemukan setelah semua percobaan',
        productUrl: productUrl
      };
    }

    return result;
  }

  async browseNaverAndGetCookies(page, browser, attempt, browserManager) {
    try {
      this.logger.info(`[${attempt}] Mulai browsing di: ${CONFIG.URLS.NAVER}`);
      await browserManager.navigateWithReferer(page, CONFIG.URLS.NAVER, { 
        waitUntil: 'networkidle2' 
      });
      
      this.logger.info(`[${attempt}] ✅ Network idle di Naver`);
      
      // Debug: check page title and URL
      const pageTitle = await page.title();
      const pageUrl = page.url();
      this.logger.info(`[${attempt}] Page title: ${pageTitle}`);
      this.logger.info(`[${attempt}] Page URL: ${pageUrl}`);
      
      // Wait for page to be fully loaded
      await randomDelay(3000, 5000);
      
      // Debug: check if page content is loaded
      try {
        const bodyText = await page.evaluate(() => document.body.innerText);
        this.logger.info(`[${attempt}] Body text length: ${bodyText.length}`);
        this.logger.info(`[${attempt}] Body preview: ${bodyText.substring(0, 200)}...`);
      } catch (error) {
        this.logger.warn(`[${attempt}] Error getting body text: ${error.message}`);
      }
      
      // Additional wait for shortcuts to be visible
      try {
        await page.waitForSelector('li.shortcut_item a.link_service', { timeout: 10000 });
        this.logger.info(`[${attempt}] ✅ Shortcuts sudah ter-load`);
        
        // Debug: count shortcuts
        const shortcuts = await page.$$('li.shortcut_item a.link_service');
        this.logger.info(`[${attempt}] Jumlah shortcuts ditemukan: ${shortcuts.length}`);
      } catch (error) {
        this.logger.warn(`[${attempt}] Shortcuts tidak ditemukan: ${error.message}`);
      }
      
          const shoppingPage = await this.openShoppingTab(page, browser, attempt);
    if (!shoppingPage) {
      throw new Error('Tidak bisa membuka tab shopping');
    }

    // Check if shopping page is already loaded and ready
    const shoppingUrl = shoppingPage.url();
    this.logger.info(`[${attempt}] Shopping page URL: ${shoppingUrl}`);
    
    if (shoppingUrl.includes('shopping.naver.com')) {
      this.logger.info(`[${attempt}] ✅ Shopping page sudah terbuka dan siap, langsung lanjut ke human behavior`);
      await this.findProductAndGetCookies(shoppingPage, attempt);
    } else {
      this.logger.warn(`[${attempt}] ⚠️ Shopping page belum terbuka dengan benar, URL: ${shoppingUrl}`);
      throw new Error('Shopping page tidak terbuka dengan benar');
    }
      this.logger.info(`[${attempt}] ✅ Cookie initialization completed successfully`);
      
    } catch (error) {
      this.logger.error(`[${attempt}] ❌ Error in browseNaverAndGetCookies: ${error.message}`);
      throw error; // Re-throw to trigger retry
    } finally {
      // Always close browser after cookie initialization or error
      this.logger.info(`[${attempt}] 🔄 Closing browser...`);
      await browserManager.closeBrowser(browser);
    }
  }

  async openShoppingTab(page, browser, attempt) {
    this.logger.info(`[${attempt}] Mencari link shopping...`);
    
    // Check if shopping page is already open
    const pages = await browser.pages();
    const existingShoppingPage = pages.find(p => p.url().includes('shopping.naver.com'));
    
    if (existingShoppingPage) {
      this.logger.info(`[${attempt}] ✅ Shopping page sudah terbuka: ${existingShoppingPage.url()}`);
      return existingShoppingPage;
    }
    
    // Wait for shopping link to be available
    try {
      this.logger.info(`[${attempt}] Menunggu shopping link ter-load...`);
      await page.waitForSelector('li.shortcut_item a.link_service[href*="shopping.naver.com"]', { timeout: 15000 });
      this.logger.info(`[${attempt}] ✅ Shopping link sudah ter-load`);
    } catch (error) {
      this.logger.warn(`[${attempt}] Shopping link selector tidak ditemukan: ${error.message}`);
      // Continue with alternative selectors
    }
    
    // Try multiple selectors for shopping link
    const shoppingSelectors = [
      'li.shortcut_item a.link_service[href*="shopping.naver.com"]',
      'li.shortcut_item a[href*="shopping.naver.com"]',
      'a.link_service[href*="shopping.naver.com"]',
      'a[href*="shopping.naver.com"]',
      'a.link_service[href*="shopping"]',
      'a[href*="shopping"]'
    ];
    
    let shoppingPage = null;
    
    for (const selector of shoppingSelectors) {
      try {
        this.logger.info(`[${attempt}] Coba selector: ${selector}`);
        
        // Check if element exists and is visible
        const element = await page.$(selector);
        if (!element) {
          this.logger.debug(`[${attempt}] Element tidak ditemukan dengan selector: ${selector}`);
          continue;
        }
        
        const isVisible = await element.isVisible();
        if (!isVisible) {
          this.logger.debug(`[${attempt}] Element tidak visible dengan selector: ${selector}`);
          continue;
        }
        
        // Get href for logging with timeout
        const href = await element.evaluate(el => el.href, { timeout: 10000 });
        this.logger.info(`[${attempt}] ✅ Ditemukan shopping link: ${href}`);
        
        // Click the element
        await element.click();
        await randomDelay(2000, 3000);
        
        // Check if new page opened
        const pages = await browser.pages();
        shoppingPage = pages.find(p => p.url().includes('shopping'));
        
        if (shoppingPage) {
          this.logger.info(`[${attempt}] ✅ Shopping page berhasil dibuka: ${shoppingPage.url()}`);
          await this.setupShoppingPage(shoppingPage);
          return shoppingPage;
        }
      } catch (error) {
        this.logger.warn(`[${attempt}] Error dengan selector ${selector}: ${error.message}`);
      }
    }
    
    // Fallback: navigate directly to shopping URL
    this.logger.info(`[${attempt}] Fallback: Navigasi langsung ke shopping URL`);
    try {
      const newPage = await browser.newPage();
      await newPage.goto(CONFIG.URLS.SHOPPING, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.setupShoppingPage(newPage);
      return newPage;
    } catch (fallbackError) {
      this.logger.error(`[${attempt}] Fallback juga gagal: ${fallbackError.message}`);
      throw new Error('Tidak bisa membuka shopping page');
    }
  }



  async setupShoppingPage(shoppingPage) {
    // Let stealth plugin handle user agent
    await shoppingPage.setViewport(new BrowserManager().getRandomViewport());
    
    // Simple wait for page to be ready
    try {
      await shoppingPage.waitForSelector('body', { timeout: 10000 });
    } catch (error) {
      this.logger.warn(`Body selector wait failed: ${error.message}`);
    }
    
    this.logger.info(`Shopping page URL: ${shoppingPage.url()}`);
  }

  async findProductAndGetCookies(shoppingPage, attempt) {
    this.logger.info(`[${attempt}] Mulai human behavior di shopping page...`);
    
    // Check if we're on shopping page
    const currentUrl = shoppingPage.url();
    this.logger.info(`[${attempt}] Current URL: ${currentUrl}`);
    
    if (!currentUrl.includes('shopping')) {
      this.logger.warn(`[${attempt}] ⚠️ Tidak di halaman shopping, current URL: ${currentUrl}`);
      throw new Error('Tidak di halaman shopping');
    }
    
    this.logger.info(`[${attempt}] ✅ Shopping page sudah siap, langsung lanjut ke human behavior`);
    
    // Add delay before human behavior with timeout
    this.logger.info(`[${attempt}] Menunggu sebelum human behavior...`);
    try {
      await Promise.race([
        randomDelay(5000, 10000), // 5-10 detik delay
        new Promise((_, reject) => setTimeout(() => reject(new Error('Delay timeout')), 15000))
      ]);
      this.logger.info(`[${attempt}] ✅ Delay selesai, mulai human behavior...`);
    } catch (error) {
      this.logger.warn(`[${attempt}] ⚠️ Delay timeout, langsung lanjut ke human behavior`);
    }
    
    // Extended human behavior simulation with timeout
    this.logger.info(`[${attempt}] Memulai extended human behavior simulation...`);
    try {
      await Promise.race([
        this.humanSimulator.simulateExtendedBehavior(shoppingPage),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Human behavior timeout')), 60000)) // 60s timeout
      ]);
      this.logger.info(`[${attempt}] ✅ Extended human behavior selesai`);
    } catch (error) {
      this.logger.error(`[${attempt}] ❌ Error dalam human behavior: ${error.message}`);
      if (error.message.includes('timeout')) {
        this.logger.warn(`[${attempt}] ⚠️ Human behavior timeout, lanjut ke step berikutnya`);
      }
    }
    
    // Get cookies from shopping page
    this.logger.info(`[${attempt}] Mengambil cookies dari shopping page...`);
    const cookies = await shoppingPage.cookies();
    this.logger.info(`[${attempt}] Total cookies ditemukan: ${cookies.length}`);
    
    // Filter cookies - exclude those containing "sus"
    const filteredCookies = cookies.filter(cookie => {
      const cookieKey = cookie.name.toLowerCase();
      const cookieValue = (cookie.value || '').toLowerCase();
      return !cookieKey.includes('sus') && !cookieValue.includes('sus');
    });
    
    this.logger.info(`[${attempt}] Filtered cookies: ${filteredCookies.length}/${cookies.length} (excluded ${cookies.length - filteredCookies.length} suspicious cookies)`);
    
    // Save filtered cookies to file
    await this.cookieManager.saveCookies(filteredCookies);
    
    this.logger.info(`[${attempt}] ✅ Filtered cookies berhasil disimpan ke file`);
    
    // Wait for shopping page to load and find product links
    this.logger.info(`[${attempt}] Menunggu shopping page load...`);
    
    // Check current URL first
    const shoppingUrl = shoppingPage.url();
    this.logger.info(`[${attempt}] Shopping page URL: ${shoppingUrl}`);
    
    // Wait a bit for page to load with timeout
    try {
      await Promise.race([
        randomDelay(3000, 5000),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Page load timeout')), 10000))
      ]);
    } catch (error) {
      this.logger.warn(`[${attempt}] ⚠️ Page load timeout, lanjut ke step berikutnya`);
    }
    
    try {
      await shoppingPage.waitForSelector(CONFIG.SELECTORS.PRODUCT_LINK, { timeout: 30000 });
      this.logger.info(`[${attempt}] ✅ Product links sudah muncul`);
    } catch (error) {
      this.logger.warn(`[${attempt}] Product links belum muncul: ${error.message}`);
      
      // Force action: try to scroll and refresh page
      this.logger.info(`[${attempt}] 🔄 Force action: scrolling and refreshing...`);
      try {
        await shoppingPage.evaluate(() => window.scrollTo(0, 500));
        await randomDelay(2000, 3000);
        await shoppingPage.evaluate(() => window.scrollTo(0, 1000));
        await randomDelay(2000, 3000);
        this.logger.info(`[${attempt}] ✅ Force scroll completed`);
      } catch (scrollError) {
        this.logger.warn(`[${attempt}] Error force scrolling: ${scrollError.message}`);
      }
      
      // Try to find any links on the page
      const allLinks = await shoppingPage.$$('a');
      this.logger.info(`[${attempt}] Total links di halaman: ${allLinks.length}`);
      
      // Log first few links for debugging
      for (let i = 0; i < Math.min(5, allLinks.length); i++) {
        try {
          const href = await allLinks[i].evaluate(el => el.href, { timeout: 10000 });
          const text = await allLinks[i].evaluate(el => el.textContent?.trim() || '', { timeout: 10000 });
          this.logger.info(`[${attempt}] Link ${i}: ${text} -> ${href}`);
        } catch (e) {
          this.logger.warn(`[${attempt}] Error getting link ${i}: ${e.message}`);
        }
      }
    }
    
    // Click on a product link and get NA_CO cookie with timeout
    this.logger.info(`[${attempt}] Mencari dan klik product link...`);
    try {
      await Promise.race([
        this.clickProductAndGetNACookie(shoppingPage, attempt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Product click timeout')), 45000)) // 45s timeout
      ]);
    } catch (error) {
      this.logger.error(`[${attempt}] ❌ Error dalam click product: ${error.message}`);
      if (error.message.includes('timeout')) {
        this.logger.warn(`[${attempt}] ⚠️ Product click timeout, lanjut ke step berikutnya`);
      }
    }
  }

  async selectBestProductLink(productLinks, attempt) {
    const smartstoreLinks = [];
    const aderLinks = [];
    
    for (let i = 0; i < productLinks.length; i++) {
      try {
        const href = await productLinks[i].evaluate(el => el.href, { timeout: 10000 });
        if (href.includes('smartstore.naver.com')) {
          smartstoreLinks.push({ element: productLinks[i], href, index: i, type: 'smartstore' });
        } else if (href.includes('ader.naver.com')) {
          aderLinks.push({ element: productLinks[i], href, index: i, type: 'ader' });
        }
      } catch (error) {
        this.logger.warn(`[${attempt}] Error evaluating link ${i}: ${error.message}`);
      }
    }
    
    if (smartstoreLinks.length > 0) {
      this.logger.info(`[${attempt}] ✅ Ditemukan ${smartstoreLinks.length} link smartstore dari ${productLinks.length} total link`);
      const randomIndex = Math.floor(Math.random() * smartstoreLinks.length);
      const selected = smartstoreLinks[randomIndex];
      this.logger.info(`[${attempt}] Pilih link smartstore ${randomIndex + 1}/${smartstoreLinks.length}: ${selected.href}`);
      return selected;
    } else if (aderLinks.length > 0) {
      this.logger.info(`[${attempt}] ✅ Tidak ada smartstore, ditemukan ${aderLinks.length} link ader dari ${productLinks.length} total link`);
      const randomIndex = Math.floor(Math.random() * aderLinks.length);
      const selected = aderLinks[randomIndex];
      this.logger.info(`[${attempt}] Pilih link ader ${randomIndex + 1}/${aderLinks.length}: ${selected.href}`);
      return selected;
    } else {
      this.logger.warn(`[${attempt}] Tidak ada link smartstore atau ader ditemukan, gunakan link random`);
      const randomIndex = Math.floor(Math.random() * Math.min(productLinks.length, 3));
      const element = productLinks[randomIndex];
      try {
        const href = await element.evaluate(el => el.href, { timeout: 10000 });
        this.logger.info(`[${attempt}] Pilih link fallback: ${href}`);
        return { element, href, type: 'fallback' };
      } catch (error) {
        this.logger.warn(`[${attempt}] Error getting fallback link href: ${error.message}`);
        return { element, href: 'unknown', type: 'fallback' };
      }
    }
  }

  async clickProductAndHandlePage(selectedLink, shoppingPage, attempt) {
    await selectedLink.element.click();
    await randomDelay(3000, 5000);
    
    // Wait for page load
    this.logger.info(`[${attempt}] Menunggu page load sempurna setelah klik product...`);
    try {
      await shoppingPage.waitForNavigation({ waitUntil: 'networkidle0', timeout: 150000 });
      this.logger.info(`[${attempt}] ✅ Navigation selesai`);
    } catch (error) {
      this.logger.warn(`Navigation wait failed: ${error.message}`);
    }
    
    try {
      await shoppingPage.waitForSelector(CONFIG.SELECTORS.BODY, { timeout: 10000 });
      this.logger.info(`[${attempt}] ✅ Body element loaded`);
      await randomDelay(3000, 5000);
    } catch (error) {
      this.logger.warn(`Body element wait failed: ${error.message}`);
    }
    
    // Check navigation and page type
    const currentUrl = shoppingPage.url();
    let finalStoreType = '';
    
    if (PageValidator.isSmartStoreOrAder(currentUrl)) {
      finalStoreType = currentUrl.includes('smartstore.naver.com') ? 'smartstore' : 'ader';
      this.logger.info(`[${attempt}] ✅ Langsung ke ${finalStoreType}: ${currentUrl}`);
    } else {
      this.logger.info(`[${attempt}] Menunggu redirect ke smartstore/ader...`);
      await shoppingPage.waitForFunction(() => {
        return window.location.href.includes('smartstore.naver.com') || 
               window.location.href.includes('ader.naver.com');
      }, { timeout: CONFIG.TIMEOUTS.FUNCTION_WAIT });
      
      const finalUrl = shoppingPage.url();
      finalStoreType = finalUrl.includes('smartstore.naver.com') ? 'smartstore' : 'ader';
      this.logger.info(`[${attempt}] ✅ Berhasil redirect ke ${finalStoreType}: ${finalUrl}`);
    }
    
    // Validate page
    const pageTitle = await shoppingPage.title();
    const currentUrlAfterClick = shoppingPage.url();
    
    if (PageValidator.isCaptchaPage(pageTitle, currentUrlAfterClick)) {
      this.logger.warn(`[${attempt}] ❌ Captcha page terdeteksi: ${pageTitle}`);
      await this.handleErrorPage(shoppingPage, attempt, this.browserManager);
      return false;
    }
    
    if (PageValidator.isErrorPage(pageTitle, currentUrlAfterClick)) {
      this.logger.warn(`[${attempt}] ❌ Error page terdeteksi: ${pageTitle}`);
      await this.handleErrorPage(shoppingPage, attempt, this.browserManager);
      return false;
    }
    
    // Human-like behavior
    this.logger.info(`[${attempt}] Memulai human-like behavior di ${finalStoreType} page...`);
    await randomDelay(CONFIG.DELAYS.LONG.min, CONFIG.DELAYS.LONG.max);
    await this.humanSimulator.simulateMouseMove(shoppingPage);
    await randomDelay(CONFIG.DELAYS.MEDIUM.min, CONFIG.DELAYS.MEDIUM.max);
    await this.humanSimulator.scrollDown(shoppingPage);
    await randomDelay(CONFIG.DELAYS.MEDIUM.min, CONFIG.DELAYS.MEDIUM.max);
    await this.humanSimulator.simulateMouseMove(shoppingPage);
    await randomDelay(CONFIG.DELAYS.MEDIUM.min, CONFIG.DELAYS.MEDIUM.max);
    this.logger.info(`[${attempt}] Human-like behavior selesai`);
    
    // Check for cookies
    const xWtmCookie = await this.cookieManager.findXWtmCookie(shoppingPage);
    
    if (xWtmCookie) {
      this.logger.info(`[${attempt}] ✅ Cookie X-Wtm-Cpt-Tk ditemukan di smartstore!`);
      const cookies = await shoppingPage.cookies();
      await this.cookieManager.setCookiesToPage(shoppingPage, cookies);
      await this.cookieManager.saveCookies(cookies);
      return true;
    } else {
      return await this.huntForCookies(shoppingPage, attempt);
    }
  }

  async handleErrorPage(page, attempt, browserManager) {
    this.logger.info(`[${attempt}] Kembali ke halaman sebelumnya...`);
    await page.goBack();
    await randomDelay(CONFIG.DELAYS.MEDIUM.min, CONFIG.DELAYS.MEDIUM.max);
    
    const backUrl = page.url();
    if (!backUrl.includes('shopping.naver.com')) {
      this.logger.warn(`[${attempt}] Tidak kembali ke shopping page, navigate manual...`);
      await browserManager.navigateWithReferer(page, CONFIG.URLS.SHOPPING);
      await randomDelay(CONFIG.DELAYS.MEDIUM.min, CONFIG.DELAYS.MEDIUM.max);
    } else {
      this.logger.info(`[${attempt}] ✅ Berhasil kembali ke shopping page: ${backUrl}`);
    }
  }

  async huntForCookies(page, attempt) {
    this.logger.info(`[${attempt}] Cookie X-Wtm-Cpt-Tk belum ditemukan, scroll lagi untuk trigger cookie generation...`);
    
    let cookieScrollAttempts = 0;
    const maxCookieScrollAttempts = 5;
    
    while (cookieScrollAttempts < maxCookieScrollAttempts) {
      cookieScrollAttempts++;
      this.logger.info(`[${attempt}] Cookie scroll attempt ${cookieScrollAttempts}/${maxCookieScrollAttempts}...`);
      
      await this.humanSimulator.scrollDown(page);
      await randomDelay(CONFIG.DELAYS.MEDIUM.min, CONFIG.DELAYS.MEDIUM.max);
      
      this.logger.info(`[${attempt}] Cek ulang cookies setelah scroll...`);
      const xWtmCookie = await this.cookieManager.findXWtmCookie(page);
      
      if (xWtmCookie) {
        this.logger.info(`[${attempt}] ✅ Setelah scroll ${cookieScrollAttempts}, Cookie X-Wtm-Cpt-Tk ditemukan!`);
        const cookies = await page.cookies();
        await this.cookieManager.setCookiesToPage(page, cookies);
        await this.cookieManager.saveCookies(cookies);
        return true;
      } else {
        this.logger.info(`[${attempt}] Setelah scroll ${cookieScrollAttempts}, Cookie X-Wtm-Cpt-Tk masih belum ditemukan`);
        if (cookieScrollAttempts < maxCookieScrollAttempts) {
          this.logger.info(`[${attempt}] Scroll lebih jauh lagi untuk trigger cookie...`);
          await this.humanSimulator.scrollDown(page);
          await randomDelay(1000, 2000);
        }
      }
    }
    
    this.logger.warn(`[${attempt}] ❌ Setelah ${maxCookieScrollAttempts} scroll attempts, Cookie X-Wtm-Cpt-Tk masih belum ditemukan`);
    return false;
  }

  async scrollForMoreProducts(page, productLinks, attempt) {
    this.logger.info(`[${attempt}] Link produk belum muncul, scroll ke bawah untuk load lebih banyak produk...`);
    
    let scrollAttempts = 0;
    const maxScrollAttempts = 3;
    let productLinksUpdated = false;
    
    while (!productLinksUpdated && scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;
      this.logger.info(`[${attempt}] Scroll attempt ${scrollAttempts}/${maxScrollAttempts}...`);
      
      await this.humanSimulator.scrollDown(page);
      await randomDelay(CONFIG.DELAYS.MEDIUM.min, CONFIG.DELAYS.MEDIUM.max);
      
      this.logger.info(`[${attempt}] Cek ulang link produk setelah scroll...`);
      const productLinksAfterScroll = await page.$$(CONFIG.SELECTORS.PRODUCT_LINK);
      
      if (productLinksAfterScroll.length > productLinks.length) {
        this.logger.info(`[${attempt}] ✅ Setelah scroll ${scrollAttempts}, ditemukan ${productLinksAfterScroll.length} link (sebelumnya ${productLinks.length})`);
        productLinks.length = 0;
        productLinks.push(...productLinksAfterScroll);
        productLinksUpdated = true;
        break;
      } else {
        this.logger.info(`[${attempt}] Setelah scroll ${scrollAttempts}, jumlah link masih sama (${productLinksAfterScroll.length})`);
        if (scrollAttempts < maxScrollAttempts) {
          this.logger.info(`[${attempt}] Scroll lebih jauh lagi...`);
          await this.humanSimulator.scrollDown(page);
          await randomDelay(1000, 2000);
        }
      }
    }
    
    if (!productLinksUpdated) {
      this.logger.warn(`[${attempt}] ❌ Setelah ${maxScrollAttempts} scroll attempts, tidak ada penambahan link produk`);
    } else {
      this.logger.info(`[${attempt}] ✅ Product links berhasil diupdate, lanjut ke iterasi berikutnya untuk filter smartstore/ader...`);
    }
  }

  async accessProductPageWithCookies(page, productUrl, attempt) {
    // Load and merge cookies from file
    const cookiesFromFile = await this.cookieManager.loadCookies();
    
    // Check if cookies are fresh enough
    if (!this.areCookiesFresh(cookiesFromFile)) {
      this.logger.warn(`[${attempt}] Cookies sudah expired atau terlalu lama, perlu refresh...`);
      // Note: In production, you might want to trigger cookie refresh here
    }
    
    const mergedCookies = this.mergeCookies(cookiesFromFile);
    await this.cookieManager.setCookiesToPage(page, mergedCookies);

    // Inject NA_CO cookie if available
    try {
      const naCoData = JSON.parse(fs.readFileSync('na_co_cookie.json', 'utf8'));
      if (naCoData && naCoData.cookie) {
        await page.setCookie(naCoData.cookie);
        this.logger.info('NA_CO cookie injected to browser');
      }
    } catch (e) {
      this.logger && this.logger.warn('NA_CO cookie not injected: ' + e.message);
    }
    
    // Set referer to shopping URL
    const shoppingUrl = CONFIG.URLS.SHOPPING;
    this.browserManager.refererManager.setCurrentUrl(shoppingUrl);
    
    this.logger.info(`[${attempt}] Navigasi ke product URL: ${productUrl} dengan referer: ${shoppingUrl}`);
    await this.browserManager.navigateWithReferer(page, productUrl, { 
      waitUntil: 'networkidle0' 
    });
    await randomDelay(1000, 5000);
    
    const preloaded = await page.evaluate(() => {
      return window.__PRELOADED_STATE__ ? JSON.stringify(window.__PRELOADED_STATE__) : null;
    });
    
    if (!preloaded) {
      throw new Error('__PRELOADED_STATE__ tidak ditemukan');
    }
    
    const result = JSON.parse(preloaded);
    this.logger.info(`✅ Berhasil ambil __PRELOADED_STATE__ dari ${productUrl}`);
    return result;
  }

  areCookiesFresh(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return false;
    }

    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    // Check if any cookie has expiration time
    for (const cookie of cookies) {
      if (cookie.expires) {
        const cookieTime = new Date(cookie.expires * 1000).getTime();
        if (cookieTime < now) {
          this.logger.debug(`Cookie ${cookie.name} expired at ${new Date(cookieTime).toISOString()}`);
          return false;
        }
      }
    }
    
    // Check file modification time as fallback
    try {
      const fs = require('fs');
      const stats = fs.statSync('naver_cookies.json');
      const fileAge = now - stats.mtime.getTime();
      
      if (fileAge > maxAge) {
        this.logger.debug(`Cookie file is ${Math.round(fileAge / (60 * 60 * 1000))} hours old`);
        return false;
      }
    } catch (error) {
      this.logger.debug('Could not check cookie file age');
    }
    
    return true;
  }

  mergeCookies(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) {
      this.logger.warn('Tidak ada cookies dari file, gunakan cookies kosong');
      return [];
    }

    const cookieMap = new Map();
    let naverCookies = 0;
    let shoppingCookies = 0;
    let overriddenCookies = 0;
    
    // Process cookies, shopping cookies will override naver cookies
    for (const cookie of cookies) {
      const key = `${cookie.name}-${cookie.domain}`;
      
      if (cookieMap.has(key)) {
        const existingCookie = cookieMap.get(key);
        const existingSource = this.getCookieSource(existingCookie);
        const newSource = this.getCookieSource(cookie);
        
        // Shopping cookies override Naver cookies
        if (existingSource === 'naver' && newSource === 'shopping') {
          cookieMap.set(key, cookie);
          overriddenCookies++;
          this.logger.debug(`Override cookie: ${cookie.name} (${existingSource} → ${newSource})`);
        } else if (existingSource === 'shopping' && newSource === 'naver') {
          // Keep shopping cookie, ignore naver cookie
          this.logger.debug(`Keep shopping cookie: ${cookie.name}, ignore naver cookie`);
        } else {
          // Same source, keep the latest one
          cookieMap.set(key, cookie);
        }
      } else {
        cookieMap.set(key, cookie);
        const source = this.getCookieSource(cookie);
        if (source === 'naver') naverCookies++;
        else if (source === 'shopping') shoppingCookies++;
      }
    }
    
    const mergedCookies = Array.from(cookieMap.values());
    this.logger.info(`Merged cookies: ${cookies.length} → ${mergedCookies.length} unique (Naver: ${naverCookies}, Shopping: ${shoppingCookies}, Overridden: ${overriddenCookies})`);
    
    return mergedCookies;
  }

  getCookieSource(cookie) {
    // Determine cookie source based on domain or path
    if (cookie.domain && cookie.domain.includes('shopping.naver.com')) {
      return 'shopping';
    } else if (cookie.domain && cookie.domain.includes('naver.com')) {
      return 'naver';
    } else if (cookie.path && cookie.path.includes('shopping')) {
      return 'shopping';
    } else {
      return 'naver'; // Default to naver
    }
  }

  async validateProductPage(page, attempt) {
    try {
      // Get page info
      const pageTitle = await page.title();
      const currentUrl = page.url();
      
      this.logger.info(`[${attempt}] Page title: ${pageTitle}`);
      this.logger.info(`[${attempt}] Current URL: ${currentUrl}`);
      
      // Check for captcha
      if (PageValidator.isCaptchaPage(pageTitle, currentUrl)) {
        this.logger.error(`[${attempt}] ❌ CAPTCHA detected! Title: ${pageTitle}`);
        throw new Error('CAPTCHA detected on product page');
      }
      
      // Check for error pages
      if (PageValidator.isErrorPage(pageTitle, currentUrl)) {
        this.logger.error(`[${attempt}] ❌ Error page detected! Title: ${pageTitle}`);
        throw new Error('Error page detected on product page');
      }
      
      // Check for blocked pages
      if (PageValidator.isBlockedPage(pageTitle, currentUrl)) {
        this.logger.error(`[${attempt}] ❌ Blocked page detected! Title: ${pageTitle}`);
        throw new Error('Blocked page detected on product page');
      }
      
      // Check if we're still on shopping page (should have navigated to product)
      if (currentUrl.includes('shopping.naver.com') && !currentUrl.includes('product')) {
        this.logger.warn(`[${attempt}] ⚠️ Still on shopping page, navigation might have failed`);
      }
      
      // Check for SmartStore or Ader URL
      if (!PageValidator.isSmartStoreOrAder(currentUrl)) {
        this.logger.warn(`[${attempt}] ⚠️ Not on SmartStore or Ader page: ${currentUrl}`);
      } else {
        this.logger.info(`[${attempt}] ✅ Valid product page detected: ${currentUrl}`);
      }
      
      // Check for common error indicators
      const errorIndicators = [
        '페이지를 찾을 수 없습니다',
        'Page Not Found',
        '404',
        '500',
        'Error',
        '에러',
        '오류',
        '접근할 수 없습니다',
        'Access Denied',
        'Forbidden'
      ];
      
      for (const indicator of errorIndicators) {
        if (pageTitle.includes(indicator) || currentUrl.includes(indicator)) {
          this.logger.error(`[${attempt}] ❌ Error indicator found: ${indicator}`);
          throw new Error(`Error indicator detected: ${indicator}`);
        }
      }
      
      // Check if page has product content
      try {
        const productContent = await page.$$('div[class*="product"], div[class*="Product"], .product_info, .productInfo');
        if (productContent.length === 0) {
          this.logger.warn(`[${attempt}] ⚠️ No product content found on page`);
        } else {
          this.logger.info(`[${attempt}] ✅ Product content found: ${productContent.length} elements`);
        }
      } catch (error) {
        this.logger.warn(`[${attempt}] Error checking product content: ${error.message}`);
      }
      
      this.logger.info(`[${attempt}] ✅ Page validation completed successfully`);
      
    } catch (error) {
      this.logger.error(`[${attempt}] ❌ Page validation failed: ${error.message}`);
      throw error;
    }
  }

  async clickProductAndGetNACookie(shoppingPage, attempt) {
    try {
      this.logger.info(`[${attempt}] Mencari product links (SmartStore/Ader)...`);
      
      // Check current URL
      const currentUrl = shoppingPage.url();
      this.logger.info(`[${attempt}] Current URL: ${currentUrl}`);
      
      // Get all product links
      const productLinks = await shoppingPage.$$(CONFIG.SELECTORS.PRODUCT_LINK);
      this.logger.info(`[${attempt}] Ditemukan ${productLinks.length} product links`);
      
      // If no links found, try alternative selectors
      if (productLinks.length === 0) {
        this.logger.info(`[${attempt}] Mencoba selector alternatif...`);
        const altLinks = await shoppingPage.$$('a[href*="smartstore"], a[href*="ader"], a[href*="product"]');
        this.logger.info(`[${attempt}] Ditemukan ${altLinks.length} links dengan selector alternatif`);
        
        if (altLinks.length > 0) {
          // Use alternative links
          for (let i = 0; i < altLinks.length; i++) {
            try {
                          const href = await altLinks[i].evaluate(el => el.href, { timeout: 10000 });
            this.logger.info(`[${attempt}] Link ${i}: ${href}`);
              
              if (href.includes('smartstore.naver.com')) {
                selectedLink = altLinks[i];
                selectedType = 'smartstore';
                this.logger.info(`[${attempt}] ✅ Ditemukan SmartStore link: ${href}`);
                break;
              } else if (href.includes('ader.naver.com')) {
                selectedLink = altLinks[i];
                selectedType = 'ader';
                this.logger.info(`[${attempt}] ✅ Ditemukan Ader link: ${href}`);
                break;
              }
            } catch (error) {
              this.logger.warn(`[${attempt}] Error checking alt link ${i}: ${error.message}`);
            }
          }
        }
      }
      
      // Find SmartStore or Ader links
      let selectedLink = null;
      let selectedType = '';
      
      for (let i = 0; i < productLinks.length; i++) {
        try {
          const href = await productLinks[i].evaluate(el => el.href, { timeout: 10000 });
          
          if (href.includes('smartstore.naver.com')) {
            selectedLink = productLinks[i];
            selectedType = 'smartstore';
            this.logger.info(`[${attempt}] ✅ Ditemukan SmartStore link: ${href}`);
            break;
          } else if (href.includes('ader.naver.com')) {
            selectedLink = productLinks[i];
            selectedType = 'ader';
            this.logger.info(`[${attempt}] ✅ Ditemukan Ader link: ${href}`);
            break;
          }
        } catch (error) {
          this.logger.warn(`[${attempt}] Error checking link ${i}: ${error.message}`);
        }
      }
      
      if (!selectedLink) {
        this.logger.warn(`[${attempt}] ❌ Tidak ada SmartStore atau Ader link ditemukan`);
        
        // Take screenshot for debugging
        try {
          await shoppingPage.screenshot({ path: `debug_shopping_page_${attempt}.png`, fullPage: true });
          this.logger.info(`[${attempt}] Screenshot disimpan: debug_shopping_page_${attempt}.png`);
        } catch (error) {
          this.logger.warn(`[${attempt}] Error screenshot: ${error.message}`);
        }
        
        return;
      }
      
      // Click the selected product link
      this.logger.info(`[${attempt}] Klik product link (${selectedType})...`);
      await selectedLink.click();
      await randomDelay(3000, 5000);
      
      // Wait for navigation
      try {
        await shoppingPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        this.logger.info(`[${attempt}] ✅ Navigation ke product page selesai`);
      } catch (error) {
        this.logger.warn(`[${attempt}] Navigation wait failed: ${error.message}`);
      }
      
      // Check for captcha, error pages, and validate page
      this.logger.info(`[${attempt}] Memeriksa halaman setelah navigation...`);
      try {
        await this.validateProductPage(shoppingPage, attempt);
      } catch (error) {
        this.logger.error(`[${attempt}] ❌ Page validation failed: ${error.message}`);
        
        // Take screenshot for debugging before closing
        try {
          await shoppingPage.screenshot({ path: `error_page_${attempt}.png`, fullPage: true });
          this.logger.info(`[${attempt}] Screenshot error page disimpan: error_page_${attempt}.png`);
        } catch (screenshotError) {
          this.logger.warn(`[${attempt}] Error taking screenshot: ${screenshotError.message}`);
        }
        
        this.logger.info(`[${attempt}] 🔄 Closing browser and retrying from start...`);
        throw error; // Re-throw to trigger retry
      }
      
      // Get all cookies and find NA_CO
      this.logger.info(`[${attempt}] Mencari cookie NA_CO...`);
      const allCookies = await shoppingPage.cookies();
      const naCoCookie = allCookies.find(cookie => cookie.name === 'NA_CO');
      
      if (naCoCookie) {
        this.logger.info(`[${attempt}] ✅ Cookie NA_CO ditemukan: ${naCoCookie.value}`);
        
        // Save NA_CO cookie to file
        const naCoData = {
          timestamp: new Date().toISOString(),
          cookie: naCoCookie,
          productType: selectedType,
          url: shoppingPage.url()
        };
        
        fs.writeFileSync('na_co_cookie.json', JSON.stringify(naCoData, null, 2));
        this.logger.info(`[${attempt}] ✅ Cookie NA_CO disimpan ke na_co_cookie.json`);
      } else {
        this.logger.warn(`[${attempt}] ❌ Cookie NA_CO tidak ditemukan`);
      }
      
    } catch (error) {
      this.logger.error(`[${attempt}] Error klik product dan cari NA_CO: ${error.message}`);
    }
  }
}

/**
 * Initialize cookies by browsing Naver and Shopping (run once at startup)
 */
export async function initializeCookies({ proxy, browserConfig, logger }) {
  const scraper = new NaverProductScraper(logger);
  let attempt = 0;
  let success = false;

  while (attempt < MAX_RETRIES && !success) {
    attempt++;
    let browser;
    let browserManager;
    
    try {
      logger.info(`🔄 Cookie initialization attempt ${attempt}/${MAX_RETRIES}`);
      
      const proxyConfig = new ProxyConfig(proxy);
      browserManager = new BrowserManager(browserConfig, proxyConfig, logger);
      
      browser = await browserManager.launch();
      const page = await browserManager.setupPage(browser);
      
      await scraper.browseNaverAndGetCookies(page, browser, attempt, browserManager);
      success = true;
      logger.info(`✅ Cookie initialization completed successfully on attempt ${attempt}`);
      
    } catch (err) {
      logger.warn(`❌ Cookie initialization attempt ${attempt} failed: ${err.message}`);
      
      // Check if it's a captcha/error that requires retry
      const isRetryableError = err.message.includes('CAPTCHA') || 
                              err.message.includes('Error page') || 
                              err.message.includes('Blocked page') ||
                              err.message.includes('validation failed') ||
                              err.message.includes('Error indicator');
      
      if (isRetryableError) {
        logger.info(`🔄 Retryable error detected, will retry...`);
      } else {
        logger.warn(`⚠️ Non-retryable error: ${err.message}`);
      }
      
      if (browser && browserManager) {
        try {
          await browserManager.closeBrowser(browser);
          logger.info(`✅ Browser closed after error`);
        } catch (closeError) {
          logger.warn(`Error closing browser: ${closeError.message}`);
        }
      }
      
      if (attempt >= MAX_RETRIES) {
        logger.error(`❌ Cookie initialization failed after ${MAX_RETRIES} attempts`);
        return false;
      }
      
      // Wait before retry with increasing delay
      const delay = Math.min(5000 + (attempt * 2000), 15000); // 5s, 7s, 9s, 11s, 13s, 15s
      logger.info(`⏳ Waiting ${delay}ms before retry...`);
      await randomDelay(delay, delay + 2000);
    }
  }

  return success;
}

/**
 * Main export function
 */
export async function scrapeNaverProduct({ productUrl, proxy, browserConfig, logger, options = {} }) {
  const scraper = new NaverProductScraper(logger);
  return await scraper.scrape({ productUrl, proxy, browserConfig, options });
} 