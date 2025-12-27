export function saveInlineMessageState(sessionId, interactionId, state) {
  if (!sessionId || !interactionId) return;

  const key = `claude-ui:inline-message:${sessionId}:${interactionId}`;

  try {
    sessionStorage.setItem(key, JSON.stringify({
      expanded: state.expanded,
      scrollPosition: state.scrollPosition,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('Failed to save inline message state:', e);
  }
}

export function getInlineMessageState(sessionId, interactionId) {
  if (!sessionId || !interactionId) return null;

  const key = `claude-ui:inline-message:${sessionId}:${interactionId}`;

  try {
    const stored = sessionStorage.getItem(key);
    if (!stored) return null;

    const state = JSON.parse(stored);
    const TTL = 60 * 60 * 1000;

    if (Date.now() - state.timestamp > TTL) {
      sessionStorage.removeItem(key);
      return null;
    }

    return state;
  } catch (e) {
    console.warn('Failed to load inline message state:', e);
    sessionStorage.removeItem(key);
    return null;
  }
}

export function clearInlineMessageState(sessionId, interactionId) {
  if (!sessionId || !interactionId) return;
  const key = `claude-ui:inline-message:${sessionId}:${interactionId}`;
  sessionStorage.removeItem(key);
}
