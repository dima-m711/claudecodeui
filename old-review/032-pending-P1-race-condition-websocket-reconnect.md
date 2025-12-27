---
id: "032"
title: "Race condition on WebSocket client reconnection"
priority: P1
category: reliability
status: pending
created: 2024-12-27
source: pr-review
files:
  - server/services/permissionWebSocketHandler.js
---

# Race Condition on WebSocket Client Reconnection

## Problem
The `addClient()` method doesn't properly handle rapid reconnections. If a client reconnects quickly, it could result in duplicate entries or orphaned event listeners, leading to message duplication or memory leaks.

## Location
- `server/services/permissionWebSocketHandler.js:43-71` - `addClient` method

## Risk
- **Severity**: HIGH (P1)
- **Impact**: Duplicate messages, orphaned listeners, memory leak
- **Trigger**: Network instability, browser refresh, tab switch

## Root Cause
```javascript
// server/services/permissionWebSocketHandler.js:43
addClient(ws, clientId, sessionId = null) {
    // ❌ No check for existing client with same ID
    // ❌ No cleanup of previous client's listeners

    this.clients.set(clientId, {
        ws,
        sessionId,
        pendingRequests: new Set(),
        // ...
    });

    // Event listeners added without cleanup of old ones
    ws.on('close', () => this.removeClient(clientId));
    ws.on('error', () => this.removeClient(clientId));
}
```

## Scenario
```
T0: Client A connects with ID "client-123"
T1: Network hiccup, Client A's WebSocket closes
T2: Client A reconnects quickly with same ID "client-123"
T3: Old close handler fires, removes new client!
    OR: Both old and new clients exist, duplicate messages
```

## Recommended Fix
```javascript
// server/services/permissionWebSocketHandler.js
addClient(ws, clientId, sessionId = null) {
    // Check and clean up existing client with same ID
    if (this.clients.has(clientId)) {
        console.log(`Client ${clientId} reconnecting, cleaning up old connection`);
        this.removeClient(clientId);
    }

    const client = {
        ws,
        clientId,  // Store for reference
        sessionId,
        pendingRequests: new Set(),
        pendingAcks: new Set(),
        queuedMessages: [],
        isAlive: true,
        connectedAt: Date.now()
    };

    // Use bound handlers that check clientId matches
    const closeHandler = () => {
        // Only remove if this is still the current client
        const currentClient = this.clients.get(clientId);
        if (currentClient && currentClient.connectedAt === client.connectedAt) {
            this.removeClient(clientId);
        }
    };

    ws.on('close', closeHandler);
    ws.on('error', closeHandler);

    // Store handler references for cleanup
    client._closeHandler = closeHandler;

    this.clients.set(clientId, client);
}

removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Clean up event listeners
    if (client._closeHandler) {
        client.ws.removeListener('close', client._closeHandler);
        client.ws.removeListener('error', client._closeHandler);
    }

    // ... rest of cleanup
    this.clients.delete(clientId);
}
```

## Testing
- [ ] Unit test: Rapid reconnection doesn't duplicate client
- [ ] Unit test: Old close handler doesn't remove new client
- [ ] Load test: 100 rapid connect/disconnect cycles
- [ ] Memory test: No listener accumulation after reconnections

## Estimated Effort
1-2 hours
