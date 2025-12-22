export const InteractionType = {
  PERMISSION: 'permission',
  PLAN_APPROVAL: 'plan-approval',
  ASK_USER: 'ask-user'
};

export const WS_INTERACTION_MESSAGES = {
  INTERACTION_REQUEST: 'interaction-request',
  INTERACTION_RESPONSE: 'interaction-response',
  INTERACTION_SYNC_REQUEST: 'interaction-sync-request',
  INTERACTION_SYNC_RESPONSE: 'interaction-sync-response'
};

export function createInteractionRequestMessage(interaction) {
  return {
    type: WS_INTERACTION_MESSAGES.INTERACTION_REQUEST,
    interactionType: interaction.type,
    id: interaction.id,
    sessionId: interaction.sessionId,
    data: interaction.data,
    metadata: interaction.metadata,
    requestedAt: interaction.requestedAt
  };
}

export function createInteractionResponseMessage(interactionId, response) {
  return {
    type: WS_INTERACTION_MESSAGES.INTERACTION_RESPONSE,
    interactionId,
    response,
    timestamp: Date.now()
  };
}

export function createInteractionSyncRequestMessage(sessionIds) {
  return {
    type: WS_INTERACTION_MESSAGES.INTERACTION_SYNC_REQUEST,
    sessionIds,
    timestamp: Date.now()
  };
}

export function createInteractionSyncResponseMessage(sessionIds, interactions) {
  return {
    type: WS_INTERACTION_MESSAGES.INTERACTION_SYNC_RESPONSE,
    sessionIds,
    interactions,
    timestamp: Date.now()
  };
}

export function validateInteractionResponse(message) {
  if (!message.interactionId || typeof message.interactionId !== 'string') {
    throw new Error('Missing or invalid interactionId');
  }
  if (!message.response || typeof message.response !== 'object') {
    throw new Error('Missing or invalid response');
  }
  return true;
}
