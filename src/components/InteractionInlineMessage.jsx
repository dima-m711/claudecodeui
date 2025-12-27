import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { INTERACTION_TYPES } from '../contexts/InteractionContext';
import {
  saveInlineMessageState,
  getInlineMessageState,
  clearInlineMessageState
} from '../utils/interactionStorage';

const InteractionInlineMessage = ({
  interaction,
  detailsComponent: DetailsComponent,
  onResponse,
  onDismiss,
  defaultExpanded = true
}) => {
  const [expanded, setExpanded] = useState(() => {
    if (!interaction?.sessionId || !interaction?.id) {
      return defaultExpanded;
    }

    const savedState = getInlineMessageState(interaction.sessionId, interaction.id);
    return savedState?.expanded ?? defaultExpanded;
  });

  useEffect(() => {
    if (interaction?.sessionId && interaction?.id) {
      saveInlineMessageState(interaction.sessionId, interaction.id, { expanded });
    }
  }, [expanded, interaction]);

  const handleToggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const handleResponse = useCallback((response) => {
    if (interaction?.sessionId && interaction?.id) {
      clearInlineMessageState(interaction.sessionId, interaction.id);
    }
    onResponse?.(response);
  }, [interaction, onResponse]);

  const handleDismiss = useCallback(() => {
    if (interaction?.sessionId && interaction?.id) {
      clearInlineMessageState(interaction.sessionId, interaction.id);
    }
    onDismiss?.();
  }, [interaction, onDismiss]);

  if (!interaction) {
    return null;
  }

  const getInteractionTitle = () => {
    switch (interaction.type) {
      case INTERACTION_TYPES.PERMISSION:
        return `Permission Request: ${interaction.data?.toolName || 'Unknown Tool'}`;
      case INTERACTION_TYPES.PLAN_APPROVAL:
        return 'Plan Approval Required';
      case INTERACTION_TYPES.ASK_USER:
        return interaction.data?.question || 'User Input Required';
      default:
        return 'Interaction Required';
    }
  };

  const getInteractionIcon = () => {
    switch (interaction.type) {
      case INTERACTION_TYPES.PERMISSION:
        return '🔐';
      case INTERACTION_TYPES.PLAN_APPROVAL:
        return '📋';
      case INTERACTION_TYPES.ASK_USER:
        return '❓';
      default:
        return '🔄';
    }
  };

  return (
    <div className="my-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${expanded ? 'border-b border-gray-200 dark:border-gray-700' : ''}`}
        onClick={handleToggleExpanded}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getInteractionIcon()}</span>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {getInteractionTitle()}
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(interaction.requestedAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
        <button
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          aria-label={expanded ? 'collapse' : 'expand'}
        >
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="p-4">
          {DetailsComponent ? (
            <DetailsComponent
              interaction={interaction}
              onResponse={handleResponse}
              onDismiss={handleDismiss}
            />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No details component provided for {interaction.type}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default InteractionInlineMessage;
