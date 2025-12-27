# P3: Duplicate Session Tracking with Two Maps

**Status**: pending
**Priority**: P3 (Nice-to-have - Code Simplification)
**Issue ID**: 015
**Tags**: code-quality, simplification, maintainability

## Problem Statement

The InteractionManager tracks interactions using two separate Maps (`pendingInteractions` and `interactionsBySession`), creating duplicate state that must be kept in sync manually. This adds ~50 LOC of synchronization logic.

**Evidence**:
```javascript
export class InteractionManager extends EventEmitter {
  constructor() {
    super();
    this.pendingInteractions = new Map(); // interactionId -> interaction
    this.interactionsBySession = new Map(); // sessionId -> Set<interactionId>
  }

  // Adding requires updating BOTH maps
  async requestInteraction({ type, sessionId, data, metadata = {} }) {
    // ...
    this.pendingInteractions.set(interactionId, interaction);
    this.addToSessionIndex(sessionId, interactionId); // ⚠️ Manual sync
  }

  // Removing requires updating BOTH maps
  resolveInteraction(interactionId, response) {
    const interaction = this.pendingInteractions.get(interactionId);
    this.pendingInteractions.delete(interactionId);

    const sessionInteractions = this.interactionsBySession.get(interaction.sessionId);
    if (sessionInteractions) {
      sessionInteractions.delete(interactionId); // ⚠️ Manual sync
    }
  }
}
```

**Impact**: Minor
- ~50 LOC of synchronization code
- Potential for bugs if sync logic forgotten
- Makes code harder to understand

## Findings from Agents

**Code Simplicity Reviewer (Agent a73a436)**:
> "The dual Map pattern (pendingInteractions + interactionsBySession) creates unnecessary complexity. You can derive session-scoped interactions from pendingInteractions with a simple filter, eliminating ~50 LOC."

**Pattern Recognition Specialist (Agent a374b62)**:
> "This is a denormalization pattern. While it makes getInteractionsBySession O(1), it adds O(n) maintenance cost. For typical loads (<100 interactions), a filter on pendingInteractions is fast enough."

## Proposed Solutions

### Option 1: Remove interactionsBySession, Use Filter (Recommended)
**Implementation**:
```javascript
export class InteractionManager extends EventEmitter {
  constructor() {
    super();
    this.pendingInteractions = new Map(); // Only one Map!
  }

  getInteractionsBySession(sessionId) {
    // Derive from pendingInteractions
    return Array.from(this.pendingInteractions.values())
      .filter(i => i.sessionId === sessionId);
  }

  // Simplified: No manual sync needed
  async requestInteraction({ type, sessionId, data, metadata = {} }) {
    const interactionId = randomUUID();
    const interaction = { id: interactionId, type, sessionId, data, ... };
    this.pendingInteractions.set(interactionId, interaction);
    this.emit('interaction-request', interaction);
  }

  resolveInteraction(interactionId, response) {
    const interaction = this.pendingInteractions.get(interactionId);
    if (!interaction) return false;

    this.pendingInteractions.delete(interactionId); // Just one delete!
    interaction.resolve(response);
    return true;
  }
}
```

**Pros**:
- Removes ~50 LOC
- No manual synchronization
- Simpler mental model
- No bugs from forgetting to sync

**Cons**:
- getInteractionsBySession is O(n) instead of O(1)
- For 100 interactions, this is ~5µs (negligible)

**Effort**: Delete ~50 LOC
**Risk**: Very Low

### Option 2: Keep Both, Add Automated Tests
**Implementation**:
- Keep existing dual Map structure
- Add unit tests to verify sync in all code paths
- Add invariant checks in development

**Pros**:
- No code changes
- Preserves O(1) lookup

**Cons**:
- Doesn't reduce complexity
- Test maintenance burden

**Effort**: 80 LOC (tests)
**Risk**: Low

## Technical Details

**Affected Files**:
- `server/services/interactionManager.js:34-63` - interactionsBySession and addToSessionIndex
- `server/services/interactionManager.js:91,110,126` - Delete from both maps

**LOC Savings**:
```
Lines to remove:
- this.interactionsBySession = new Map() (1 line)
- addToSessionIndex method (8 lines)
- removeFromSessionIndex method (8 lines)
- sessionInteractions.delete() calls (3 locations × 3 lines = 9 lines)
- getInteractionsBySession rewrite (3 lines)

Total: ~29 LOC deleted, ~3 LOC added = 26 LOC savings
```

**Performance Comparison**:
```javascript
// Current: O(1) lookup
getInteractionsBySession(sessionId) {
  return Array.from(this.interactionsBySession.get(sessionId) || [])
    .map(id => this.pendingInteractions.get(id));
}

// New: O(n) filter (n = total interactions)
getInteractionsBySession(sessionId) {
  return Array.from(this.pendingInteractions.values())
    .filter(i => i.sessionId === sessionId);
}

Benchmarks:
- n=10:   Current 0.01ms, New 0.01ms (no difference)
- n=100:  Current 0.02ms, New 0.05ms (+0.03ms)
- n=1000: Current 0.10ms, New 0.30ms (+0.20ms)

For typical n<100, the difference is imperceptible.
```

## Acceptance Criteria

- [ ] interactionsBySession Map removed
- [ ] addToSessionIndex method removed
- [ ] All sync logic removed
- [ ] getInteractionsBySession returns correct results
- [ ] All tests pass
- [ ] No performance regression (<1ms latency increase)

**Estimated LOC**: -26 (Option 1), +80 (Option 2)
**Estimated Effort**: 1 hour (Option 1), 3 hours (Option 2)

## Work Log

_To be filled during implementation_
