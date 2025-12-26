import { useState, useEffect, useCallback, useRef } from 'react';
import { useInteraction } from '../contexts/InteractionContext';

export function useInteractionPolling({ sessionIds, enabled = true }) {
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(null);
  const [lastPollTime, setLastPollTime] = useState(null);
  const pollIntervalRef = useRef(null);
  const abortControllerRef = useRef(null);
  const { addInteraction, removeInteraction, pendingInteractions } = useInteraction();

  const pollInterval = pendingInteractions.length > 0 ? 3000 : 10000;

  const poll = useCallback(async () => {
    if (!sessionIds || sessionIds.length === 0) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(
        `/api/interactions/poll?sessionIds=${sessionIds.join(',')}`,
        {
          signal: abortControllerRef.current.signal,
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Poll failed: ${response.status}`);
      }

      const data = await response.json();

      data.interactions.forEach(interaction => {
        addInteraction(interaction);
      });

      setError(null);
      setLastPollTime(Date.now());
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Polling error:', err);
      setError(err);
    }
  }, [sessionIds, addInteraction]);

  useEffect(() => {
    if (!enabled || !sessionIds || sessionIds.length === 0) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    poll();

    pollIntervalRef.current = setInterval(poll, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setIsPolling(false);
    };
  }, [enabled, poll, pollInterval, sessionIds]);

  const sendResponse = useCallback(async (interactionId, response) => {
    try {
      const token = localStorage.getItem('auth-token');
      const res = await fetch(`/api/interactions/${interactionId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ response })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Response failed: ${res.status}`);
      }

      removeInteraction(interactionId);
      poll();

      return { success: true };
    } catch (err) {
      console.error('Response error:', err);
      return { success: false, error: err };
    }
  }, [removeInteraction, poll]);

  return {
    isPolling,
    error,
    lastPollTime,
    sendResponse,
    forceRefresh: poll
  };
}
