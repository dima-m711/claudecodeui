---
name: test-plan-approval-flow
description: Test plan approval flow using chrome-devtools MCP and report results
argument-hint: "[optional: project-name]"
---

# Test Plan Approval Flow

Automated test that validates the plan approval flow in Claude Code UI. This command uses chrome-devtools MCP to interact with the browser and verify that plan approvals appear inline and work correctly.

## Prerequisites

Before running this test:
1. Ensure the Claude Code UI server is running on http://localhost:5173
2. Ensure chrome-devtools MCP is configured and Chrome is open with DevTools
3. The test project directory must exist (default: /Users/dima/Documents/2Projects/cc-ui-tests)

## Workflow

### Step 1: Verify Server is Running

Use Bash to check the server status:
```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
```

If server returns 200, proceed. If not, start the server:
```bash
npm run dev > /tmp/claude-ui-server.log 2>&1 &
```

Wait 5 seconds for startup, then verify again.

### Step 2: List Browser Pages

Use `mcp__mcpm_chrome-devtools__list_pages` to see available browser pages.

If no suitable page exists, navigate to the UI:
```
mcp__mcpm_chrome-devtools__navigate_page with url: "http://localhost:5173"
```

### Step 3: Take Initial Snapshot

Use `mcp__mcpm_chrome-devtools__take_snapshot` to capture the page structure.

Look for:
- Project list in sidebar (buttons with project names)
- The target project button (default: "todo-cli")

### Step 4: Select Project

Find the project button in the snapshot. Click the project using `mcp__mcpm_chrome-devtools__click` with the element's uid.

### Step 5: Start New Claude Session with Plan Mode

After project selection, look for the Claude button and click it to start a new session.
Switch to plan mode by clicking 3 times on the Default mode button to cycle to Plan mode.

### Step 6: Wait for Input Field

Take another snapshot and verify the input field is ready.

### Step 7: Send Plan-Triggering Message

Use `mcp__mcpm_chrome-devtools__fill` to enter a message that will trigger plan mode:
```
I want to add a new feature to create todo items with priorities. Please enter plan mode and create a detailed implementation plan.
```

Then use `mcp__mcpm_chrome-devtools__press_key` with key "Enter" to send.

### Step 8: Wait for Plan Approval Request

Use `mcp__mcpm_chrome-devtools__wait_for` with:
- text: "Plan Approval" OR "Approve Plan"
- timeout: 60000 (60 seconds)

### Step 9: Verify Plan Approval UI (INLINE)

Take snapshot and confirm these elements are present:
- Plan content rendered as markdown
- "Approve Plan" button
- "Reject Plan" button
- Permission mode selector (Default, Auto-approve Read, Auto-approve All)

**Critical**: Verify this is an INLINE component in the chat, NOT a modal dialog. The plan should appear within the message stream.

Look for patterns like:
```
heading "Plan Approval Required"
StaticText "Proposed Plan:"
button "Approve Plan"
button "Reject Plan"
```

### Step 10: Verify Permission Mode Options

Take snapshot and verify these radio options exist:
```
radio "Default"
radio "Auto-approve Read"
radio "Auto-approve All"
```

### Step 11: Select Permission Mode and Approve

1. Click the "Auto-approve Read" radio button
2. Click "Approve Plan" button

### Step 12: Wait for Plan Execution

Use `mcp__mcpm_chrome-devtools__wait_for` with:
- text: "plan approved" OR "proceeding" OR "implementing"
- timeout: 30000

### Step 13: Verify Server Logs

Check the server logs for successful plan approval:
```bash
grep -E "(Plan.*approved|permissionMode)" /tmp/claude-ui-server.log | tail -10
```

**Critical Verification**: The log should show:
```
✅ [PlanApproval] Plan <planId> approved with mode: auto-approve-read
```

### Step 14: Generate Test Report

Output a report in this format:

```
=== Plan Approval Flow Test ===
Started: [timestamp]

✓ Step 1: Server running (Xs)
✓ Step 2: Browser page ready (Xs)
✓ Step 3: Project selected (Xs)
✓ Step 4: Claude session created (Xs)
✓ Step 5: Plan-triggering message sent (Xs)
✓ Step 6: Plan approval request appeared INLINE (Xs)
✓ Step 7: Permission mode options verified (Xs)
✓ Step 8: Plan approved with "Auto-approve Read" mode (Xs)
✓ Step 9: Server logs confirm approval (Xs)

Total duration: Xs
Status: PASS ✓

Plan displayed: INLINE (not modal)
Permission mode selected: auto-approve-read
```

## Success Criteria

- [ ] Server responds with HTTP 200
- [ ] Browser navigates to UI successfully
- [ ] Project can be selected from sidebar
- [ ] Claude session starts without errors
- [ ] Plan-triggering message is sent successfully
- [ ] Plan approval appears **INLINE** (not as modal dialog)
- [ ] Plan content renders as markdown
- [ ] Permission mode radio buttons work
- [ ] "Approve Plan" and "Reject Plan" buttons visible
- [ ] Approval resolves the plan correctly
- [ ] Server logs show correct permission mode

## Error Handling

If any step fails:

1. **Take screenshot**: `mcp__mcpm_chrome-devtools__take_screenshot`
2. **Capture console**: `mcp__mcpm_chrome-devtools__list_console_messages`
3. **Check server logs**: `tail -50 /tmp/claude-ui-server.log`
4. **Report failure** with:
   - Step that failed
   - Expected vs actual state
   - Whether plan appeared as modal vs inline
   - Screenshot path
   - Relevant log excerpts

## Common Issues

### Plan approval appears as modal instead of inline
- Check if PlanApprovalDialog.jsx is still being used
- Verify InteractionInlineMessage is rendering
- Check InteractionContext is receiving the plan-approval interaction

### Permission mode not changing
- Check radio button click is working
- Verify state update in component

### Plan never appears
- Check if Claude enters plan mode correctly
- Look for "ExitPlanMode" in messages
- Verify WebSocket is receiving plan-approval-request

## Usage

```bash
# Test with default project
/test-plan-approval-flow

# Test with specific project
/test-plan-approval-flow my-project
```
