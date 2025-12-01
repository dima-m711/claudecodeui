# Interactive Permission System Testing Guide

## Overview
This document describes how to test the end-to-end interactive permission system in Claude Code UI.

## Prerequisites
- Development server running (`npm run dev`)
- Browser DevTools console open
- A test project selected in the UI

## Test Scenarios

### 1. Basic Permission Flow

#### Test: Permission Dialog Appears
**Steps:**
1. Start a new chat session
2. Type a message that triggers a tool use (e.g., "read the package.json file")
3. Wait for Claude to request permission

**Expected Result:**
- Permission dialog should appear with:
  - Tool name (e.g., "Read")
  - Description
  - Input parameters
  - Decision buttons (Allow Once, Allow Session, Allow Always, Deny)
  - Countdown timer (30 seconds)
  - Keyboard shortcuts hint

**Console Logs to Verify:**
```
📥 Processing permission request: {id: "...", tool: "Read", ...}
```

#### Test: Allow Once
**Steps:**
1. Trigger permission dialog
2. Click "Allow Once" button (or press 'Y')

**Expected Result:**
- Dialog closes immediately
- Claude continues with the operation
- Next similar operation requires permission again

**Console Logs:**
```
📤 Sending permission response: {type: "permission-response", requestId: "...", decision: "allow", ...}
✅ Permission granted for tool: Read
```

#### Test: Deny
**Steps:**
1. Trigger permission dialog
2. Click "Deny" button (or press 'N')

**Expected Result:**
- Dialog closes immediately
- Claude receives denial and handles gracefully
- Error message appears in chat

**Console Logs:**
```
📤 Sending permission response: {decision: "deny", ...}
❌ Permission denied for tool: Read
```

### 2. Session Permissions

#### Test: Allow for Session
**Steps:**
1. Trigger permission dialog
2. Click "Allow Session" button (or press 'S')
3. Trigger the same tool again in the same session

**Expected Result:**
- First request: Dialog appears, you approve
- Second request: Auto-approved, no dialog
- Dialog shows only once per tool per session

**Console Logs:**
```
📥 Processing permission request: {tool: "Read", ...}
[Auto-approved based on session permission]
```

#### Test: Session Permissions Reset on Refresh
**Steps:**
1. Allow a tool for session
2. Refresh the browser (F5)
3. Trigger the same tool

**Expected Result:**
- After refresh, permission dialog appears again
- Session permissions are cleared

### 3. Permanent Permissions

#### Test: Allow Always
**Steps:**
1. Trigger permission dialog
2. Click "Allow Always" button (or press 'A')
3. Refresh browser
4. Trigger the same tool

**Expected Result:**
- Permission is remembered across browser refreshes
- No dialog appears for future requests
- Check localStorage for `permanentPermissions` key

**Verify localStorage:**
```javascript
// In browser console:
JSON.parse(localStorage.getItem('permanentPermissions'))
// Should show: [{ tool: "Read", decision: "allow-always", timestamp: ... }]
```

#### Test: Clear Permanent Permissions
**Steps:**
1. Set permanent permission
2. Clear it via:
   ```javascript
   localStorage.removeItem('permanentPermissions')
   ```
3. Trigger the tool

**Expected Result:**
- Permission dialog appears again

### 4. Timeout Behavior

#### Test: Auto-Deny on Timeout
**Steps:**
1. Trigger permission dialog
2. Wait 30 seconds without responding

**Expected Result:**
- Countdown reaches 0
- Dialog auto-closes
- Request is automatically denied
- Claude receives denial

**Console Logs:**
```
⏱️ Permission request timed out: ...
❌ Auto-denied due to timeout
```

### 5. Keyboard Shortcuts

#### Test: All Shortcuts
**Keys to Test:**
- `Y` - Allow Once
- `N` - Deny
- `S` - Allow Session
- `A` - Allow Always
- `D` - Deny (alternative)
- `Escape` - Deny and close

**Expected Result:**
- Each key triggers the corresponding action immediately
- Dialog closes after action

### 6. Permission Queue

#### Test: Multiple Pending Requests
**Steps:**
1. Trigger multiple tool uses rapidly (e.g., "read file1, file2, file3")
2. Observe queue indicator

**Expected Result:**
- Queue indicator shows count of pending requests
- Dialogs appear one at a time
- Responding to one shows the next

**UI Elements:**
- PermissionQueueIndicator shows badge with number (e.g., "3 pending")

### 7. Permission Modes

#### Test: Accept Edits Mode
**Steps:**
1. Switch to "Accept Edits" mode (Tab key or mode button)
2. Trigger Read/Write/Edit operations

**Expected Result:**
- Read, Write, Edit tools are auto-approved
- Other tools (e.g., Bash) still show dialog

#### Test: Bypass Permissions Mode
**Steps:**
1. Switch to "Bypass Permissions" mode
2. Trigger any tool

**Expected Result:**
- No permission dialogs appear
- All tools auto-approved
- Use with caution!

#### Test: Plan Mode
**Steps:**
1. Switch to "Plan Mode"
2. Trigger various tools

**Expected Result:**
- Only allowed tools: Read, Task, ExitPlanMode, TodoRead, TodoWrite
- Other tools are auto-denied

### 8. WebSocket Connection

#### Test: Connection Loss During Request
**Steps:**
1. Open Network tab in DevTools
2. Trigger permission dialog
3. Throttle network to "Offline" in DevTools
4. Try to respond

**Expected Result:**
- Response is queued
- When connection restored, response is sent
- No data loss

**Console Logs:**
```
⚠️ WebSocket not connected, queuing response
```

#### Test: WebSocket Messages
**Steps:**
1. Open Network tab → WS
2. Trigger permission dialog
3. Observe WebSocket messages

**Expected Messages:**
```json
// Request (server → client):
{
  "type": "permission-request",
  "requestId": "uuid-here",
  "toolName": "Read",
  "input": {...},
  "timestamp": 1234567890
}

// Response (client → server):
{
  "type": "permission-response",
  "requestId": "uuid-here",
  "decision": "allow",
  "timestamp": 1234567890
}
```

### 9. Development Tools

#### Test: Mock Permission Request
**Steps:**
1. Ensure `NODE_ENV=development`
2. Look for "Test Permission" button (bottom left)
3. Click it

**Expected Result:**
- Permission dialog appears with mock data
- Can test UI without triggering real Claude operations
- Useful for UI development

**Alternative - Console:**
```javascript
// In browser console:
window.__testPermission = () => {
  const mockRequest = {
    id: `test-${Date.now()}`,
    tool: 'Bash',
    operation: 'execute',
    description: 'Test permission request',
    input: { command: 'ls -la' },
    timestamp: Date.now()
  };
  // Dispatch custom event to trigger dialog
  window.dispatchEvent(new CustomEvent('permission-request', { detail: mockRequest }));
};
window.__testPermission();
```

### 10. Error Handling

#### Test: Malformed Request
**Steps:**
1. In development, send malformed permission request via WebSocket
2. Observe error handling

**Expected Result:**
- Error logged to console
- No crash
- Graceful degradation

#### Test: Rapid Successive Requests
**Steps:**
1. Trigger many tools rapidly
2. Observe system behavior

**Expected Result:**
- Queue handles all requests
- No race conditions
- All requests processed in order

## Troubleshooting

### Dialog Doesn't Appear
**Check:**
1. WebSocket connection status (look for green indicator)
2. Console for errors
3. Permission mode (ensure not in "Bypass Permissions")
4. usePermissions hook is called in ChatInterface

**Debug:**
```javascript
// In browser console:
// Check WebSocket connection
console.log('WS Connected:', window.ws?.readyState === 1);

// Check pending requests
console.log('Pending:', localStorage.getItem('permissionHistory'));
```

### Response Not Reaching Backend
**Check:**
1. WebSocket connection
2. Message format (should use `requestId`, not `id`)
3. Server logs for "📨 Received permission response"

### Permission Not Remembered
**Check:**
1. localStorage (F12 → Application → Local Storage)
2. Key: `permanentPermissions`
3. Format: `[{tool, decision, timestamp}]`

## Performance Benchmarks

- **Dialog Display Latency:** < 500ms from request to UI
- **Response Round-Trip:** < 100ms
- **Memory Usage:** < 5MB for 100+ permission cycles
- **No Memory Leaks:** Verified via Chrome Memory Profiler

## Validation Checklist

- [ ] Permission dialog appears for tool use
- [ ] All decision buttons work
- [ ] Keyboard shortcuts functional
- [ ] Timeout auto-denies after 30s
- [ ] Session permissions work (cleared on refresh)
- [ ] Permanent permissions persist across refreshes
- [ ] Queue indicator shows correct count
- [ ] WebSocket messages have correct format
- [ ] All permission modes work correctly
- [ ] No console errors during normal operation
- [ ] Mobile responsive (dialog fits on small screens)
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Focus trap works in modal

## Success Criteria

✅ **Complete Integration:**
- Backend `canUseTool` callback sends permission-request
- Frontend usePermissions hook receives message
- PermissionDialog displays with all information
- User decision sent back to backend
- Backend resolves promise and continues/stops execution

✅ **Zero Data Loss:**
- No dropped permission requests
- Responses always reach backend
- Queue persists during navigation

✅ **Good UX:**
- Dialog appears quickly (< 500ms)
- Keyboard shortcuts work
- Clear visual feedback
- Timeout countdown visible
- Queue status always visible

## Next Steps

After completing these tests, the permission system is ready for:
- Phase 4: Pattern matching and intelligent grouping
- Phase 5: Enhanced settings UI and permission management panel
