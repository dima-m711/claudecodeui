---
id: "031"
title: "Information disclosure - broadcasts leak to all clients"
priority: P0
category: security
status: pending
created: 2024-12-27
source: pr-review
files:
  - server/services/permissionWebSocketHandler.js
---

# Information Disclosure - Broadcasts Leak to All Clients

## Problem
The `broadcastPermissionRequest` and `broadcastInteractionRequest` methods send ALL interactions to ALL connected WebSocket clients, regardless of session ownership. In multi-user environments, users can see sensitive information from other users' sessions.

## Location
- `server/services/permissionWebSocketHandler.js:90-114` - `broadcastPermissionRequest`
- `server/services/permissionWebSocketHandler.js:326-337` - `broadcastInteractionRequest`

## Risk
- **Severity**: CRITICAL (P0)
- **Impact**: Sensitive data disclosure across users
- **Leaked Data**: File paths, bash commands, API keys in parameters, project structures
- **CVSS**: 8.5 (Confidentiality impact)

## Root Cause
```javascript
// server/services/permissionWebSocketHandler.js:90
broadcastPermissionRequest(request) {
    const message = createPermissionRequestMessage(request);
    const messageStr = JSON.stringify(message);

    this.clients.forEach((client, clientId) => {  // ❌ ALL clients
        if (client.ws.readyState === client.ws.OPEN) {
            client.ws.send(messageStr);  // ❌ Everyone sees everything
        }
    });
}
```

## Sensitive Data Exposed
```javascript
// Example permission request that ALL users see:
{
    type: 'permission-request',
    toolName: 'Bash',
    input: {
        command: 'cat /home/user/.ssh/id_rsa',  // ❌ SSH key path exposed
        path: '/home/user/secret-project'       // ❌ Project structure exposed
    },
    sessionId: 'user-a-session-123'
}
```

## Recommended Fix

### Step 1: Add session subscription tracking
```javascript
// server/services/permissionWebSocketHandler.js
addClient(ws, clientId, sessionId = null) {
    this.clients.set(clientId, {
        ws,
        sessionId,
        subscribedSessions: new Set(),  // Track subscribed sessions
        // ...
    });
}

subscribeToSession(clientId, sessionId) {
    const client = this.clients.get(clientId);
    if (client) {
        client.subscribedSessions.add(sessionId);
    }
}
```

### Step 2: Filter broadcasts to session subscribers
```javascript
// server/services/permissionWebSocketHandler.js
broadcastPermissionRequest(request) {
    const message = createPermissionRequestMessage(request);
    const messageStr = JSON.stringify(message);
    const targetSessionId = request.sessionId;

    this.clients.forEach((client, clientId) => {
        // Only send to clients subscribed to this session
        const isSubscribed = client.subscribedSessions?.has(targetSessionId) ||
                           client.sessionId === targetSessionId;

        if (isSubscribed && client.ws.readyState === client.ws.OPEN) {
            client.ws.send(messageStr);
        }
    });
}
```

### Step 3: Add subscription message handler in index.js
```javascript
// server/index.js - in handleChatConnection
if (data.type === 'subscribe-session') {
    permissionWebSocketHandler.subscribeToSession(ws.clientId, data.sessionId);
    return;
}

if (data.type === 'unsubscribe-session') {
    permissionWebSocketHandler.unsubscribeFromSession(ws.clientId, data.sessionId);
    return;
}
```

### Step 4: Client subscribes when viewing session
```javascript
// src/hooks/usePermissions.js
useEffect(() => {
    if (wsClient && currentSessionId) {
        wsClient.send({
            type: 'subscribe-session',
            sessionId: currentSessionId
        });

        return () => {
            wsClient.send({
                type: 'unsubscribe-session',
                sessionId: currentSessionId
            });
        };
    }
}, [wsClient, currentSessionId]);
```

## Testing
- [ ] Unit test: Broadcasts only reach subscribed clients
- [ ] Unit test: Unsubscribed clients don't receive messages
- [ ] Integration test: Multi-user isolation verification
- [ ] Security test: Attempt to receive other users' requests

## Estimated Effort
2-3 hours
