---
id: "033"
title: "No rate limiting on interaction requests"
priority: P1
category: security
status: pending
created: 2024-12-27
source: pr-review
files:
  - server/services/interactionManager.js
---

# No Rate Limiting on Interaction Requests

## Problem
While there is a `MAX_INTERACTIONS_PER_SESSION` limit (100), there is no rate limiting on how quickly interactions can be created. A malicious actor could spam interactions up to the limit instantly, overwhelming users with dialogs or causing DoS.

## Location
- `server/services/interactionManager.js:34-38` - Count check without rate limit

## Risk
- **Severity**: HIGH (P1)
- **Impact**: DoS via dialog spam, resource exhaustion
- **Attack Vector**: Malicious Claude commands that trigger many permissions rapidly

## Root Cause
```javascript
// server/services/interactionManager.js:34-38
if (sessionId) {
    const sessionInteractions = this.interactionsBySession.get(sessionId);
    if (sessionInteractions && sessionInteractions.size >= MAX_INTERACTIONS_PER_SESSION) {
        throw new Error(`Too many pending interactions for session ${sessionId}`);
    }
}
// ❌ Can create 100 interactions in 1ms - no rate limit!
```

## Attack Scenario
```javascript
// Malicious script creates 100 permission dialogs instantly
for (let i = 0; i < 100; i++) {
    interactionManager.requestInteraction({
        type: 'permission',
        sessionId: 'victim-session',
        data: { toolName: 'Bash', command: `rm -rf ${i}` }
    });
}
// User sees 100 dialogs simultaneously, UI becomes unusable
```

## Recommended Fix
```javascript
// server/services/interactionManager.js

const RATE_LIMIT_WINDOW_MS = 60 * 1000;  // 1 minute
const MAX_INTERACTIONS_PER_WINDOW = 20;  // 20 per minute per session

constructor() {
    super();
    // ... existing init
    this.rateLimitWindows = new Map();  // sessionId -> { count, windowStart }
}

async requestInteraction({ type, sessionId, data, metadata = {} }) {
    // Rate limit check
    if (sessionId) {
        const now = Date.now();
        let rateLimit = this.rateLimitWindows.get(sessionId);

        if (!rateLimit || now - rateLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
            // Start new window
            rateLimit = { count: 0, windowStart: now };
            this.rateLimitWindows.set(sessionId, rateLimit);
        }

        if (rateLimit.count >= MAX_INTERACTIONS_PER_WINDOW) {
            const waitTime = RATE_LIMIT_WINDOW_MS - (now - rateLimit.windowStart);
            throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)}s`);
        }

        rateLimit.count++;
    }

    // ... rest of method
}

// Clean up stale rate limit entries
cleanupStaleInteractions() {
    const now = Date.now();

    // Clean rate limit windows
    for (const [sessionId, rateLimit] of this.rateLimitWindows) {
        if (now - rateLimit.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
            this.rateLimitWindows.delete(sessionId);
        }
    }

    // ... existing cleanup
}
```

## Testing
- [ ] Unit test: Rate limit rejects after threshold
- [ ] Unit test: Rate limit resets after window expires
- [ ] Load test: Burst of 100 interactions properly throttled
- [ ] Integration test: User sees rate limit error message

## Estimated Effort
1-2 hours
