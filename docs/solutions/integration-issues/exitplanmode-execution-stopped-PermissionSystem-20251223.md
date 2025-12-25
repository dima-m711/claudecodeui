---
module: Permission System
date: 2025-12-23
problem_type: integration_issue
component: tooling
symptoms:
  - "Plan approval showed green success message but execution stopped"
  - "Recursive restart approach lost session context"
  - "Permission mode did not transition after ExitPlanMode"
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags: [exitplanmode, plan-approval, permissions, sdk-integration, updated-permissions]
---

# Troubleshooting: ExitPlanMode Execution Stopped After Plan Approval

## Problem
After approving a plan in plan mode, the UI showed a green "Plan Approved" success message, but Claude execution stopped instead of continuing with the approved permission mode. The recursive restart approach used to transition from plan mode to execution mode lost session context and failed to continue execution.

## Environment
- Module: Permission System
- Component: Claude Agent SDK integration (server/claude-sdk.js)
- Affected Component: ExitPlanMode tool handler in canUseTool callback
- Date: 2025-12-23

## Symptoms
- Plan approval dialog completed successfully with user selecting a permission mode (e.g., "Auto-approve Read/Write")
- Green "Plan Approved" success message displayed correctly in UI
- Execution stopped after ExitPlanMode instead of continuing with approved permission mode
- No subsequent tool calls were made despite plan being approved
- Session appeared to end prematurely

## What Didn't Work

**Attempted Solution 1: Recursive Restart Approach**
- Denied ExitPlanMode with `behavior: 'deny'` and `interrupt: true`
- Stored approved permission mode in session tracking (`session.planApproved`, `session.nextPermissionMode`)
- Attempted to recursively call `queryClaudeSDK` after session ended with new permission mode
- **Why it failed:**
  - Session state was lost during the interrupt and restart
  - Conversation context may not have been properly preserved
  - SDK didn't properly continue from interrupted state
  - Complex session management with multiple tracking fields proved unreliable

## Solution

Changed ExitPlanMode handler to use SDK's built-in `updatedPermissions` mechanism instead of denying and restarting.

**Code changes:**

```javascript
// Before (broken):
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

  // Deny with interrupt to end planning phase
  return {
    behavior: 'deny',
    message: 'Plan approved by user. Transitioning to execution mode...',
    interrupt: true
  };
}

// After (fixed):
if (toolName === 'ExitPlanMode') {
  const approvalResult = await planApprovalManager.requestPlanApproval(
    input.plan || input,
    currentSessionId
  );

  console.log(`✅ [SDK] Plan approved with mode: ${approvalResult.permissionMode}`);

  // ALLOW ExitPlanMode with updatedPermissions to change mode
  // SDK will automatically update the permission mode for the current session
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

**Cleanup changes:**

1. **Removed auto-restart logic** (lines 671-708 in server/claude-sdk.js):
   - Deleted code that checked for `session.planApproved` after generator loop
   - Removed recursive `queryClaudeSDK` call
   - Removed `plan-execution-start` message sending

2. **Removed session tracking fields** (lines 291-292 in addSession function):
   ```javascript
   // Removed these fields:
   planApproved: false,
   nextPermissionMode: null
   ```

## Why This Works

1. **Root cause:** The recursive restart approach was fighting against the SDK's intended design. Using `behavior: 'deny'` with `interrupt: true` ends the session completely, making it difficult to properly resume with preserved context.

2. **SDK's built-in mechanism:** The `updatedPermissions` field in `PermissionResult` is specifically designed for updating permissions as part of allowing a tool use. The SDK type definition includes:
   ```typescript
   export type PermissionResult = {
       behavior: 'allow';
       updatedInput: Record<string, unknown>;
       updatedPermissions?: PermissionUpdate[];
   }

   // With permission update type:
   {
       type: 'setMode';
       mode: PermissionMode;
       destination: PermissionUpdateDestination;  // 'session' for current session
   }
   ```

3. **Why the solution works:**
   - Allowing ExitPlanMode lets execution continue in the same session
   - SDK automatically applies the permission mode change when `updatedPermissions` is provided
   - Session context and conversation history are preserved
   - No complex session tracking or recursive calls needed
   - The SDK handles the mode transition internally as part of processing the tool result

4. **Execution flow after fix:**
   - User approves plan with permission mode (e.g., 'acceptEdits')
   - ExitPlanMode is allowed with `updatedPermissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]`
   - SDK updates the session's permission mode to 'acceptEdits'
   - Execution continues in the same session
   - Subsequent Read/Write/Edit tools are now auto-allowed per the 'acceptEdits' mode rules

## Prevention

**When integrating with Claude Agent SDK:**
- Use built-in SDK mechanisms (like `updatedPermissions`) rather than trying to orchestrate complex session management manually
- Check SDK type definitions for available fields and patterns (e.g., `PermissionResult`, `PermissionUpdate`)
- Prefer `behavior: 'allow'` with modifications over `behavior: 'deny'` with workarounds when you want execution to continue
- Use `destination: 'session'` in `PermissionUpdate` for session-scoped permission changes
- Avoid storing permission state in custom session tracking fields when SDK provides built-in mechanisms

**Red flags that suggest using wrong SDK pattern:**
- Need for recursive function calls to restart sessions
- Custom session tracking fields for SDK-managed state
- Using `interrupt: true` when you actually want execution to continue
- Complex cleanup logic around session transitions

**How to catch this early:**
- Review SDK documentation and type definitions before implementing permission flows
- Look for built-in mechanisms before building custom orchestration
- Test permission mode transitions in a simple case before adding complexity
- Verify that session context is preserved after tool execution

## Related Issues

- See also: [permission-dialog-lost-after-refresh-20251201.md](./permission-dialog-lost-after-refresh-20251201.md) - Related permission system behavior

## Critical Pattern

⭐ **This solution has been promoted to Required Reading:**
- Pattern #1 in [cora-critical-patterns.md](../patterns/cora-critical-patterns.md#1-sdk-permission-mode-transitions---use-updatedpermissions-always-required)
- All subagents will see this pattern before code generation
