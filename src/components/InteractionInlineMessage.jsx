import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, Typography, IconButton, Collapse, Box } from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
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
    <Card
      sx={{
        my: 2,
        backgroundColor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        boxShadow: 3
      }}
    >
      <CardHeader
        avatar={
          <Box sx={{ fontSize: '1.5rem', mr: 1 }}>
            {getInteractionIcon()}
          </Box>
        }
        action={
          <IconButton
            onClick={handleToggleExpanded}
            aria-label={expanded ? 'collapse' : 'expand'}
            size="small"
          >
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        }
        title={
          <Typography variant="subtitle1" fontWeight="bold">
            {getInteractionTitle()}
          </Typography>
        }
        subheader={
          <Typography variant="caption" color="text.secondary">
            {new Date(interaction.requestedAt).toLocaleTimeString()}
          </Typography>
        }
        sx={{ pb: expanded ? 2 : 1 }}
      />

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <CardContent sx={{ pt: 0 }}>
          {DetailsComponent ? (
            <DetailsComponent
              interaction={interaction}
              onResponse={handleResponse}
              onDismiss={handleDismiss}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No details component provided for {interaction.type}
            </Typography>
          )}
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default InteractionInlineMessage;
