import { EventEmitter } from 'events';
import { getInteractionManager } from './interactionManager.js';
import { InteractionType } from './interactionTypes.js';

class AskUserHandler extends EventEmitter {
  constructor() {
    super();
    this.interactionManager = getInteractionManager();
  }

  async askUser(questions, sessionId) {
    console.log(`❓ [AskUser] Requesting user input for ${questions.length} question(s)`);

    try {
      const response = await this.interactionManager.requestInteraction({
        type: InteractionType.ASK_USER,
        sessionId,
        data: {
          questions,
          timestamp: Date.now()
        },
        metadata: {}
      });

      console.log(`✅ [AskUser] Received user response with ${Object.keys(response.answers || {}).length} answer(s)`);

      return response.answers || {};
    } catch (error) {
      console.error(`❌ [AskUser] Failed to get user input:`, error.message);
      throw error;
    }
  }

  resolveAskUser(interactionId, answers) {
    console.log(`✅ [AskUser] Resolving interaction ${interactionId}`);

    const result = this.interactionManager.resolveInteraction(interactionId, {
      answers
    });

    return result.success;
  }

  rejectAskUser(interactionId, reason = 'User cancelled') {
    console.log(`❌ [AskUser] Rejecting interaction ${interactionId}: ${reason}`);

    const result = this.interactionManager.rejectInteraction(interactionId, reason);

    return result.success;
  }

  hasPendingQuestion() {
    const pending = Array.from(this.interactionManager.pendingInteractions.values())
      .filter(i => i.type === InteractionType.ASK_USER);
    return pending.length > 0;
  }

  getPendingQuestion() {
    const pending = Array.from(this.interactionManager.pendingInteractions.values())
      .filter(i => i.type === InteractionType.ASK_USER);

    if (pending.length === 0) return null;

    const question = pending[0];
    return {
      interactionId: question.id,
      questions: question.data.questions,
      sessionId: question.sessionId,
      timestamp: question.requestedAt
    };
  }

  getPendingQuestions(sessionIds) {
    return this.interactionManager.getPendingInteractions(sessionIds, InteractionType.ASK_USER);
  }

  getStatistics() {
    const stats = this.interactionManager.getStatistics();
    return stats['ask-user'] || { total: 0, resolved: 0, rejected: 0 };
  }
}

let askUserHandlerInstance = null;

export function getAskUserHandler() {
  if (!askUserHandlerInstance) {
    askUserHandlerInstance = new AskUserHandler();
  }
  return askUserHandlerInstance;
}

export { AskUserHandler };
