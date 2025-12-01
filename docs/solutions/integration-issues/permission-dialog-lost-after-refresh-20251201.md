---
module: Permission System
date: 2025-12-01
problem_type: integration_issue
component: frontend_stimulus
symptoms:
  - "Permission dialog doesn't show after page refresh"
  - "Backend sends sync response with pending requests"
  - "Frontend error: Request not found in your pending queue"
  - "canUseTool callback error: capturedSessionId is not defined"
root_cause: scope_issue
resolution_type: code_fix
severity: high
tags: [websocket, permissions, session-management, closure-scope, page-refresh]
---

# Troubleshooting: Permission Dialog Lost After Page Refresh

## Problem
Permission requests created before a page refresh were not showing in the permission dialog after the page reloaded, even though the backend correctly stored and returned them in the sync response.

## Environment
- Module: Permission System (WebSocket-based interactive permissions)
- Component: Frontend WebSocket client + Backend SDK integration
- Date: 2025-12-01
- Files affected:
  - `server/claude-sdk.js`
  - `src/utils/permissionWebSocketClient.js`
  - `server/services/permissionWebSocketHandler.js`

## Symptoms
- Permission dialog doesn't appear after page refresh, even though permission is pending
- Backend logs show: `🔄 [WebSocket] Sending sync response with 1 requests`
- Frontend logs show: `📥 [WS] Received message: { type: 'permission-sync-response', ... }`
- When user approves after refresh: `❗ Permission error: Request not found in your pending queue`
- During tool execution: `❌ Permission request error: capturedSessionId is not defined`

## What Didn't Work

**Attempted Solution 1:** Restore from sessionStorage on page load
- **Why it failed:** Created race condition where stale requests would appear before server sync completed, leading to duplicate or invalid requests

**Attempted Solution 2:** Increased timeout from 5 minutes to 1 hour
- **Why it failed:** Timeout wasn't the issue - requests were lost during sync, not expiring

**Attempted Solution 3:** Added sessionId to debug logs
- **Why it failed:** This helped identify the problem but didn't fix it - revealed sessionId mismatch

**Attempted Solution 4:** Changed `sessionId` to `capturedSessionId` in canUseTool callback
- **Why it failed:** `capturedSessionId` was out of scope - defined in outer function but not accessible in the callback defined in inner function

**Attempted Solution 5:** Added `PERMISSION_SYNC_RESPONSE` to WS_MESSAGE_TYPES
- **Why it failed:** This fixed part of the issue (messages now received) but requests still couldn't be responded to

## Solution

**Three-part fix required:**

### Fix 1: Pass sessionId by reference (server/claude-sdk.js)

**Problem:** `capturedSessionId` variable in `queryClaudeSDK` was not accessible inside the `canUseTool` callback created in `mapCliOptionsToSDK`.

**Code changes:**
```javascript
// Before (broken):
function mapCliOptionsToSDK(options = {}, ws = null) {
  // ...
  sdkOptions.canUseTool = async (toolName, input, abortSignal) => {
    // capturedSessionId is not defined here!
    const result = await permissionManager.addRequest(requestId, toolName, input, capturedSessionId, abortSignal);
  };
}

async function queryClaudeSDK(command, options = {}, ws) {
  let capturedSessionId = sessionId;
  const { sdkOptions } = mapCliOptionsToSDK(options, ws);
  // ...
}

// After (fixed):
function mapCliOptionsToSDK(options = {}, ws = null, sessionIdRef = null) {
  // ...
  sdkOptions.canUseTool = async (toolName, input, abortSignal) => {
    const currentSessionId = sessionIdRef ? sessionIdRef.current : null;
    const result = await permissionManager.addRequest(requestId, toolName, input, currentSessionId, abortSignal);
  };
}

async function queryClaudeSDK(command, options = {}, ws) {
  let capturedSessionId = sessionId;
  const sessionIdRef = { current: capturedSessionId }; // Reference object
  const { sdkOptions } = mapCliOptionsToSDK(options, ws, sessionIdRef);

  // Update reference when actual session_id arrives
  if (message.session_id && !capturedSessionId) {
    capturedSessionId = message.session_id;
    sessionIdRef.current = capturedSessionId; // Update reference
  }
}
```

### Fix 2: Handle sync response messages (src/utils/permissionWebSocketClient.js)

**Problem:** Frontend WebSocket client was dropping `permission-sync-response` messages because they weren't in the switch statement.

**Code changes:**
```javascript
// Before (broken):
export const WS_MESSAGE_TYPES = {
  PERMISSION_REQUEST: 'permission-request',
  PERMISSION_RESPONSE: 'permission-response',
  PERMISSION_TIMEOUT: 'permission-timeout',
  PERMISSION_QUEUE_STATUS: 'permission-queue-status',
  PERMISSION_CANCELLED: 'permission-cancelled',
  PERMISSION_ERROR: 'permission-error'
  // permission-sync-response NOT HERE - falls through to default case
};

handleMessage(message) {
  switch (data.type) {
    case WS_MESSAGE_TYPES.PERMISSION_REQUEST:
      // ...
    default:
      // Message dropped!
      break;
  }
}

// After (fixed):
export const WS_MESSAGE_TYPES = {
  PERMISSION_REQUEST: 'permission-request',
  PERMISSION_RESPONSE: 'permission-response',
  PERMISSION_TIMEOUT: 'permission-timeout',
  PERMISSION_QUEUE_STATUS: 'permission-queue-status',
  PERMISSION_CANCELLED: 'permission-cancelled',
  PERMISSION_ERROR: 'permission-error',
  PERMISSION_SYNC_RESPONSE: 'permission-sync-response' // ADDED
};

handleMessage(message) {
  switch (data.type) {
    case WS_MESSAGE_TYPES.PERMISSION_REQUEST:
      // ...
    case WS_MESSAGE_TYPES.PERMISSION_SYNC_RESPONSE:
      this.handleSyncResponse(data);
      break;
    default:
      break;
  }
}

handleSyncResponse(data) {
  console.log('🔄 Received permission sync response:', {
    sessionId: data.sessionId,
    pendingCount: data.pendingRequests?.length || 0
  });

  // Notify all listeners (including usePermissions.js)
  this.notifyListeners(data);
}
```

### Fix 3: Track synced requests in client (server/services/permissionWebSocketHandler.js)

**Problem:** When syncing, backend sent pending requests to frontend but didn't add them to `client.pendingRequests` Set, so validation failed when user tried to respond.

**Code changes:**
```javascript
// Before (broken):
handlePermissionSyncRequest(clientId, message, permissionManager) {
  const requests = permissionManager.getRequestsForSession(sessionId);
  const formattedRequests = requests.map(r => ({ ... }));

  const client = this.clients.get(clientId);
  if (client?.ws?.readyState === client.ws.OPEN) {
    client.ws.send(JSON.stringify({
      type: 'permission-sync-response',
      pendingRequests: formattedRequests
    }));
    // Requests NOT added to client.pendingRequests!
  }
}

handlePermissionResponse(clientId, message) {
  // Verify the client actually has this request pending
  if (!client.pendingRequests.has(message.requestId)) {
    this.sendError(clientId, message.requestId, 'Request not found in your pending queue');
    return; // FAILS HERE!
  }
}

// After (fixed):
handlePermissionSyncRequest(clientId, message, permissionManager) {
  const requests = permissionManager.getRequestsForSession(sessionId);
  const formattedRequests = requests.map(r => ({ ... }));

  const client = this.clients.get(clientId);
  if (client?.ws?.readyState === client.ws.OPEN) {
    // Add synced requests to client's pending set
    formattedRequests.forEach(req => {
      client.pendingRequests.add(req.requestId);
    });

    client.ws.send(JSON.stringify({
      type: 'permission-sync-response',
      pendingRequests: formattedRequests
    }));
    console.log(`🔄 [WebSocket] Added ${formattedRequests.length} requests to client pendingRequests`);
  }
}
```

## Why This Works

### Root Cause Analysis

**1. JavaScript Closure Scope Issue**

The `canUseTool` callback was created inside `mapCliOptionsToSDK` function, which didn't have access to the `capturedSessionId` variable declared in the outer `queryClaudeSDK` function. JavaScript closures capture variables by reference, but only if they're in scope when the function is defined.

By passing a `sessionIdRef` object, we create a shared reference that:
- Starts with the initial sessionId value
- Gets updated when the actual session_id arrives from the SDK
- Remains accessible to the callback through the object reference

This is the JavaScript equivalent of "pass by reference" - both functions share the same object, so updates in one function are visible in the other.

**2. Message Type Not Recognized**

The frontend WebSocket client had a switch statement that only handled specific message types. `permission-sync-response` wasn't in the list, so it fell through to the `default` case which just ignored it.

Adding the message type to the enum and creating a handler ensures the sync response:
1. Is recognized as a valid message type
2. Gets routed to `handleSyncResponse()`
3. Calls `notifyListeners()` to inform `usePermissions.js`
4. Processes the pending requests and shows the dialog

**3. Client-Side Request Tracking**

The backend maintains two levels of tracking:
- `permissionManager.pendingRequests` - Global queue of all pending requests
- `client.pendingRequests` - Per-client Set of requests that client is aware of

The second level provides security: a client can only respond to requests it was actually sent. When broadcasting a new request, the backend adds it to `client.pendingRequests` (line 94). But when syncing after refresh, this step was missing, so the backend thought the client didn't have permission to respond.

Adding the synced requests to `client.pendingRequests` during sync ensures:
- Client can respond to requests it received via sync
- Validation passes when user approves/denies
- Security model is maintained (clients only respond to their own requests)

## Prevention

### How to avoid this in future development:

**1. JavaScript Closures and Scope**
- When passing callbacks between functions, ensure all required variables are in scope
- For mutable values that update later, pass reference objects (`{ current: value }`) instead of primitives
- Add logging at callback creation time to verify scope access
- Test callbacks with values that change after creation

**2. WebSocket Message Handling**
- When adding new message types, update the enum AND the switch statement together
- Add handler method even if it just calls `notifyListeners()`
- Log unhandled message types in `default` case for debugging
- Test message flow with browser refresh scenarios

**3. Client-Side State Tracking**
- When syncing state after disconnect/reconnect, verify ALL tracking data structures are updated
- If maintaining security checks based on client state, ensure sync operations update those checks
- Add assertions or validation that client state matches server state after sync
- Log the size of tracking structures before/after sync for debugging

**4. Testing Refresh Scenarios**
- Always test WebSocket features with page refresh
- Verify state persists correctly through disconnect/reconnect
- Check that security validations work after sync
- Test the complete flow: create request → refresh → respond

## Related Issues

No related issues documented yet.
