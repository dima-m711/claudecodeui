import React from 'react';
import { INTERACTION_TYPES } from '../contexts/InteractionContext';
import InteractionInlineMessage from './InteractionInlineMessage';
import PermissionDetails from './PermissionDetails';
import PlanApprovalDetails from './PlanApprovalDetails';
import AskUserDetails from './AskUserDetails';

const InteractionRenderer = ({ interactions, onResponse, currentSessionId }) => {
  if (!interactions || interactions.length === 0) {
    return null;
  }

  const getDetailsComponent = (type) => {
    switch (type) {
      case INTERACTION_TYPES.PERMISSION:
        return PermissionDetails;
      case INTERACTION_TYPES.PLAN_APPROVAL:
        return PlanApprovalDetails;
      case INTERACTION_TYPES.ASK_USER:
        return AskUserDetails;
      default:
        return null;
    }
  };

  // Defensive filtering: Only render interactions for current session
  const sessionFilteredInteractions = interactions.filter(interaction => {
    if (!interaction.sessionId || !currentSessionId) {
      return true; // No session info - allow through
    }
    const shouldRender = interaction.sessionId === currentSessionId;
    if (!shouldRender) {
      console.log('⏭️ [InteractionRenderer] Skipping interaction for different session:',
                  interaction.sessionId, 'current:', currentSessionId);
    }
    return shouldRender;
  });

  if (sessionFilteredInteractions.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      {sessionFilteredInteractions.map((interaction) => (
        <InteractionInlineMessage
          key={interaction.id}
          interaction={interaction}
          detailsComponent={getDetailsComponent(interaction.type)}
          onResponse={(response) => onResponse(interaction.id, response)}
          onDismiss={(dismissData) => onResponse(interaction.id, dismissData || { cancelled: true })}
        />
      ))}
    </div>
  );
};

export default InteractionRenderer;
