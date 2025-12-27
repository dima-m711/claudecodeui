---
name: test-unified-interaction-system
description: Run all unified interaction system tests (permission, plan approval, ask-user)
argument-hint: "[optional: project-name]"
---

# Test Unified Interaction System

Master test command that validates all three interaction flows in the unified interaction system. Runs each test sequentially and generates a comprehensive report.

## Overview

This command runs the following tests in order:
1. **Permission Flow** (`/test-permission-flow`) - Tests permission request/approval
2. **Plan Approval Flow** (`/test-plan-approval-flow`) - Tests inline plan approvals
3. **AskUserQuestion Flow** (`/test-ask-user-flow`) - Tests user question handling

## Prerequisites

Before running this test:
1. Ensure the Claude Code UI server is running on http://localhost:5173
2. Ensure chrome-devtools MCP is configured and Chrome is open with DevTools
3. The test project directory must exist (default: /Users/dima/Documents/2Projects/cc-ui-tests)

## Workflow

### Phase 1: Setup Verification

1. Check server is running
2. Verify chrome-devtools MCP connection
3. Navigate to test project

### Phase 2: Run Permission Flow Test

Execute the permission flow test:
- Send file creation request
- Verify permission dialog appears
- Approve permission
- Verify file created
- Check server logs

Record: PASS/FAIL with timing

### Phase 3: Run Plan Approval Flow Test

Execute the plan approval flow test:
- Send plan-triggering message
- Verify plan appears INLINE (not modal)
- Verify permission mode options
- Approve with selected mode
- Check server logs

Record: PASS/FAIL with timing

### Phase 4: Run AskUserQuestion Flow Test

Execute the AskUserQuestion flow test:
- Send question-triggering message
- Verify question appears INLINE
- Select/enter answer
- Submit answer
- Verify Claude receives and uses answer

Record: PASS/FAIL with timing

### Phase 5: Generate Comprehensive Report

Output a report in this format:

```
╔══════════════════════════════════════════════════════════════╗
║         UNIFIED INTERACTION SYSTEM TEST REPORT               ║
╠══════════════════════════════════════════════════════════════╣
║ Date: [timestamp]                                            ║
║ Project: [project-name]                                      ║
║ Server: http://localhost:5173                                ║
╠══════════════════════════════════════════════════════════════╣

┌─────────────────────────────────────────────────────────────┐
│ TEST 1: PERMISSION FLOW                                     │
├─────────────────────────────────────────────────────────────┤
│ Status: [PASS ✓ / FAIL ✗]                                   │
│ Duration: Xs                                                │
│ Details:                                                    │
│   - Permission dialog appeared: [Yes/No]                    │
│   - Allow button clickable: [Yes/No]                        │
│   - File created: [Yes/No]                                  │
│   - updatedInput correct: [Yes/No]                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ TEST 2: PLAN APPROVAL FLOW                                  │
├─────────────────────────────────────────────────────────────┤
│ Status: [PASS ✓ / FAIL ✗]                                   │
│ Duration: Xs                                                │
│ Details:                                                    │
│   - Plan appeared INLINE: [Yes/No]                          │
│   - Markdown rendered: [Yes/No]                             │
│   - Permission mode options: [Yes/No]                       │
│   - Approval resolved: [Yes/No]                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ TEST 3: ASK USER QUESTION FLOW                              │
├─────────────────────────────────────────────────────────────┤
│ Status: [PASS ✓ / FAIL ✗]                                   │
│ Duration: Xs                                                │
│ Details:                                                    │
│   - Question appeared INLINE: [Yes/No]                      │
│   - Options rendered: [Yes/No]                              │
│   - Answer submitted: [Yes/No]                              │
│   - Answer received by SDK: [Yes/No]                        │
└─────────────────────────────────────────────────────────────┘

╠══════════════════════════════════════════════════════════════╣
║ SUMMARY                                                      ║
╠══════════════════════════════════════════════════════════════╣
║ Tests Passed: [X/3]                                          ║
║ Tests Failed: [X/3]                                          ║
║ Total Duration: Xs                                           ║
║                                                              ║
║ OVERALL STATUS: [ALL PASS ✓ / SOME FAILURES ✗]              ║
╚══════════════════════════════════════════════════════════════╝
```

## Success Criteria

All three tests must pass:

### Permission Flow
- [ ] Permission request appears
- [ ] Buttons (Allow, Deny, etc.) work
- [ ] File operation completes after approval
- [ ] Server logs show correct updatedInput

### Plan Approval Flow
- [ ] Plan appears **INLINE** (critical - not modal)
- [ ] Markdown content renders
- [ ] Permission mode selector works
- [ ] Approval/rejection works

### AskUserQuestion Flow
- [ ] Question appears **INLINE**
- [ ] Options render correctly
- [ ] Answer selection works
- [ ] SDK receives answer
- [ ] Claude continues with context

## Error Handling

If any test fails:
1. Continue with remaining tests
2. Mark failed test in report
3. Include error details and screenshot paths
4. Summarize all failures at end

## Cleanup

After all tests:
1. Delete any test files created (test-permission-*.md)
2. Clear server log if specified
3. Leave browser on final state for inspection

## Usage

```bash
# Run all tests with default project
/test-unified-interaction-system

# Run all tests with specific project
/test-unified-interaction-system my-project
```

## Individual Tests

To run tests individually:
- `/test-permission-flow` - Permission only
- `/test-plan-approval-flow` - Plan approval only
- `/test-ask-user-flow` - AskUserQuestion only

## Related Files

- `UNIFIED_INTERACTION_IMPLEMENTATION.md` - Implementation details
- `UNIFIED_SYSTEM_COMPLETE.md` - Full documentation
- `server/services/interactionManager.js` - Core backend service
- `src/contexts/InteractionContext.jsx` - Frontend context
