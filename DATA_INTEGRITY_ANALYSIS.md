# Data Integrity Analysis: Permission Persistence Implementation

Branch: `presisten-permissions`

## Executive Summary

This analysis identifies **8 critical and 5 moderate data integrity issues** in the permission persistence implementation. The most severe risks involve:
- Race conditions during sync operations
- Orphaned requests that never get resolved
- State inconsistencies between frontend and backend storage
- Session/request ID collision scenarios
- Stale data after page refresh

---

## Critical Issues

### 1. Orphaned Requests After Page Refresh
**Severity:** CRITICAL
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/src/hooks/usePermissions.js` (lines 47-64)

**Issue:**
When a user refreshes the page:
1. Frontend sends `permission-sync-request` to backend (line 56-59)
2. Backend responds with pending requests from its `requestsBySession` Map (permissionManager.js lines 373-389)
3. Frontend loads these into sessionStorage (line 153)
4. However, the backend's `pendingRequests` Map still holds Promise resolvers that reference the OLD WebSocket connection

**Data Corruption Scenario:**
```javascript
// Before refresh: Request pending
Backend pendingRequests Map: { "req-123": { resolver: [Function], ws: [Old Connection] } }
Frontend sessionStorage: { "session-abc": [{ id: "req-123", ... }] }

// After refresh: User makes decision
Frontend: Loads req-123 from sessionStorage
Frontend: Sends permission-response via NEW WebSocket
Backend: Receives response, but OLD resolver is dead
Result: Promise never resolves, SDK hangs forever
```

**Specific Code Path:**
```javascript
// permissionManager.js line 214 - This resolver points to OLD connection
request.resolver(result);  // DEAD RESOLVER - nothing receives this
```

**Mitigation Strategy:**
1. Add request rehydration mechanism in backend
2. When sync-response is sent, update all resolver references to current WebSocket
3. Add timeout detection for stale resolvers (>5 minutes old)
4. Send explicit "request-expired" message for requests that can't be rehydrated

```javascript
// Proposed fix in permissionManager.js
rehydrateRequest(requestId, newResolver, newWebSocket) {
  const request = this.pendingRequests.get(requestId);
  if (!request) return false;

  // Check if request is stale
  if (Date.now() - request.timestamp > 5 * 60 * 1000) {
    this.pendingRequests.delete(requestId);
    return false;
  }

  // Update resolver and connection
  request.resolver = newResolver;
  request.webSocket = newWebSocket;
  return true;
}
```

---

### 2. Race Condition in Sync Protocol
**Severity:** CRITICAL
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/src/hooks/usePermissions.js` (lines 133-164)

**Issue:**
The sync response handler at line 133-164 has no deduplication check. If multiple requests arrive simultaneously during/after sync, they can be added to the queue multiple times.

**Data Corruption Scenario:**
```javascript
// Timeline:
T0: User refreshes page
T1: Frontend sends permission-sync-request
T2: New permission request arrives (req-456)
T3: Backend processes sync, returns [req-123, req-456]
T4: Frontend enqueues req-456 (from sync)
T5: Frontend enqueues req-456 AGAIN (from live WebSocket message)

Result: Duplicate request in queue, user approves once, second copy never resolved
```

**Specific Code Path:**
```javascript
// usePermissions.js lines 141-162 - No duplicate check
message.pendingRequests.forEach(serverRequest => {
  // enqueueRequest called WITHOUT checking if already in queue
  const result = enqueueRequest(request);
});
```

**Mitigation Strategy:**
1. Add request ID deduplication in `enqueueRequest`
2. Track "syncing" state to defer live messages
3. Add sequence numbers to sync protocol

```javascript
// Proposed fix in usePermissions.js
const [isSyncing, setIsSyncing] = useState(false);

// During sync
setIsSyncing(true);
wsClient.send({ type: 'permission-sync-request', sessionId });

// In message handler
if (message.type === 'permission-sync-response') {
  const existingIds = new Set([
    activeRequest?.id,
    ...pendingRequests.map(r => r.id)
  ].filter(Boolean));

  message.pendingRequests.forEach(serverRequest => {
    if (!existingIds.has(serverRequest.requestId)) {
      // Only add if not already present
      enqueueRequest(request);
      existingIds.add(serverRequest.requestId);
    }
  });
  setIsSyncing(false);
}
```

---

### 3. State Inconsistency on Auto-Approval
**Severity:** CRITICAL
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/src/hooks/usePermissions.js` (lines 101-113)

**Issue:**
When a request is auto-approved (lines 101-109), it:
1. Sends WebSocket response immediately
2. Removes from sessionStorage (line 111-113)

BUT: The backend's `pendingRequests` Map still contains the request until the WebSocket response is processed. If the response is lost (network issue), the backend will never clean up.

**Data Corruption Scenario:**
```javascript
// Timeline:
T0: Request req-789 arrives
T1: Frontend auto-approves (has session permission)
T2: Frontend sends permission-response
T3: NETWORK FAILURE - response lost
T4: Backend still has req-789 in pendingRequests Map
T5: Backend timeout fires after 5 minutes
T6: Backend sends auto-deny
T7: SDK receives DENY despite frontend thinking it was APPROVED

Result: User's session permission ignored, operation fails unexpectedly
```

**Mitigation Strategy:**
1. Add acknowledgment for permission responses
2. Retry auto-approval responses up to 3 times
3. Add response ID tracking in backend

```javascript
// Proposed fix - Add ack protocol
// Frontend sends
const responseId = `resp-${Date.now()}-${Math.random()}`;
wsClient.send({
  type: 'permission-response',
  responseId,
  requestId,
  decision
});

// Backend acknowledges
ws.send({
  type: 'permission-response-ack',
  responseId,
  requestId
});

// Frontend retries if no ack within 2 seconds
```

---

### 4. Missing Transaction Boundaries in Storage Operations
**Severity:** CRITICAL
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/src/utils/permissionStorage.js` (lines 17-30)

**Issue:**
The `savePendingRequest` function has no atomic guarantee. If the browser crashes between line 21 (filter) and line 26 (setItem), data is lost.

**Data Corruption Scenario:**
```javascript
// Timeline:
T0: Request req-999 needs to be saved
T1: Load existing requests from sessionStorage (line 20)
T2: Filter out duplicate req-999 (line 22)
T3: BROWSER CRASH
Result: req-999 completely lost, user never sees it

// OR worse:
T0: User has 5 pending requests
T1: New request req-1000 arrives
T2: Load existing = [req-A, req-B, req-C, req-D, req-E]
T3: Create updated = [req-A, req-B, req-C, req-D, req-E, req-1000]
T4: sessionStorage.setItem quota exceeded
Result: Exception thrown, sessionStorage corrupted
```

**Specific Code Path:**
```javascript
// permissionStorage.js line 26 - No error recovery
sessionStorage.setItem(key, JSON.stringify(updated));
// If this fails, state is inconsistent
```

**Mitigation Strategy:**
1. Implement optimistic locking with version numbers
2. Add quota check before write
3. Implement atomic write-ahead log

```javascript
// Proposed fix
export function savePendingRequest(sessionId, request) {
  if (!sessionId) return;
  const key = `${STORAGE_KEY_PREFIX}${sessionId}`;

  // Check quota first
  try {
    const testKey = `${key}:test`;
    sessionStorage.setItem(testKey, '1');
    sessionStorage.removeItem(testKey);
  } catch (e) {
    // Storage full, remove expired entries
    const existing = getPendingRequests(sessionId);
    const nonExpired = existing.filter(r => !isRequestExpired(r));
    sessionStorage.setItem(key, JSON.stringify(nonExpired));
  }

  // Atomic write with rollback
  const backup = sessionStorage.getItem(key);
  try {
    const existing = getPendingRequests(sessionId);
    const updated = [
      ...existing.filter(r => r.id !== request.id),
      { ...request, timestamp: request.timestamp || Date.now() }
    ];
    sessionStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    // Rollback on failure
    if (backup) {
      sessionStorage.setItem(key, backup);
    }
    throw e;
  }
}
```

---

### 5. Request ID Collision Risk
**Severity:** HIGH
**File:** Multiple files - ID generation not centralized

**Issue:**
Request IDs are generated in multiple places without coordination:
- SDK generates IDs (external)
- Mock requests use `Date.now()` (usePermissions.js line 271)
- No collision detection exists

**Data Corruption Scenario:**
```javascript
// Timeline:
T0: Mock request: "mock-1732885400000"
T1: Real request arrives at same millisecond: "mock-1732885400000"
T2: Both stored with same ID
T3: User approves one
T4: removePendingRequest removes BOTH
T5: Second request never resolved

// OR:
T0: Request req-123 pending
T1: Backend restarts, counters reset
T2: New request gets ID req-123
T3: Response for new req-123 resolves OLD req-123 in storage
```

**Mitigation Strategy:**
1. Use UUIDs instead of timestamps
2. Add session prefix to all IDs
3. Implement collision detection

```javascript
// Proposed fix - Centralized ID generation
import { v4 as uuidv4 } from 'uuid';

export function generateRequestId(sessionId, prefix = 'req') {
  return `${prefix}-${sessionId.substring(0, 8)}-${uuidv4()}`;
}

// In permissionStorage.js
export function savePendingRequest(sessionId, request) {
  const existing = getPendingRequests(sessionId);

  // Detect collision
  if (existing.some(r => r.id === request.id && r.timestamp !== request.timestamp)) {
    console.error('Request ID collision detected:', request.id);
    throw new Error(`Duplicate request ID: ${request.id}`);
  }

  // ... rest of save logic
}
```

---

### 6. Stale Data in PermissionContext After Restore
**Severity:** HIGH
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/src/contexts/PermissionContext.jsx` (lines 47-76)

**Issue:**
The restore logic at lines 47-76 loads requests from sessionStorage but doesn't validate that these requests still exist on the backend. If backend restarted, these are zombie requests.

**Data Corruption Scenario:**
```javascript
// Timeline:
T0: User has 3 pending requests
T1: Backend crashes/restarts
T2: User refreshes page
T3: Frontend restores 3 requests from sessionStorage
T4: Backend has 0 requests (fresh start)
T5: User approves a request
T6: Backend receives unknown requestId
T7: resolveRequest returns false (line 163 in permissionManager.js)
T8: Frontend thinks approved, backend ignores
Result: State permanently inconsistent
```

**Specific Code Path:**
```javascript
// PermissionContext.jsx lines 62-72 - Blindly restores without validation
const restored = getPendingRequests(currentSessionId);
if (restored.length > 0) {
  const [first, ...rest] = restored;
  setActiveRequest(first);
  setPendingRequests(rest);
}
// NO validation that backend knows about these requests
```

**Mitigation Strategy:**
1. After restore, send validation request to backend
2. Backend responds with which IDs are still valid
3. Remove invalid requests from storage

```javascript
// Proposed fix in PermissionContext.jsx
useEffect(() => {
  if (currentSessionId !== lastSessionIdRef.current) {
    lastSessionIdRef.current = currentSessionId;
    setIsRestoring(true);

    const restored = getPendingRequests(currentSessionId);

    if (restored.length > 0) {
      // Send validation request
      wsClient.send({
        type: 'validate-requests',
        sessionId: currentSessionId,
        requestIds: restored.map(r => r.id)
      });

      // Wait for validation response
      // (implement timeout if no response)
    } else {
      setActiveRequest(null);
      setPendingRequests([]);
    }

    setIsRestoring(false);
  }
}, [currentSessionId]);

// Add handler for validation response
// Remove requests that backend doesn't recognize
```

---

### 7. Memory Leak in Backend requestsBySession Map
**Severity:** HIGH
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/server/services/permissionManager.js` (lines 29-30, 128-134)

**Issue:**
The `requestsBySession` Map grows indefinitely. Sessions are never cleaned up, even after all their requests are resolved or timed out.

**Data Corruption Scenario:**
```javascript
// Over time:
After 1 hour: requestsBySession has 50 sessions, 200 empty Sets
After 1 day: requestsBySession has 1200 sessions, 5000 empty Sets
After 1 week: Memory exhaustion, server crashes

// Specific scenario:
T0: Session "sess-A" has 5 requests
T1: All 5 requests resolved
T2: requestsBySession.get("sess-A") = Set() (empty)
T3: Map entry never deleted
T4: Memory leak continues forever
```

**Specific Code Path:**
```javascript
// permissionManager.js lines 178-183
if (request.sessionId && this.requestsBySession.has(request.sessionId)) {
  this.requestsBySession.get(request.sessionId).delete(requestId);
  if (this.requestsBySession.get(request.sessionId).size === 0) {
    this.requestsBySession.delete(request.sessionId);  // Good!
  }
}
// BUT: What if request.sessionId is null? Session never cleaned up!
```

**Mitigation Strategy:**
1. Add session TTL tracking
2. Cleanup sessions after 1 hour of inactivity
3. Add size limits with LRU eviction

```javascript
// Proposed fix in permissionManager.js
constructor() {
  super();
  this.requestsBySession = new Map();
  this.sessionLastActivity = new Map();

  // Add session cleanup interval
  this.sessionCleanupInterval = setInterval(() => {
    this.cleanupInactiveSessions();
  }, 10 * 60 * 1000); // Every 10 minutes
}

cleanupInactiveSessions() {
  const now = Date.now();
  const SESSION_TTL = 60 * 60 * 1000; // 1 hour

  for (const [sessionId, lastActivity] of this.sessionLastActivity.entries()) {
    if (now - lastActivity > SESSION_TTL) {
      this.requestsBySession.delete(sessionId);
      this.sessionLastActivity.delete(sessionId);
      console.log(`🧹 Cleaned up inactive session: ${sessionId}`);
    }
  }
}

// Update activity timestamp on every operation
addRequest(id, toolName, input, sessionId = null, abortSignal = null) {
  if (sessionId) {
    this.sessionLastActivity.set(sessionId, Date.now());
  }
  // ... rest of method
}
```

---

### 8. No Validation on Sync Response Data
**Severity:** HIGH
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/src/hooks/usePermissions.js` (lines 141-162)

**Issue:**
The sync response handler blindly trusts all data from the server. No validation of:
- Request ID format
- Timestamp validity
- Input parameter sanitization
- Tool name allowlist

**Data Corruption Scenario:**
```javascript
// Malicious/corrupted server response:
{
  type: 'permission-sync-response',
  pendingRequests: [
    {
      requestId: "'; DROP TABLE users; --",  // SQL injection pattern
      toolName: "../../../etc/passwd",        // Path traversal pattern
      timestamp: -999999999999,                // Invalid timestamp
      input: { __proto__: { isAdmin: true } } // Prototype pollution
    }
  ]
}

// Frontend blindly processes:
savePendingRequest(currentSessionId, request);  // Corrupts storage
enqueueRequest(request);                         // Corrupts state
```

**Mitigation Strategy:**
1. Add comprehensive validation schema
2. Sanitize all input fields
3. Validate timestamp ranges
4. Allowlist tool names

```javascript
// Proposed fix - Add validation
function validateSyncRequest(serverRequest) {
  const ALLOWED_TOOLS = ['bash', 'read', 'write', 'edit', /* ... */];
  const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

  // Validate ID format
  if (!/^[a-zA-Z0-9-_]+$/.test(serverRequest.requestId)) {
    throw new Error(`Invalid request ID format: ${serverRequest.requestId}`);
  }

  // Validate tool name
  if (!ALLOWED_TOOLS.includes(serverRequest.toolName)) {
    throw new Error(`Unknown tool: ${serverRequest.toolName}`);
  }

  // Validate timestamp
  const age = Date.now() - serverRequest.timestamp;
  if (age < 0 || age > MAX_AGE_MS) {
    throw new Error(`Invalid timestamp: ${serverRequest.timestamp}`);
  }

  // Sanitize input object (deep clone to prevent prototype pollution)
  const sanitizedInput = JSON.parse(JSON.stringify(serverRequest.input));

  return {
    id: serverRequest.requestId,
    tool: serverRequest.toolName,
    timestamp: serverRequest.timestamp,
    input: sanitizedInput
  };
}

// In sync response handler
message.pendingRequests.forEach(serverRequest => {
  try {
    const validated = validateSyncRequest(serverRequest);
    savePendingRequest(currentSessionId, validated);
    enqueueRequest(validated);
  } catch (error) {
    console.error('Invalid sync request:', error);
    // Continue processing other requests
  }
});
```

---

## Moderate Issues

### 9. TTL Cleanup Race Condition
**Severity:** MODERATE
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/src/utils/permissionStorage.js` (lines 4-14)

**Issue:**
`getPendingRequests` filters by TTL (line 11) but doesn't persist the filtered result. Next call may return expired requests if another tab/window added them.

**Mitigation:**
Write filtered results back to storage after TTL cleanup.

---

### 10. No Conflict Resolution for Concurrent Updates
**Severity:** MODERATE
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/src/utils/permissionStorage.js` (lines 17-30)

**Issue:**
Two browser tabs can overwrite each other's changes when saving to sessionStorage.

**Mitigation:**
Implement storage event listeners and last-write-wins with version vectors.

---

### 11. Statistics Counter Integrity
**Severity:** MODERATE
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/server/services/permissionManager.js` (lines 35-42)

**Issue:**
Statistics counters aren't atomic. If multiple requests resolve simultaneously, counters may be inconsistent.

**Mitigation:**
Use atomic increment operations or move to database with proper transactions.

---

### 12. hasSyncedRef Not Reset on WebSocket Reconnect
**Severity:** MODERATE
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/src/hooks/usePermissions.js` (lines 44, 66-69)

**Issue:**
`hasSyncedRef` is only reset when `currentSessionId` changes, not when WebSocket reconnects. If connection drops and reconnects, sync won't happen again.

**Mitigation:**
Reset `hasSyncedRef` on WebSocket disconnect/reconnect events.

---

### 13. Missing Error Handling in localStorage Operations
**Severity:** MODERATE
**File:** `/Users/dima/Documents/3OpenSource/claudecodeui/src/contexts/PermissionContext.jsx` (lines 24-45)

**Issue:**
localStorage operations for permanent permissions have try/catch on read (line 28-33) but not on write (line 38-44). If quota exceeded, write fails silently.

**Mitigation:**
Add try/catch to write operations and notify user if permanent permissions can't be saved.

---

## Summary of Risks by Category

### State Consistency Risks
- Orphaned requests (Issue #1)
- Sync race conditions (Issue #2)
- Stale data after restore (Issue #6)
- No conflict resolution (Issue #10)

### Data Loss Risks
- Missing transaction boundaries (Issue #4)
- Browser crashes during write (Issue #4)
- Network failures on auto-approval (Issue #3)
- TTL cleanup race (Issue #9)

### Memory/Resource Leaks
- Session map never cleaned (Issue #7)
- Empty Sets accumulate (Issue #7)

### Security/Validation Risks
- No sync data validation (Issue #8)
- Prototype pollution possible (Issue #8)

### Operational Risks
- ID collisions (Issue #5)
- Statistics inconsistency (Issue #11)
- Sync flag not reset (Issue #12)

---

## Recommended Priority Fixes

1. **Immediate (Week 1):**
   - Issue #1: Orphaned requests (data loss)
   - Issue #4: Transaction boundaries (corruption)
   - Issue #8: Sync validation (security)

2. **High Priority (Week 2):**
   - Issue #2: Sync race conditions
   - Issue #3: Auto-approval acknowledgment
   - Issue #6: Stale data validation

3. **Medium Priority (Week 3-4):**
   - Issue #5: Request ID collisions
   - Issue #7: Memory leaks
   - Issues #9-13: Moderate issues

---

## Testing Recommendations

### Critical Path Tests
1. Page refresh with 10 pending requests
2. Network disconnect during auto-approval
3. Browser crash during storage write
4. Multiple tabs with same session
5. Backend restart with frontend still running
6. Request ID collision simulation
7. Storage quota exceeded scenario

### Stress Tests
1. 1000 requests over 24 hours (memory leak detection)
2. 100 rapid page refreshes (sync protocol stress)
3. Concurrent updates from 10 tabs (conflict detection)

### Data Integrity Assertions
```javascript
// After every operation, verify:
assert(frontend.activeRequest === null ||
       backend.pendingRequests.has(frontend.activeRequest.id))

assert(frontend.pendingRequests.every(req =>
       backend.pendingRequests.has(req.id)))

assert(sessionStorage.size < QUOTA_LIMIT * 0.9)

assert(backend.requestsBySession.size < MAX_SESSIONS)
```

---

## Conclusion

The permission persistence implementation has significant data integrity risks that could lead to:
- User decisions being ignored (orphaned requests)
- Operations hanging indefinitely (stale resolvers)
- Memory exhaustion (session leaks)
- State corruption (race conditions)

All 13 issues should be addressed before production deployment, with the 8 critical issues being blockers for any release.
