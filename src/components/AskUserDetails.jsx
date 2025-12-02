import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  TextField,
  Paper,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  FormGroup
} from '@mui/material';

const AskUserDetails = ({ interaction, onResponse, onDismiss }) => {
  const { data } = interaction;
  const {
    question,
    questions = [],
    multiSelect = false,
    options = []
  } = data || {};

  const [answers, setAnswers] = useState({});

  const handleSingleChoice = (questionIndex, value) => {
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: value
    }));
  };

  const handleMultipleChoice = (questionIndex, value, checked) => {
    setAnswers(prev => {
      const currentAnswers = prev[questionIndex] || [];
      if (checked) {
        return {
          ...prev,
          [questionIndex]: [...currentAnswers, value]
        };
      } else {
        return {
          ...prev,
          [questionIndex]: currentAnswers.filter(v => v !== value)
        };
      }
    });
  };

  const handleTextInput = (questionIndex, value) => {
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: value
    }));
  };

  const handleSubmit = () => {
    onResponse({ answers });
  };

  const canSubmit = () => {
    if (questions.length === 0) {
      return !!answers[0];
    }

    return questions.every((_, index) => {
      const answer = answers[index];
      if (multiSelect) {
        return Array.isArray(answer) && answer.length > 0;
      }
      return answer !== undefined && answer !== null && answer !== '';
    });
  };

  const renderQuestion = (questionItem, index) => {
    if (!questionItem || typeof questionItem !== 'object') {
      return null;
    }

    const { question: q, options: qOptions = [], multiSelect: qMultiSelect = false } = questionItem;

    return (
      <Paper key={index} variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="body1" gutterBottom fontWeight="bold">
          {q}
        </Typography>

        {qOptions.length > 0 ? (
          qMultiSelect ? (
            <FormGroup>
              {qOptions.map((option, optIndex) => (
                <FormControlLabel
                  key={optIndex}
                  control={
                    <Checkbox
                      checked={(answers[index] || []).includes(option.label)}
                      onChange={(e) => handleMultipleChoice(index, option.label, e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2">{option.label}</Typography>
                      {option.description && (
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              ))}
            </FormGroup>
          ) : (
            <RadioGroup
              value={answers[index] || ''}
              onChange={(e) => handleSingleChoice(index, e.target.value)}
            >
              {qOptions.map((option, optIndex) => (
                <FormControlLabel
                  key={optIndex}
                  value={option.label}
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">{option.label}</Typography>
                      {option.description && (
                        <Typography variant="caption" color="text.secondary">
                          {option.description}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              ))}
            </RadioGroup>
          )
        ) : (
          <TextField
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            placeholder="Enter your answer..."
            value={answers[index] || ''}
            onChange={(e) => handleTextInput(index, e.target.value)}
            sx={{ mt: 1 }}
          />
        )}
      </Paper>
    );
  };

  return (
    <Box>
      <Stack spacing={2}>
        {questions.length > 0 ? (
          questions.map((q, index) => renderQuestion(q, index))
        ) : question ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="body1" gutterBottom fontWeight="bold">
              {question}
            </Typography>
            {options.length > 0 ? (
              multiSelect ? (
                <FormGroup>
                  {options.map((option, index) => (
                    <FormControlLabel
                      key={index}
                      control={
                        <Checkbox
                          checked={(answers[0] || []).includes(option.label)}
                          onChange={(e) => handleMultipleChoice(0, option.label, e.target.checked)}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2">{option.label}</Typography>
                          {option.description && (
                            <Typography variant="caption" color="text.secondary">
                              {option.description}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  ))}
                </FormGroup>
              ) : (
                <RadioGroup
                  value={answers[0] || ''}
                  onChange={(e) => handleSingleChoice(0, e.target.value)}
                >
                  {options.map((option, index) => (
                    <FormControlLabel
                      key={index}
                      value={option.label}
                      control={<Radio />}
                      label={
                        <Box>
                          <Typography variant="body2">{option.label}</Typography>
                          {option.description && (
                            <Typography variant="caption" color="text.secondary">
                              {option.description}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  ))}
                </RadioGroup>
              )
            ) : (
              <TextField
                fullWidth
                multiline
                rows={3}
                variant="outlined"
                placeholder="Enter your answer..."
                value={answers[0] || ''}
                onChange={(e) => handleTextInput(0, e.target.value)}
                sx={{ mt: 1 }}
              />
            )}
          </Paper>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No question provided
          </Typography>
        )}

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={!canSubmit()}
            fullWidth
          >
            Submit Answer
          </Button>
          {onDismiss && (
            <Button
              variant="outlined"
              onClick={onDismiss}
              fullWidth
            >
              Cancel
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

export default AskUserDetails;
