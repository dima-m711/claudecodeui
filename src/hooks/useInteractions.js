import { useEffect, useCallback } from 'react';
import { useInteraction } from '../contexts/InteractionContext';

export function useInteractions(ws, sessionIds = []) {
  const {
    addInteraction,
    removeInteraction,
    getInteractionById
  } = useInteraction();

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'interaction-request') {
          console.log('🔄 [WebSocket] Received interaction request:', data.interactionType, data.id);

          const interaction = {
            id: data.id,
            type: data.interactionType,
            sessionId: data.sessionId,
            data: data.data,
            metadata: data.metadata,
            requestedAt: data.requestedAt
          };

          addInteraction(interaction);
        }

        if (data.type === 'interaction-sync-response') {
          console.log('🔄 [WebSocket] Received interaction sync response:', data.interactions?.length || 0, 'interactions');

          if (data.interactions && Array.isArray(data.interactions)) {
            data.interactions.forEach(interaction => {
              addInteraction(interaction);
            });
          }
        }

        if (data.type === 'interaction-resolved') {
          console.log('🔄 [WebSocket] Interaction resolved by server:', data.interactionId);
          removeInteraction(data.interactionId);
        }
      } catch (error) {
        console.error('Failed to parse interaction message:', error);
      }
    };

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, addInteraction, removeInteraction]);

  useEffect(() => {
    if (!ws || !sessionIds || sessionIds.length === 0) return;

    console.log('🔄 [Interactions] Requesting sync for sessions:', sessionIds);

    const syncMessage = {
      type: 'interaction-sync-request',
      sessionIds
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(syncMessage));
    }
  }, [ws, sessionIds]);

  const sendInteractionResponse = useCallback((interactionId, response) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send interaction response: WebSocket not connected');
      return false;
    }

    const interaction = getInteractionById(interactionId);
    if (!interaction) {
      console.warn('Cannot send interaction response: Interaction not found', interactionId);
      return false;
    }

    console.log('🔄 [WebSocket] Sending interaction response:', interactionId);

    const message = {
      type: 'interaction-response',
      interactionId,
      response
    };

    ws.send(JSON.stringify(message));

    removeInteraction(interactionId);

    return true;
  }, [ws, getInteractionById, removeInteraction]);

  return {
    sendInteractionResponse
  };
}

export default useInteractions;
