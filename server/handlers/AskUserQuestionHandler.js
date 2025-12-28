import { InteractionType } from '../services/interactionTypes.js';

export class AskUserQuestionHandler {
  constructor(interactionManager) {
    this.interactionManager = interactionManager;
  }

  async handle(input, sessionIdRef) {
    try {
      const currentSessionId = sessionIdRef ? sessionIdRef.current : null;

      const response = await this.interactionManager.requestInteraction({
        type: InteractionType.ASK_USER,
        sessionId: currentSessionId,
        data: {
          questions: input.questions || [input]
        },
        metadata: {
          toolName: 'AskUserQuestion'
        }
      });

      return {
        behavior: 'allow',
        updatedInput: { ...input, answers: response.answers }
      };
    } catch (error) {
      console.error('[SDK] AskUserQuestion failed:', error.message);
      return {
        behavior: 'deny',
        message: error.message || 'AskUserQuestion failed'
      };
    }
  }
}
