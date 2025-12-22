import React, { useState, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

const QuestionDialog = ({ questionData, onSubmit, onTimeout }) => {
  const [answers, setAnswers] = useState({});
  const [otherInputs, setOtherInputs] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(null);

  useEffect(() => {
    if (!questionData || !questionData.expiresAt) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((questionData.expiresAt - now) / 1000));
      setTimeRemaining(remaining);

      if (remaining === 0) {
        clearInterval(intervalId);
        if (onTimeout) onTimeout();
      }
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);

    return () => clearInterval(intervalId);
  }, [questionData, onTimeout]);

  const handleRadioChange = (questionIndex, optionLabel) => {
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: optionLabel
    }));
    if (optionLabel !== 'Other') {
      setOtherInputs(prev => {
        const newInputs = { ...prev };
        delete newInputs[questionIndex];
        return newInputs;
      });
    }
  };

  const handleCheckboxChange = (questionIndex, optionLabel, checked) => {
    setAnswers(prev => {
      const currentAnswers = prev[questionIndex] ? prev[questionIndex].split(', ') : [];
      let newAnswers;

      if (checked) {
        newAnswers = [...currentAnswers, optionLabel];
      } else {
        newAnswers = currentAnswers.filter(a => a !== optionLabel);
        if (optionLabel === 'Other') {
          setOtherInputs(prevInputs => {
            const newInputs = { ...prevInputs };
            delete newInputs[questionIndex];
            return newInputs;
          });
        }
      }

      return {
        ...prev,
        [questionIndex]: newAnswers.join(', ')
      };
    });
  };

  const handleOtherInput = (questionIndex, value) => {
    setOtherInputs(prev => ({
      ...prev,
      [questionIndex]: value
    }));
  };

  const handleSubmit = () => {
    const finalAnswers = { ...answers };

    Object.keys(otherInputs).forEach(questionIndex => {
      if (otherInputs[questionIndex]) {
        const currentAnswer = finalAnswers[questionIndex];
        if (currentAnswer && currentAnswer.includes('Other')) {
          if (currentAnswer === 'Other') {
            finalAnswers[questionIndex] = `Other: ${otherInputs[questionIndex]}`;
          } else {
            const parts = currentAnswer.split(', ');
            const updatedParts = parts.map(part =>
              part === 'Other' ? `Other: ${otherInputs[questionIndex]}` : part
            );
            finalAnswers[questionIndex] = updatedParts.join(', ');
          }
        }
      }
    });

    onSubmit(finalAnswers);
  };

  const isAnswerComplete = () => {
    if (!questionData || !questionData.questions) return false;

    for (let i = 0; i < questionData.questions.length; i++) {
      const answer = answers[i];
      if (!answer || answer.trim() === '') return false;

      if (answer.includes('Other') && !otherInputs[i]) {
        return false;
      }
    }
    return true;
  };

  if (!questionData || !questionData.questions) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500 flex items-center justify-center shadow-lg">
              <HelpCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Questions</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Please answer the following questions</p>
            </div>
          </div>

          {timeRemaining !== null && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              timeRemaining <= 10
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">{timeRemaining}s</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {questionData.questions.map((question, qIndex) => (
            <div key={qIndex} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50">
              <div className="mb-3">
                <span className="inline-block px-2 py-1 text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                  {question.header}
                </span>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {question.question}
              </h3>

              <div className="space-y-3">
                {question.options.map((option, oIndex) => {
                  const optionId = `q${qIndex}-o${oIndex}`;
                  const isChecked = question.multiSelect
                    ? (answers[qIndex] || '').split(', ').includes(option.label)
                    : answers[qIndex] === option.label;

                  return (
                    <label
                      key={oIndex}
                      htmlFor={optionId}
                      className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 cursor-pointer transition-colors"
                    >
                      <input
                        type={question.multiSelect ? 'checkbox' : 'radio'}
                        id={optionId}
                        name={`question-${qIndex}`}
                        checked={isChecked}
                        onChange={(e) => {
                          if (question.multiSelect) {
                            handleCheckboxChange(qIndex, option.label, e.target.checked);
                          } else {
                            handleRadioChange(qIndex, option.label);
                          }
                        }}
                        className="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {option.label}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {option.description}
                        </div>
                      </div>
                    </label>
                  );
                })}

                <label
                  htmlFor={`q${qIndex}-other`}
                  className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <input
                    type={question.multiSelect ? 'checkbox' : 'radio'}
                    id={`q${qIndex}-other`}
                    name={`question-${qIndex}`}
                    checked={question.multiSelect
                      ? (answers[qIndex] || '').split(', ').includes('Other')
                      : answers[qIndex] === 'Other'}
                    onChange={(e) => {
                      if (question.multiSelect) {
                        handleCheckboxChange(qIndex, 'Other', e.target.checked);
                      } else {
                        handleRadioChange(qIndex, 'Other');
                      }
                    }}
                    className="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white mb-2">
                      Other
                    </div>
                    {((question.multiSelect && (answers[qIndex] || '').split(', ').includes('Other')) ||
                      (!question.multiSelect && answers[qIndex] === 'Other')) && (
                      <input
                        type="text"
                        value={otherInputs[qIndex] || ''}
                        onChange={(e) => handleOtherInput(qIndex, e.target.value)}
                        placeholder="Please specify..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                      />
                    )}
                  </div>
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
          <button
            onClick={handleSubmit}
            disabled={!isAnswerComplete()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Submit Answers</span>
          </button>

          {!isAnswerComplete() && (
            <p className="mt-2 text-xs text-center text-gray-500 dark:text-gray-400">
              Please answer all questions before submitting
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuestionDialog;
