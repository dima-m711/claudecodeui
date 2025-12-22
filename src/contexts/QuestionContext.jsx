import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';

const QuestionContext = createContext();

export const useQuestion = () => {
  const context = useContext(QuestionContext);
  if (!context) {
    throw new Error('useQuestion must be used within a QuestionProvider');
  }
  return context;
};

export const QuestionProvider = ({ children, websocket }) => {
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!websocket) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'question:request') {
          console.log('❓ [Question] Received question request:', data.questionId);
          setActiveQuestion({
            questionId: data.questionId,
            questions: data.questions,
            sessionId: data.sessionId,
            timestamp: data.timestamp,
            expiresAt: data.expiresAt
          });
        } else if (data.type === 'question:timeout') {
          console.log('⏱️  [Question] Question timed out:', data.questionId);
          if (activeQuestion && activeQuestion.questionId === data.questionId) {
            setActiveQuestion(null);
            setIsProcessing(false);
          }
        }
      } catch (error) {
        console.error('Error handling question message:', error);
      }
    };

    websocket.addEventListener('message', handleMessage);

    return () => {
      websocket.removeEventListener('message', handleMessage);
    };
  }, [websocket, activeQuestion]);

  const handleAnswerSubmit = useCallback((questionId, answers) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    console.log('✅ [Question] Submitting answers:', { questionId, answers });
    setIsProcessing(true);

    const response = {
      type: 'question:answer',
      questionId,
      answers,
      timestamp: Date.now()
    };

    websocket.send(JSON.stringify(response));

    setActiveQuestion(null);
    setTimeout(() => setIsProcessing(false), 500);
  }, [websocket]);

  const handleTimeout = useCallback(() => {
    if (activeQuestion) {
      console.log('⏱️  [Question] Question dialog timed out');
      setActiveQuestion(null);
    }
  }, [activeQuestion]);

  const value = {
    activeQuestion,
    isProcessing,
    handleAnswerSubmit,
    handleTimeout
  };

  return (
    <QuestionContext.Provider value={value}>
      {children}
    </QuestionContext.Provider>
  );
};
