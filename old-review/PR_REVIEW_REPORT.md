
# PR Review: `simpler-session-managment`

**Changes:** 37 code files, +19,939 / -443 lines

---

## Critical Issues in PR

### 🔴 CRITICAL: Session Isolation Bypass

**File:** `server/services/permissionWebSocketHandler.js:119-160`

Any client can respond to ANY permission request because:
1. `permissionManager` not passed from `index.js` message handler
2. All clients receive all permission requests via broadcast
3. Session check is bypassed when `permissionManager` is null

```javascript
// server/index.js:737 - Missing permissionManager parameter!
permissionWebSocketHandler.handlePermissionResponse(clientId, data);  // No permissionManager!
```

**Fix:** Pass `permissionManager` to handler, enforce session matching.

---

### 🔴 CRITICAL: Memory Leak in InteractionManager

**File:** `server/services/interactionManager.js:41-54`

Promise callbacks stored in `pendingInteractions` Map are never cleaned up if client disconnects before resolution. Server memory grows until OOM.

**Fix:** Clean up pending promises in `removeSession()`.

---

### 🔴 CRITICAL: Broadcasts Leak to All Clients

**Files:** `permissionWebSocketHandler.js:90-114, 326-337`

```javascript
this.clients.forEach((client, clientId) => {  // ALL clients get ALL requests
    client.ws.send(messageStr);
});
```

In multi-user environments, users see each other's file paths, bash commands, etc.

**Fix:** Filter broadcasts to session-subscribed clients only.

---

## High Priority Issues

| Issue | File | Fix |
|-------|------|-----|
| No rate limiting | `interactionManager.js` | Add time-based limits |
| Predictable client IDs | `index.js:720` | Use `crypto.randomUUID()` |
| Missing input sanitization | `askUserHandler.js` | Sanitize user answers |
| Race condition on reconnect | `permissionWebSocketHandler.js:43-71` | Check/cleanup before adding client |
| WebSocket send failures ignored | `useInteractions.js:73-98` | Don't remove interaction until confirmed |

---

## Medium Priority Issues

| Issue | File |
|-------|------|
| BroadcastChannel cleanup | `interactionBroadcast.js:14-34` |
| SessionStorage leak | `interactionStorage.js` |
| Unbounded interactions array | `InteractionContext.jsx:73-98` |
| Sync request lacks auth | `permissionWebSocketHandler.js:164-198` |
| Minimal response validation | `interactionTypes.js:52-60` |

---

## What's Good About This PR

✅ Well-designed unified interaction abstraction
✅ EventEmitter pattern for decoupling
✅ Memory protection limits (`maxQueuedMessagesPerClient`)
✅ Heartbeat mechanism for stale connections
✅ `MAX_INTERACTIONS_PER_SESSION` limit
✅ Proper WebSocket connection authentication

---

## Summary

The PR introduces a **solid architectural foundation** for unified interaction management, but has **critical security bugs** that must be fixed before merge:

1. **Session isolation bypass** - Any user can control any session
2. **Memory leak** - Server will eventually OOM
3. **Information disclosure** - All users see all requests

**Verdict:** 🔴 **Do not merge** until critical issues fixed.

**Estimated fix time:** 2-4 hours for critical issues.
