import { EventEmitter } from 'events';
import crypto from 'crypto';

const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_INTERACTIONS_PER_SESSION = 100;

export class InteractionManager extends EventEmitter {
  constructor() {
    super();

    this.pendingInteractions = new Map();
    this.interactionsBySession = new Map();
    this.statistics = new Map();

    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleInteractions();
    }, DEFAULT_CLEANUP_INTERVAL_MS);

    this.debugMode = process.env.DEBUG && process.env.DEBUG.includes('interactions');

    if (this.debugMode) {
      console.log('🔄 InteractionManager initialized in debug mode');
    }
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
        this.interactionsBySession.get(sessionId).add(interactionId);
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

  resolveInteraction(interactionId, response) {
    const interaction = this.pendingInteractions.get(interactionId);

    if (!interaction || interaction.status !== 'pending') {
      console.warn(`⚠️ Interaction ${interactionId} not found or already resolved`);
      return { success: false, error: 'invalid_or_decided' };
    }

    if (this.debugMode) {
      console.log(`✅ [Interaction] Resolving ${interaction.type}:`, interactionId);
    }

    interaction.status = 'resolved';
    interaction.response = response;
    interaction.decidedAt = Date.now();

    this.statistics.get(interaction.type).resolved++;

    this.pendingInteractions.delete(interactionId);

    if (interaction.sessionId && this.interactionsBySession.has(interaction.sessionId)) {
      this.interactionsBySession.get(interaction.sessionId).delete(interactionId);
      if (this.interactionsBySession.get(interaction.sessionId).size === 0) {
        this.interactionsBySession.delete(interaction.sessionId);
      }
    }

    interaction.resolve(response);

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
      console.warn(`⚠️ Interaction ${interactionId} not found or already resolved`);
      return { success: false, error: 'invalid_or_decided' };
    }

    if (this.debugMode) {
      console.log(`❌ [Interaction] Rejecting ${interaction.type}:`, interactionId, reason);
    }

    interaction.status = 'rejected';
    interaction.decidedAt = Date.now();

    this.statistics.get(interaction.type).rejected++;

    this.pendingInteractions.delete(interactionId);

    if (interaction.sessionId && this.interactionsBySession.has(interaction.sessionId)) {
      this.interactionsBySession.get(interaction.sessionId).delete(interactionId);
      if (this.interactionsBySession.get(interaction.sessionId).size === 0) {
        this.interactionsBySession.delete(interaction.sessionId);
      }
    }

    interaction.reject(new Error(reason));

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

    console.log('🔄 InteractionManager shut down');
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
