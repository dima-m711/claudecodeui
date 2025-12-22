import { EventEmitter } from 'events';
import crypto from 'crypto';
import { PERMISSION_TIMEOUT_MS } from './permissionTypes.js';

class QuestionManager extends EventEmitter {
  constructor() {
    super();
    this.pendingQuestion = null;
    this.statistics = {
      totalRequests: 0,
      answered: 0,
      timedOut: 0
    };
  }

  async requestQuestionAnswers(questions, sessionId) {
    if (this.pendingQuestion) {
      throw new Error('Another question is already pending answer');
    }

    const questionId = crypto.randomUUID();
    const timestamp = Date.now();
    const expiresAt = timestamp + PERMISSION_TIMEOUT_MS;

    console.log(`❓ [Question] Requesting answers for question ${questionId}`);

    return new Promise((resolve, reject) => {
      this.pendingQuestion = {
        questionId,
        questions,
        sessionId,
        timestamp,
        expiresAt,
        resolve,
        reject
      };

      this.statistics.totalRequests++;

      this.emit('question-request', {
        questionId,
        questions,
        sessionId,
        timestamp,
        expiresAt
      });

      const timeoutHandle = setTimeout(() => {
        if (this.pendingQuestion && this.pendingQuestion.questionId === questionId) {
          console.log(`⏱️  [Question] Question ${questionId} timed out`);
          this.statistics.timedOut++;
          this.emit('question-timeout', { questionId });
          this.pendingQuestion.reject(new Error('Question timed out'));
          this.pendingQuestion = null;
        }
      }, PERMISSION_TIMEOUT_MS);

      this.pendingQuestion.timeoutHandle = timeoutHandle;
    });
  }

  resolveQuestionAnswers(questionId, answers) {
    if (!this.pendingQuestion || this.pendingQuestion.questionId !== questionId) {
      console.warn(`⚠️  [Question] No pending question found with ID ${questionId}`);
      return false;
    }

    console.log(`✅ [Question] Question ${questionId} answered:`, answers);

    clearTimeout(this.pendingQuestion.timeoutHandle);
    this.statistics.answered++;

    this.pendingQuestion.resolve({ answers });
    this.pendingQuestion = null;

    return true;
  }

  hasPendingQuestion() {
    return this.pendingQuestion !== null;
  }

  getPendingQuestion() {
    return this.pendingQuestion ? {
      questionId: this.pendingQuestion.questionId,
      questions: this.pendingQuestion.questions,
      sessionId: this.pendingQuestion.sessionId,
      timestamp: this.pendingQuestion.timestamp,
      expiresAt: this.pendingQuestion.expiresAt
    } : null;
  }

  getStatistics() {
    return { ...this.statistics };
  }

  clearPendingQuestion() {
    if (this.pendingQuestion) {
      clearTimeout(this.pendingQuestion.timeoutHandle);
      this.pendingQuestion.reject(new Error('Question cancelled'));
      this.pendingQuestion = null;
    }
  }
}

let questionManagerInstance = null;

export function getQuestionManager() {
  if (!questionManagerInstance) {
    questionManagerInstance = new QuestionManager();
  }
  return questionManagerInstance;
}

export { QuestionManager };
