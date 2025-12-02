---
name: test-permission-flow
description: Test permission approval flow using chrome-devtools MCP and report results
argument-hint: "[optional: project-name]"
---

# Test Permission Approval Flow

Automated test that validates the permission approval flow in Claude Code UI. This command uses chrome-devtools MCP to interact with the browser and verify the entire permission flow works correctly.

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

Find the project button in the snapshot. Look for pattern:
```
button "todo-cli 5+• .../2Projects/cc-ui-tests"
```

Click the project using `mcp__mcpm_chrome-devtools__click` with the element's uid.

### Step 5: Start New Claude Session

After project selection, look for:
```
button "Claude Claude by Anthropic"
```

Click this button to start a new Claude session.

### Step 6: Wait for Input Field

Take another snapshot and verify the input field is ready:
```
textbox "Type / for commands, @ for files, or ask Claude anything..." focusable focused multiline
```

### Step 7: Send Test Message

Use `mcp__mcpm_chrome-devtools__fill` to enter the test message:
```
create test-permission-TIMESTAMP.md with content "# Test Permission Flow"
```
(Replace TIMESTAMP with current epoch time)

Then use `mcp__mcpm_chrome-devtools__press_key` with key "Enter" to send.

### Step 8: Wait for Permission Request

Use `mcp__mcpm_chrome-devtools__wait_for` with:
- text: "Permission"
- timeout: 30000 (30 seconds)

### Step 9: Verify Permission UI

Take snapshot and confirm these elements are present:
```
StaticText "⚠️ Permission Required"
button "Allow"
button "Deny"
button "Allow Session"
button "Always Allow"
```

### Step 10: Approve Permission

Click the "Allow" button using its uid from the snapshot.

### Step 11: Wait for Completion

Use `mcp__mcpm_chrome-devtools__wait_for` with:
- text: "created the file" OR "I've created"
- timeout: 60000 (60 seconds to allow for API latency)

### Step 12: Verify File Creation

Use Bash to check the file was created:
```bash
cat /Users/dima/Documents/2Projects/cc-ui-tests/test-permission-TIMESTAMP.md
```

The file should contain: `# Test Permission Flow`

### Step 13: Verify Server Logs

Check the server logs for successful permission resolution:
```bash
grep -E "(updatedInput|Returning result)" /tmp/claude-ui-server.log | tail -10
```

**Critical Verification**: The log should show `updatedInput` with actual content, NOT an empty object `{}`:
```
✅ [SDK] Returning result to SDK: {"behavior":"allow","updatedInput":{"file_path":"...","content":"# Test Permission Flow"}}
```

If you see `"updatedInput":{}` the permission flow is BROKEN.

### Step 14: Generate Test Report

Output a report in this format:

```
=== Permission Approval Flow Test ===
Started: [timestamp]

✓ Step 1: Server running (Xs)
✓ Step 2: Browser page ready (Xs)
✓ Step 3: Project selected (Xs)
✓ Step 4: Claude session created (Xs)
✓ Step 5: Test message sent (Xs)
✓ Step 6: Permission request appeared (Xs)
✓ Step 7: Permission approved (Xs)
✓ Step 8: File created and verified (Xs)
✓ Step 9: Server logs show correct updatedInput (Xs)

Total duration: Xs
Status: PASS ✓

File: test-permission-TIMESTAMP.md
Content: # Test Permission Flow
Log verification: updatedInput contains file_path and content
```

## Success Criteria

- [ ] Server responds with HTTP 200
- [ ] Browser navigates to UI successfully
- [ ] Project can be selected from sidebar
- [ ] Claude session starts without errors
- [ ] Test message is sent successfully
- [ ] Permission request appears within 30 seconds
- [ ] "Allow" button is clickable
- [ ] Permission dialog disappears after approval
- [ ] File is created with correct content
- [ ] Server logs show `updatedInput` with actual parameters (NOT empty `{}`)
- [ ] No "Tool Error" messages in the response

## Error Handling

If any step fails:

1. **Take screenshot**: `mcp__mcpm_chrome-devtools__take_screenshot`
2. **Capture console**: `mcp__mcpm_chrome-devtools__list_console_messages`
3. **Check server logs**: `tail -50 /tmp/claude-ui-server.log`
4. **Report failure** with:
   - Step that failed
   - Expected vs actual state
   - Screenshot path
   - Relevant log excerpts

## Common Issues

### "Permission" text never appears
- Check if Claude is responding (look for "Thinking..." or "Processing...")
- Verify the message was sent (check chat history)
- Check server logs for errors

### File not created after approval
- Check server logs for `updatedInput` - if empty `{}`, the fix is not applied
- Look for "Tool Error" in Claude's response
- Verify the project directory is writable

### Browser not responding
- Ensure Chrome DevTools is open and connected
- Try `mcp__mcpm_chrome-devtools__list_pages` to verify connection
- Restart Chrome if needed

## Usage

```bash
# Test with default project (todo-cli)
/test-permission-flow

# Test with specific project
/test-permission-flow my-project
```
