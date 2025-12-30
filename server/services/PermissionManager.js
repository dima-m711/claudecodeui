import crypto from 'crypto';
import {
  InteractionType,
  createSdkPermissionResult,
  TOOL_RISK_LEVELS,
  TOOL_CATEGORIES,
  RiskLevel
} from './interactionTypes.js';

export class PermissionManager {
  constructor(interactionManager) {
    this.interactionManager = interactionManager;
  }

  async handleAcceptEditsMode(toolName, input) {
    const autoAllowTools = ['Read', 'Write', 'Edit'];
    if (autoAllowTools.includes(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }
    return null;
  }

  async handlePlanMode(toolName, input) {
    const planModeTools = [
      'Read',
      'Glob',
      'Grep',
      'Task',
      'ExitPlanMode',
      'TodoRead',
      'TodoWrite',
      'AskUserQuestion'
    ];
    if (!planModeTools.includes(toolName)) {
      return { behavior: 'deny', message: `${toolName} not allowed in plan mode` };
    }
    return null;
  }

  async handleDefaultPermissionMode(toolName, input, requestId, ws, sessionIdRef, abortSignal, suggestions) {
    try {
      const currentSessionId = sessionIdRef ? sessionIdRef.current : null;

      const riskLevel = TOOL_RISK_LEVELS[toolName] || RiskLevel.HIGH;
      const category = TOOL_CATEGORIES[toolName] || 'other';

      const response = await this.interactionManager.requestInteraction({
        type: InteractionType.PERMISSION,
        sessionId: currentSessionId,
        data: {
          toolName,
          input,
          suggestions: suggestions || []
        },
        metadata: {
          requestId,
          riskLevel,
          category
        }
      });

      const result = createSdkPermissionResult(
        response.decision,
        response.updatedInput,
        response.suggestions || suggestions,
        response.message,
        response.interrupt
      );

      return result;

    } catch (error) {
      console.error(`Permission request ${requestId} error:`, error.message);
      return { behavior: 'deny', message: error.message || 'Permission request failed' };
    }
  }

  async checkPermission(toolName, input, runtimeState, ws, sessionIdRef, abortSignal, suggestions) {
    const requestId = crypto.randomUUID();

    switch (runtimeState.permissionMode) {
      case 'acceptEdits': {
        const result = await this.handleAcceptEditsMode(toolName, input);
        if (result) return result;
        break;
      }

      case 'plan': {
        const result = await this.handlePlanMode(toolName, input);
        if (result) return result;
        break;
      }
    }

    return await this.handleDefaultPermissionMode(
      toolName, input, requestId, ws, sessionIdRef, abortSignal, suggestions
    );
  }
}
