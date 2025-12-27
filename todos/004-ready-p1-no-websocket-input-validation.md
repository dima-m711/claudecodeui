# P1: Missing Input Validation on WebSocket Messages

---
status: ready
priority: p1
issue_id: "004"
tags: [security, input-validation, websocket, OWASP]
dependencies: []
---

**Status**: ready
**Priority**: P1 (Critical - Blocks Merge)
**Issue ID**: 004
**Tags**: security, input-validation, websocket, OWASP

## Problem Statement

The WebSocket message handler in `server/index.js:750-822` directly parses and trusts all incoming JSON messages without validation, sanitization, or size limits. This creates multiple attack vectors for malicious payloads.

**Evidence**:
```javascript
ws.on('message', async (message) => {
  try {
    const data = JSON.parse(message); // ⚠️ NO SIZE LIMIT

    // ⚠️ NO SCHEMA VALIDATION
    if (data.type === 'interaction-response') {
      interactionManager.resolveInteraction(
        data.interactionId,  // ⚠️ NO TYPE CHECK
        data.response        // ⚠️ NO SANITIZATION
      );
    }
  } catch (error) {
    console.error('WebSocket message error:', error);
  }
});
```

**Risk Level**: CRITICAL
- Enables JSON injection attacks
- No protection against resource exhaustion (large messages)
- Violates OWASP A03:2021 - Injection
- Bypasses all backend validation layers

## Findings from Agents

**Security Sentinel (Agent af22acf)**:
> "WebSocket message handling has zero input validation. An attacker can send arbitrarily large JSON payloads, prototype pollution vectors, or malformed data to crash the server or corrupt interaction state."

**Architecture Strategist (Agent aaa1b5c)**:
> "The lack of a validation layer before JSON.parse() violates defense-in-depth principles. Modern WebSocket servers should implement message size limits, rate limiting, and schema validation."

**Data Integrity Guardian (Agent addd421)**:
> "The response field in interaction-response messages is directly passed to resolveInteraction() without type checking. If the SDK expects an object but receives a string, the tool execution may fail silently."

## Proposed Solutions

### Option 1: Add Zod Schema Validation (Recommended)
**Implementation**:
```javascript
import { z } from 'zod';

// Define schemas
const InteractionResponseSchema = z.object({
  type: z.literal('interaction-response'),
  interactionId: z.string().uuid(),
  response: z.record(z.unknown()) // Flexible but typed
});

const SessionUpdateSchema = z.object({
  type: z.literal('session-update'),
  sessionId: z.string().uuid(),
  status: z.enum(['active', 'inactive'])
});

const WebSocketMessageSchema = z.discriminatedUnion('type', [
  InteractionResponseSchema,
  SessionUpdateSchema
]);

// In WebSocket handler
ws.on('message', async (messageBuffer) => {
  // SIZE LIMIT: 1MB
  if (messageBuffer.length > 1024 * 1024) {
    ws.send(JSON.stringify({ error: 'MESSAGE_TOO_LARGE' }));
    return;
  }

  try {
    const messageStr = messageBuffer.toString('utf8');
    const rawData = JSON.parse(messageStr);

    // VALIDATION: Schema check
    const validationResult = WebSocketMessageSchema.safeParse(rawData);
    if (!validationResult.success) {
      console.error('Invalid WebSocket message:', validationResult.error);
      ws.send(JSON.stringify({
        error: 'INVALID_MESSAGE',
        details: validationResult.error.flatten()
      }));
      return;
    }

    const data = validationResult.data;

    // SAFE: Now we have typed, validated data
    if (data.type === 'interaction-response') {
      const client = connectedClients.get(ws.clientId);
      interactionManager.resolveInteraction(
        data.interactionId,
        data.response
      );
    }
  } catch (error) {
    console.error('WebSocket message error:', error);
    ws.send(JSON.stringify({ error: 'INVALID_JSON' }));
  }
});
```

**Pros**:
- Type-safe validation with runtime checks
- Auto-generates TypeScript types
- Excellent error messages for debugging
- Industry-standard library (widely used)
- Prevents prototype pollution

**Cons**:
- Adds `zod` dependency (~14KB)
- Requires schema maintenance

**Effort**: 80 LOC + schemas
**Risk**: Low (Zod is battle-tested)

### Option 2: Manual Validation with JSON Schema
**Implementation**:
```javascript
import Ajv from 'ajv';

const ajv = new Ajv();

const interactionResponseSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'interaction-response' },
    interactionId: { type: 'string', format: 'uuid' },
    response: { type: 'object' }
  },
  required: ['type', 'interactionId', 'response'],
  additionalProperties: false
};

const validate = ajv.compile(interactionResponseSchema);

ws.on('message', async (messageBuffer) => {
  if (messageBuffer.length > 1024 * 1024) {
    return ws.send(JSON.stringify({ error: 'MESSAGE_TOO_LARGE' }));
  }

  try {
    const data = JSON.parse(messageBuffer.toString());

    if (!validate(data)) {
      console.error('Validation errors:', validate.errors);
      return ws.send(JSON.stringify({ error: 'INVALID_MESSAGE' }));
    }

    // Validated data
    handleInteractionResponse(data);
  } catch (error) {
    ws.send(JSON.stringify({ error: 'INVALID_JSON' }));
  }
});
```

**Pros**:
- JSON Schema is a standard
- AJV is very fast (~3x faster than Zod)
- Can use existing JSON Schema documentation

**Cons**:
- Less developer-friendly than Zod
- Error messages harder to parse
- No TypeScript type generation

**Effort**: 100 LOC + schemas
**Risk**: Low

### Option 3: Lightweight Custom Validation
**Implementation**:
```javascript
function validateInteractionResponse(data) {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Message must be an object');
  }

  if (data.type !== 'interaction-response') {
    throw new Error('Invalid message type');
  }

  if (typeof data.interactionId !== 'string' || !data.interactionId) {
    throw new Error('interactionId must be a non-empty string');
  }

  if (!data.interactionId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
    throw new Error('interactionId must be a valid UUID');
  }

  if (typeof data.response !== 'object' || data.response === null) {
    throw new Error('response must be an object');
  }

  return true;
}

ws.on('message', async (messageBuffer) => {
  if (messageBuffer.length > 1024 * 1024) {
    return ws.send(JSON.stringify({ error: 'MESSAGE_TOO_LARGE' }));
  }

  try {
    const data = JSON.parse(messageBuffer.toString());
    validateInteractionResponse(data);
    handleInteractionResponse(data);
  } catch (error) {
    ws.send(JSON.stringify({ error: error.message }));
  }
});
```

**Pros**:
- No dependencies
- Full control over validation logic
- Easy to debug

**Cons**:
- Verbose and repetitive
- Easy to miss edge cases
- No type safety
- Requires manual updates for schema changes

**Effort**: 60 LOC
**Risk**: Medium (more likely to have bugs)

## Technical Details

**Affected Files**:
- `server/index.js:750-822` - Main WebSocket message handler
- `server/services/interactionTypes.js` - Should define message schemas
- `src/hooks/useInteractions.js:45-67` - Frontend message sender (needs matching validation)

**Related Findings**:
- #001: Predictable client IDs (injection can be combined with hijacking)
- #002: Missing session validation (injection bypasses authorization)
- #006: XSS vulnerability (unsanitized response shown in UI)

**Attack Vectors**:

1. **Resource Exhaustion**:
```javascript
ws.send(JSON.stringify({
  type: 'interaction-response',
  interactionId: 'valid-uuid',
  response: { data: 'x'.repeat(100 * 1024 * 1024) } // 100MB string
}));
```

2. **Prototype Pollution**:
```javascript
ws.send(JSON.stringify({
  type: 'interaction-response',
  interactionId: 'valid-uuid',
  response: { __proto__: { isAdmin: true } }
}));
```

3. **Type Confusion**:
```javascript
ws.send(JSON.stringify({
  type: 'interaction-response',
  interactionId: ['not', 'a', 'string'],
  response: 'not an object'
}));
```

## Acceptance Criteria

- [ ] All WebSocket messages validated against schema before processing
- [ ] Message size limit enforced (1MB default, configurable)
- [ ] Invalid messages rejected with clear error response
- [ ] Prototype pollution prevention verified with unit test
- [ ] Rate limiting consideration (future enhancement)
- [ ] Frontend receives schema validation errors for debugging
- [ ] Performance: <1ms validation overhead per message

**Estimated LOC**: 80-100 (Option 1), 100-120 (Option 2), 60 (Option 3)
**Estimated Effort**: 6 hours (Option 1 with testing), 8 hours (Option 2), 4 hours (Option 3)

## Work Log

### 2025-12-27 - Approved for Work
**By:** Claude Triage System
**Actions:**
- Issue approved during triage session
- Status changed from pending → ready
- Ready to be picked up and worked on

**Learnings:**
- Critical security vulnerability enabling multiple attack vectors
- Recommended: Zod schema validation with 1MB size limit (Option 1)
- Related to issue #001 (predictable IDs) and #002 (session validation)
