import { InteractionType } from '../services/interactionTypes.js';

export class ExitPlanModeHandler {
  constructor(interactionManager) {
    this.interactionManager = interactionManager;
  }

  async handle(input, sessionIdRef, runtimeState) {
    try {
      const currentSessionId = sessionIdRef ? sessionIdRef.current : null;

      const planContent = input.plan || input;

      const response = await this.interactionManager.requestInteraction({
        type: InteractionType.PLAN_APPROVAL,
        sessionId: currentSessionId,
        data: {
          planData: planContent
        },
        metadata: {
          toolName: 'ExitPlanMode'
        }
      });

      if (response.cancelled) {
        const rejectionMessage = response.feedback
          ? `Plan rejected by user. Feedback: ${response.feedback}`
          : 'Plan rejected by user';
        console.log('[SDK] Plan approval cancelled:', rejectionMessage);
        return {
          behavior: 'deny',
          message: rejectionMessage,
          interrupt: !response.feedback
        };
      }

      const permissionMode = response.permissionMode || 'default';
      runtimeState.permissionMode = permissionMode;

      return {
        behavior: 'allow',
        updatedInput: input,
        updatedPermissions: [{
          type: 'setMode',
          mode: permissionMode,
          destination: 'session'
        }]
      };
    } catch (error) {
      console.error('[SDK] Plan approval failed:', error.message);
      return {
        behavior: 'deny',
        message: `Plan rejected: ${error.message}`,
        interrupt: false
      };
    }
  }
}
