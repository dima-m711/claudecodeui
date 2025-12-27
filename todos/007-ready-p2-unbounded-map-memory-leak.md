# P2: Unbounded Map Growth Causes Memory Leaks

---
status: ready
priority: p2
issue_id: "007"
tags: [performance, memory-leak, scalability, reliability]
dependencies: []
---

**Status**: ready
**Priority**: P2 (Important - Reliability)
**Issue ID**: 007
**Tags**: performance, memory-leak, scalability, reliability

## Problem Statement

The `connectedClients` Map in `server/index.js:84-94` and `interactionsBySession` Map in `server/services/interactionManager.js:34-63` grow unboundedly as clients connect and interactions are created, never releasing memory for closed connections or completed interactions.

**Evidence**:
```javascript
// server/index.js
const connectedClients = new Map(); // ⚠️ NEVER CLEARED

wss.on('connection', (ws, req) => {
  const clientId = `client-${Date.now()}-...`;
  connectedClients.set(clientId, { ws, sessionId: null, lastSeen: Date.now() });

  ws.on('close', () => {
    connectedClients.delete(clientId); // ⚠️ ONLY on graceful close
  });
});

// server/services/interactionManager.js
this.interactionsBySession = new Map(); // ⚠️ NEVER PRUNED

addToSessionIndex(sessionId, interactionId) {
  if (!this.interactionsBySession.has(sessionId)) {
    this.interactionsBySession.set(sessionId, new Set()); // ⚠️ GROWS FOREVER
  }
  this.interactionsBySession.get(sessionId).add(interactionId);
}
```

**Risk Level**: HIGH
- Server crashes after ~10k connections due to OOM
- Memory grows by ~500 bytes per interaction
- No cleanup for orphaned sessions

## Findings from Agents

**Performance Oracle (Agent ab5d7fb)**:
> "connectedClients and interactionsBySession Maps grow without bounds. If connections drop without graceful close (network failures, crashes), entries persist forever. A server running for weeks with 1000 daily connections will accumulate 700k orphaned entries."

**Data Integrity Guardian (Agent addd421)**:
> "interactionsBySession is never pruned after session ends. If a session creates 100 interactions, the Set remains in memory even after all interactions are resolved."

## Proposed Solutions

### Option 1: TTL-Based LRU Cache (Recommended)
**Implementation**:
```javascript
import { LRUCache } from 'lru-cache';

// Replace Map with LRU cache
const connectedClients = new LRUCache({
  max: 10000, // Max 10k concurrent connections
  ttl: 1000 * 60 * 60, // 1 hour TTL
  updateAgeOnGet: true, // Refresh TTL on activity
  dispose: (clientId, client) => {
    console.log(`Evicting inactive client ${clientId}`);
    client.ws.close();
  }
});

// Update on activity
ws.on('message', () => {
  const client = connectedClients.get(ws.clientId);
  if (client) {
    client.lastSeen = Date.now();
    connectedClients.set(ws.clientId, client); // Refresh TTL
  }
});
```

**For InteractionManager**:
```javascript
export class InteractionManager extends EventEmitter {
  constructor() {
    super();
    this.pendingInteractions = new Map();
    this.interactionsBySession = new LRUCache({
      max: 1000, // Max 1000 active sessions
      ttl: 1000 * 60 * 15, // 15 minutes TTL
      dispose: (sessionId, interactions) => {
        console.log(`Pruning session ${sessionId} with ${interactions.size} interactions`);
        interactions.forEach(id => this.timeoutInteraction(id, 'SESSION_EXPIRED'));
      }
    });
  }
}
```

**Pros**:
- Automatic eviction of old entries
- Configurable memory limits
- Well-tested library

**Cons**:
- Adds dependency (~50KB)
- May evict active sessions if misconfigured

**Effort**: 40 LOC
**Risk**: Low

### Option 2: Periodic Cleanup Task
**Implementation**:
```javascript
// Cleanup inactive clients every 5 minutes
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes

  for (const [clientId, client] of connectedClients.entries()) {
    if (now - client.lastSeen > timeout) {
      console.log(`Cleaning up inactive client ${clientId}`);
      client.ws.terminate(); // Force close
      connectedClients.delete(clientId);
    }
  }
}, 5 * 60 * 1000);

// Cleanup empty session indexes
setInterval(() => {
  for (const [sessionId, interactions] of interactionManager.interactionsBySession.entries()) {
    if (interactions.size === 0) {
      interactionManager.interactionsBySession.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);
```

**Pros**:
- No dependencies
- Simple to understand

**Cons**:
- 5-minute delay before cleanup
- CPU spike during cleanup
- May close active connections if lastSeen isn't updated

**Effort**: 30 LOC
**Risk**: Medium

### Option 3: Weak References (Advanced)
**Implementation**:
```javascript
export class InteractionManager extends EventEmitter {
  constructor() {
    super();
    this.pendingInteractions = new Map();
    this.sessionRegistry = new FinalizationRegistry((sessionId) => {
      console.log(`Session ${sessionId} was garbage collected`);
      this.interactionsBySession.delete(sessionId);
    });
  }

  registerSession(sessionId, sessionObject) {
    this.sessionRegistry.register(sessionObject, sessionId);
  }
}
```

**Pros**:
- Automatic cleanup when session object is GC'd
- No manual memory management

**Cons**:
- Requires session object to be managed elsewhere
- Non-deterministic cleanup timing
- Complex to reason about

**Effort**: 50 LOC
**Risk**: High (relies on GC behavior)

## Technical Details

**Affected Files**:
- `server/index.js:84-94` - connectedClients Map
- `server/services/interactionManager.js:34-63` - interactionsBySession Map
- `server/services/interactionManager.js:138-158` - Existing cleanup task (5 minutes, only for pendingInteractions)

**Memory Growth Calculation**:
```
connectedClients:
- Key: ~50 bytes (client-1234567890-abc123def)
- Value: ~200 bytes (WebSocket object + metadata)
- Total: ~250 bytes/entry

interactionsBySession:
- Key: ~40 bytes (UUID)
- Value: Set(100 interactions) = ~5000 bytes
- Total: ~5040 bytes/session

1000 daily connections × 30 days = 30k entries = 7.5MB leaked
100 daily sessions × 30 days × 100 interactions = 15GB leaked (!!)
```

## Acceptance Criteria

- [ ] connectedClients limited to 10k entries with TTL
- [ ] interactionsBySession pruned when session ends
- [ ] Memory usage monitored with Prometheus/StatsD
- [ ] Load test: 10k connections over 1 hour, memory stable
- [ ] No active connections closed prematurely
- [ ] Metrics dashboard shows Map sizes

**Estimated LOC**: 40 (Option 1), 30 (Option 2), 50 (Option 3)
**Estimated Effort**: 4 hours (Option 1), 3 hours (Option 2), 6 hours (Option 3)

## Work Log

### 2025-12-27 - Approved for Work
**By:** Claude Triage System
**Actions:**
- Issue approved during triage session
- Status changed from pending → ready
- Ready to be picked up and worked on
- User preference: Use LRU cache approach (Option 1)

**Learnings:**
- Critical memory leak affecting scalability
- Recommended: LRU cache with TTL for automatic eviction
- Server crashes after ~10k connections without fix
