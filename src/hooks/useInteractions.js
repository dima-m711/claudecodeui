import { useCallback } from 'react';
import { useInteraction } from '../contexts/InteractionContext';
import { useInteractionPolling } from './useInteractionPolling';

export function useInteractions(sessionIds = []) {
  const { getInteractionById, removeInteraction } = useInteraction();
  const { sendResponse } = useInteractionPolling({ sessionIds, enabled: sessionIds.length > 0 });

  const sendInteractionResponse = useCallback(async (interactionId, response) => {
    const interaction = getInteractionById(interactionId);
    if (!interaction) {
      console.warn('Cannot send interaction response: Interaction not found', interactionId);
      return false;
    }

    console.log('🔄 [HTTP] Sending interaction response:', interactionId);

    const result = await sendResponse(interactionId, response);

    if (!result.success) {
      console.error('Failed to send interaction response:', result.error);
      return false;
    }

    return true;
  }, [getInteractionById, sendResponse]);

  return {
    sendInteractionResponse
  };
}

export default useInteractions;
