import React from 'react';
import { INTERACTION_TYPES } from '../contexts/InteractionContext';
import InteractionInlineMessage from './InteractionInlineMessage';
import PermissionDetails from './PermissionDetails';
import PlanApprovalDetails from './PlanApprovalDetails';
import AskUserDetails from './AskUserDetails';

const InteractionRenderer = ({ interactions, onResponse }) => {
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

  return (
    <div className="w-full">
      {interactions.map((interaction) => (
        <InteractionInlineMessage
          key={interaction.id}
          interaction={interaction}
          detailsComponent={getDetailsComponent(interaction.type)}
          onResponse={(response) => onResponse(interaction.id, response)}
          onDismiss={() => onResponse(interaction.id, { cancelled: true })}
        />
      ))}
    </div>
  );
};

export default InteractionRenderer;
