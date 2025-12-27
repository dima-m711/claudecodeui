# P2: Statistics Map Grows Without Bounds

---
status: ready
priority: p2
issue_id: "014"
tags: [memory-leak, performance, observability]
dependencies: []
---

**Status**: ready
**Priority**: P2 (Important - Reliability)
**Issue ID**: 014
**Tags**: memory-leak, performance, observability

## Problem Statement

The `statistics` Map in `server/services/interactionManager.js:171-184` accumulates metrics for every session that ever existed, never pruning old sessions, causing unbounded memory growth.

**Evidence**:
```javascript
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

  // ⚠️ NEVER DELETED - grows forever
}
```

**Risk Level**: MEDIUM
- Memory leak: ~200 bytes per session
- 10k daily sessions × 365 days = 730MB leaked per year
- No cleanup mechanism for inactive sessions

## Findings from Agents

**Performance Oracle (Agent ab5d7fb)**:
> "The statistics Map grows without bounds. If the server runs for months with 1000 daily sessions, this leaks 100k+ entries consuming hundreds of MB."

**Pattern Recognition Specialist (Agent a374b62)**:
> "Statistics are never exported or used. No endpoints expose these metrics. This is classic YAGNI - unused code that adds complexity and memory leaks."

## Proposed Solutions

### Option 1: Remove Statistics Entirely (Recommended)
**Implementation**:
```javascript
// Delete _updateStatistics method (lines 171-184)
// Remove this.statistics = new Map() from constructor
// Remove all _updateStatistics() call sites

// If observability is needed later, implement proper metrics system
```

**Pros**:
- Eliminates memory leak completely
- Removes unused code (~50 LOC)
- Simplifies InteractionManager

**Cons**:
- Loses potential observability (but currently unused)

**Effort**: Delete ~50 LOC
**Risk**: Very Low (code is unused)

### Option 2: Export Statistics via Prometheus
**Implementation**:
```javascript
import { register, Counter, Gauge } from 'prom-client';

// Replace Map with Prometheus metrics
const interactionsTotal = new Counter({
  name: 'interactions_total',
  help: 'Total interactions created',
  labelNames: ['type', 'outcome']
});

const pendingInteractions = new Gauge({
  name: 'interactions_pending',
  help: 'Number of pending interactions',
  labelNames: ['session_id']
});

// In resolveInteraction
interactionsTotal.inc({ type: interaction.type, outcome: 'resolved' });
pendingInteractions.dec({ session_id: interaction.sessionId });

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**Pros**:
- Industry-standard observability
- Automatic aggregation and cleanup
- Grafana/Datadog integration
- No memory leaks (metrics expire)

**Cons**:
- Adds prom-client dependency
- Requires metrics infrastructure

**Effort**: 80 LOC + Prometheus setup
**Risk**: Low

### Option 3: Add TTL-Based Cleanup
**Implementation**:
```javascript
import { LRUCache } from 'lru-cache';

this.statistics = new LRUCache({
  max: 1000, // Max 1000 sessions
  ttl: 1000 * 60 * 60 * 24, // 24 hour TTL
  updateAgeOnGet: false // Don't refresh on read
});
```

**Pros**:
- Keeps existing code structure
- Automatic cleanup
- Configurable retention

**Cons**:
- Statistics still not used/exported
- Adds dependency

**Effort**: 10 LOC
**Risk**: Low

## Technical Details

**Affected Files**:
- `server/services/interactionManager.js:171-184` - _updateStatistics method
- `server/services/interactionManager.js:12` - statistics Map initialization
- `server/services/interactionManager.js:91,110,126,155` - Call sites

**Memory Leak Calculation**:
```
Per-session statistics:
- Key: ~40 bytes (session UUID)
- Value: { total, resolved, rejected, timedOut } = ~160 bytes
- Total: ~200 bytes/session

10k daily sessions × 365 days = 3.65M sessions
3.65M × 200 bytes = 730MB leaked per year
```

**Current Usage**:
```bash
$ grep -r "statistics" server/
server/services/interactionManager.js:    this.statistics = new Map();
server/services/interactionManager.js:  _updateStatistics(sessionId, outcome) {
server/services/interactionManager.js:    if (!this.statistics.has(sessionId)) {
server/services/interactionManager.js:      this.statistics.set(sessionId, {
server/services/interactionManager.js:    const stats = this.statistics.get(sessionId);

# NO EXPORTS, NO ENDPOINTS, NO USAGE!
```

## Acceptance Criteria

### If Option 1 (Remove):
- [ ] All _updateStatistics calls removed
- [ ] statistics Map removed from constructor
- [ ] No references to statistics in codebase
- [ ] All tests pass

### If Option 2 (Prometheus):
- [ ] Metrics exposed at /metrics endpoint
- [ ] Grafana dashboard configured
- [ ] Metrics retention policy set (7 days)
- [ ] Documentation for metrics

### If Option 3 (TTL):
- [ ] LRU cache configured with 24h TTL
- [ ] Statistics pruned automatically
- [ ] Memory usage stable under load

**Estimated LOC**: -50 (Option 1), 80 (Option 2), 10 (Option 3)
**Estimated Effort**: 30 minutes (Option 1), 4 hours (Option 2), 1 hour (Option 3)

## Work Log

_To be filled during implementation_
## Work Log

### 2025-12-27 - Approved for Work
**By:** Claude Triage System
**Actions:**
- Issue approved during triage session
- Status changed from pending → ready
- Ready to be picked up and worked on

**Learnings:**
- Important maintainability/performance issue
- Approved for implementation in this PR
