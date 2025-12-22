const STORAGE_KEY_PREFIX = 'claude-ui:interactions:';
const INTERACTION_TTL_MS = 60 * 60 * 1000;

export function getPendingInteractions(sessionIds) {
  if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
    return [];
  }

  const allInteractions = [];

  for (const sessionId of sessionIds) {
    if (!sessionId) continue;

    const key = `${STORAGE_KEY_PREFIX}${sessionId}`;
    try {
      const stored = sessionStorage.getItem(key);
      if (!stored) continue;

      const interactions = JSON.parse(stored);

      if (!Array.isArray(interactions)) {
        console.warn('Invalid interaction storage format, clearing');
        sessionStorage.removeItem(key);
        continue;
      }

      const validInteractions = interactions.filter(interaction => {
        if (!interaction || typeof interaction !== 'object') return false;
        if (!interaction.id || typeof interaction.id !== 'string') return false;
        if (!interaction.type || typeof interaction.type !== 'string') return false;
        if (typeof interaction.requestedAt !== 'number') return false;

        return Date.now() - interaction.requestedAt < INTERACTION_TTL_MS;
      });

      allInteractions.push(...validInteractions);
    } catch (e) {
      console.warn(`Failed to parse interaction storage for session ${sessionId}:`, e);
      sessionStorage.removeItem(key);
    }
  }

  return allInteractions;
}

export function savePendingInteraction(sessionId, interaction) {
  if (!sessionId) return;

  const key = `${STORAGE_KEY_PREFIX}${sessionId}`;
  const existing = getPendingInteractions([sessionId]);

  const updated = [
    ...existing.filter(i => i.id !== interaction.id),
    {
      ...interaction,
      requestedAt: interaction.requestedAt || Date.now()
    }
  ];

  try {
    sessionStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to persist interaction:', e);
  }
}

export function removePendingInteraction(sessionId, interactionId) {
  if (!sessionId) return;

  const key = `${STORAGE_KEY_PREFIX}${sessionId}`;
  const existing = getPendingInteractions([sessionId]);
  const updated = existing.filter(i => i.id !== interactionId);

  try {
    if (updated.length > 0) {
      sessionStorage.setItem(key, JSON.stringify(updated));
    } else {
      sessionStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('Failed to update interaction storage:', e);
  }
}

export function clearAllInteractions(sessionId) {
  if (!sessionId) return;
  const key = `${STORAGE_KEY_PREFIX}${sessionId}`;
  sessionStorage.removeItem(key);
}

export function getPendingInteractionsByType(sessionIds, type) {
  const allInteractions = getPendingInteractions(sessionIds);
  return allInteractions.filter(i => i.type === type);
}

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
