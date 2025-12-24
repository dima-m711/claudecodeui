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
   * @param {Array} [suggestions] - Optional SDK-provided permission suggestions
   * @returns {Promise<Object>} Promise that resolves with permission result
   */
  async addRequest(id, toolName, input, sessionId = null, abortSignal = null, suggestions = null) {
    // SDK now handles session/permanent permission caching via updatedPermissions
    // No need for server-side cache anymore

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
          category: TOOL_CATEGORIES?.[toolName] || 'general',
          suggestions  // SDK-provided permission suggestions
        },
        metadata: {
          abortSignal
        }
      });

      // SDK handles permission persistence via updatedPermissions
      return createSdkPermissionResult(response.decision, response.updatedInput, response.suggestions || suggestions);
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
   * Removes all data for a specific session
   * @param {string} sessionId - Session identifier to clean up
   */
  removeSession(sessionId) {
    if (!sessionId) return;

    this.interactionManager.removeSession(sessionId);

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
      pendingCount: this.getPendingCount()
    };
  }

  /**
   * Shuts down the permission manager
   */
  shutdown() {
    // SDK handles permission cleanup
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
