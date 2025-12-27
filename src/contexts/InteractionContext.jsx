import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { useBroadcastChannel } from '../utils/interactionBroadcast';

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
  const sessionIdsRef = useRef(sessionIds);

  useEffect(() => {
    sessionIdsRef.current = sessionIds;
  }, [sessionIds]);

  const handleBroadcast = useCallback((data) => {
    switch (data.type) {
      case 'interaction-added':
        if (sessionIdsRef.current.includes(data.interaction.sessionId)) {
          console.log('📡 [Interaction] Received from another tab:', data.interaction.id);
          setPendingInteractions(prev => {
            if (prev.find(i => i.id === data.interaction.id)) return prev;
            return [...prev, data.interaction];
          });
        }
        break;
      case 'interaction-removed':
        console.log('📡 [Interaction] Removing from another tab:', data.interactionId);
        setPendingInteractions(prev => prev.filter(i => i.id !== data.interactionId));
        break;
      case 'interaction-updated':
        console.log('📡 [Interaction] Updating from another tab:', data.interactionId);
        setPendingInteractions(prev =>
          prev.map(i => i.id === data.interactionId ? { ...i, ...data.updates } : i)
        );
        break;
    }
  }, []);

  const { broadcast } = useBroadcastChannel(handleBroadcast);

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

      console.log('🔄 [Interaction] Sessions changed:', sessionIds);
    }
  }, [sessionIds]);

  const addInteraction = useCallback((interaction) => {
    console.log(`🔄 [Interaction] Adding ${interaction.type} interaction:`, interaction.id);

    const interactionWithTimestamp = {
      ...interaction,
      requestedAt: interaction.requestedAt || Date.now()
    };

    broadcast({ type: 'interaction-added', interaction: interactionWithTimestamp });

    const shouldAddToState = interaction.sessionId &&
                             sessionIdsRef.current.length > 0 &&
                             sessionIdsRef.current.includes(interaction.sessionId);

    if (!shouldAddToState) {
      console.log('⏭️ [Interaction] Broadcast sent but not adding to local state (different session)');
      return;
    }

    setPendingInteractions(prev => {
      const existing = prev.find(i => i.id === interaction.id);
      if (existing) {
        return prev.map(i => i.id === interaction.id ? interactionWithTimestamp : i);
      }
      return [...prev, interactionWithTimestamp];
    });
  }, [broadcast]);

  const removeInteraction = useCallback((interactionId) => {
    console.log('🔄 [Interaction] Removing interaction:', interactionId);

    broadcast({ type: 'interaction-removed', interactionId });
    setPendingInteractions(prev => prev.filter(i => i.id !== interactionId));
  }, [broadcast]);

  const updateInteraction = useCallback((interactionId, updates) => {
    console.log('🔄 [Interaction] Updating interaction:', interactionId, updates);

    broadcast({ type: 'interaction-updated', interactionId, updates });
    setPendingInteractions(prev =>
      prev.map(i => i.id === interactionId ? { ...i, ...updates } : i)
    );
  }, [broadcast]);

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
    setPendingInteractions([]);
  }, []);

  const clearInteractionsBySession = useCallback((sessionId) => {
    console.log('🔄 [Interaction] Clearing interactions for session:', sessionId);
    setPendingInteractions(prev => prev.filter(i => i.sessionId !== sessionId));
  }, []);

  const clearInteractionsByType = useCallback((type) => {
    console.log('🔄 [Interaction] Clearing interactions of type:', type);
    setPendingInteractions(prev => prev.filter(i => i.type !== type));
  }, []);

  const getInteractionCountBySession = useCallback((sessionId) => {
    if (!sessionId) return 0;
    return pendingInteractions.filter(i => i.sessionId === sessionId).length;
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
    getInteractionCountBySession,
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
