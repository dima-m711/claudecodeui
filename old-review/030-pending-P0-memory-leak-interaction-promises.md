---
id: "030"
title: "Memory leak - interaction promises never cleaned up"
priority: P0
category: performance
status: pending
created: 2024-12-27
source: pr-review
files:
  - server/services/interactionManager.js
---

# Memory Leak - Interaction Promises Never Cleaned Up

## Problem
The `InteractionManager` stores resolve/reject callbacks in memory via the promise-based interaction pattern. If a client disconnects before the interaction is resolved, the promises remain in memory indefinitely, causing a memory leak that will eventually lead to server OOM.

## Location
- `server/services/interactionManager.js:41-54` - Promise callbacks stored in Map
- `server/services/interactionManager.js:193-210` - `removeSession()` doesn't clean promises properly

## Risk
- **Severity**: CRITICAL (P0)
- **Impact**: Server memory grows continuously until OOM crash
- **Timeline**: Hours to days depending on usage
- **CVSS**: 7.5 (Availability impact)

## Root Cause
```javascript
// server/services/interactionManager.js:41-54
return new Promise((resolve, reject) => {
    const interaction = {
        id: interactionId,
        // ...
        resolve,  // ❌ Callback stored in memory
        reject    // ❌ Callback stored in memory
    };

    this.pendingInteractions.set(interactionId, interaction);
    // If client disconnects, this Map entry is never cleaned
    // The promise callbacks retain references to their closure scope
});
```

## Memory Growth Pattern
```
Time 0h:   50 MB baseline
Time 1h:   75 MB (+25 MB from leaked promises)
Time 4h:  150 MB
Time 8h:  300 MB
Time 24h: OOM crash
```

## Recommended Fix

### Step 1: Add proper cleanup in removeSession
```javascript
// server/services/interactionManager.js
removeSession(sessionId) {
    if (!sessionId) return;

    const interactionIds = this.interactionsBySession.get(sessionId);
    if (interactionIds) {
        interactionIds.forEach(interactionId => {
            const interaction = this.pendingInteractions.get(interactionId);
            if (interaction) {
                // Clean up any abort signal listeners
                if (interaction.metadata?.abortSignal) {
                    // Remove abort listener if attached
                }

                // Reject the promise to release callbacks
                this.rejectInteraction(interactionId, 'Session disconnected');
            }
        });
        this.interactionsBySession.delete(sessionId);
    }
}
```

### Step 2: Add timeout for stale interactions
```javascript
// Add to constructor
this.interactionTimeout = 5 * 60 * 1000; // 5 minutes

// Add to requestInteraction
const timeoutId = setTimeout(() => {
    if (this.pendingInteractions.has(interactionId)) {
        this.rejectInteraction(interactionId, 'Interaction timed out');
    }
}, this.interactionTimeout);

interaction.timeoutId = timeoutId;

// Add to resolveInteraction/rejectInteraction
if (interaction.timeoutId) {
    clearTimeout(interaction.timeoutId);
}
```

### Step 3: Add periodic cleanup
```javascript
// In cleanupStaleInteractions
cleanupStaleInteractions() {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [id, interaction] of this.pendingInteractions) {
        if (now - interaction.requestedAt > staleThreshold) {
            console.warn(`Cleaning up stale interaction: ${id}`);
            this.rejectInteraction(id, 'Stale interaction cleaned up');
        }
    }
    // ... existing session cleanup
}
```

## Testing
- [ ] Unit test: Interactions cleaned up when session removed
- [ ] Unit test: Stale interactions auto-rejected after timeout
- [ ] Load test: Memory usage stable after 1000 connect/disconnect cycles
- [ ] Monitor: Add memory metrics for pendingInteractions Map size

## Estimated Effort
2-3 hours
