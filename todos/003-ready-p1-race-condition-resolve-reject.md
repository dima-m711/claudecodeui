# P1: Race Condition in Concurrent Interaction Resolution

---
status: ready
priority: p1
issue_id: "003"
tags: [concurrency, data-integrity, race-condition, reliability]
dependencies: []
---

**Status**: ready
**Priority**: P1 (Critical - Blocks Merge)
**Issue ID**: 003
**Tags**: concurrency, data-integrity, race-condition, reliability

## Problem Statement

The `resolveInteraction` and `rejectInteraction` methods in `server/services/interactionManager.js:85-136` have a critical race condition where multiple concurrent calls can trigger the stored Promise's resolve/reject callbacks multiple times before the Map entry is deleted.

**Evidence**:
```javascript
resolveInteraction(interactionId, response) {
  const interaction = this.pendingInteractions.get(interactionId);
  if (!interaction) return;

  interaction.resolve(response);  // ⚠️ RACE: Can be called multiple times
  this.pendingInteractions.delete(interactionId);  // ⚠️ TOO LATE: Delete happens after resolve
  // ... statistics update
}

rejectInteraction(interactionId, error) {
  const interaction = this.pendingInteractions.get(interactionId);
  if (!interaction) return;

  interaction.reject(error);  // ⚠️ RACE: Can be called multiple times
  this.pendingInteractions.delete(interactionId);  // ⚠️ TOO LATE
  // ... statistics update
}
```

**Risk Level**: CRITICAL
- Promise resolve/reject can be called multiple times in concurrent scenarios
- BroadcastChannel cross-tab sync amplifies race window
- Causes SDK tool execution to receive duplicate responses
- Unpredictable behavior when multiple tabs respond simultaneously

## Findings from Agents

**Data Integrity Guardian (Agent addd421)**:
> "Race condition where resolve() is called before delete() happens. If two clients respond concurrently, both will successfully call resolve() on the same Promise, causing undefined behavior."

**Pattern Recognition Specialist (Agent a374b62)**:
> "The delete-after-resolve pattern is error-prone. Standard practice is to atomically remove the entry before invoking callbacks to prevent re-entry bugs."

**Git History Analyzer (Agent a6e4f43)**:
> "ChatInterface.jsx has 25 modifications in this branch, suggesting high interaction with the interaction system. This increases the likelihood of concurrent resolution attempts from UI events."

## Proposed Solutions

### Option 1: Atomic Delete-Before-Resolve (Recommended)
**Implementation**:
```javascript
resolveInteraction(interactionId, response) {
  const interaction = this.pendingInteractions.get(interactionId);
  if (!interaction) {
    console.warn(`⚠️  No pending interaction found: ${interactionId}`);
    return false;
  }

  // ATOMIC: Delete before resolve to prevent double-resolution
  this.pendingInteractions.delete(interactionId);

  // Update secondary index
  const sessionInteractions = this.interactionsBySession.get(interaction.sessionId);
  if (sessionInteractions) {
    sessionInteractions.delete(interactionId);
  }

  // Update statistics
  this._updateStatistics(interaction.sessionId, 'resolved');

  // Safe to call now - no re-entry possible
  try {
    interaction.resolve(response);
  } catch (error) {
    console.error(`Failed to resolve interaction ${interactionId}:`, error);
  }

  this.emit('interaction-resolved', { interactionId, sessionId: interaction.sessionId });
  return true;
}

rejectInteraction(interactionId, error) {
  const interaction = this.pendingInteractions.get(interactionId);
  if (!interaction) {
    console.warn(`⚠️  No pending interaction found: ${interactionId}`);
    return false;
  }

  // ATOMIC: Delete first
  this.pendingInteractions.delete(interactionId);

  const sessionInteractions = this.interactionsBySession.get(interaction.sessionId);
  if (sessionInteractions) {
    sessionInteractions.delete(interactionId);
  }

  this._updateStatistics(interaction.sessionId, 'rejected');

  try {
    interaction.reject(new Error(error || 'Interaction rejected'));
  } catch (error) {
    console.error(`Failed to reject interaction ${interactionId}:`, error);
  }

  this.emit('interaction-rejected', { interactionId, sessionId: interaction.sessionId });
  return true;
}
```

**Pros**:
- Eliminates race condition completely
- Try-catch prevents unhandled exceptions from corrupting state
- Returns boolean for caller verification
- Maintains all existing side effects (statistics, events)

**Cons**:
- If resolve/reject throws, interaction is lost (acceptable - prefer consistency)
- Slightly more verbose

**Effort**: 30 LOC modified
**Risk**: Low (strictly safer than current code)

### Option 2: Use Mutex/Lock Pattern
**Implementation**:
```javascript
import { Mutex } from 'async-mutex';

export class InteractionManager extends EventEmitter {
  constructor() {
    super();
    this.pendingInteractions = new Map();
    this.resolutionLocks = new Map(); // interactionId -> Mutex
  }

  async resolveInteraction(interactionId, response) {
    let mutex = this.resolutionLocks.get(interactionId);
    if (!mutex) {
      mutex = new Mutex();
      this.resolutionLocks.set(interactionId, mutex);
    }

    const release = await mutex.acquire();
    try {
      const interaction = this.pendingInteractions.get(interactionId);
      if (!interaction) return false;

      this.pendingInteractions.delete(interactionId);
      interaction.resolve(response);
      return true;
    } finally {
      release();
      this.resolutionLocks.delete(interactionId);
    }
  }
}
```

**Pros**:
- Guarantees mutual exclusion
- Standard concurrency primitive

**Cons**:
- Adds external dependency (`async-mutex`)
- Async API change breaks callers
- Overkill for this use case (delete-first is simpler)
- Introduces lock cleanup overhead

**Effort**: 50 LOC + dependency
**Risk**: Medium (API change requires caller updates)

### Option 3: Idempotent Flag Pattern
**Implementation**:
```javascript
resolveInteraction(interactionId, response) {
  const interaction = this.pendingInteractions.get(interactionId);
  if (!interaction) return false;

  // Idempotency check
  if (interaction._resolved || interaction._rejected) {
    console.warn(`Interaction ${interactionId} already resolved/rejected`);
    return false;
  }

  interaction._resolved = true; // Flag before calling resolve
  interaction.resolve(response);
  this.pendingInteractions.delete(interactionId);
  return true;
}
```

**Pros**:
- No external dependencies
- Synchronous API preserved

**Cons**:
- Still allows window between flag set and resolve() call
- Mutates interaction object (side effect)
- Doesn't prevent concurrent delete() calls

**Effort**: 10 LOC
**Risk**: Low, but doesn't fully solve the problem

## Technical Details

**Affected Files**:
- `server/services/interactionManager.js:85-136` - resolveInteraction, rejectInteraction
- `server/services/interactionManager.js:138-158` - timeoutInteraction (same pattern)
- `src/contexts/InteractionContext.jsx:73-98` - BroadcastChannel message handler (amplifies race)

**Race Window Analysis**:
1. **Tab A** receives user approval, calls `ws.send({ type: 'interaction-response' })`
2. **Tab B** (via BroadcastChannel) also processes approval, calls `ws.send(...)` concurrently
3. **Server** receives both messages within milliseconds
4. **Both** WebSocket handlers call `resolveInteraction(interactionId, response)`
5. **First call** reads `pendingInteractions.get()`, calls `resolve()` ✓
6. **Second call** reads `pendingInteractions.get()` (still exists!), calls `resolve()` again ✗
7. **Promise** behavior undefined (throws or silent failure depending on implementation)

**Reproduction Steps**:
```javascript
// Test case
const manager = new InteractionManager();
const promise = manager.requestInteraction({ type: 'test', sessionId: 's1', data: {} });

// Simulate concurrent resolution
setTimeout(() => manager.resolveInteraction(interactionId, { approved: true }), 0);
setTimeout(() => manager.resolveInteraction(interactionId, { approved: true }), 0);

// Expected: Second call returns false
// Actual: Both calls may succeed
```

## Acceptance Criteria

- [ ] resolveInteraction atomically removes entry before calling resolve()
- [ ] rejectInteraction atomically removes entry before calling reject()
- [ ] timeoutInteraction follows same pattern
- [ ] Unit test: Concurrent calls result in exactly one resolve()
- [ ] Integration test: Multi-tab approval only resolves once
- [ ] All existing tests pass without modification
- [ ] Performance: No measurable latency increase

**Estimated LOC**: 30 (Option 1), 50 (Option 2), 10 (Option 3)
**Estimated Effort**: 3 hours (Option 1), 6 hours (Option 2), 1 hour (Option 3 - incomplete fix)

## Work Log

### 2025-12-27 - Approved for Work
**By:** Claude Triage System
**Actions:**
- Issue approved during triage session
- Status changed from pending → ready
- Ready to be picked up and worked on

**Learnings:**
- Critical race condition causing duplicate Promise resolution
- Recommended: Atomic delete-before-resolve pattern (Option 1)
- Related to issue #010 (BroadcastChannel race condition)
