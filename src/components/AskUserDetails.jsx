import React, { useState } from 'react';

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

  const renderOptions = (qOptions, qMultiSelect, index) => {
    if (qMultiSelect) {
      return (
        <div className="space-y-2 mt-2">
          {qOptions.map((option, optIndex) => (
            <label
              key={optIndex}
              className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={(answers[index] || []).includes(option.label)}
                onChange={(e) => handleMultipleChoice(index, option.label, e.target.checked)}
                className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div>
                <span className="text-sm text-gray-900 dark:text-gray-100">{option.label}</span>
                {option.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {option.description}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-2 mt-2">
        {qOptions.map((option, optIndex) => (
          <label
            key={optIndex}
            className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
          >
            <input
              type="radio"
              name={`question-${index}`}
              value={option.label}
              checked={answers[index] === option.label}
              onChange={(e) => handleSingleChoice(index, e.target.value)}
              className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm text-gray-900 dark:text-gray-100">{option.label}</span>
              {option.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {option.description}
                </p>
              )}
            </div>
          </label>
        ))}
      </div>
    );
  };

  const renderQuestion = (questionItem, index) => {
    if (!questionItem || typeof questionItem !== 'object') {
      return null;
    }

    const { question: q, options: qOptions = [], multiSelect: qMultiSelect = false } = questionItem;

    return (
      <div
        key={index}
        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-3"
      >
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {q}
        </p>

        {qOptions.length > 0 ? (
          renderOptions(qOptions, qMultiSelect, index)
        ) : (
          <textarea
            rows={3}
            placeholder="Enter your answer..."
            value={answers[index] || ''}
            onChange={(e) => handleTextInput(index, e.target.value)}
            className="w-full mt-2 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-100"
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {questions.length > 0 ? (
        questions.map((q, index) => renderQuestion(q, index))
      ) : question ? (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {question}
          </p>
          {options.length > 0 ? (
            renderOptions(options, multiSelect, 0)
          ) : (
            <textarea
              rows={3}
              placeholder="Enter your answer..."
              value={answers[0] || ''}
              onChange={(e) => handleTextInput(0, e.target.value)}
              className="w-full mt-2 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-100"
            />
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No question provided
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit()}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          Submit Answer
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

export default AskUserDetails;
