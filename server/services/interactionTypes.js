export const InteractionType = {
  PERMISSION: 'permission',
  PLAN_APPROVAL: 'plan-approval',
  ASK_USER: 'ask-user'
};

export const WS_INTERACTION_MESSAGES = {
  INTERACTION_REQUEST: 'interaction-request',
  INTERACTION_RESPONSE: 'interaction-response',
  INTERACTION_SYNC_REQUEST: 'interaction-sync-request',
  INTERACTION_SYNC_RESPONSE: 'interaction-sync-response'
};

export const PermissionDecision = {
  ALLOW: 'allow',
  DENY: 'deny',
  ALLOW_SESSION: 'allow-session',
  ALLOW_ALWAYS: 'allow-always'
};

export const PermissionBehavior = {
  ALLOW: 'allow',
  DENY: 'deny'
};

export const RiskLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export const ToolCategory = {
  FILE_READ: 'file-read',
  FILE_WRITE: 'file-write',
  SYSTEM_COMMAND: 'system-command',
  NETWORK: 'network',
  PROCESS: 'process',
  OTHER: 'other'
};

export const TOOL_RISK_LEVELS = {
  Read: RiskLevel.LOW,
  Glob: RiskLevel.LOW,
  Grep: RiskLevel.LOW,
  TodoRead: RiskLevel.LOW,
  Write: RiskLevel.MEDIUM,
  Edit: RiskLevel.MEDIUM,
  TodoWrite: RiskLevel.MEDIUM,
  NotebookEdit: RiskLevel.MEDIUM,
  Bash: RiskLevel.HIGH,
  Task: RiskLevel.HIGH,
  WebFetch: RiskLevel.HIGH,
  KillShell: RiskLevel.HIGH,
  SlashCommand: RiskLevel.HIGH,
  Skill: RiskLevel.HIGH
};

export const TOOL_CATEGORIES = {
  Read: ToolCategory.FILE_READ,
  Glob: ToolCategory.FILE_READ,
  Grep: ToolCategory.FILE_READ,
  Write: ToolCategory.FILE_WRITE,
  Edit: ToolCategory.FILE_WRITE,
  NotebookEdit: ToolCategory.FILE_WRITE,
  Bash: ToolCategory.SYSTEM_COMMAND,
  BashOutput: ToolCategory.SYSTEM_COMMAND,
  KillShell: ToolCategory.PROCESS,
  WebFetch: ToolCategory.NETWORK,
  Task: ToolCategory.PROCESS,
  SlashCommand: ToolCategory.PROCESS,
  Skill: ToolCategory.PROCESS,
  TodoRead: ToolCategory.OTHER,
  TodoWrite: ToolCategory.OTHER,
  AskUserQuestion: ToolCategory.OTHER,
  ExitPlanMode: ToolCategory.OTHER
};

export function createSdkPermissionResult(decision, updatedInput = null, suggestions = null, message = null, interrupt = false) {
  const behavior = (decision === PermissionDecision.ALLOW ||
                    decision === PermissionDecision.ALLOW_SESSION ||
                    decision === PermissionDecision.ALLOW_ALWAYS)
                   ? PermissionBehavior.ALLOW
                   : PermissionBehavior.DENY;

  const result = { behavior };

  if (behavior === PermissionBehavior.ALLOW) {
    result.updatedInput = updatedInput || {};
  }

  if (decision === PermissionDecision.ALLOW_SESSION || decision === PermissionDecision.ALLOW_ALWAYS) {
    if (suggestions && suggestions.length > 0) {
      const destination = decision === PermissionDecision.ALLOW_SESSION ? 'session' : 'localSettings';
      result.updatedPermissions = suggestions.map(suggestion => ({
        ...suggestion,
        destination
      }));
    }
  }

  if (behavior === PermissionBehavior.DENY) {
    result.message = message || 'Permission denied by user';
    if (interrupt) {
      result.interrupt = interrupt;
    }
  }

  return result;
}

export function createInteractionRequestMessage(interaction) {
  return {
    type: WS_INTERACTION_MESSAGES.INTERACTION_REQUEST,
    interactionType: interaction.type,
    id: interaction.id,
    sessionId: interaction.sessionId,
    data: interaction.data,
    metadata: interaction.metadata,
    requestedAt: interaction.requestedAt
  };
}

export function createInteractionResponseMessage(interactionId, response) {
  return {
    type: WS_INTERACTION_MESSAGES.INTERACTION_RESPONSE,
    interactionId,
    response,
    timestamp: Date.now()
  };
}

export function createInteractionSyncRequestMessage(sessionIds) {
  return {
    type: WS_INTERACTION_MESSAGES.INTERACTION_SYNC_REQUEST,
    sessionIds,
    timestamp: Date.now()
  };
}

export function createInteractionSyncResponseMessage(sessionIds, interactions) {
  return {
    type: WS_INTERACTION_MESSAGES.INTERACTION_SYNC_RESPONSE,
    sessionIds,
    interactions,
    timestamp: Date.now()
  };
}

export function validateInteractionResponse(message) {
  if (!message.interactionId || typeof message.interactionId !== 'string') {
    throw new Error('Missing or invalid interactionId');
  }
  if (!message.response || typeof message.response !== 'object') {
    throw new Error('Missing or invalid response');
  }
  return true;
}
