---
name: test-permission-flow
description: Test permission approval flow using chrome-devtools MCP and report results
argument-hint: "[optional: project-name]"
---

# Test Permission Approval Flow

Automated test that reproduces the permission approval flow testing using chrome-devtools MCP. This command:
1. Opens the Claude Code UI in browser
2. Creates a new session in the specified project (defaults to todo-cli)
3. Asks the agent to create a test file
4. Monitors for permission request
5. Approves the permission
6. Verifies the file was created successfully
7. Reports test results

## Workflow

### Step 1: Initialize Test Environment

Check that the UI server is running and accessible:
- Verify http://localhost:5173 is accessible
- Take initial snapshot to confirm UI is loaded

### Step 2: Navigate and Select Project

1. Navigate to http://localhost:5173
2. Take snapshot to identify available projects
3. Click on the project specified in arguments (default: "todo-cli")
4. Verify project is selected

### Step 3: Create New Claude Session

1. Locate and click the "Claude" provider button to start a new session
2. Wait for the input field to become focused
3. Verify session creation was successful

### Step 4: Send Test Message

1. Fill the input field with: "create test-file-{timestamp}.md"
2. Press Enter to send the message
3. Monitor for Claude's response

### Step 5: Monitor for Permission Request

1. Wait for permission request UI to appear (look for text "Permission Required" or "Allow" button)
2. Take snapshot when permission request appears
3. Record timestamp of permission request appearance

### Step 6: Approve Permission

1. Locate the "Allow" button in the permission UI
2. Click the "Allow" button
3. Verify permission UI disappears
4. Wait for agent to complete file creation

### Step 7: Verify File Creation

1. Wait for Claude's completion message (look for "I've created" or "created the")
2. Use Bash to verify the file exists in the project directory
3. Read the file contents to confirm it was created properly

### Step 8: Generate Test Report

Create a test report with:
- Test execution timestamp
- Each step's status (✓ passed / ✗ failed)
- Time taken for each step
- Screenshot evidence (saved to /tmp/permission-test-{timestamp}.png)
- File verification results
- Overall test result (PASS/FAIL)

## Success Criteria

- [ ] UI loads successfully at http://localhost:5173
- [ ] Project can be selected
- [ ] New Claude session can be created
- [ ] Message can be sent to agent
- [ ] Permission request appears within 30 seconds
- [ ] Permission can be approved successfully
- [ ] File is created in the correct location
- [ ] File contains expected content
- [ ] No errors logged in browser console
- [ ] Test completes in under 2 minutes

## Error Handling

If any step fails:
1. Take screenshot of current state
2. Capture browser console logs
3. Record the error message and step that failed
4. Generate failure report with diagnostic information
5. Exit with non-zero status code

## Usage Examples

```bash
# Test with default project (todo-cli)
/test-permission-flow

# Test with specific project
/test-permission-flow my-project

# Test with verbose output
/test-permission-flow --verbose
```

## Output Format

```
=== Permission Approval Flow Test ===
Started: 2024-12-02 10:30:00

✓ Step 1: UI loaded successfully (0.5s)
✓ Step 2: Project 'todo-cli' selected (1.2s)
✓ Step 3: Claude session created (0.8s)
✓ Step 4: Test message sent (0.3s)
✓ Step 5: Permission request appeared (12.5s)
✓ Step 6: Permission approved (0.5s)
✓ Step 7: File verified at /path/to/test-file-20241202.md (2.1s)

Total duration: 17.9s
Status: PASS ✓

File created: test-file-20241202103000.md
File size: 13 bytes
File content: # Test File
Screenshot: /tmp/permission-test-20241202103000.png
```

## Notes

- Requires chrome-devtools MCP server to be configured and running
- Requires Claude Code UI server running on http://localhost:5173
- Test file will be created with timestamp to avoid conflicts
- Screenshots are saved to /tmp for debugging
- Browser console logs are captured for error diagnosis
