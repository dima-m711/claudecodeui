# Permission System Debug Log Guide

## Overview
This guide explains the diagnostic logs added to help debug why the WebSocket interactive permission dialog isn't appearing.

## Where to Look

### Server Logs (Terminal running `npm run dev`)
The server logs will show the permission system flow:

1. **Command Reception** (server/index.js:730)
2. **SDK Option Mapping** (server/claude-sdk.js:34)
3. **canUseTool Callback Attachment** (server/claude-sdk.js:112 or 173)
4. **Permission Requests** (server/claude-sdk.js:138)

### Browser Console (F12 → Console)
The browser logs show the frontend permission handling:

1. **WebSocket Message Reception** (usePermissions.js:49)
2. **Permission Enqueueing** (PermissionContext.jsx:48)
3. **Auto-Approval Detection** (PermissionContext.jsx:59 or 71)
4. **Dialog Display** (usePermissions.js:79)

---

## Expected Log Flow (Happy Path)

### When You Send a Message Requiring Tool Permission

**1. Command Reception (Server)**
```
[DEBUG] User message: read /Users/dima/.claude/settings.json
📁 Project: /Users/dima/Documents/1Dev/playground
🔄 Session: New
🔐 Permission Mode: default
🔐 Skip Permissions: false
🌐 WebSocket State: OPEN
```

**What to check:**
- ✅ Permission Mode should be **"default"** (not "bypassPermissions")
- ✅ Skip Permissions should be **false**
- ✅ WebSocket State should be **"OPEN"**

---

**2. SDK Option Mapping (Server)**
```
🔍 [SDK] Mapping CLI options to SDK: {
  permissionMode: 'default',
  hasWebSocket: true,
  wsReadyState: 'OPEN',
  skipPermissions: false,
  sessionId: 'NEW_SESSION'
}
```

**What to check:**
- ✅ hasWebSocket should be **true**
- ✅ wsReadyState should be **"OPEN"**
- ✅ skipPermissions should be **false**
- ✅ permissionMode should be **"default"** (not "bypassPermissions")

---

**3. canUseTool Callback Attachment (Server)**

**✅ SUCCESS Case:**
```
✅ [SDK] Attaching canUseTool callback for interactive permissions
```

**❌ FAILURE Case:**
```
⚠️  [SDK] NOT attaching canUseTool callback
    Reason: {
  permissionMode: 'bypassPermissions',
  isBypassMode: true,
  hasWebSocket: true,
  wsReadyState: 'OPEN'
}
```

**What to check:**
- If you see ❌ FAILURE, the callback won't be invoked
- Check the "Reason" object to see why:
  - `isBypassMode: true` → Permission mode is set to bypass
  - `hasWebSocket: false` → No WebSocket connection
  - `wsReadyState: 'CONNECTING'/'CLOSING'/'CLOSED'` → WebSocket not ready

---

**4. Tool Use Triggers canUseTool (Server)**
```
🔐 Permission request 3f7b9c2e-4a1d-4e5f-8b3c-9d2e1f4a5b6c for tool: Read
```

**What to check:**
- This should appear when Claude tries to use a tool
- If you DON'T see this, the callback wasn't attached (see step 3)

---

**5. WebSocket Message Sent (Server)**
The server sends a WebSocket message to the frontend:
```json
{
  "type": "permission-request",
  "requestId": "3f7b9c2e-4a1d-4e5f-8b3c-9d2e1f4a5b6c",
  "toolName": "Read",
  "input": {...},
  "timestamp": 1234567890
}
```

**What to check:**
- Check browser Network tab (F12 → Network → WS)
- Should see message with type "permission-request"

---

**6. Frontend Receives Message (Browser Console)**
```
📥 [WS] Received message: {
  type: 'permission-request',
  requestId: '3f7b9c2e-4a1d-4e5f-8b3c-9d2e1f4a5b6c',
  toolName: 'Read',
  timestamp: '2025-01-10T12:34:56.789Z'
}
```

**What to check:**
- If you DON'T see this, the WebSocket message isn't reaching the frontend
- Check browser WebSocket connection in Network tab

---

**7. Permission Enqueueing (Browser Console)**
```
🔐 [Permission] Enqueue request: {
  id: '3f7b9c2e-4a1d-4e5f-8b3c-9d2e1f4a5b6c',
  tool: 'Read',
  operation: 'execute',
  toolKey: 'Read:execute',
  timestamp: '2025-01-10T12:34:56.789Z'
}
```

---

**8. Auto-Approval Check (Browser Console)**

**Case A: NOT Auto-Approved (Dialog Should Appear)**
```
📋 [Permission] Queuing for user approval: {
  toolKey: 'Read:execute',
  hasActiveRequest: false,
  queueLength: 0
}
🔔 [Permission] Showing dialog for: 3f7b9c2e-4a1d-4e5f-8b3c-9d2e1f4a5b6c
```

**Case B: Auto-Approved (Dialog Won't Appear)**
```
✅ [Permission] Auto-approved (SESSION): {
  toolKey: 'Read:execute',
  decision: 'allow',
  storedCount: 3,
  allSession: ['Read:execute', 'Write:execute', 'Bash:execute']
}
```
OR
```
✅ [Permission] Auto-approved (PERMANENT): {
  toolKey: 'Read:execute',
  decision: 'allow',
  storedCount: 5,
  allPermanent: ['Read:execute', 'Write:execute', ...]
}
```

**What to check:**
- If Case B (Auto-Approved), the dialog won't show
- Use "Reset Permissions" button to clear cache
- Check `allSession` and `allPermanent` arrays to see what's cached

---

## Common Issues and Solutions

### Issue 1: "NOT attaching canUseTool callback" with `isBypassMode: true`

**Cause:** `permissionMode` is set to "bypassPermissions"

**Check:**
1. Browser UI: Look for mode indicator (should show "Bypass Permissions" in orange)
2. Frontend state: Check if user toggled permission mode

**Solution:**
- Switch permission mode to "Default" in the UI
- Check if `toolsSettings.skipPermissions` is being set to `true` somewhere

---

### Issue 2: "NOT attaching canUseTool callback" with `hasWebSocket: false`

**Cause:** WebSocket connection not passed to SDK

**Check:**
1. Server logs: Verify WebSocket is created and connected
2. `queryClaudeSDK` call: Ensure `ws` parameter is passed

**Solution:**
- Check server/index.js:739 - ensure `ws` is passed as third parameter
- Verify WebSocket connection is established before sending command

---

### Issue 3: skipPermissions Override

**Server log:**
```
⚠️  [SDK] skipPermissions=true, overriding permissionMode to bypassPermissions
```

**Cause:** Frontend is sending `toolsSettings.skipPermissions: true`

**Check:**
1. Browser console: Inspect WebSocket message being sent
2. Look for `toolsSettings.skipPermissions` in the message
3. Check frontend code for where this is set

**Solution:**
- Find where `skipPermissions` is being set to `true`
- Ensure it defaults to `false` in ChatInterface.jsx

---

### Issue 4: Auto-Approval from Cache

**Browser log:**
```
✅ [Permission] Auto-approved (SESSION): ...
```

**Cause:** Permission was previously granted for this tool in this session

**Solution:**
- Click "Reset Permissions" button (red button, bottom-left)
- OR run in browser console: `localStorage.removeItem('permanentPermissions')`
- OR refresh the page (clears session permissions only)

---

### Issue 5: CLI Prompts Instead of Dialog

**Symptom:** Terminal shows permission prompts like:
```
───────────────────────────────────────
 Read file
  Read(file_path: "/Users/dima/.claude/settings.json")
 Do you want to proceed?
 ❯ 1. Yes
```

**Cause:** The `canUseTool` callback is NOT attached, so the SDK falls back to CLI prompts

**What to check:**
1. Look for "⚠️  [SDK] NOT attaching canUseTool callback" in server logs
2. Check the "Reason" object to see why
3. Follow solutions for Issues 1-3 above

---

## Testing Checklist

### 1. Send a test command
```
"read /Users/dima/.claude/settings.json"
```

### 2. Check server logs for:
- ✅ `🔐 Permission Mode: default` (not "bypassPermissions")
- ✅ `🔐 Skip Permissions: false`
- ✅ `✅ [SDK] Attaching canUseTool callback`
- ✅ `🔐 Permission request ... for tool: Read`

### 3. Check browser console for:
- ✅ `📥 [WS] Received message: {type: 'permission-request', ...}`
- ✅ `🔐 [Permission] Enqueue request: ...`
- ✅ `📋 [Permission] Queuing for user approval` (not auto-approved)
- ✅ `🔔 [Permission] Showing dialog for: ...`

### 4. Verify UI:
- ✅ Permission dialog appears
- ✅ Shows tool name, description, input
- ✅ Has decision buttons (Allow Once, Allow Session, etc.)

---

## Quick Fixes

### Clear All Permissions
```javascript
// In browser console:
localStorage.removeItem('permanentPermissions');
localStorage.removeItem('permissionHistory');
location.reload();
```

### Check Current Permissions
```javascript
// In browser console:
console.log('Permanent:', JSON.parse(localStorage.getItem('permanentPermissions') || '[]'));
console.log('History:', JSON.parse(localStorage.getItem('permissionHistory') || '[]').length, 'entries');
```

### Force Permission Mode to Default
```javascript
// In browser console (temporary):
// Find the ChatInterface component and update its state
// Or just check the mode indicator in the UI
```

---

## Summary

The logs will tell you exactly where the permission flow breaks:

1. **Command received?** → Check "[DEBUG] User message" log
2. **Options correct?** → Check "🔍 [SDK] Mapping CLI options" log
3. **Callback attached?** → Check "✅ [SDK] Attaching canUseTool" or "⚠️  NOT attaching"
4. **Tool use triggered?** → Check "🔐 Permission request" log
5. **WebSocket message sent?** → Check Network tab WS messages
6. **Frontend received?** → Check "📥 [WS] Received message" in browser
7. **Dialog shown?** → Check "🔔 [Permission] Showing dialog" in browser

Each step must succeed for the dialog to appear!
