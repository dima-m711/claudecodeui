import { useState, useCallback } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

export function QuestionInlineDialog({ questionData, onSubmit, onTimeout }) {
  const [answers, setAnswers] = useState({});
  const [otherInputs, setOtherInputs] = useState({});
  const [expandedQuestions, setExpandedQuestions] = useState(
    questionData?.questions ? Object.fromEntries(questionData.questions.map((_, i) => [i, true])) : {}
  );

  const toggleQuestion = (index) => {
    setExpandedQuestions(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

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

  const handleSubmit = useCallback(() => {
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
  }, [answers, otherInputs, onSubmit]);

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

  const answeredCount = questionData?.questions
    ? questionData.questions.filter((_, i) => answers[i] && answers[i].trim() !== '').length
    : 0;
  const totalCount = questionData?.questions?.length || 0;

  if (!questionData || !questionData.questions) return null;

  return (
    <div className="mx-4 mb-4 rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm flex items-center gap-2 text-blue-900 dark:text-blue-100">
              ❓ Questions Required
              <span className="text-xs bg-blue-200 dark:bg-blue-800 px-2 py-0.5 rounded-full">
                {answeredCount}/{totalCount}
              </span>
            </span>
          </div>

          <div className="space-y-4">
            {questionData.questions.map((question, qIndex) => (
              <div key={qIndex} className="border border-blue-200 dark:border-blue-800 rounded-lg bg-white dark:bg-gray-900">
                <button
                  onClick={() => toggleQuestion(qIndex)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-t-lg transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {expandedQuestions[qIndex] ? (
                      <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    )}
                    <span className="text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                      {question.header}
                    </span>
                    {answers[qIndex] && (
                      <span className="text-xs text-green-600 dark:text-green-400">✓</span>
                    )}
                  </div>
                </button>

                {expandedQuestions[qIndex] && (
                  <div className="p-3 pt-0 space-y-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                      {question.question}
                    </p>

                    <div className="space-y-2">
                      {question.options.map((option, oIndex) => {
                        const optionId = `q${qIndex}-o${oIndex}`;
                        const isChecked = question.multiSelect
                          ? (answers[qIndex] || '').split(', ').includes(option.label)
                          : answers[qIndex] === option.label;

                        return (
                          <label
                            key={oIndex}
                            htmlFor={optionId}
                            className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
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
                              className="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                            />
                            <div className="flex-1 text-sm">
                              <div className="font-medium text-gray-900 dark:text-white">
                                {option.label}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">
                                {option.description}
                              </div>
                            </div>
                          </label>
                        );
                      })}

                      <label
                        htmlFor={`q${qIndex}-other`}
                        className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
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
                          className="mt-0.5 w-4 h-4 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900 dark:text-white mb-1">
                            Other
                          </div>
                          {((question.multiSelect && (answers[qIndex] || '').split(', ').includes('Other')) ||
                            (!question.multiSelect && answers[qIndex] === 'Other')) && (
                            <input
                              type="text"
                              value={otherInputs[qIndex] || ''}
                              onChange={(e) => handleOtherInput(qIndex, e.target.value)}
                              placeholder="Please specify..."
                              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                            />
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!isAnswerComplete()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
            >
              Submit Answers
            </button>
          </div>

          {!isAnswerComplete() && (
            <p className="mt-2 text-xs text-center text-gray-600 dark:text-gray-400">
              Please answer all questions before submitting
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
