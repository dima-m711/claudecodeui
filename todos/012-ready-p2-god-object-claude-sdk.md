# P2: God Object Pattern in claude-sdk.js (844 Lines)

---
status: ready
priority: p2
issue_id: "012"
tags: [architecture, maintainability, code-quality, refactoring]
dependencies: []
---

**Status**: ready
**Priority**: P2 (Important - Maintainability)
**Issue ID**: 012
**Tags**: architecture, maintainability, code-quality, refactoring

## Problem Statement

The `server/claude-sdk.js` file has grown to 844 lines with multiple responsibilities including tool handling, permission management, plan approval, session management, and WebSocket coordination. This violates Single Responsibility Principle and makes the code difficult to test and maintain.

**Evidence**:
```javascript
// claude-sdk.js responsibilities:
1. Claude SDK initialization (lines 1-30)
2. AskUserQuestion tool handler (lines 32-61)
3. ExitPlanMode tool handler (lines 63-107) - 5 bug fixes!
4. Permission handling (lines 188-235)
5. Tool allow/deny/modify logic (lines 237-289)
6. Session management (lines 291-340)
7. WebSocket message handling (lines 342-400)
8. Runtime state mutation (lines 402-450)
9. Statistics tracking (lines 452-500)
10. Error handling (lines 502-550)
```

**Risk Level**: MEDIUM
- High coupling makes changes risky
- Testing requires mocking entire file
- 5 bug fixes to ExitPlanMode suggest complexity
- New developers struggle to understand flow

## Findings from Agents

**Architecture Strategist (Agent aaa1b5c)**:
> "claude-sdk.js is a God Object with 844 lines handling 10+ distinct responsibilities. This should be split into: ToolHandlers (AskUser, ExitPlan), PermissionManager, SessionManager, and SDKClient."

**Pattern Recognition Specialist (Agent a374b62)**:
> "The ExitPlanMode handler has been modified 5 times in this branch, indicating it's error-prone. The complexity stems from mixing business logic (plan approval) with transport logic (WebSocket) in the same function."

**Git History Analyzer (Agent a6e4f43)**:
> "claude-sdk.js has high churn rate. Most modifications are in the tool handling sections (lines 32-235), suggesting these should be extracted into separate modules for easier testing and modification."

## Proposed Solutions

### Option 1: Extract Tool Handlers (Recommended)
**Implementation**:
```javascript
// server/handlers/AskUserQuestionHandler.js
export class AskUserQuestionHandler {
  constructor(interactionManager) {
    this.interactionManager = interactionManager;
  }

  async handle(input, sessionId) {
    const response = await this.interactionManager.requestInteraction({
      type: InteractionType.ASK_USER,
      sessionId,
      data: {
        question: input.question,
        questions: input.questions,
        options: input.options
      }
    });

    return {
      behavior: 'allow',
      updatedInput: { ...input, answers: response.answers }
    };
  }
}

// server/handlers/ExitPlanModeHandler.js
export class ExitPlanModeHandler {
  constructor(interactionManager) {
    this.interactionManager = interactionManager;
  }

  async handle(input, sessionId, runtimeState) {
    const response = await this.interactionManager.requestInteraction({
      type: InteractionType.PLAN_APPROVAL,
      sessionId,
      data: { planData: input.plan || input }
    });

    // Update runtime state if permission mode changed
    if (response.permissionMode) {
      runtimeState.permissionMode = response.permissionMode;
    }

    return {
      behavior: 'allow',
      updatedInput: input
    };
  }
}

// server/services/PermissionManager.js
export class PermissionManager {
  constructor(interactionManager) {
    this.interactionManager = interactionManager;
  }

  async checkPermission(tool, sessionId, permissionMode) {
    // Extract permission logic from createCanUseToolHandler
    if (permissionMode === 'bypassPermissions') return true;
    if (permissionMode === 'acceptEdits' && this.isReadWrite(tool)) return true;

    const response = await this.interactionManager.requestInteraction({
      type: InteractionType.PERMISSION,
      sessionId,
      data: { toolName: tool.name, toolInput: tool.input }
    });

    return response.approved;
  }

  isReadWrite(tool) {
    return ['Read', 'Edit', 'Write'].includes(tool.name);
  }
}

// server/claude-sdk.js (now 200 lines)
import { AskUserQuestionHandler } from './handlers/AskUserQuestionHandler.js';
import { ExitPlanModeHandler } from './handlers/ExitPlanModeHandler.js';
import { PermissionManager } from './services/PermissionManager.js';

export function createClaudeSDK(interactionManager) {
  const askUserHandler = new AskUserQuestionHandler(interactionManager);
  const planHandler = new ExitPlanModeHandler(interactionManager);
  const permissionManager = new PermissionManager(interactionManager);

  // Simplified SDK initialization
  return {
    askUserHandler,
    planHandler,
    permissionManager,
    createCanUseToolHandler: (sessionIdRef, runtimeState) => {
      return async (tool) => {
        return permissionManager.checkPermission(tool, sessionIdRef.current, runtimeState.permissionMode);
      };
    }
  };
}
```

**Pros**:
- Each class has single responsibility
- Easy to test in isolation
- Clearer separation of concerns
- Reduces claude-sdk.js from 844 to ~200 LOC

**Cons**:
- More files to navigate
- Requires reorganization effort

**Effort**: 300 LOC (split into 4 files)
**Risk**: Low (pure refactoring)

### Option 2: Feature-Based Modules
**Implementation**:
```javascript
// server/features/permissions/
//   - PermissionManager.js
//   - permissionTypes.js
//   - permissionHandlers.js

// server/features/tools/
//   - AskUserTool.js
//   - ExitPlanTool.js
//   - toolRegistry.js

// server/features/sessions/
//   - SessionManager.js
//   - sessionState.js
```

**Pros**:
- Domain-driven organization
- Easy to find related code
- Scales well for future features

**Cons**:
- More upfront design
- Deeper directory structure

**Effort**: 400 LOC (major reorganization)
**Risk**: Medium

### Option 3: Incremental Extraction (Minimal)
**Implementation**:
```javascript
// Extract only most complex parts
// server/handlers/exitPlanMode.js (107 lines)
// server/handlers/askUserQuestion.js (61 lines)

// Leave rest in claude-sdk.js for now
// Reduces main file to ~676 lines
```

**Pros**:
- Minimal disruption
- Addresses highest pain points (5 bug fixes in ExitPlanMode)
- Easy to do incrementally

**Cons**:
- Doesn't fully solve the problem
- Still leaves large file

**Effort**: 150 LOC
**Risk**: Very Low

## Technical Details

**Affected Files**:
- `server/claude-sdk.js:1-844` - Main file to refactor
- New files:
  - `server/handlers/AskUserQuestionHandler.js`
  - `server/handlers/ExitPlanModeHandler.js`
  - `server/services/PermissionManager.js`
  - `server/services/SessionManager.js`

**Complexity Metrics**:
```
Current claude-sdk.js:
- Lines: 844
- Functions: 18
- Cyclomatic Complexity: 47
- Responsibilities: 10+

After Option 1:
- claude-sdk.js: 200 lines, 5 functions, complexity 12
- Handler files: 100-150 lines each, complexity 5-8
- Total: ~600 LOC (same code, better organized)
```

## Acceptance Criteria

- [ ] Each class has single, clear responsibility
- [ ] Unit tests for each handler in isolation
- [ ] No functional changes (pure refactoring)
- [ ] All existing tests pass
- [ ] Code coverage maintained or improved
- [ ] Documentation updated

**Estimated LOC**: 300 (Option 1), 400 (Option 2), 150 (Option 3)
**Estimated Effort**: 8 hours (Option 1), 12 hours (Option 2), 4 hours (Option 3)

## Work Log

_To be filled during implementation_
## Work Log

### 2025-12-27 - Approved for Work
**By:** Claude Triage System
**Actions:**
- Issue approved during triage session
- Status changed from pending → ready
- Ready to be picked up and worked on

**Learnings:**
- Important maintainability/performance issue
- Approved for implementation in this PR
