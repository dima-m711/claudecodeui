/**
 * Permission Manager
 *
 * Core permission queue and handling logic for the interactive permission system.
 * Manages pending permission requests, handles timeouts, and coordinates responses.
 */

import { EventEmitter } from 'events';
import {
  PermissionDecision,
  formatPermissionRequest,
  createSdkPermissionResult,
  TOOL_RISK_LEVELS,
  TOOL_CATEGORIES
} from './permissionTypes.js';
import { getInteractionManager } from './interactionManager.js';
import { InteractionType } from './interactionTypes.js';

/**
 * PermissionManager class
 * Thin adapter over InteractionManager for permission-specific logic
 */
export class PermissionManager extends EventEmitter {
  constructor() {
    super();

    this.interactionManager = getInteractionManager();

    // Session-level permission cache (for allow-session decisions)
    // Map of sessionId -> Map of cacheKey -> { decision, timestamp }
    this.sessionPermissions = new Map();

    // Cache configuration
    this.maxSessionCacheEntries = 1000;
    this.sessionCacheTTL = 60 * 60 * 1000; // 1 hour

    // Debug mode flag
    this.debugMode = process.env.DEBUG && process.env.DEBUG.includes('permissions');

    if (this.debugMode) {
      console.log('🔐 PermissionManager initialized in debug mode');
    }

    // Forward interaction-request events from InteractionManager
    this.interactionManager.on('interaction-request', (interaction) => {
      if (interaction.type === InteractionType.PERMISSION) {
        const formattedRequest = formatPermissionRequest(
          interaction.id,
          interaction.data.toolName,
          interaction.data.input
        );
        formattedRequest.sessionId = interaction.sessionId;
        this.emit('permission-request', formattedRequest);
      }
    });
  }

  /**
   * Adds a permission request to the queue
   * @param {string} id - Unique request ID
   * @param {string} toolName - Name of the tool
   * @param {Object} input - Tool input parameters
   * @param {string} [sessionId] - Optional session identifier
   * @param {AbortSignal} [abortSignal] - Optional abort signal
   * @returns {Promise<Object>} Promise that resolves with permission result
   */
  async addRequest(id, toolName, input, sessionId = null, abortSignal = null) {
    // Check if this tool/input combination is in session cache
    if (sessionId) {
      const cacheKey = this.getSessionCacheKey(toolName, input);
      const cachedDecision = this.getSessionPermission(sessionId, cacheKey);
      if (cachedDecision) {
        if (this.debugMode) {
          console.log(`🔐 Using cached session permission for ${toolName}: ${cachedDecision} (session: ${sessionId})`);
        }
        return createSdkPermissionResult(cachedDecision);
      }
    }

    // Delegate to InteractionManager
    try {
      const response = await this.interactionManager.requestInteraction({
        type: InteractionType.PERMISSION,
        sessionId,
        data: {
          requestId: id,
          toolName,
          input,
          riskLevel: TOOL_RISK_LEVELS?.[toolName] || 'medium',
          category: TOOL_CATEGORIES?.[toolName] || 'general'
        },
        metadata: {
          abortSignal
        }
      });

      // Handle session caching
      if (response.decision === PermissionDecision.ALLOW_SESSION && sessionId) {
        const cacheKey = this.getSessionCacheKey(toolName, input);
        this.setSessionPermission(sessionId, cacheKey, response.decision);
      }

      return createSdkPermissionResult(response.decision, response.updatedInput);
    } catch (error) {
      if (this.debugMode) {
        console.error(`❌ [Permission] Request ${id} failed:`, error.message);
      }
      throw error;
    }
  }

  /**
   * Resolves a permission request with user decision
   * @param {string} requestId - Request ID to resolve
   * @param {string} decision - User decision (from PermissionDecision enum)
   * @param {Object} [updatedInput] - Optional modified input
   * @returns {boolean} True if request was resolved, false if not found
   */
  resolveRequest(requestId, decision, updatedInput = null) {
    console.log(`🔍 [PermissionManager] resolveRequest called:`, { requestId, decision });

    // Resolve through InteractionManager
    const result = this.interactionManager.resolveInteraction(requestId, {
      decision,
      updatedInput
    });

    if (!result.success) {
      console.warn(`⚠️ Permission request ${requestId} could not be resolved`);
      return false;
    }

    if (this.debugMode) {
      console.log(`🔐 Resolved permission ${requestId}: ${decision}`);
    }

    return true;
  }


  /**
   * Gets a cache key for session-level permissions
   * @param {string} toolName - Tool name
   * @param {Object} input - Tool input
   * @returns {string} Cache key
   * @private
   */
  getSessionCacheKey(toolName, input) {
    // Create a simple cache key based on tool and critical input params
    // This is a basic implementation; Phase 4 will add pattern matching
    const keyParts = [toolName];

    switch (toolName) {
      case 'Read':
      case 'Write':
      case 'Edit':
        keyParts.push(input.file_path);
        break;
      case 'Bash':
        // For now, don't cache Bash commands (too risky)
        return `${toolName}_${Date.now()}_nocache`;
      case 'WebFetch':
        keyParts.push(input.url);
        break;
      default:
        keyParts.push(JSON.stringify(input));
    }

    return keyParts.join('\x00');
  }

  /**
   * Gets a session-specific cached permission with TTL check
   * @param {string} sessionId - Session identifier
   * @param {string} cacheKey - Cache key for the permission
   * @returns {string|null} Cached permission decision or null if not found/expired
   * @private
   */
  getSessionPermission(sessionId, cacheKey) {
    const sessionCache = this.sessionPermissions.get(sessionId);
    if (!sessionCache) return null;

    const entry = sessionCache.get(cacheKey);
    if (!entry) return null;

    // Check TTL expiration
    if (Date.now() - entry.timestamp > this.sessionCacheTTL) {
      sessionCache.delete(cacheKey);
      return null;
    }

    return entry.decision;
  }

  /**
   * Sets a session-specific cached permission with TTL and size limit
   * @param {string} sessionId - Session identifier
   * @param {string} cacheKey - Cache key for the permission
   * @param {string} permission - Permission decision to cache
   * @private
   */
  setSessionPermission(sessionId, cacheKey, permission) {
    let sessionCache = this.sessionPermissions.get(sessionId);
    if (!sessionCache) {
      sessionCache = new Map();
      this.sessionPermissions.set(sessionId, sessionCache);
    }

    // Evict oldest entries if cache is full (simple LRU approximation)
    if (sessionCache.size >= this.maxSessionCacheEntries) {
      const oldestKey = sessionCache.keys().next().value;
      sessionCache.delete(oldestKey);
    }

    sessionCache.set(cacheKey, { decision: permission, timestamp: Date.now() });
  }

  /**
   * Clears session-level permission cache
   */
  clearSessionCache() {
    this.sessionPermissions.clear();
    if (this.debugMode) {
      console.log('🔐 Cleared session permission cache');
    }
  }

  /**
   * Removes all data for a specific session
   * @param {string} sessionId - Session identifier to clean up
   */
  removeSession(sessionId) {
    if (!sessionId) return;

    this.interactionManager.removeSession(sessionId);
    this.sessionPermissions.delete(sessionId);

    if (this.debugMode) {
      console.log(`🔐 Removed session ${sessionId} from permission manager`);
    }
  }

  /**
   * Gets the count of pending permission requests
   * @returns {number} Number of pending requests
   */
  getPendingCount() {
    return this.interactionManager.getPendingInteractions([],  InteractionType.PERMISSION).length;
  }

  /**
   * Gets all pending permission requests
   * @returns {Array} Array of formatted pending requests
   */
  getPendingRequests() {
    const interactions = Array.from(this.interactionManager.pendingInteractions.values())
      .filter(i => i.type === InteractionType.PERMISSION);

    return interactions.map(interaction => {
      const formatted = formatPermissionRequest(
        interaction.id,
        interaction.data.toolName,
        interaction.data.input
      );
      formatted.sessionId = interaction.sessionId;
      formatted.timestamp = interaction.requestedAt;
      return formatted;
    });
  }

  /**
   * Gets pending permission requests for a specific session
   * @param {string} sessionId - Session identifier
   * @returns {Array} Array of formatted pending requests for the session
   */
  getRequestsForSession(sessionId) {
    if (!sessionId) return [];

    const interactions = this.interactionManager.getPendingInteractions(
      [sessionId],
      InteractionType.PERMISSION
    );

    return interactions.map(interaction => {
      const formatted = formatPermissionRequest(
        interaction.id,
        interaction.data.toolName,
        interaction.data.input
      );
      formatted.sessionId = interaction.sessionId;
      formatted.timestamp = interaction.requestedAt;
      return formatted;
    });
  }

  /**
   * Gets permission manager statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const interactionStats = this.interactionManager.getStatistics();
    return {
      ...interactionStats.permission,
      pendingCount: this.getPendingCount(),
      sessionCacheSize: this.sessionPermissions.size
    };
  }

  /**
   * Shuts down the permission manager
   */
  shutdown() {
    this.sessionPermissions.clear();
    console.log('🔐 PermissionManager shut down');
  }
}

// Export singleton instance
let permissionManagerInstance = null;

/**
 * Gets the singleton PermissionManager instance
 * @returns {PermissionManager} The permission manager instance
 */
export function getPermissionManager() {
  if (!permissionManagerInstance) {
    permissionManagerInstance = new PermissionManager();
  }
  return permissionManagerInstance;
}

/**
 * Resets the singleton instance (mainly for testing)
 */
export function resetPermissionManager() {
  if (permissionManagerInstance) {
    permissionManagerInstance.shutdown();
    permissionManagerInstance = null;
  }
}
