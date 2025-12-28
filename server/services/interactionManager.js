import { EventEmitter } from 'events';
import crypto from 'crypto';
import { LRUCache } from 'lru-cache';

const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_INTERACTIONS_PER_SESSION = 100;

export class InteractionManager extends EventEmitter {
  constructor() {
    super();

    this.pendingInteractions = new Map();
    this.interactionsBySession = new LRUCache({
      max: 1000,
      ttl: 1000 * 60 * 15,
      updateAgeOnGet: true,
      dispose: (sessionId, interactions) => {
        console.log(`Pruning session ${sessionId} with ${interactions.size} interactions`);
        interactions.forEach(interactionId => {
          const interaction = this.pendingInteractions.get(interactionId);
          if (interaction && interaction.status === 'pending') {
            this.rejectInteraction(interactionId, 'Session expired (TTL)');
          }
        });
      }
    });
    this.statistics = new Map();

    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleInteractions();
    }, DEFAULT_CLEANUP_INTERVAL_MS);

    this.debugMode = process.env.DEBUG && process.env.DEBUG.includes('interactions');
  }

  async requestInteraction({ type, sessionId, data, metadata = {} }) {
    const interactionId = crypto.randomUUID();
    const timestamp = Date.now();

    if (this.debugMode) {
      console.log(`🔄 [Interaction] Creating ${type} interaction:`, interactionId);
    }

    if (sessionId) {
      const sessionInteractions = this.interactionsBySession.get(sessionId);
      if (sessionInteractions && sessionInteractions.size >= MAX_INTERACTIONS_PER_SESSION) {
        throw new Error(`Too many pending interactions for session ${sessionId}`);
      }
    }

    return new Promise((resolve, reject) => {
      const interaction = {
        id: interactionId,
        type,
        sessionId,
        data,
        metadata,
        status: 'pending',
        requestedAt: timestamp,
        decidedAt: null,
        response: null,
        resolve,
        reject
      };

      this.pendingInteractions.set(interactionId, interaction);

      if (sessionId) {
        if (!this.interactionsBySession.has(sessionId)) {
          this.interactionsBySession.set(sessionId, new Set());
        }
        const sessionInteractionsSet = this.interactionsBySession.get(sessionId);
        sessionInteractionsSet.add(interactionId);
        this.interactionsBySession.set(sessionId, sessionInteractionsSet);
      }

      if (!this.statistics.has(type)) {
        this.statistics.set(type, {
          total: 0,
          resolved: 0,
          rejected: 0
        });
      }
      this.statistics.get(type).total++;

      this.emit('interaction-request', {
        id: interactionId,
        type,
        sessionId,
        data,
        metadata,
        requestedAt: timestamp
      });
    });
  }

  resolveInteraction(interactionId, response, requestingSessionId) {
    const interaction = this.pendingInteractions.get(interactionId);

    if (!interaction || interaction.status !== 'pending') {
      console.warn(`Interaction ${interactionId} not found or already resolved`);
      return { success: false, error: 'invalid_or_decided' };
    }

    if (interaction.sessionId !== requestingSessionId) {
      console.error(`Session mismatch: ${requestingSessionId} tried to resolve ${interactionId} owned by ${interaction.sessionId}`);
      return { success: false, error: 'SESSION_MISMATCH' };
    }

    this.pendingInteractions.delete(interactionId);

    if (interaction.sessionId && this.interactionsBySession.has(interaction.sessionId)) {
      const sessionInteractionsSet = this.interactionsBySession.get(interaction.sessionId);
      sessionInteractionsSet.delete(interactionId);
      if (sessionInteractionsSet.size === 0) {
        this.interactionsBySession.delete(interaction.sessionId);
      } else {
        this.interactionsBySession.set(interaction.sessionId, sessionInteractionsSet);
      }
    }

    if (this.debugMode) {
      console.log(`✅ [Interaction] Resolving ${interaction.type}:`, interactionId);
    }

    interaction.status = 'resolved';
    interaction.response = response;
    interaction.decidedAt = Date.now();

    if (this.statistics.has(interaction.type)) {
      this.statistics.get(interaction.type).resolved++;
    }

    try {
      interaction.resolve(response);
    } catch (error) {
      console.error(`Failed to resolve interaction ${interactionId}:`, error);
    }

    this.emit('interaction-resolved', {
      interactionId,
      sessionId: interaction.sessionId,
      resolvedAt: interaction.decidedAt
    });

    return { success: true };
  }

  rejectInteraction(interactionId, reason = 'Interaction rejected') {
    const interaction = this.pendingInteractions.get(interactionId);

    if (!interaction || interaction.status !== 'pending') {
      console.warn(`Interaction ${interactionId} not found or already resolved`);
      return { success: false, error: 'invalid_or_decided' };
    }

    this.pendingInteractions.delete(interactionId);

    if (interaction.sessionId && this.interactionsBySession.has(interaction.sessionId)) {
      const sessionInteractionsSet = this.interactionsBySession.get(interaction.sessionId);
      sessionInteractionsSet.delete(interactionId);
      if (sessionInteractionsSet.size === 0) {
        this.interactionsBySession.delete(interaction.sessionId);
      } else {
        this.interactionsBySession.set(interaction.sessionId, sessionInteractionsSet);
      }
    }

    if (this.debugMode) {
      console.log(`❌ [Interaction] Rejecting ${interaction.type}:`, interactionId, reason);
    }

    interaction.status = 'rejected';
    interaction.decidedAt = Date.now();

    if (this.statistics.has(interaction.type)) {
      this.statistics.get(interaction.type).rejected++;
    }

    try {
      interaction.reject(new Error(reason));
    } catch (error) {
      console.error(`Failed to reject interaction ${interactionId}:`, error);
    }

    return { success: true };
  }

  getPendingInteractions(sessionIds, type = null) {
    const results = [];

    for (const sessionId of sessionIds) {
      const interactionIds = this.interactionsBySession.get(sessionId);
      if (!interactionIds) continue;

      for (const id of interactionIds) {
        const interaction = this.pendingInteractions.get(id);
        if (!interaction || interaction.status !== 'pending') continue;
        if (type && interaction.type !== type) continue;

        results.push({
          id: interaction.id,
          type: interaction.type,
          sessionId: interaction.sessionId,
          data: interaction.data,
          metadata: interaction.metadata,
          requestedAt: interaction.requestedAt
        });
      }
    }

    return results;
  }

  cleanupStaleInteractions() {
    const staleSessionIds = [];

    for (const [sessionId, interactionIds] of this.interactionsBySession) {
      if (interactionIds.size === 0) {
        staleSessionIds.push(sessionId);
      } else {
        const hasActiveInteractions = Array.from(interactionIds).some(
          id => this.pendingInteractions.has(id)
        );
        if (!hasActiveInteractions) {
          staleSessionIds.push(sessionId);
        }
      }
    }

    if (staleSessionIds.length > 0 && this.debugMode) {
      console.log(`🧹 Cleaning up ${staleSessionIds.length} stale sessions`);
    }

    staleSessionIds.forEach(sessionId => {
      this.interactionsBySession.delete(sessionId);
    });
  }

  removeSession(sessionId) {
    if (!sessionId) return;

    const interactionIds = this.interactionsBySession.get(sessionId);
    if (interactionIds) {
      interactionIds.forEach(interactionId => {
        const interaction = this.pendingInteractions.get(interactionId);
        if (interaction) {
          this.rejectInteraction(interactionId, 'Session removed');
        }
      });
      this.interactionsBySession.delete(sessionId);
    }

    if (this.debugMode) {
      console.log(`🔄 [Interaction] Removed session ${sessionId}`);
    }
  }

  getPendingCount() {
    return this.pendingInteractions.size;
  }

  getStatistics() {
    const stats = {};
    for (const [type, typeStat] of this.statistics) {
      stats[type] = { ...typeStat };
    }
    return {
      ...stats,
      pendingCount: this.pendingInteractions.size,
      sessionCount: this.interactionsBySession.size
    };
  }

  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    for (const [id, interaction] of this.pendingInteractions) {
      interaction.reject(new Error('InteractionManager shutting down'));
    }

    this.pendingInteractions.clear();
    this.interactionsBySession.clear();
  }
}

let interactionManagerInstance = null;

export function getInteractionManager() {
  if (!interactionManagerInstance) {
    interactionManagerInstance = new InteractionManager();
  }
  return interactionManagerInstance;
}

export function resetInteractionManager() {
  if (interactionManagerInstance) {
    interactionManagerInstance.shutdown();
    interactionManagerInstance = null;
  }
}
