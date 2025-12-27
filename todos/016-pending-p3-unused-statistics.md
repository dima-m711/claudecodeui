# P3: Unused Statistics System (50 LOC)

**Status**: pending
**Priority**: P3 (Nice-to-have - Code Simplification)
**Issue ID**: 016
**Tags**: yagni, code-quality, simplification

## Problem Statement

The `_updateStatistics` method and related code in `server/services/interactionManager.js` (~50 LOC) collects metrics that are never exported, displayed, or used anywhere in the system.

**Evidence**:
```bash
# Find all references to statistics
$ grep -r "statistics" server/

server/services/interactionManager.js:    this.statistics = new Map();
server/services/interactionManager.js:    this._updateStatistics(sessionId, 'resolved');
server/services/interactionManager.js:    this._updateStatistics(sessionId, 'rejected');
server/services/interactionManager.js:    this._updateStatistics(sessionId, 'timedOut');
server/services/interactionManager.js:  _updateStatistics(sessionId, outcome) {

# NO usage outside InteractionManager - dead code!
```

**Impact**: Minor
- ~50 LOC of unused code
- Memory leak (see #014)
- Maintenance burden for no benefit

## Findings from Agents

**Code Simplicity Reviewer (Agent a73a436)**:
> "YAGNI violation: Statistics system was implemented speculatively but never used. No endpoints expose these metrics, no UI displays them. Remove all statistics-related code (~50 LOC)."

**Pattern Recognition Specialist (Agent a374b62)**:
> "Classic premature optimization. The statistics system was built 'just in case' but has zero consumers. This violates YAGNI and adds unnecessary complexity."

## Proposed Solutions

### Option 1: Remove All Statistics Code (Recommended)
**Implementation**:
```javascript
// Delete these from InteractionManager:
this.statistics = new Map(); // Line 12
this._updateStatistics(sessionId, 'resolved'); // Line 91
this._updateStatistics(sessionId, 'rejected'); // Line 110
this._updateStatistics(sessionId, 'timedOut'); // Line 126
_updateStatistics(sessionId, outcome) { ... } // Lines 171-184
```

**Pros**:
- Removes ~50 LOC
- Eliminates memory leak (#014)
- Simplifies InteractionManager
- No impact on functionality (code is unused)

**Cons**:
- Need to re-implement if observability needed later
- Easy to add back with proper metrics system (Prometheus)

**Effort**: Delete ~50 LOC
**Risk**: None (code has no consumers)

### Option 2: Keep Skeleton for Future Use
**Implementation**:
```javascript
// Keep Map but don't implement _updateStatistics
this.statistics = new Map(); // Reserved for future use

// Comment out update calls
// this._updateStatistics(sessionId, 'resolved');
```

**Pros**:
- Preserves structure for future implementation

**Cons**:
- Still has memory leak
- Clutters codebase with commented code
- Better to add when actually needed (YAGNI)

**Effort**: 10 LOC (comments)
**Risk**: None

## Technical Details

**Affected Files**:
- `server/services/interactionManager.js:12` - statistics Map
- `server/services/interactionManager.js:91` - _updateStatistics call
- `server/services/interactionManager.js:110` - _updateStatistics call
- `server/services/interactionManager.js:126` - _updateStatistics call
- `server/services/interactionManager.js:171-184` - _updateStatistics method

**Code to Remove**:
```javascript
// Constructor
this.statistics = new Map();

// resolveInteraction
this._updateStatistics(interaction.sessionId, 'resolved');

// rejectInteraction
this._updateStatistics(interaction.sessionId, 'rejected');

// timeoutInteraction
this._updateStatistics(interaction.sessionId, 'timedOut');

// Method
_updateStatistics(sessionId, outcome) {
  if (!this.statistics.has(sessionId)) {
    this.statistics.set(sessionId, {
      total: 0,
      resolved: 0,
      rejected: 0,
      timedOut: 0
    });
  }

  const stats = this.statistics.get(sessionId);
  stats.total++;
  if (outcome) stats[outcome]++;
}
```

**Future Implementation Path**:
If observability is needed:
1. Use Prometheus/StatsD instead of Map
2. Export via `/metrics` endpoint
3. Build Grafana dashboard
(See #014 Option 2 for details)

## Acceptance Criteria

- [ ] All _updateStatistics calls removed
- [ ] _updateStatistics method deleted
- [ ] statistics Map removed from constructor
- [ ] All tests pass (no test relies on statistics)
- [ ] No grep matches for "statistics" outside comments

**Estimated LOC**: -50
**Estimated Effort**: 30 minutes

## Work Log

_To be filled during implementation_
