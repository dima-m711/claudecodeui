# P1: Missing Session Validation in Interaction Resolution

---
status: ready
priority: p1
issue_id: "002"
tags: [security, authorization, data-integrity, race-condition]
dependencies: []
---

**Status**: ready
**Priority**: P1 (Critical - Blocks Merge)
**Issue ID**: 002
**Tags**: security, authorization, data-integrity, race-condition

## Problem Statement

The `resolveInteraction` method in `server/services/interactionManager.js:85-121` does not verify that the responding client owns the session associated with the interaction. Any client with knowledge of an interaction ID can resolve it, enabling cross-session attacks.

**Evidence**:
```javascript
resolveInteraction(interactionId, response) {
  const interaction = this.pendingInteractions.get(interactionId);
  if (!interaction) {
    console.warn(`⚠️  No pending interaction found: ${interactionId}`);
    return;
  }
  // NO SESSION VALIDATION HERE!
  interaction.resolve(response);
  this.pendingInteractions.delete(interactionId);
}
```

**Risk Level**: CRITICAL
- Enables unauthorized permission grants
- Allows plan approval hijacking
- Violates session isolation guarantees
- No defense against interaction ID enumeration

## Findings from Agents

**Security Sentinel (Agent af22acf)**:
> "resolveInteraction lacks session ownership validation. Any WebSocket client can resolve any interaction by guessing/intercepting the interaction ID."

**Data Integrity Guardian (Agent addd421)**:
> "Race condition exists where multiple resolve() calls can be made before pendingInteractions.delete() executes. This allows double-resolution attacks."

**Architecture Strategist (Agent aaa1b5c)**:
> "The interaction resolution flow has no authorization layer. The InteractionManager trusts all callers implicitly, violating the zero-trust principle."

## Proposed Solutions

### Option 1: Add Session Validation in resolveInteraction (Recommended)
**Implementation**:
```javascript
resolveInteraction(interactionId, response, requestingSessionId) {
  const interaction = this.pendingInteractions.get(interactionId);
  if (!interaction) {
    console.warn(`⚠️  No pending interaction found: ${interactionId}`);
    return { success: false, error: 'INTERACTION_NOT_FOUND' };
  }

  // SECURITY: Validate session ownership
  if (interaction.sessionId !== requestingSessionId) {
    console.error(`🚨 Session mismatch: ${requestingSessionId} tried to resolve ${interactionId} owned by ${interaction.sessionId}`);
    return { success: false, error: 'SESSION_MISMATCH' };
  }

  // RACE CONDITION FIX: Remove before resolving
  this.pendingInteractions.delete(interactionId);

  interaction.resolve(response);
  return { success: true };
}
```

**Pros**:
- Prevents cross-session attacks
- Fixes race condition (delete-before-resolve)
- Minimal changes to existing code
- Returns error for audit logging

**Cons**:
- Requires sessionId parameter in all callers
- Breaking change to method signature

**Effort**: ~30 LOC + 10 callsite updates
**Risk**: Low (compile-time errors guide migration)

### Option 2: Validate at WebSocket Handler Level
**Implementation**:
```javascript
// In server/index.js WebSocket handler
ws.on('message', async (message) => {
  const data = JSON.parse(message);

  if (data.type === 'interaction-response') {
    const client = connectedClients.get(ws.clientId);
    if (!client || !client.sessionId) {
      ws.send(JSON.stringify({ error: 'NO_SESSION' }));
      return;
    }

    // Validate interaction belongs to this session
    const interaction = interactionManager.pendingInteractions.get(data.interactionId);
    if (interaction && interaction.sessionId !== client.sessionId) {
      ws.send(JSON.stringify({ error: 'SESSION_MISMATCH' }));
      return;
    }

    interactionManager.resolveInteraction(data.interactionId, data.response);
  }
});
```

**Pros**:
- Validation at entry point
- No changes to InteractionManager API
- Easier to add rate limiting

**Cons**:
- Violates separation of concerns
- Harder to test in isolation
- Duplicates logic if multiple entry points exist

**Effort**: ~40 LOC in WebSocket handler
**Risk**: Medium (harder to test thoroughly)

### Option 3: Add Authorization Middleware
**Implementation**:
```javascript
class InteractionAuthorizationMiddleware {
  authorize(interaction, requestingSessionId, requestingClientId) {
    if (interaction.sessionId !== requestingSessionId) {
      throw new UnauthorizedError('SESSION_MISMATCH');
    }
    // Future: Add role-based checks, rate limiting, etc.
  }
}
```

**Pros**:
- Extensible for future requirements
- Clear separation of concerns
- Easy to add audit logging

**Cons**:
- Over-engineering for current needs
- More files to maintain

**Effort**: ~80 LOC
**Risk**: Medium (architectural change)

## Technical Details

**Affected Files**:
- `server/services/interactionManager.js:85-121` - resolveInteraction method
- `server/index.js:750-822` - WebSocket message handler
- `src/hooks/useInteractions.js:45-67` - Frontend response sender

**Related Findings**:
- #001: Predictable client IDs (makes enumeration easier)
- #003: Race condition in resolve/reject
- #004: No input validation on WebSocket messages

**Attack Scenario**:
1. Attacker connects to WebSocket endpoint
2. Observes interaction IDs in network traffic (or enumerates UUIDs)
3. Sends `interaction-response` message with victim's interaction ID
4. Gains unauthorized permission approval or plan acceptance

## Acceptance Criteria

- [ ] resolveInteraction validates sessionId parameter
- [ ] Returns error object with type and message on validation failure
- [ ] Unit test: Rejects cross-session resolution attempts
- [ ] Integration test: WebSocket handler passes correct sessionId
- [ ] Audit log entry created for all failed authorization attempts
- [ ] No breaking changes to frontend interaction flow

**Estimated LOC**: 30-40 (Option 1), 80-100 (Option 3)
**Estimated Effort**: 4 hours (Option 1), 1 day (Option 3)

## Work Log

### 2025-12-27 - Approved for Work
**By:** Claude Triage System
**Actions:**
- Issue approved during triage session
- Status changed from pending → ready
- Ready to be picked up and worked on

**Learnings:**
- Critical authorization vulnerability allowing cross-session attacks
- Recommended: Add session validation in resolveInteraction (Option 1)
- Related to issue #001 (predictable client IDs) and #003 (race conditions)
