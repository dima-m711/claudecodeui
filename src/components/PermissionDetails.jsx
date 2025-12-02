 import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  TextField,
  Chip,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';

const PERMISSION_DECISIONS = {
  ALLOW: 'allow',
  ALLOW_SESSION: 'allow-session',
  DENY: 'deny',
  MODIFY: 'modify'
};

const PermissionDetails = ({ interaction, onResponse, onDismiss }) => {
  const { data } = interaction;
  const { toolName, input, riskLevel = 'medium', category = 'general' } = data || {};

  const [decision, setDecision] = useState(null);
  const [modifiedInput, setModifiedInput] = useState(JSON.stringify(input, null, 2));
  const [showInputEditor, setShowInputEditor] = useState(false);

  const handleDecision = (selectedDecision) => {
    if (selectedDecision === PERMISSION_DECISIONS.MODIFY) {
      setShowInputEditor(true);
      setDecision(selectedDecision);
      return;
    }

    const response = {
      decision: selectedDecision,
      updatedInput: input
    };

    onResponse(response);
  };

  const handleSubmitModified = () => {
    try {
      const parsedInput = JSON.parse(modifiedInput);
      const response = {
        decision: PERMISSION_DECISIONS.ALLOW,
        updatedInput: parsedInput
      };
      onResponse(response);
    } catch (error) {
      alert('Invalid JSON: ' + error.message);
    }
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'success';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Box>
          <Stack direction="row" spacing={1} mb={1}>
            <Chip
              label={`Risk: ${riskLevel}`}
              color={getRiskColor(riskLevel)}
              size="small"
            />
            <Chip
              label={`Category: ${category}`}
              variant="outlined"
              size="small"
            />
          </Stack>
        </Box>

        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" gutterBottom fontWeight="bold">
            Tool: {toolName}
          </Typography>

          <Accordion disableGutters elevation={0}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="body2">View Input Parameters</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box
                component="pre"
                sx={{
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxHeight: '200px',
                  bgcolor: 'grey.900',
                  color: 'grey.100',
                  p: 1,
                  borderRadius: 1,
                  m: 0
                }}
              >
                {JSON.stringify(input, null, 2)}
              </Box>
            </AccordionDetails>
          </Accordion>
        </Paper>

        {showInputEditor ? (
          <Box>
            <Typography variant="body2" gutterBottom fontWeight="bold">
              Modify Input (JSON):
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={10}
              value={modifiedInput}
              onChange={(e) => setModifiedInput(e.target.value)}
              variant="outlined"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                '& .MuiInputBase-input': {
                  fontFamily: 'monospace'
                }
              }}
            />
            <Stack direction="row" spacing={1} mt={2}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSubmitModified}
              >
                Allow with Modifications
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setShowInputEditor(false);
                  setDecision(null);
                }}
              >
                Cancel
              </Button>
            </Stack>
          </Box>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              variant="contained"
              color="success"
              onClick={() => handleDecision(PERMISSION_DECISIONS.ALLOW)}
            >
              Allow Once
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={() => handleDecision(PERMISSION_DECISIONS.ALLOW_SESSION)}
            >
              Allow for Session
            </Button>
            <Button
              variant="outlined"
              color="info"
              onClick={() => handleDecision(PERMISSION_DECISIONS.MODIFY)}
            >
              Modify Input
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => handleDecision(PERMISSION_DECISIONS.DENY)}
            >
              Deny
            </Button>
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export default PermissionDetails;
