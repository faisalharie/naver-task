// utils/delay.js
// Refactored delay utilities dengan SOLID principles

// Configuration constants
const CONFIG = {
  DELAY: {
    MIN_DEFAULT: 1000,
    MAX_DEFAULT: 5000,
    HUMAN_LIKE: {
      MIN: 500,
      MAX: 3000,
      VARIANCE: 0.3
    },
  }
};

/**
 * Manages delay calculation and validation
 */
class DelayCalculator {
  static calculateRandomDelay(min, max) {
    const validMin = this.validateMinDelay(min);
    const validMax = this.validateMaxDelay(max, validMin);
    
    return Math.floor(Math.random() * (validMax - validMin + 1)) + validMin;
  }

  static calculateHumanLikeDelay() {
    const baseDelay = this.calculateRandomDelay(
      CONFIG.DELAY.HUMAN_LIKE.MIN, 
      CONFIG.DELAY.HUMAN_LIKE.MAX
    );
    
    // Add some variance to make it more human-like
    const variance = baseDelay * CONFIG.DELAY.HUMAN_LIKE.VARIANCE;
    const randomVariance = (Math.random() - 0.5) * variance;
    
    return Math.max(0, baseDelay + randomVariance);
  }

  static validateMinDelay(min) {
    if (typeof min !== 'number' || min < 0) {
      return CONFIG.DELAY.MIN_DEFAULT;
    }
    return min;
  }

  static validateMaxDelay(max, min) {
    if (typeof max !== 'number' || max < min) {
      return Math.max(min + 1000, CONFIG.DELAY.MAX_DEFAULT);
    }
    return max;
  }

  static validateDelayRange(min, max) {
    const validMin = this.validateMinDelay(min);
    const validMax = this.validateMaxDelay(max, validMin);
    
    return {
      min: validMin,
      max: validMax,
      isValid: validMin <= validMax
    };
  }
}

/**
 * Manages delay execution and timing
 */
class DelayExecutor {
  static async executeDelay(ms) {
    const validMs = DelayCalculator.validateMinDelay(ms);
    return new Promise(resolve => setTimeout(resolve, validMs));
  }

  static async executeRandomDelay(min, max) {
    const delayMs = DelayCalculator.calculateRandomDelay(min, max);
    return await this.executeDelay(delayMs);
  }

  static async executeHumanLikeDelay() {
    const delayMs = DelayCalculator.calculateHumanLikeDelay();
    return await this.executeDelay(delayMs);
  }

  static async executeProgressiveDelay(baseDelay, multiplier = 1.5, maxAttempts = 5) {
    let currentDelay = baseDelay;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.executeDelay(currentDelay);
      currentDelay = Math.floor(currentDelay * multiplier);
    }
  }

  static async executeExponentialBackoff(baseDelay, maxDelay = 30000) {
    let currentDelay = baseDelay;
    let attempt = 0;
    
    while (currentDelay <= maxDelay) {
      await this.executeDelay(currentDelay);
      currentDelay = Math.min(currentDelay * 2, maxDelay);
      attempt++;
    }
  }
}

/**
 * Manages delay strategies for different scenarios
 */
class DelayStrategy {
  static async quickDelay() {
    return await DelayExecutor.executeRandomDelay(100, 500);
  }

  static async standardDelay() {
    return await DelayExecutor.executeRandomDelay(
      CONFIG.DELAY.MIN_DEFAULT, 
      CONFIG.DELAY.MAX_DEFAULT
    );
  }

  static async humanLikeDelay() {
    return await DelayExecutor.executeHumanLikeDelay();
  }

  static async longDelay() {
    return await DelayExecutor.executeRandomDelay(5000, 15000);
  }

  static async retryDelay(attempt, baseDelay = 1000) {
    const delay = baseDelay * Math.pow(2, attempt - 1);
    return await DelayExecutor.executeDelay(delay);
  }
}

/**
 * Main delay manager class
 */
class DelayManager {
  constructor() {
    this.defaultMin = CONFIG.DELAY.MIN_DEFAULT;
    this.defaultMax = CONFIG.DELAY.MAX_DEFAULT;
  }

  setDefaultRange(min, max) {
    const validation = DelayCalculator.validateDelayRange(min, max);
    if (validation.isValid) {
      this.defaultMin = validation.min;
      this.defaultMax = validation.max;
      return true;
    }
    return false;
  }

  async delay(ms) {
    return await DelayExecutor.executeDelay(ms);
  }

  async randomDelay(min = this.defaultMin, max = this.defaultMax) {
    return await DelayExecutor.executeRandomDelay(min, max);
  }

  async humanLikeDelay() {
    return await DelayExecutor.executeHumanLikeDelay();
  }

  async progressiveDelay(baseDelay, multiplier, maxAttempts) {
    return await DelayExecutor.executeProgressiveDelay(baseDelay, multiplier, maxAttempts);
  }

  async exponentialBackoff(baseDelay, maxDelay) {
    return await DelayExecutor.executeExponentialBackoff(baseDelay, maxDelay);
  }
}

// Create singleton instance
const delayManager = new DelayManager();

// Export main functions for backward compatibility
export function randomDelay(min, max) {
  return delayManager.randomDelay(min, max);
}

export function sleep(ms) {
  return delayManager.delay(ms);
}

// Export classes for advanced usage
export { 
  DelayManager, 
  DelayCalculator, 
  DelayExecutor, 
  DelayStrategy 
};

// Export singleton instance
export { delayManager }; 