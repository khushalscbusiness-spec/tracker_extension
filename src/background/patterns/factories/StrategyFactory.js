// src/background/patterns/factories/StrategyFactory.js

import { GenericStrategy } from '../strategies/GenericStrategy.js';
import { GreenhouseStrategy } from '../strategies/GreenhouseStrategy.js';
import { LeverStrategy } from '../strategies/LeverStrategy.js';
import { WorkdayStrategy } from '../strategies/WorkdayStrategy.js';

/**
 * Strategy Factory
 *
 * Creates and manages submission detection strategies for different ATS platforms.
 *
 * This implements the Factory Pattern:
 * - Centralizes creation of strategy instances
 * - Registers all available strategies
 * - Selects the appropriate strategy based on URL
 * - Caches strategy instances for performance
 *
 * The factory follows a priority-based selection:
 * - Higher priority strategies are checked first
 * - The first strategy that can handle the URL is selected
 * - GenericStrategy (priority 0) is the fallback
 */
export class StrategyFactory {
  constructor() {
    // Registry of all available strategies
    this.strategies = [];

    // Cache of strategy instances (singleton per type)
    this.instanceCache = new Map();

    // Register all strategies with their priorities
    this.registerStrategies();
  }

  /**
   * Register all available strategies
   * Strategies are sorted by priority (higher = checked first)
   * @private
   */
  registerStrategies() {
    console.log('[StrategyFactory] Registering strategies...');

    // Register strategies with their classes and priorities
    const strategyConfigs = [
      { class: GreenhouseStrategy, priority: 10 },
      { class: LeverStrategy, priority: 9 },
      { class: WorkdayStrategy, priority: 8 },
      { class: GenericStrategy, priority: 0 }
    ];

    // Sort by priority (highest first)
    strategyConfigs.sort((a, b) => b.priority - a.priority);

    // Create and register each strategy
    for (const config of strategyConfigs) {
      this.registerStrategy(config.class, config.priority);
    }

    console.log(`[StrategyFactory] Registered ${this.strategies.length} strategies`);
  }

  /**
   * Register a single strategy
   * @param {Class} StrategyClass - The strategy class to register
   * @param {number} priority - Priority of the strategy (higher = checked first)
   */
  registerStrategy(StrategyClass, priority) {
    // Create an instance to get the ATS name
    const tempInstance = new StrategyClass();
    const atsName = tempInstance.atsName || 'unknown';

    this.strategies.push({
      class: StrategyClass,
      atsName: atsName,
      priority: priority || 0
    });

    // Sort by priority (highest first)
    this.strategies.sort((a, b) => b.priority - a.priority);

    console.log(`[StrategyFactory] ✅ Registered: ${atsName} (priority: ${priority})`);
  }

  /**
   * Get a strategy instance for the given URL
   * @param {string} url - The URL to get a strategy for
   * @returns {SubmissionDetectionStrategy} The appropriate strategy
   */
  getStrategy(url) {
    console.log(`[StrategyFactory] Getting strategy for URL: ${url}`);

    // Try each strategy in priority order
    for (const config of this.strategies) {
      // Get or create cached instance
      let instance = this.instanceCache.get(config.atsName);

      if (!instance) {
        instance = new config.class();
        this.instanceCache.set(config.atsName, instance);
        console.log(`[StrategyFactory] Cached instance for: ${config.atsName}`);
      }

      // Check if this strategy can handle the URL
      try {
        if (instance.canHandle(url)) {
          console.log(`[StrategyFactory] ✅ Selected strategy: ${config.atsName} (priority: ${config.priority})`);
          return instance;
        }
      } catch (error) {
        console.warn(`[StrategyFactory] Error checking strategy ${config.atsName}:`, error);
      }
    }

    // Fallback: Create a new GenericStrategy (should never happen since GenericStrategy handles all URLs)
    console.log('[StrategyFactory] ⚠️ No strategy found, using generic fallback');
    const fallback = new GenericStrategy();
    this.instanceCache.set('generic', fallback);
    return fallback;
  }

  /**
   * Get a specific strategy by ATS name
   * @param {string} atsName - Name of the ATS
   * @returns {SubmissionDetectionStrategy|null} The strategy or null if not found
   */
  getStrategyByName(atsName) {
    // Check cache first
    if (this.instanceCache.has(atsName)) {
      return this.instanceCache.get(atsName);
    }

    // Find the strategy class
    const config = this.strategies.find(s => s.atsName === atsName);
    if (!config) {
      console.warn(`[StrategyFactory] Strategy not found: ${atsName}`);
      return null;
    }

    // Create and cache instance
    const instance = new config.class();
    this.instanceCache.set(atsName, instance);
    return instance;
  }

  /**
   * Get all registered strategy names
   * @returns {string[]} Array of ATS names
   */
  getStrategyNames() {
    return this.strategies.map(s => s.atsName);
  }

  /**
   * Get all strategies with their priorities
   * @returns {Array} Array of { atsName, priority } objects
   */
  getStrategyInfo() {
    return this.strategies.map(s => ({
      atsName: s.atsName,
      priority: s.priority
    }));
  }

  /**
   * Check if a strategy exists for the given ATS
   * @param {string} atsName - Name of the ATS
   * @returns {boolean} True if a strategy exists
   */
  hasStrategy(atsName) {
    return this.strategies.some(s => s.atsName === atsName);
  }

  /**
   * Detect the ATS from the URL
   * @param {string} url - The URL to detect ATS from
   * @returns {string} The ATS name or 'unknown'
   */
  detectAtsFromUrl(url) {
    // Get strategy for URL
    const strategy = this.getStrategy(url);
    return strategy ? strategy.getAtsName() : 'unknown';
  }

  /**
   * Get display name for an ATS
   * @param {string} atsName - The ATS name
   * @returns {string} The display name
   */
  getAtsDisplayName(atsName) {
    const strategy = this.getStrategyByName(atsName);
    return strategy ? strategy.getDisplayName() : atsName;
  }

  /**
   * Clear all cached instances
   * Useful for testing or when strategies need to be reloaded
   */
  clearCache() {
    this.instanceCache.clear();
    console.log('[StrategyFactory] Cache cleared');
  }

  /**
   * Get the current strategy cache size
   * @returns {number} Number of cached strategies
   */
  getCacheSize() {
    return this.instanceCache.size;
  }

  /**
   * Check if the URL is from a known ATS
   * @param {string} url - The URL to check
   * @returns {boolean} True if from a known ATS
   */
  isKnownAts(url) {
    const strategy = this.getStrategy(url);
    return strategy ? strategy.getAtsName() !== 'generic' : false;
  }

  /**
   * Get all strategy instances (for debugging)
   * @returns {Object} Map of ATS name to strategy instance
   */
  getInstances() {
    const result = {};
    for (const [name, instance] of this.instanceCache) {
      result[name] = instance;
    }
    return result;
  }
}

// Export singleton instance
const strategyFactory = new StrategyFactory();
export default strategyFactory;