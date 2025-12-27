---
id: "029"
title: "Session isolation bypass - any client can respond to any permission"
priority: P0
category: security
status: pending
created: 2024-12-27
source: pr-review
files:
  - server/services/permissionWebSocketHandler.js
  - server/index.js
---

# Session Isolation Bypass - Critical Security Vulnerability

## Problem
Any connected WebSocket client can respond to ANY permission request, regardless of session ownership. This is because:

1. `permissionManager` is NOT passed from `index.js` message handler to `handlePermissionResponse`
2. All clients receive ALL permission requests via `broadcastPermissionRequest`
3. The session check in `handlePermissionResponse` is bypassed when `permissionManager` is null

## Location
- `server/index.js:737` - Missing `permissionManager` parameter
- `server/services/permissionWebSocketHandler.js:119-160` - Session check bypassed

## Risk
- **Severity**: CRITICAL (P0)
- **Impact**: In multi-user environments, User A can approve/deny permissions for User B's sessions
- **Attack Vector**: Malicious user approves dangerous commands in other users' sessions
- **CVSS**: 10.0 (Complete auth bypass)

## Reproduction
1. Connect two browser tabs as different users
2. Start a Claude session in Tab A that requests a permission
3. In Tab B, intercept the WebSocket message and respond with approval
4. Tab A's permission is approved by Tab B

## Root Cause
```javascript
// server/index.js:737 - BUG: permissionManager not passed!
if (data.type === 'permission-response') {
    permissionWebSocketHandler.handlePermissionResponse(clientId, data);
    // ❌ Missing: permissionManager parameter for session validation
    return;
}

// server/services/permissionWebSocketHandler.js:119
handlePermissionResponse(clientId, message, permissionManager = null) {
    // ...
    if (permissionManager) {  // <-- This check is SKIPPED because permissionManager is null!
        const request = permissionManager.pendingRequests.get(message.requestId);
        if (request && request.sessionId !== client.sessionId) {
            // Session validation would happen here, but never executes
        }
    }
}
```

## Recommended Fix

### Step 1: Pass permissionManager to handler
```javascript
// server/index.js:737
if (data.type === 'permission-response') {
    const permissionManager = getPermissionManager();
    permissionWebSocketHandler.handlePermissionResponse(clientId, data, permissionManager);
    return;
}
```

### Step 2: Make session validation mandatory
```javascript
// server/services/permissionWebSocketHandler.js:119
handlePermissionResponse(clientId, message, permissionManager) {
    if (!permissionManager) {
        console.error('SECURITY: permissionManager required for response handling');
        return;
    }

    const request = permissionManager.pendingRequests.get(message.requestId);
    if (!request) {
        this.sendError(clientId, message.requestId, 'Request not found');
        return;
    }

    // MANDATORY session check
    if (request.sessionId && client.sessionId !== request.sessionId) {
        console.warn(`SECURITY: Client ${clientId} attempted to respond to session ${request.sessionId}`);
        this.sendError(clientId, message.requestId, 'Not authorized for this session');
        return;
    }
    // ... rest of handler
}
```

### Step 3: Filter broadcasts to session subscribers only
```javascript
// server/services/permissionWebSocketHandler.js:90
broadcastPermissionRequest(request) {
    const message = createPermissionRequestMessage(request);

    this.clients.forEach((client, clientId) => {
        // Only send to clients subscribed to this session
        if (client.sessionId === request.sessionId && client.ws.readyState === client.ws.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    });
}
```

## Testing
- [ ] Unit test: Response rejected when sessionId doesn't match
- [ ] Unit test: Response rejected when permissionManager is null
- [ ] Integration test: Multi-user session isolation
- [ ] Security test: Attempt cross-session permission manipulation

## Estimated Effort
1-2 hours
