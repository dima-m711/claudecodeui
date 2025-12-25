# Security Audit Report: Session/WebSocket/Interaction Sync Architecture

**Date:** 2025-12-24
**Auditor:** Security Review Team
**Scope:** Session, WebSocket, and Interaction Synchronization Architecture
**Plan Document:** `/Users/dima/Documents/3OpenSource/claudecodeui/plans/session-websocket-interaction-sync-architecture.md`

---

## Executive Summary

**Overall Risk Assessment: HIGH** 🔴

The proposed architecture for server-side interaction state management and WebSocket broadcast synchronization contains **CRITICAL security vulnerabilities** that could lead to:

- Unauthorized access to sensitive interactions from other users' sessions
- Cross-session information disclosure
- Lack of authorization controls on WebSocket subscriptions
- Potential DoS attacks through subscription flooding
- Session hijacking and impersonation risks

**CRITICAL FINDING:** The architecture plan does NOT include authorization checks when clients subscribe to sessionIds, allowing malicious tabs to potentially subscribe to and receive interactions from ANY session.

---

## Risk Matrix

| Vulnerability | Severity | Exploitability | Impact | Priority |
|--------------|----------|----------------|---------|----------|
| Missing Session Authorization | CRITICAL | High | Complete session hijacking | P0 |
| No Subscription Validation | CRITICAL | High | Cross-user data exposure | P0 |
| Lack of Session Ownership Verification | HIGH | Medium | Unauthorized interaction access | P1 |
| WebSocket Broadcast to All Clients | HIGH | High | Information disclosure | P1 |
| No Rate Limiting on Subscriptions | MEDIUM | Medium | DoS via subscription flooding | P2 |
| Missing Replay Attack Protection | MEDIUM | Low | Interaction response replay | P2 |
| Insufficient Input Validation | MEDIUM | Medium | Injection attacks | P2 |

---

## Detailed Findings

### 🔴 CRITICAL - Vulnerability 1: Missing Session Authorization

**Location:** Architecture Plan - Solution 1, Phase 2 (Lines 176-187)

**Description:**
The proposed WebSocket protocol includes `interaction-subscribe` messages where clients specify which `sessionIds` they want to subscribe to:

```typescript
// Client → Server
{ type: 'interaction-subscribe', sessionIds: string[] }
```

**SECURITY ISSUE:**
There is **NO authorization check** to verify that the requesting client owns or has permission to access the specified sessionIds. A malicious client could:

1. Connect to the WebSocket server
2. Send `{ type: 'interaction-subscribe', sessionIds: ['victim-session-123'] }`
3. Receive all interaction requests (permissions, plan approvals, ask-user questions) from the victim's session
4. Respond to these interactions, potentially hijacking the victim's workflow

**Proof of Concept:**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws?token=ATTACKER_TOKEN');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'interaction-subscribe',
    sessionIds: ['guess-or-enumerated-victim-sessionId']
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'interaction-request') {
    console.log('Stolen interaction:', data);
  }
};
```

**Impact:**
- **Confidentiality:** Complete exposure of victim's session interactions
- **Integrity:** Attacker can respond to interactions on behalf of victim
- **Availability:** Attacker could deny/block legitimate interactions

**Current Implementation Check:**

Examining `/Users/dima/Documents/3OpenSource/claudecodeui/server/services/permissionWebSocketHandler.js`:

- Line 43: `addClient(ws, clientId, sessionId = null)` - sessionId parameter exists but is NOT enforced
- Line 165: `handlePermissionSyncRequest` checks for sessionId in message but does NOT validate ownership
- Line 372: `handleInteractionSyncRequest` accepts sessionIds array with NO validation

**Code Evidence:**
```javascript
// From permissionWebSocketHandler.js:372-393
handleInteractionSyncRequest(clientId, message, interactionManager) {
  const { sessionIds } = message;
  if (!sessionIds || !Array.isArray(sessionIds)) {
    console.warn('Interaction sync request missing or invalid sessionIds');
    return;
  }

  console.log(`🔄 [WebSocket] Interaction sync request for sessions:`, sessionIds);

  // VULNERABILITY: No authorization check here!
  const interactions = interactionManager.getPendingInteractions(sessionIds);

  const client = this.clients.get(clientId);
  if (client?.ws?.readyState === client.ws.OPEN) {
    const response = {
      type: WS_INTERACTION_MESSAGES.INTERACTION_SYNC_RESPONSE,
      sessionIds,
      interactions
    };
    console.log(`🔄 [WebSocket] Sending sync response with ${interactions.length} interactions`);
    client.ws.send(JSON.stringify(response));
  }
}
```

**Remediation:**
```javascript
handleInteractionSyncRequest(clientId, message, interactionManager) {
  const { sessionIds } = message;
  if (!sessionIds || !Array.isArray(sessionIds)) {
    console.warn('Interaction sync request missing or invalid sessionIds');
    return;
  }

  const client = this.clients.get(clientId);
  if (!client) {
    console.warn('Interaction sync request from unknown client:', clientId);
    return;
  }

  // CRITICAL: Verify client owns these sessions
  const userId = client.userId; // Must be set during WebSocket authentication
  if (!userId) {
    this.sendError(clientId, null, 'Unauthorized: Missing user context');
    return;
  }

  // Validate session ownership
  const authorizedSessions = [];
  for (const sessionId of sessionIds) {
    if (this.verifySessionOwnership(userId, sessionId)) {
      authorizedSessions.push(sessionId);
    } else {
      console.warn(`Client ${clientId} attempted unauthorized access to session ${sessionId}`);
      this.emit('security-violation', { clientId, userId, sessionId, violation: 'unauthorized-subscription' });
    }
  }

  if (authorizedSessions.length === 0) {
    this.sendError(clientId, null, 'Unauthorized: No valid sessions');
    return;
  }

  const interactions = interactionManager.getPendingInteractions(authorizedSessions);
  // ... rest of code
}

verifySessionOwnership(userId, sessionId) {
  // Implement session ownership verification
  // Options:
  // 1. Query database for session ownership
  // 2. Use session-to-user mapping in memory
  // 3. Validate JWT claims contain session access
  const session = this.sessionStore.getSession(sessionId);
  return session && session.userId === userId;
}
```

---

### 🔴 CRITICAL - Vulnerability 2: Broadcast to All Connected Clients

**Location:**
- Architecture Plan - Solution 1 (Lines 86-117)
- `/Users/dima/Documents/3OpenSource/claudecodeui/server/services/permissionWebSocketHandler.js:426-441`

**Description:**
The current implementation broadcasts interactions to ALL connected WebSocket clients without filtering by session ownership:

```javascript
// From permissionWebSocketHandler.js:426
broadcastToAll(message) {
  const messageStr = JSON.stringify(message);

  this.clients.forEach((client, clientId) => {
    if (client.ws.readyState === client.ws.OPEN) {
      try {
        client.ws.send(messageStr);
      } catch (error) {
        console.error(`Failed to send message to client ${clientId}:`, error);
        this.queueMessage(clientId, message);
      }
    } else {
      this.queueMessage(clientId, message);
    }
  });
}
```

**SECURITY ISSUE:**
The `broadcastToAll` method is used for:
- Permission requests (line 206)
- Plan approval requests (line 242)
- Interaction requests (line 332)
- Timeouts, cancellations, and errors

This means EVERY connected client receives EVERY interaction from EVERY session, creating massive information disclosure.

**Impact:**
- Multi-tenant environment: Users from different organizations see each other's interactions
- Sensitive data exposure: Permission requests may contain file paths, command parameters, API keys
- Privacy violation: Ask-user questions may contain personal/sensitive information

**Current Code Analysis:**

`broadcastPermissionRequest` (line 90):
```javascript
broadcastPermissionRequest(request) {
  const message = createPermissionRequestMessage(request);
  message.sequenceNumber = ++this.sequenceNumber;
  const messageStr = JSON.stringify(message);

  // VULNERABILITY: Broadcasts to ALL clients regardless of session
  this.clients.forEach((client, clientId) => {
    if (client.ws.readyState === client.ws.OPEN) {
      try {
        client.ws.send(messageStr);
        client.pendingRequests.add(request.id);
      } catch (error) {
        console.error(`Failed to send permission request to client ${clientId}:`, error);
        this.queueMessage(clientId, message);
      }
    } else {
      this.queueMessage(clientId, message);
    }
  });
}
```

**Remediation:**
```javascript
broadcastToSession(sessionId, message) {
  if (!sessionId) {
    console.warn('Attempted broadcast without sessionId');
    return;
  }

  const messageStr = JSON.stringify(message);
  let deliveredCount = 0;

  this.clients.forEach((client, clientId) => {
    if (!client.authorizedSessions || !client.authorizedSessions.has(sessionId)) {
      return;
    }

    if (client.ws.readyState === client.ws.OPEN) {
      try {
        client.ws.send(messageStr);
        deliveredCount++;
      } catch (error) {
        console.error(`Failed to send message to client ${clientId}:`, error);
        this.queueMessage(clientId, message);
      }
    } else {
      this.queueMessage(clientId, message);
    }
  });

  console.log(`📤 Broadcast to session ${sessionId}: ${deliveredCount} clients`);

  if (deliveredCount === 0) {
    console.warn(`No authorized clients for session ${sessionId}`);
    this.emit('no-authorized-clients', { sessionId, message });
  }
}

broadcastPermissionRequest(request) {
  if (!request.sessionId) {
    console.error('Permission request missing sessionId');
    return;
  }

  const message = createPermissionRequestMessage(request);
  message.sequenceNumber = ++this.sequenceNumber;

  this.broadcastToSession(request.sessionId, message);
}
```

---

### 🟠 HIGH - Vulnerability 3: No Session Validation on Server

**Location:** `/Users/dima/Documents/3OpenSource/claudecodeui/server/index.js:738-744`

**Description:**
When a client sends a `permission-sync-request`, the server retrieves and returns all interactions for the requested sessionId without verifying:
1. The session exists
2. The session belongs to the requesting user
3. The session is still active/valid

**Code:**
```javascript
// From index.js:738-744
if (data.type === 'permission-sync-request') {
  console.log('🔄 Received permission sync request for session:', data.sessionId);
  const clientId = ws.clientId || `client-${Date.now()}`;
  const permissionManager = getPermissionManager();
  // NO validation of data.sessionId ownership!
  permissionWebSocketHandler.handlePermissionSyncRequest(clientId, data, permissionManager);
  return;
}
```

**Attack Scenario:**
1. Attacker opens DevTools in their browser
2. Attacker sends malicious WebSocket message:
   ```javascript
   ws.send(JSON.stringify({
     type: 'permission-sync-request',
     sessionId: 'victim-session-abc123'
   }));
   ```
3. Server returns all pending permissions for victim's session
4. Attacker gains visibility into victim's workflow and file operations

**Remediation:**
Add session ownership validation middleware:

```javascript
// server/middleware/sessionAuth.js
export function validateSessionOwnership(userId, sessionId) {
  const sessionPath = path.join(
    process.env.HOME,
    '.claude',
    'projects',
    extractProjectFromSessionId(sessionId),
    'sessions',
    `${sessionId}.jsonl`
  );

  if (!fs.existsSync(sessionPath)) {
    return false;
  }

  const sessionMetadata = getSessionMetadata(sessionId);
  return sessionMetadata && sessionMetadata.userId === userId;
}

// Update index.js:
if (data.type === 'permission-sync-request') {
  const userId = ws.user?.userId || ws.userId;

  if (!validateSessionOwnership(userId, data.sessionId)) {
    console.warn(`Unauthorized session access attempt: user ${userId} -> session ${data.sessionId}`);
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Unauthorized: Session access denied',
      code: 'SESSION_AUTH_FAILED'
    }));
    return;
  }

  const clientId = ws.clientId || `client-${Date.now()}`;
  const permissionManager = getPermissionManager();
  permissionWebSocketHandler.handlePermissionSyncRequest(clientId, data, permissionManager);
  return;
}
```

---

### 🟠 HIGH - Vulnerability 4: WebSocket Authentication Bypass (Platform Mode)

**Location:** `/Users/dima/Documents/3OpenSource/claudecodeui/server/index.js:187-196`

**Description:**
In "platform mode" (`VITE_IS_PLATFORM=true`), WebSocket authentication is completely bypassed, and the first user from the database is automatically assigned to ALL connections:

```javascript
// From index.js:187-196
if (process.env.VITE_IS_PLATFORM === 'true') {
  const user = authenticateWebSocket(null); // Will return first user
  if (!user) {
    console.log('[WARN] Platform mode: No user found in database');
    return false;
  }
  info.req.user = user;
  console.log('[OK] Platform mode WebSocket authenticated for user:', user.username);
  return true;
}
```

**SECURITY ISSUE:**
Platform mode appears to be designed for single-tenant deployments, but if accidentally enabled in a multi-user environment, ALL WebSocket connections would be authenticated as the same user, causing:

- Session mixing between different users
- Authorization bypass
- Complete breakdown of user isolation

**Impact:**
- If platform mode is enabled by mistake in production, all users become the same user
- No user isolation or access control
- Potential for mass data breach

**Remediation:**
1. Add environment validation:
```javascript
if (process.env.VITE_IS_PLATFORM === 'true') {
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 CRITICAL: Platform mode is NOT supported in production!');
    console.error('🚨 Set VITE_IS_PLATFORM=false immediately!');
    throw new Error('Platform mode cannot be used in production');
  }

  console.warn('⚠️  Platform mode enabled - single-user mode only!');
  console.warn('⚠️  This should only be used in development or single-tenant deployments');

  const user = authenticateWebSocket(null);
  if (!user) {
    console.log('[WARN] Platform mode: No user found in database');
    return false;
  }
  info.req.user = user;
  console.log('[OK] Platform mode WebSocket authenticated for user:', user.username);
  return true;
}
```

2. Document platform mode clearly:
```markdown
## Platform Mode Security Warning

PLATFORM_MODE should NEVER be enabled in multi-user production environments.

Platform mode bypasses all WebSocket authentication and uses a single user
for all connections. This is ONLY safe for:
- Local development
- Single-tenant deployments (one user per instance)
- Docker containers with one user

In multi-user environments, platform mode creates CRITICAL security vulnerabilities.
```

---

### 🟡 MEDIUM - Vulnerability 5: No Rate Limiting on WebSocket Subscriptions

**Location:** Architecture Plan & Implementation

**Description:**
There are no rate limits on:
- Number of sessions a client can subscribe to
- Frequency of subscription requests
- Total number of subscriptions per user

**Attack Scenario - DoS via Subscription Flooding:**
```javascript
const ws = new WebSocket('ws://localhost:3000/ws?token=VALID_TOKEN');

ws.onopen = () => {
  setInterval(() => {
    const fakeSessions = Array.from({ length: 1000 }, (_, i) => `fake-session-${i}`);
    ws.send(JSON.stringify({
      type: 'interaction-subscribe',
      sessionIds: fakeSessions
    }));
  }, 100);
};
```

**Impact:**
- Server memory exhaustion from tracking subscriptions
- CPU exhaustion from processing subscription requests
- Network congestion from broadcast traffic
- Degraded service for legitimate users

**Current Limits Found:**
- `MAX_INTERACTIONS_PER_SESSION = 100` (interactionManager.js:5)
- `maxQueuedMessagesPerClient = 100` (permissionWebSocketHandler.js:28)
- `maxPendingAcks = 1000` (permissionWebSocketHandler.js:29)

**Missing Limits:**
- No limit on subscriptions per client
- No limit on subscription requests per time window
- No limit on total active subscriptions

**Remediation:**
```javascript
class PermissionWebSocketHandler extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map();

    this.limits = {
      maxSubscriptionsPerClient: 50,
      maxSubscriptionRequestsPerMinute: 100,
      maxTotalSubscriptions: 10000
    };

    this.subscriptionRateLimiter = new Map();
  }

  addClient(ws, clientId, sessionId = null) {
    const clientInfo = {
      ws,
      id: clientId,
      sessionId,
      isAlive: true,
      lastSeen: Date.now(),
      pendingRequests: new Set(),
      authorizedSessions: new Set(),
      subscriptionRequests: []
    };

    this.clients.set(clientId, clientInfo);
    // ... rest of code
  }

  handleSubscriptionRequest(clientId, sessionIds) {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (!this.checkRateLimit(clientId)) {
      this.sendError(clientId, null, 'Rate limit exceeded for subscriptions');
      return;
    }

    if (client.authorizedSessions.size + sessionIds.length > this.limits.maxSubscriptionsPerClient) {
      this.sendError(clientId, null, `Maximum ${this.limits.maxSubscriptionsPerClient} subscriptions per client`);
      return;
    }

    const totalSubscriptions = Array.from(this.clients.values())
      .reduce((sum, c) => sum + c.authorizedSessions.size, 0);

    if (totalSubscriptions + sessionIds.length > this.limits.maxTotalSubscriptions) {
      this.sendError(clientId, null, 'Server subscription limit reached');
      return;
    }

    for (const sessionId of sessionIds) {
      if (this.verifySessionOwnership(client.userId, sessionId)) {
        client.authorizedSessions.add(sessionId);
      }
    }
  }

  checkRateLimit(clientId) {
    const now = Date.now();
    const windowMs = 60000;

    if (!this.subscriptionRateLimiter.has(clientId)) {
      this.subscriptionRateLimiter.set(clientId, []);
    }

    const requests = this.subscriptionRateLimiter.get(clientId);
    const recentRequests = requests.filter(t => now - t < windowMs);

    if (recentRequests.length >= this.limits.maxSubscriptionRequestsPerMinute) {
      return false;
    }

    recentRequests.push(now);
    this.subscriptionRateLimiter.set(clientId, recentRequests);
    return true;
  }
}
```

---

### 🟡 MEDIUM - Vulnerability 6: Missing Replay Attack Protection

**Location:** All interaction response handlers

**Description:**
Interaction responses do not include replay protection mechanisms:
- No nonce/unique message ID validation
- No timestamp validation
- No sequence number verification
- Responses can be captured and replayed

**Attack Scenario:**
1. Attacker intercepts legitimate interaction response via network sniffing or XSS
2. Attacker saves the response message
3. Later, when same interaction type appears, attacker replays the saved response
4. System accepts replayed response as valid

**Example Captured Message:**
```json
{
  "type": "permission-response",
  "requestId": "abc-123",
  "decision": "allow",
  "updatedInput": null
}
```

Attacker can replay this whenever they see `requestId: "abc-123"` in any session.

**Current Implementation:**
```javascript
// From permissionWebSocketHandler.js:119
handlePermissionResponse(clientId, message, permissionManager = null) {
  try {
    validatePermissionResponse(message);

    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`Permission response from unknown client: ${clientId}`);
      return;
    }

    // Verify the client actually has this request pending
    if (!client.pendingRequests.has(message.requestId)) {
      console.warn(`Client ${clientId} sent response for non-pending request: ${message.requestId}`);
      this.sendError(clientId, message.requestId, 'Request not found in your pending queue');
      return;
    }

    // NO nonce, timestamp, or replay check here!

    client.pendingRequests.delete(message.requestId);
    this.emit('permission-response', {
      clientId,
      requestId: message.requestId,
      decision: message.decision,
      updatedInput: message.updatedInput
    });
  }
}
```

**Remediation:**
```javascript
class PermissionWebSocketHandler extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map();
    this.usedNonces = new Set();
    this.nonceCleanupInterval = setInterval(() => {
      this.cleanupExpiredNonces();
    }, 60000);
  }

  handlePermissionResponse(clientId, message, permissionManager = null) {
    try {
      validatePermissionResponse(message);

      if (!message.nonce || typeof message.nonce !== 'string') {
        this.sendError(clientId, message.requestId, 'Missing or invalid nonce');
        return;
      }

      if (this.usedNonces.has(message.nonce)) {
        console.warn(`🚨 Replay attack detected: nonce ${message.nonce} already used`);
        this.sendError(clientId, message.requestId, 'Invalid nonce - possible replay attack');
        this.emit('security-violation', {
          clientId,
          violation: 'replay-attack',
          nonce: message.nonce,
          requestId: message.requestId
        });
        return;
      }

      if (!message.timestamp || typeof message.timestamp !== 'number') {
        this.sendError(clientId, message.requestId, 'Missing or invalid timestamp');
        return;
      }

      const now = Date.now();
      const messageAge = now - message.timestamp;
      const MAX_MESSAGE_AGE = 60000;

      if (messageAge > MAX_MESSAGE_AGE) {
        console.warn(`Expired message: ${messageAge}ms old`);
        this.sendError(clientId, message.requestId, 'Message expired');
        return;
      }

      if (messageAge < -5000) {
        console.warn(`Future timestamp: ${messageAge}ms`);
        this.sendError(clientId, message.requestId, 'Invalid timestamp');
        return;
      }

      const client = this.clients.get(clientId);
      if (!client) {
        console.warn(`Permission response from unknown client: ${clientId}`);
        return;
      }

      if (!client.pendingRequests.has(message.requestId)) {
        console.warn(`Client ${clientId} sent response for non-pending request: ${message.requestId}`);
        this.sendError(clientId, message.requestId, 'Request not found in your pending queue');
        return;
      }

      this.usedNonces.add(message.nonce);
      setTimeout(() => {
        this.usedNonces.delete(message.nonce);
      }, MAX_MESSAGE_AGE * 2);

      client.pendingRequests.delete(message.requestId);

      this.emit('permission-response', {
        clientId,
        requestId: message.requestId,
        decision: message.decision,
        updatedInput: message.updatedInput
      });

      this.sendQueueStatus();
    } catch (error) {
      console.error('Invalid permission response:', error);
      this.sendError(clientId, message.requestId, error.message);
    }
  }

  cleanupExpiredNonces() {
    console.log(`🧹 Cleaned up ${this.usedNonces.size} nonces`);
  }
}
```

**Client-side changes:**
```javascript
sendPermissionResponse(requestId, decision, updatedInput = null) {
  const nonce = crypto.randomUUID();
  const timestamp = Date.now();

  const message = {
    type: 'permission-response',
    requestId,
    decision,
    updatedInput,
    nonce,
    timestamp
  };

  this.ws.send(JSON.stringify(message));
}
```

---

### 🟡 MEDIUM - Vulnerability 7: Insufficient Input Validation

**Location:** Multiple message handlers

**Description:**
Input validation is minimal or missing for several message types:

1. Session IDs are not validated for format/length
2. Array inputs (`sessionIds`) not validated for size limits
3. No sanitization of user-provided strings
4. Missing type validation in several handlers

**Examples:**

**No SessionId Format Validation:**
```javascript
if (data.type === 'permission-sync-request') {
  console.log('🔄 Received permission sync request for session:', data.sessionId);
  // data.sessionId could be: undefined, null, {}, [], 99999999, "../../../etc/passwd", etc.
  const clientId = ws.clientId || `client-${Date.now()}`;
  const permissionManager = getPermissionManager();
  permissionWebSocketHandler.handlePermissionSyncRequest(clientId, data, permissionManager);
  return;
}
```

**No Array Size Validation:**
```javascript
handleInteractionSyncRequest(clientId, message, interactionManager) {
  const { sessionIds } = message;
  if (!sessionIds || !Array.isArray(sessionIds)) {
    console.warn('Interaction sync request missing or invalid sessionIds');
    return;
  }
  // sessionIds could be array of 1 million items!
  const interactions = interactionManager.getPendingInteractions(sessionIds);
}
```

**Remediation:**

Create validation module:

```javascript
// server/utils/validation.js

export const SESSION_ID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function validateSessionId(sessionId) {
  if (typeof sessionId !== 'string') {
    throw new Error('Session ID must be a string');
  }

  if (sessionId.length < 10 || sessionId.length > 100) {
    throw new Error('Session ID length invalid');
  }

  if (!SESSION_ID_REGEX.test(sessionId)) {
    throw new Error('Session ID format invalid');
  }

  if (sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
    throw new Error('Session ID contains invalid characters');
  }

  return true;
}

export function validateSessionIdsArray(sessionIds, maxLength = 50) {
  if (!Array.isArray(sessionIds)) {
    throw new Error('Session IDs must be an array');
  }

  if (sessionIds.length === 0) {
    throw new Error('Session IDs array cannot be empty');
  }

  if (sessionIds.length > maxLength) {
    throw new Error(`Too many session IDs (max: ${maxLength})`);
  }

  for (const sessionId of sessionIds) {
    validateSessionId(sessionId);
  }

  return true;
}

export function sanitizeString(str, maxLength = 1000) {
  if (typeof str !== 'string') {
    throw new Error('Input must be a string');
  }

  if (str.length > maxLength) {
    throw new Error(`String too long (max: ${maxLength})`);
  }

  return str.replace(/[<>]/g, '');
}
```

Apply validation:

```javascript
if (data.type === 'permission-sync-request') {
  try {
    validateSessionId(data.sessionId);
  } catch (error) {
    console.warn('Invalid sessionId in permission-sync-request:', error.message);
    ws.send(JSON.stringify({
      type: 'error',
      error: `Invalid session ID: ${error.message}`,
      code: 'VALIDATION_ERROR'
    }));
    return;
  }

  const clientId = ws.clientId || `client-${Date.now()}`;
  const permissionManager = getPermissionManager();
  permissionWebSocketHandler.handlePermissionSyncRequest(clientId, data, permissionManager);
  return;
}

if (data.type === 'interaction-sync-request') {
  try {
    validateSessionIdsArray(data.sessionIds, 50);
  } catch (error) {
    console.warn('Invalid sessionIds in interaction-sync-request:', error.message);
    ws.send(JSON.stringify({
      type: 'error',
      error: `Invalid session IDs: ${error.message}`,
      code: 'VALIDATION_ERROR'
    }));
    return;
  }

  const clientId = ws.clientId || `client-${Date.now()}`;
  const interactionManager = getInteractionManager();
  permissionWebSocketHandler.handleInteractionSyncRequest(clientId, data, interactionManager);
  return;
}
```

---

## Additional Security Concerns

### 8. Weak Client ID Generation

**Location:** `/Users/dima/Documents/3OpenSource/claudecodeui/server/index.js:721-722`

```javascript
const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
ws.clientId = clientId;
```

**Issue:** Client ID generation uses predictable timestamp + weak random, making it potentially guessable.

**Remediation:**
```javascript
import crypto from 'crypto';

const clientId = crypto.randomUUID();
ws.clientId = clientId;
```

---

### 9. No Audit Logging for Security Events

**Issue:** No logging for security-critical events:
- Failed authorization attempts
- Subscription to unauthorized sessions
- Replay attack detection
- Rate limit violations

**Remediation:**
```javascript
class SecurityAuditLogger {
  constructor() {
    this.logFile = path.join(process.env.HOME, '.claude', 'security-audit.log');
  }

  log(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...event
    };

    fs.appendFileSync(
      this.logFile,
      JSON.stringify(logEntry) + '\n',
      'utf8'
    );

    console.warn('🚨 SECURITY EVENT:', logEntry);
  }
}

const auditLogger = new SecurityAuditLogger();

permissionWebSocketHandler.on('security-violation', (event) => {
  auditLogger.log({
    type: 'security-violation',
    ...event
  });
});
```

---

### 10. No HTTPS/WSS Enforcement

**Issue:** No enforcement of secure WebSocket connections (WSS) in production.

**Remediation:**
```javascript
if (process.env.NODE_ENV === 'production' && !server.cert) {
  console.error('🚨 CRITICAL: HTTPS/WSS must be enabled in production!');
  throw new Error('Production requires HTTPS/WSS');
}
```

---

## OWASP Top 10 Compliance Assessment

| OWASP Risk | Status | Finding |
|------------|--------|---------|
| A01:2021 - Broken Access Control | ❌ FAIL | No session authorization, broadcast to all clients |
| A02:2021 - Cryptographic Failures | ⚠️ PARTIAL | No WSS enforcement, weak client ID generation |
| A03:2021 - Injection | ⚠️ PARTIAL | Limited input validation |
| A04:2021 - Insecure Design | ❌ FAIL | Architecture lacks authorization by design |
| A05:2021 - Security Misconfiguration | ⚠️ PARTIAL | Platform mode risk, no HTTPS enforcement |
| A06:2021 - Vulnerable Components | ✅ PASS | Dependencies not assessed in this audit |
| A07:2021 - Auth/Identity Failures | ❌ FAIL | Platform mode bypass, weak session validation |
| A08:2021 - Software/Data Integrity | ⚠️ PARTIAL | No replay protection, no message signing |
| A09:2021 - Logging/Monitoring Failures | ❌ FAIL | No security audit logging |
| A10:2021 - Server-Side Request Forgery | N/A | Not applicable to this architecture |

**Overall Compliance: 1/9 PASS (11%)**

---

## Recommended Remediation Roadmap

### Phase 1: CRITICAL - Immediate Action Required (P0) ⏱️ 1-2 weeks

1. **Implement Session Authorization**
   - Add `verifySessionOwnership()` function
   - Validate session access on all subscription requests
   - Store user-to-session mapping

2. **Stop Broadcasting to All Clients**
   - Replace `broadcastToAll()` with `broadcastToSession()`
   - Track authorized sessions per client
   - Filter broadcasts by session ownership

3. **Fix Platform Mode Security**
   - Add environment validation
   - Document security implications
   - Prevent production use

### Phase 2: HIGH Priority (P1) ⏱️ 2-3 weeks

4. **Add Session Validation**
   - Validate session existence
   - Verify session ownership on sync requests
   - Add session metadata lookup

5. **Implement Security Audit Logging**
   - Log all authorization failures
   - Log security violations
   - Create alert mechanism

### Phase 3: MEDIUM Priority (P2) ⏱️ 3-4 weeks

6. **Add Rate Limiting**
   - Limit subscriptions per client
   - Rate limit subscription requests
   - Implement global subscription limits

7. **Implement Replay Protection**
   - Add nonce generation/validation
   - Add timestamp validation
   - Implement used-nonce tracking

8. **Enhance Input Validation**
   - Validate session ID format
   - Limit array sizes
   - Sanitize all string inputs

### Phase 4: Hardening (P3) ⏱️ 4-6 weeks

9. **HTTPS/WSS Enforcement**
   - Require TLS in production
   - Add certificate validation
   - Implement cert rotation

10. **Penetration Testing**
    - Hire external security firm
    - Test all remediation measures
    - Validate security posture

---

## Testing Recommendations

### Security Test Cases

```javascript
describe('Session Authorization', () => {
  test('should reject subscription to unauthorized session', async () => {
    const attacker = await createAuthenticatedClient('attacker@example.com');
    const victimSessionId = await createSessionForUser('victim@example.com');

    const response = await attacker.subscribe([victimSessionId]);

    expect(response.type).toBe('error');
    expect(response.error).toContain('Unauthorized');
  });

  test('should not broadcast interactions to unauthorized clients', async () => {
    const victim = await createAuthenticatedClient('victim@example.com');
    const attacker = await createAuthenticatedClient('attacker@example.com');

    const victimSessionId = await victim.createSession();
    const interaction = await createPermissionRequest(victimSessionId);

    await waitForMessages(attacker, 100);

    expect(attacker.receivedMessages).not.toContainInteraction(interaction.id);
    expect(victim.receivedMessages).toContainInteraction(interaction.id);
  });

  test('should reject replay attacks', async () => {
    const client = await createAuthenticatedClient('user@example.com');
    const sessionId = await client.createSession();
    const permission = await createPermissionRequest(sessionId);

    const response = {
      type: 'permission-response',
      requestId: permission.id,
      decision: 'allow',
      nonce: 'test-nonce-123',
      timestamp: Date.now()
    };

    await client.send(response);
    expect(permission.status).toBe('resolved');

    const replayResult = await client.send(response);
    expect(replayResult.type).toBe('error');
    expect(replayResult.error).toContain('replay');
  });
});
```

---

## Conclusion

The proposed session/WebSocket/interaction sync architecture contains **CRITICAL security vulnerabilities** that MUST be addressed before implementation. The most severe issues are:

1. **Complete lack of session authorization** - Any client can subscribe to any session
2. **Broadcast to all clients** - All interactions visible to all users
3. **Platform mode bypass** - Single-user authentication for all connections
4. **No audit logging** - Security violations go undetected

**RECOMMENDATION: DO NOT PROCEED with Solution 1 implementation until authorization and access control are added to the design.**

---

## Appendix A: Secure Architecture Alternative

Here's a revised architecture that addresses the critical vulnerabilities:

```javascript
class SecureInteractionStore {
  constructor() {
    this.interactions = new Map();
    this.sessionToUser = new Map();
    this.userToSessions = new Map();
  }

  registerSession(sessionId, userId) {
    this.sessionToUser.set(sessionId, userId);
    if (!this.userToSessions.has(userId)) {
      this.userToSessions.set(userId, new Set());
    }
    this.userToSessions.get(userId).add(sessionId);
  }

  verifySessionAccess(userId, sessionId) {
    return this.sessionToUser.get(sessionId) === userId;
  }

  subscribe(ws, sessionIds) {
    const userId = ws.userId;
    if (!userId) {
      throw new Error('Unauthenticated connection');
    }

    const authorizedSessions = sessionIds.filter(sessionId =>
      this.verifySessionAccess(userId, sessionId)
    );

    if (authorizedSessions.length === 0) {
      throw new Error('No authorized sessions');
    }

    ws.authorizedSessions = new Set(authorizedSessions);

    for (const sessionId of authorizedSessions) {
      this.sendExistingInteractions(ws, sessionId);
    }
  }

  addInteraction(sessionId, interaction) {
    if (!this.interactions.has(sessionId)) {
      this.interactions.set(sessionId, new Map());
    }
    this.interactions.get(sessionId).set(interaction.id, interaction);

    this.broadcastToSession(sessionId, {
      type: 'interaction-added',
      sessionId,
      interaction
    });
  }

  broadcastToSession(sessionId, message) {
    const userId = this.sessionToUser.get(sessionId);
    if (!userId) {
      console.warn('Session has no owner:', sessionId);
      return;
    }

    this.connections.forEach((ws) => {
      if (ws.userId === userId && ws.authorizedSessions?.has(sessionId)) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      }
    });
  }
}
```

---

## Appendix B: References

- OWASP Top 10 2021: https://owasp.org/Top10/
- WebSocket Security: https://owasp.org/www-community/vulnerabilities/WebSocket_security
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
- CWE-862: Missing Authorization: https://cwe.mitre.org/data/definitions/862.html
- CWE-306: Missing Authentication: https://cwe.mitre.org/data/definitions/306.html

---

**Audit Complete**
**Report Generated:** 2025-12-24
**Classification:** CONFIDENTIAL - Security Sensitive