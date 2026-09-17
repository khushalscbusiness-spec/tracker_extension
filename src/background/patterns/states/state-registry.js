// src/background/patterns/states/state-registry.js

/**
 * State Registry
 *
 * Pre-loads all states with STATIC imports to avoid dynamic import()
 * in Chrome MV3 service workers.
 *
 * WHY THIS EXISTS:
 * Chrome Manifest V3 service workers do NOT support dynamic import().
 * This is a spec decision by the W3C Service Worker Working Group.
 *
 * Dynamic import() in service workers behaves like a network fetch,
 * which cannot be guaranteed to work offline. So Chrome blocks it.
 *
 * SOLUTION:
 * Instead of:
 *   const { SubmittedState } = await import('./SubmittedState.js');
 *
 * Use:
 *   import { STATES } from './state-registry.js';
 *   const state = new STATES.submitted(session);
 *
 * BENEFITS:
 * - Works in Chrome MV3 service workers
 * - No circular dependency issues
 * - Deterministic behavior
 * - Faster (states pre-loaded at startup)
 */

// ============================================
// STATIC IMPORTS (allowed in service workers)
// ============================================

import { InitiatedState } from './InitiatedState.js';
import { RedirectingState } from './RedirectingState.js';
import { InProgressState } from './InProgressState.js';
import { SubmittedState } from './SubmittedState.js';
import { AbandonedState } from './AbandonedState.js';

// ============================================
// STATE REGISTRY
// ============================================

/**
 * Registry of all states
 * Maps state name → State class
 */
export const STATES = {
  initiated: InitiatedState,
  redirecting: RedirectingState,
  in_progress: InProgressState,
  submitted: SubmittedState,
  abandoned: AbandonedState
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get a state class by name
 * @param {string} name - State name (initiated, redirecting, in_progress, submitted, abandoned)
 * @returns {Class|null} State class or null if not found
 */
export function getStateClass(name) {
  if (!name) {
    console.warn('[StateRegistry] getStateClass: null name');
    return null;
  }

  const StateClass = STATES[name];
  if (!StateClass) {
    console.warn(`[StateRegistry] Unknown state: ${name}`);
    return null;
  }

  return StateClass;
}

/**
 * Create a state instance
 * @param {string} name - State name
 * @param {Object} session - Session object
 * @param {Object} options - Optional additional arguments
 * @returns {Object|null} State instance or null
 */
export function createState(name, session, options = {}) {
  const StateClass = getStateClass(name);
  if (!StateClass) return null;

  // Handle states with extra constructor args (e.g., AbandonedState takes a reason)
  if (name === 'abandoned' && options.reason) {
    return new StateClass(session, options.reason);
  }

  return new StateClass(session);
}

/**
 * Get all available state names
 * @returns {string[]} Array of state names
 */
export function getStateNames() {
  return Object.keys(STATES);
}

/**
 * Check if a state exists
 * @param {string} name - State name
 * @returns {boolean} True if state exists
 */
export function hasState(name) {
  return !!STATES[name];
}

// ============================================
// EXPORTS
// ============================================

export default STATES;