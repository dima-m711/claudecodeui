# P1: Predictable Client ID Generation Enables Session Hijacking

---
status: ready
priority: p1
issue_id: "001"
tags: [security, websocket, authentication, OWASP]
dependencies: []
---

**Status**: ready
**Priority**: P1 (Critical - Blocks Merge)
**Issue ID**: 001
**Tags**: security, websocket, authentication, OWASP

## Problem Statement

The WebSocket client ID generation in `server/index.js:718` uses a predictable pattern combining `Date.now()` and `Math.random()`, making it trivial for attackers to enumerate and hijack active sessions.

**Evidence**:
```javascript
const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

**Risk Level**: CRITICAL
- Enables unauthorized access to Claude SDK sessions
- Allows interaction response spoofing
- Violates OWASP A01:2021 - Broken Access Control
- No cryptographic randomness for security-sensitive identifiers

## Findings from Agents

**Security Sentinel (Agent af22acf)**:
> "Client IDs generated using Date.now() + Math.random() are predictable. An attacker can enumerate possible IDs and hijack WebSocket connections, gaining unauthorized access to Claude SDK sessions and interaction responses."

**Data Integrity Guardian (Agent addd421)**:
> "WebSocket message handling at server/index.js:750-822 lacks session validation. Any client with a valid interaction ID can resolve it, regardless of session ownership."

## Proposed Solutions

### Option 1: Use crypto.randomUUID() (Recommended)
**Implementation**:
```javascript
import { randomUUID } from 'crypto';
const clientId = `client-${randomUUID()}`;
```

**Pros**:
- Cryptographically secure (RFC 4122 UUID v4)
- Built-in Node.js, no dependencies
- Industry standard for session tokens

**Cons**:
- Slightly longer IDs (36 chars vs ~20 chars)
- Migration requires client ID regeneration

**Effort**: 1 line change + testing
**Risk**: Low (backward compatible with string keys)

### Option 2: crypto.randomBytes() with base64
**Implementation**:
```javascript
import { randomBytes } from 'crypto';
const clientId = `client-${randomBytes(16).toString('base64url')}`;
```

**Pros**:
- Configurable length
- URL-safe encoding
- High entropy (128 bits)

**Cons**:
- More complex than UUID
- Less standard format

**Effort**: 2 lines + testing
**Risk**: Low

### Option 3: Add authentication layer (Complete Solution)
**Implementation**:
- Require JWT token in WebSocket handshake
- Validate token before accepting connection
- Bind session IDs to authenticated users

**Pros**:
- Addresses root cause (no authentication)
- Enables proper authorization
- Prevents all hijacking vectors

**Cons**:
- Requires authentication system implementation
- Higher complexity (~200 LOC)
- Requires frontend changes

**Effort**: 2-3 days
**Risk**: Medium (architectural change)

## Technical Details

**Affected Files**:
- `server/index.js:718` - Client ID generation
- `server/index.js:750-822` - WebSocket message handler (needs validation)
- `server/services/interactionManager.js:85-121` - Resolve method (needs session check)

**Related Findings**:
- #002: Missing session validation in resolveInteraction
- #005: Missing CSRF protection on WebSocket upgrade

**Attack Vector**:
1. Attacker observes network traffic or timing patterns
2. Generates candidate client IDs using timestamp ranges
3. Sends spoofed interaction-response messages
4. Gains control of Claude SDK session permissions

## Acceptance Criteria

- [ ] Client IDs generated using crypto.randomUUID() or crypto.randomBytes()
- [ ] Add unit test verifying ID unpredictability (collision test with 10k IDs)
- [ ] Add integration test for session isolation
- [ ] Document ID format in API specification
- [ ] No existing sessions broken after deployment

**Estimated LOC**: 1-5 (Option 1), 150-250 (Option 3)
**Estimated Effort**: 2 hours (Option 1), 2-3 days (Option 3)

## Work Log

### 2025-12-27 - Approved for Work
**By:** Claude Triage System
**Actions:**
- Issue approved during triage session
- Status changed from pending → ready
- Ready to be picked up and worked on

**Learnings:**
- Critical security vulnerability requiring immediate attention
- Simple fix with crypto.randomUUID() recommended (Option 1)
- Related to issues #002 (session validation) and #005 (CSRF protection)
