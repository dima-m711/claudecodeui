import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import {
  savePendingInteraction,
  removePendingInteraction,
  clearAllInteractions,
  getPendingInteractions
} from '../utils/interactionStorage';

const InteractionContext = createContext();

export const INTERACTION_TYPES = {
  PERMISSION: 'permission',
  PLAN_APPROVAL: 'plan-approval',
  ASK_USER: 'ask-user'
};

export const useInteraction = () => {
  const context = useContext(InteractionContext);
  if (!context) {
    throw new Error('useInteraction must be used within an InteractionProvider');
  }
  return context;
};

export const InteractionProvider = ({ children, sessionIds = [] }) => {
  const [pendingInteractions, setPendingInteractions] = useState([]);
  const lastSessionIdsRef = useRef([]);

  useEffect(() => {
    const sessionIdsChanged =
      sessionIds.length !== lastSessionIdsRef.current.length ||
      sessionIds.some((id, index) => id !== lastSessionIdsRef.current[index]);

    if (sessionIdsChanged) {
      lastSessionIdsRef.current = sessionIds;

      if (sessionIds.length === 0) {
        console.log('🔄 [Interaction] No sessions, clearing state');
        setPendingInteractions([]);
        return;
      }

      console.log('🔄 [Interaction] Sessions changed, loading from storage:', sessionIds);
      const stored = getPendingInteractions(sessionIds);
      setPendingInteractions(stored);
    }
  }, [sessionIds]);

  const addInteraction = useCallback((interaction) => {
    console.log(`🔄 [Interaction] Adding ${interaction.type} interaction:`, interaction.id);

c    // STRICT: Only add interaction if it belongs to current sessionIds
    if (interaction.sessionId && !sessionIds.includes(interaction.sessionId)) {
      console.log('⏭️ [Interaction] Ignoring interaction for different session:',
                  interaction.sessionId, 'current sessions:', sessionIds);
      return;
    }

    const interactionWithTimestamp = {
      ...interaction,
      requestedAt: interaction.requestedAt || Date.now()
    };

    if (interaction.sessionId) {
      savePendingInteraction(interaction.sessionId, interactionWithTimestamp);
    }

    setPendingInteractions(prev => {
      const existing = prev.find(i => i.id === interaction.id);
      if (existing) {
        return prev.map(i => i.id === interaction.id ? interactionWithTimestamp : i);
      }
      return [...prev, interactionWithTimestamp];
    });
  }, [sessionIds]);

  const removeInteraction = useCallback((interactionId) => {
    console.log('🔄 [Interaction] Removing interaction:', interactionId);

    setPendingInteractions(prev => {
      const interaction = prev.find(i => i.id === interactionId);
      if (interaction?.sessionId) {
        removePendingInteraction(interaction.sessionId, interactionId);
      }
      return prev.filter(i => i.id !== interactionId);
    });
  }, []);

  const updateInteraction = useCallback((interactionId, updates) => {
    console.log('🔄 [Interaction] Updating interaction:', interactionId, updates);

    setPendingInteractions(prev => {
      const updated = prev.map(i =>
        i.id === interactionId ? { ...i, ...updates } : i
      );

      const interaction = updated.find(i => i.id === interactionId);
      if (interaction?.sessionId) {
        savePendingInteraction(interaction.sessionId, interaction);
      }

      return updated;
    });
  }, []);

  const getInteractionsByType = useCallback((type) => {
    return pendingInteractions.filter(i => i.type === type);
  }, [pendingInteractions]);

  const getInteractionById = useCallback((interactionId) => {
    return pendingInteractions.find(i => i.id === interactionId);
  }, [pendingInteractions]);

  const getInteractionsBySession = useCallback((sessionId) => {
    return pendingInteractions.filter(i => i.sessionId === sessionId);
  }, [pendingInteractions]);

  const clearInteractions = useCallback(() => {
    console.log('🔄 [Interaction] Clearing all interactions');

    sessionIds.forEach(sessionId => {
      if (sessionId) {
        clearAllInteractions(sessionId);
      }
    });

    setPendingInteractions([]);
  }, [sessionIds]);

  const clearInteractionsBySession = useCallback((sessionId) => {
    console.log('🔄 [Interaction] Clearing interactions for session:', sessionId);

    if (sessionId) {
      clearAllInteractions(sessionId);
    }

    setPendingInteractions(prev => prev.filter(i => i.sessionId !== sessionId));
  }, []);

  const clearInteractionsByType = useCallback((type) => {
    console.log('🔄 [Interaction] Clearing interactions of type:', type);

    const toRemove = pendingInteractions.filter(i => i.type === type);

    toRemove.forEach(interaction => {
      if (interaction.sessionId) {
        removePendingInteraction(interaction.sessionId, interaction.id);
      }
    });

    setPendingInteractions(prev => prev.filter(i => i.type !== type));
  }, [pendingInteractions]);

  const value = {
    pendingInteractions,
    sessionIds,

    addInteraction,
    removeInteraction,
    updateInteraction,
    getInteractionsByType,
    getInteractionById,
    getInteractionsBySession,
    clearInteractions,
    clearInteractionsBySession,
    clearInteractionsByType,

    get permissionCount() {
      return pendingInteractions.filter(i => i.type === INTERACTION_TYPES.PERMISSION).length;
    },
    get planApprovalCount() {
      return pendingInteractions.filter(i => i.type === INTERACTION_TYPES.PLAN_APPROVAL).length;
    },
    get askUserCount() {
      return pendingInteractions.filter(i => i.type === INTERACTION_TYPES.ASK_USER).length;
    },
    get totalCount() {
      return pendingInteractions.length;
    }
  };

  return (
    <InteractionContext.Provider value={value}>
      {children}
    </InteractionContext.Provider>
  );
};

export default InteractionContext;
