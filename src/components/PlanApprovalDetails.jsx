import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  Divider
} from '@mui/material';
import ReactMarkdown from 'react-markdown';

const PlanApprovalDetails = ({ interaction, onResponse, onDismiss }) => {
  const { data } = interaction;
  const { planData } = data || {};

  const [permissionMode, setPermissionMode] = useState('default');

  const handleApprove = () => {
    onResponse({
      permissionMode
    });
  };

  const handleReject = () => {
    onDismiss();
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: 'background.default',
            maxHeight: '400px',
            overflow: 'auto'
          }}
        >
          <Typography variant="subtitle2" gutterBottom fontWeight="bold" mb={2}>
            Proposed Plan:
          </Typography>

          <Box
            sx={{
              '& pre': {
                bgcolor: 'grey.900',
                color: 'grey.100',
                p: 1,
                borderRadius: 1,
                overflow: 'auto',
                fontSize: '0.875rem'
              },
              '& code': {
                bgcolor: 'grey.900',
                color: 'grey.100',
                px: 0.5,
                borderRadius: 0.5,
                fontSize: '0.875rem'
              },
              '& h1, & h2, & h3, & h4, & h5, & h6': {
                mt: 2,
                mb: 1
              },
              '& ul, & ol': {
                pl: 3
              }
            }}
          >
            {typeof planData === 'string' ? (
              <ReactMarkdown>{planData}</ReactMarkdown>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No plan data available
              </Typography>
            )}
          </Box>
        </Paper>

        <Divider />

        <FormControl component="fieldset">
          <FormLabel component="legend">
            <Typography variant="body2" fontWeight="bold">
              Permission Mode
            </Typography>
          </FormLabel>
          <RadioGroup
            value={permissionMode}
            onChange={(e) => setPermissionMode(e.target.value)}
          >
            <FormControlLabel
              value="default"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">Default</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Use current permission settings
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="auto-approve-read"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">Auto-approve Read</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Automatically approve read-only operations
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="auto-approve-all"
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">Auto-approve All</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Automatically approve all operations for this plan
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            color="success"
            onClick={handleApprove}
            fullWidth
          >
            Approve Plan
          </Button>
          <Button
            variant="outlined"
            color="error"
            onClick={handleReject}
            fullWidth
          >
            Reject Plan
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};

export default PlanApprovalDetails;
