---
name: test-ask-user-flow
description: Test AskUserQuestion flow using chrome-devtools MCP and report results
argument-hint: "[optional: project-name]"
---

# Test AskUserQuestion Flow

Automated test that validates the AskUserQuestion tool flow in Claude Code UI. This command uses chrome-devtools MCP to interact with the browser and verify that user questions appear inline and answers are correctly passed back to the SDK.

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

### Step 5: Start New Claude Session

After project selection, click the Claude button to start a new session.

### Step 6: Wait for Input Field

Take another snapshot and verify the input field is ready.

### Step 7: Send Message That Triggers AskUserQuestion

Use `mcp__mcpm_chrome-devtools__fill` to enter a message that will make Claude ask clarifying questions:
```
I want to set up a new project. Ask me what programming language I want to use and what package manager I prefer before proceeding.
```

Then use `mcp__mcpm_chrome-devtools__press_key` with key "Enter" to send.

### Step 8: Wait for AskUserQuestion UI

Use `mcp__mcpm_chrome-devtools__wait_for` with:
- text: "User Input Required" OR "question"
- timeout: 60000 (60 seconds)

### Step 9: Verify AskUserQuestion UI (INLINE)

Take snapshot and confirm these elements are present:
- Question text displayed
- Answer options (radio buttons for single-select OR checkboxes for multi-select)
- "Submit Answer" button
- Optional "Cancel" button

**Critical**: Verify this is an INLINE component in the chat, NOT a modal dialog.

Look for patterns like:
```
heading "User Input Required" OR heading "❓"
StaticText [question text]
radio [option 1]
radio [option 2]
button "Submit Answer"
```

### Step 10: Test Single-Select (Radio Buttons)

If the question shows radio buttons:
1. Take snapshot to get option UIDs
2. Click one of the radio button options
3. Verify it becomes selected

### Step 11: Test Multi-Select (Checkboxes) - If Available

If the question shows checkboxes:
1. Click multiple checkbox options
2. Verify they become checked

### Step 12: Test Free-Text Input - If Available

If there's a text input field:
1. Use `mcp__mcpm_chrome-devtools__fill` to enter text
2. Verify text appears in field

### Step 13: Submit Answer

Click the "Submit Answer" button.

### Step 14: Wait for Claude to Continue

Use `mcp__mcpm_chrome-devtools__wait_for` with:
- text: "Based on your" OR "you selected" OR "proceeding"
- timeout: 60000

### Step 15: Verify Server Logs

Check the server logs for successful answer handling:
```bash
grep -E "(AskUser|Got user answers|answers)" /tmp/claude-ui-server.log | tail -15
```

**Critical Verification**: The log should show:
```
❓ [SDK] AskUserQuestion tool called
✅ [SDK] Got user answers: { "0": "selected_option" }
```

Verify answers object is NOT empty.

### Step 16: Verify Answer Was Used

Take snapshot and verify Claude's response references the answer:
- Look for text that acknowledges the user's selection
- Verify no "Tool Error" messages

### Step 17: Generate Test Report

Output a report in this format:

```
=== AskUserQuestion Flow Test ===
Started: [timestamp]

✓ Step 1: Server running (Xs)
✓ Step 2: Browser page ready (Xs)
✓ Step 3: Project selected (Xs)
✓ Step 4: Claude session created (Xs)
✓ Step 5: Question-triggering message sent (Xs)
✓ Step 6: AskUserQuestion UI appeared INLINE (Xs)
✓ Step 7: Question text displayed correctly (Xs)
✓ Step 8: Answer options rendered (Xs)
✓ Step 9: Answer selected/entered (Xs)
✓ Step 10: Answer submitted (Xs)
✓ Step 11: Server received answers (Xs)
✓ Step 12: Claude continued with answer context (Xs)

Total duration: Xs
Status: PASS ✓

Question type: [single-select/multi-select/free-text]
Answer provided: [selected option or entered text]
Answer received by SDK: { "0": "..." }
```

## Success Criteria

- [ ] Server responds with HTTP 200
- [ ] Browser navigates to UI successfully
- [ ] Project can be selected from sidebar
- [ ] Claude session starts without errors
- [ ] Question-triggering message is sent successfully
- [ ] AskUserQuestion appears **INLINE** (not as modal dialog)
- [ ] Question text displays correctly
- [ ] Options render correctly (radio/checkbox/text)
- [ ] Selection/input works properly
- [ ] "Submit Answer" button is clickable
- [ ] Answer is sent to backend correctly
- [ ] Server logs show answers received (NOT empty)
- [ ] Claude continues execution with answer context
- [ ] No "Tool Error" messages in response

## Error Handling

If any step fails:

1. **Take screenshot**: `mcp__mcpm_chrome-devtools__take_screenshot`
2. **Capture console**: `mcp__mcpm_chrome-devtools__list_console_messages`
3. **Check server logs**: `tail -50 /tmp/claude-ui-server.log`
4. **Report failure** with:
   - Step that failed
   - Expected vs actual state
   - Whether question appeared at all
   - Screenshot path
   - Relevant log excerpts

## Common Issues

### AskUserQuestion never appears
- Claude may not have used the AskUserQuestion tool
- Check if Claude is in a mode that allows the tool
- Verify the prompt encourages asking questions

### Answers not reaching SDK
- Check WebSocket connection
- Verify interaction-response message is sent
- Check server logs for response handling

### Claude doesn't acknowledge answer
- Check if answers object was empty
- Verify modifiedInput is being passed correctly in canUseTool

### Options not rendering
- Check AskUserDetails component
- Verify data structure matches expected format

## Test Variations

### Test 1: Single-Select Question
```
Ask me which database I want to use: PostgreSQL, MySQL, or MongoDB. Wait for my answer.
```

### Test 2: Multi-Select Question
```
Ask me which features I want enabled (allow multiple selections): logging, caching, authentication, rate-limiting.
```

### Test 3: Free-Text Question
```
Ask me what I want to name my project. Let me type the name.
```

## Usage

```bash
# Test with default project
/test-ask-user-flow

# Test with specific project
/test-ask-user-flow my-project
```
