---
id: "034"
title: "Predictable client IDs using Math.random"
priority: P1
category: security
status: pending
created: 2024-12-27
source: pr-review
files:
  - server/index.js
---

# Predictable Client IDs Using Math.random

## Problem
Client IDs are generated using `Date.now()` and `Math.random()`, which are not cryptographically secure and could be predicted or collided, potentially allowing client impersonation.

## Location
- `server/index.js:720` - Client ID generation

## Risk
- **Severity**: HIGH (P1)
- **Impact**: Client ID collision, potential impersonation
- **Attack Vector**: Predict client ID to hijack permissions

## Root Cause
```javascript
// server/index.js:720
const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
// ❌ Date.now() is predictable (milliseconds)
// ❌ Math.random() is not cryptographically secure
```

## Collision Probability
- `Date.now()` provides ~1000 unique values per second
- `Math.random().toString(36).substr(2, 9)` provides ~10^14 combinations
- In high-traffic scenarios, collisions become possible
- `Math.random()` can be predicted in some JS engines

## Recommended Fix
```javascript
// server/index.js
import crypto from 'crypto';

// In handleChatConnection:
const clientId = `client-${crypto.randomUUID()}`;
// ✅ Cryptographically secure
// ✅ 128-bit random, collision probability negligible
```

## Alternative (if UUID not desired)
```javascript
const clientId = `client-${crypto.randomBytes(16).toString('hex')}`;
```

## Testing
- [ ] Unit test: Client IDs are unique across 10,000 generations
- [ ] Verify no collision in load test with 1000 concurrent connections

## Estimated Effort
15 minutes
