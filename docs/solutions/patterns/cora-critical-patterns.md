# CORA Critical Patterns - Required Reading

This document contains critical patterns that **MUST** be followed in CORA development. These patterns are derived from actual bugs and issues that occurred during development. All subagents should review these patterns before generating code.

**Purpose:** Prevent recurring mistakes by documenting non-obvious requirements and SDK usage patterns.

**When to add a pattern here:**
- System made the same mistake multiple times
- Solution is non-obvious but must be followed every time
- Foundational requirement (SDK integration, Rails patterns, etc.)
- Pattern affects multiple modules or components

---

## 1. SDK Permission Mode Transitions - Use updatedPermissions (ALWAYS REQUIRED)

### ❌ WRONG (Execution stops after tool approval)
```javascript
// DON'T: Deny with interrupt and try to restart recursively
if (toolName === 'ExitPlanMode') {
  const approvalResult = await planApprovalManager.requestPlanApproval(
    input.plan || input,
    currentSessionId
  );

  // Store approved mode in session for restart
  if (currentSessionId) {
    const session = getSession(currentSessionId);
    if (session) {
      session.planApproved = true;
      session.nextPermissionMode = approvalResult.permissionMode;
    }
  }

  // This interrupts the session - execution stops!
  return {
    behavior: 'deny',
    message: 'Plan approved by user. Transitioning to execution mode...',
    interrupt: true
  };
}

// Later: Try to recursively restart (loses context, doesn't work)
const shouldRestart = session?.planApproved && session?.nextPermissionMode;
if (shouldRestart) {
  return queryClaudeSDK('Continue with the approved plan...', restartOptions, ws);
}
```

### ✅ CORRECT
```javascript
// DO: Allow with updatedPermissions - SDK handles mode transition
if (toolName === 'ExitPlanMode') {
  const approvalResult = await planApprovalManager.requestPlanApproval(
    input.plan || input,
    currentSessionId
  );

  console.log(`✅ [SDK] Plan approved with mode: ${approvalResult.permissionMode}`);

  // Allow and let SDK update permission mode automatically
  return {
    behavior: 'allow',
    updatedInput: input,
    updatedPermissions: [{
      type: 'setMode',
      mode: approvalResult.permissionMode,
      destination: 'session'  // Apply to current session
    }]
  };
}
```

**Why:** The SDK's `updatedPermissions` field is specifically designed for updating permissions during tool approval. Using `behavior: 'deny'` with `interrupt: true` ends the session completely, making it impossible to continue execution. The SDK automatically applies permission updates when you allow the tool with `updatedPermissions`, preserving session context and conversation history.

**Placement/Context:** Any time you need to transition permission modes as part of allowing a tool use in the `canUseTool` callback. This applies to ExitPlanMode transitions, dynamic permission changes, or any scenario where a tool approval should change the permission mode for subsequent operations.

**Key SDK types:**
```typescript
export type PermissionResult = {
    behavior: 'allow';
    updatedInput: Record<string, unknown>;
    updatedPermissions?: PermissionUpdate[];  // Use this!
}

export type PermissionUpdate = {
    type: 'setMode';
    mode: PermissionMode;
    destination: PermissionUpdateDestination;  // Use 'session' for current session
}

type PermissionUpdateDestination = 'userSettings' | 'projectSettings' | 'localSettings' | 'session' | 'cliArg';
```

**Red flags indicating wrong pattern:**
- Custom session tracking for SDK-managed state (`session.planApproved`, `session.nextPermissionMode`)
- Recursive function calls to restart sessions
- Using `interrupt: true` when you want execution to continue
- Complex cleanup logic around session transitions

**Documented in:** `docs/solutions/integration-issues/exitplanmode-execution-stopped-PermissionSystem-20251223.md`

---

