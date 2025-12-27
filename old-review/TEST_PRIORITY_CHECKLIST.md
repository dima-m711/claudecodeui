# Test Priority Checklist

**Quick Reference: What to Test First**

This checklist provides a prioritized action plan for implementing tests based on risk, effort, and business impact.

---

## Week 1: Foundation & Critical Security (P0)

### Day 1-2: Test Infrastructure Setup
- [ ] Install Vitest and test dependencies
- [ ] Create `vitest.config.js`
- [ ] Create `tests/setup.js`
- [ ] Configure package.json scripts
- [ ] Verify test runner works with sample test
- [ ] Set up coverage reporting
- [ ] Document test running instructions

**Deliverable:** Working test infrastructure with first passing test

---

### Day 3-4: Authentication Security Tests (CRITICAL)

**File:** `server/middleware/__tests__/auth.test.js`

#### JWT Token Validation (10 tests)
- [ ] Test: Accept valid JWT token
- [ ] Test: Reject expired JWT token
- [ ] Test: Reject malformed JWT token
- [ ] Test: Reject token with invalid signature
- [ ] Test: Reject token for non-existent user
- [ ] Test: Validate token payload structure
- [ ] Test: Hash passwords with bcrypt (saltRounds=12)
- [ ] Test: Never expose password hash in responses
- [ ] Test: Prevent timing attacks on login
- [ ] Test: Validate JWT_SECRET is not default in production

#### Platform Mode Security (5 tests)
- [ ] Test: Bypass JWT when VITE_IS_PLATFORM=true
- [ ] Test: Use first database user in platform mode
- [ ] Test: Fail when no users exist in platform mode
- [ ] Test: CRITICAL - Prevent platform mode in production
- [ ] Test: WebSocket authentication in platform mode

**Deliverable:** 15 passing authentication tests

---

### Day 5: Auth API Tests

**File:** `server/routes/__tests__/auth.test.js`

#### Registration Endpoint (8 tests)
- [ ] Test: Create user with valid credentials
- [ ] Test: Reject weak passwords (<6 chars)
- [ ] Test: Reject short usernames (<3 chars)
- [ ] Test: Prevent race condition on concurrent registration
- [ ] Test: Return JWT token on successful registration
- [ ] Test: Reject duplicate username
- [ ] Test: Enforce single-user system constraint
- [ ] Test: Handle missing required fields

#### Login Endpoint (6 tests)
- [ ] Test: Login with correct credentials
- [ ] Test: Reject incorrect password
- [ ] Test: Reject non-existent username
- [ ] Test: Update last_login timestamp
- [ ] Test: Return valid JWT token
- [ ] Test: Generic error message (don't reveal user existence)

**Deliverable:** 14 passing API tests, 29 total tests

**Milestone:** 🎯 **Authentication security validated**

---

## Week 2: Permission System Security (P0)

### Day 1-3: Permission Manager Tests

**File:** `server/services/__tests__/permissionManager.test.js`

#### Core Functionality (15 tests)
- [ ] Test: Queue permission request
- [ ] Test: Associate request with sessionId
- [ ] Test: Return promise that resolves on approval
- [ ] Test: Respect abort signal
- [ ] Test: Apply risk level based on tool
- [ ] Test: Categorize tools correctly
- [ ] Test: Resolve with ALLOW decision
- [ ] Test: Resolve with DENY decision
- [ ] Test: Handle modified input parameters
- [ ] Test: Return false for non-existent request
- [ ] Test: Remove request from pending queue
- [ ] Test: Track pending count accurately
- [ ] Test: Track resolved/denied counts
- [ ] Test: Isolate permissions by sessionId
- [ ] Test: Clean up permissions on session removal

#### Critical Security Tests (5 tests)
- [ ] Test: CRITICAL - Prevent cross-session permission access
- [ ] Test: CRITICAL - Verify session ownership before operations
- [ ] Test: Validate tool risk levels
- [ ] Test: Handle multiple sessions simultaneously
- [ ] Test: Prevent permission hijacking

**Deliverable:** 20 passing permission manager tests

---

### Day 4-5: WebSocket Handler Tests

**File:** `server/services/__tests__/permissionWebSocketHandler.test.js`

#### Broadcast Security (10 tests)
- [ ] Test: CRITICAL - Should NOT broadcast to ALL clients
- [ ] Test: CRITICAL - Verify session ownership on subscribe
- [ ] Test: Broadcast only to authorized clients
- [ ] Test: Include session context in messages
- [ ] Test: Handle offline clients gracefully
- [ ] Test: Queue messages for disconnected clients
- [ ] Test: Validate response format
- [ ] Test: Verify client authorization
- [ ] Test: Reject responses from wrong client
- [ ] Test: Prevent unauthorized session subscription

#### Replay Attack Protection (5 tests)
- [ ] Test: CRITICAL - Prevent replay attacks
- [ ] Test: Validate nonce uniqueness
- [ ] Test: Enforce timestamp validation
- [ ] Test: Reject expired messages
- [ ] Test: Reject future timestamps

**Deliverable:** 15 passing WebSocket handler tests

**Milestone:** 🎯 **Permission system security validated (64 total tests)**

---

## Week 3: Interaction Manager & WebSocket (P0)

### Day 1-3: Interaction Manager Tests

**File:** `server/services/__tests__/interactionManager.test.js`

#### Core Functionality (15 tests)
- [ ] Test: Create interaction with unique ID
- [ ] Test: Associate with sessionId
- [ ] Test: Enforce MAX_INTERACTIONS_PER_SESSION limit
- [ ] Test: Return promise that resolves on decision
- [ ] Test: Track interaction statistics
- [ ] Test: Emit interaction-request event
- [ ] Test: Handle different interaction types
- [ ] Test: Resolve pending interaction
- [ ] Test: Reject already-resolved interaction
- [ ] Test: Update statistics on resolve/reject
- [ ] Test: Remove from pending queue
- [ ] Test: Emit interaction-resolved event
- [ ] Test: Handle response data correctly
- [ ] Test: Cleanup stale sessions
- [ ] Test: Remove all interactions for session

#### Concurrency Tests (5 tests)
- [ ] Test: Handle concurrent requests safely
- [ ] Test: Prevent race conditions
- [ ] Test: Maintain data consistency
- [ ] Test: Enforce session limits under load
- [ ] Test: Thread-safe statistics updates

**Deliverable:** 20 passing interaction manager tests

---

### Day 4-5: WebSocket Integration Tests

**File:** `server/__tests__/websocket.integration.test.js`

#### Connection & Authentication (8 tests)
- [ ] Test: Authenticate on connection
- [ ] Test: Reject unauthenticated connections
- [ ] Test: Assign unique client ID
- [ ] Test: Track connection in clients map
- [ ] Test: Handle connection timeout
- [ ] Test: Validate token on WebSocket upgrade
- [ ] Test: Support query param token
- [ ] Test: Support Authorization header token

#### Message Routing (8 tests)
- [ ] Test: Route permission-sync-request
- [ ] Test: Route interaction-sync-request
- [ ] Test: Route permission-response
- [ ] Test: Route plan-approval-response
- [ ] Test: Route ask-user-response
- [ ] Test: Reject unknown message types
- [ ] Test: Validate message format
- [ ] Test: Handle malformed JSON

#### Security Tests (6 tests)
- [ ] Test: CRITICAL - Validate session ownership on sync
- [ ] Test: CRITICAL - Prevent cross-user message injection
- [ ] Test: Enforce message size limits
- [ ] Test: Rate limit message frequency
- [ ] Test: Validate sessionId format
- [ ] Test: Reject path traversal in sessionIds

**Deliverable:** 22 passing WebSocket integration tests

**Milestone:** 🎯 **WebSocket communication secured (106 total tests)**

---

## Week 4: Database & Data Integrity (P1)

### Database Operations Tests

**File:** `server/database/__tests__/db.test.js`

#### User Management (10 tests)
- [ ] Test: Create user with hashed password
- [ ] Test: Retrieve user by username
- [ ] Test: Retrieve user by ID
- [ ] Test: Update last_login timestamp
- [ ] Test: Handle duplicate username gracefully
- [ ] Test: Enforce single-user constraint
- [ ] Test: List all users
- [ ] Test: Check if users exist
- [ ] Test: Get first user
- [ ] Test: Password hash is never in SELECT results

#### Transaction Safety (5 tests)
- [ ] Test: Rollback on error
- [ ] Test: Commit on success
- [ ] Test: Handle concurrent transactions
- [ ] Test: Prevent race conditions in user creation
- [ ] Test: ACID properties maintained

#### Schema Management (3 tests)
- [ ] Test: Initialize schema on first run
- [ ] Test: Schema is idempotent
- [ ] Test: Migration handles existing data

**Deliverable:** 18 passing database tests

**Milestone:** 🎯 **Data integrity validated (124 total tests)**

---

## Week 5-6: API Endpoint Coverage (P1)

### Project API Tests

**File:** `server/routes/__tests__/projects.test.js`

#### Project Endpoints (12 tests)
- [ ] Test: GET /api/projects - List all projects
- [ ] Test: GET /api/projects/:id - Get project details
- [ ] Test: GET /api/projects/:id/sessions - List sessions
- [ ] Test: DELETE /api/projects/:id - Delete project
- [ ] Test: Enforce authentication on all routes
- [ ] Test: Validate project ownership
- [ ] Test: Handle non-existent project
- [ ] Test: Handle missing project ID
- [ ] Test: Return proper error codes
- [ ] Test: Pagination for large project lists
- [ ] Test: Filter projects by status
- [ ] Test: Search projects by name

---

### Settings API Tests

**File:** `server/routes/__tests__/settings.test.js`

#### Settings Endpoints (8 tests)
- [ ] Test: GET /api/settings - Get user settings
- [ ] Test: PUT /api/settings - Update settings
- [ ] Test: Validate setting values
- [ ] Test: Reject invalid setting keys
- [ ] Test: Handle missing settings gracefully
- [ ] Test: Merge partial updates
- [ ] Test: Preserve unmodified settings
- [ ] Test: Sanitize input values

---

### MCP API Tests

**File:** `server/routes/__tests__/mcp.test.js`

#### MCP Endpoints (10 tests)
- [ ] Test: GET /api/mcp/servers - List servers
- [ ] Test: POST /api/mcp/servers - Add server
- [ ] Test: PUT /api/mcp/servers/:id - Update config
- [ ] Test: DELETE /api/mcp/servers/:id - Remove server
- [ ] Test: Validate MCP config format
- [ ] Test: Reject malformed server configs
- [ ] Test: Test server connection
- [ ] Test: Handle connection failures
- [ ] Test: Validate environment variables
- [ ] Test: Sanitize server URLs

**Deliverable:** 30 passing API endpoint tests

**Milestone:** 🎯 **API contract validated (154 total tests)**

---

## Week 7-8: Frontend Testing (P2)

### React Context Tests

**File:** `src/contexts/__tests__/PermissionContext.test.jsx`

#### Permission Context (10 tests)
- [ ] Test: Track pending permissions
- [ ] Test: Handle permission responses
- [ ] Test: Sync across tabs via BroadcastChannel
- [ ] Test: Cleanup on unmount
- [ ] Test: Queue permission requests
- [ ] Test: Handle WebSocket disconnect
- [ ] Test: Reconnect and resync state
- [ ] Test: Handle permission timeout
- [ ] Test: Update UI on permission decision
- [ ] Test: Persist permanent permissions to localStorage

---

### Custom Hook Tests

**File:** `src/hooks/__tests__/usePermissions.test.js`

#### usePermissions Hook (8 tests)
- [ ] Test: Subscribe to permission updates
- [ ] Test: Handle approval decisions
- [ ] Test: Sync with server state
- [ ] Test: Cleanup subscriptions on unmount
- [ ] Test: Handle WebSocket reconnection
- [ ] Test: Queue decisions when offline
- [ ] Test: Flush queue on reconnect
- [ ] Test: Handle concurrent permissions

**Deliverable:** 18 passing frontend tests

**Milestone:** 🎯 **Frontend state management tested (172 total tests)**

---

## Week 9-10: E2E Testing (P2)

### User Journey Tests

**File:** `tests/e2e/user-journeys.spec.js`

#### Critical Flows (10 tests)
- [ ] Test: Complete registration and first login flow
- [ ] Test: Create project and start session
- [ ] Test: Permission request approval flow
- [ ] Test: Permission request denial flow
- [ ] Test: Plan approval flow
- [ ] Test: Multi-tab synchronization
- [ ] Test: File upload and processing
- [ ] Test: Git operations flow
- [ ] Test: MCP server configuration
- [ ] Test: Session cleanup and logout

**Deliverable:** 10 passing E2E tests

**Milestone:** 🎯 **User journeys validated (182 total tests)**

---

## Coverage Milestones

### Week 1-2: Foundation
- [ ] Test infrastructure working
- [ ] 40+ tests passing
- [ ] Authentication coverage: 100%
- [ ] Permission manager coverage: 80%

### Week 3-4: Core Services
- [ ] 100+ tests passing
- [ ] Interaction manager coverage: 85%
- [ ] WebSocket handler coverage: 80%
- [ ] Database coverage: 90%

### Week 5-6: API Layer
- [ ] 150+ tests passing
- [ ] API endpoint coverage: 75%
- [ ] Integration test suite complete

### Week 7-8: Frontend
- [ ] 170+ tests passing
- [ ] Context coverage: 80%
- [ ] Hook coverage: 85%
- [ ] Component coverage: 70%

### Week 9-10: E2E & Security
- [ ] 180+ tests passing
- [ ] All security vulnerabilities tested
- [ ] All user journeys covered
- [ ] Overall coverage: 85%+

---

## Security Checklist (MUST COMPLETE)

### Critical Security Tests (from audit findings)

- [ ] Test: Missing session authorization (CWE-862)
- [ ] Test: Broadcast to all connected clients
- [ ] Test: No subscription validation
- [ ] Test: WebSocket authentication bypass (platform mode)
- [ ] Test: No replay attack protection
- [ ] Test: Missing input validation
- [ ] Test: No rate limiting on subscriptions
- [ ] Test: Weak client ID generation
- [ ] Test: No audit logging for security events
- [ ] Test: JWT never expires (security risk)

**All 10 MUST pass before production deployment**

---

## CI/CD Integration Checklist

### GitHub Actions Setup
- [ ] Create `.github/workflows/test.yml`
- [ ] Configure test job
- [ ] Configure coverage upload
- [ ] Set coverage threshold (80%)
- [ ] Configure E2E test job
- [ ] Add test status badge to README

### Pre-commit Hooks
- [ ] Install Husky
- [ ] Create pre-commit hook for tests
- [ ] Create pre-commit hook for security tests
- [ ] Configure commit message linting

### PR Requirements
- [ ] All tests must pass
- [ ] Coverage must not decrease
- [ ] Security tests must pass
- [ ] No console errors/warnings

---

## Quick Commands

```bash
npm test                    # Run all tests
npm run test:coverage       # Check coverage
npm run test:security       # Security tests only
npm run test:watch          # Watch mode
npm run test:ui             # Visual UI

vitest run --reporter=verbose  # Detailed output
vitest run --bail                # Stop on first failure
vitest run --changed             # Only changed files
```

---

## Daily Standup Template

**What did I test yesterday?**
- [ ] List tests written/passing

**What will I test today?**
- [ ] Refer to this checklist

**Any blockers?**
- [ ] Dependencies needed
- [ ] Complex logic needs clarification

---

## Definition of Done

A test suite is considered "done" when:

- ✅ All tests pass consistently
- ✅ Coverage meets threshold (85%+ for critical paths)
- ✅ All security tests pass
- ✅ CI/CD integration complete
- ✅ Documentation updated
- ✅ Code review approved
- ✅ No flaky tests
- ✅ Performance impact acceptable

---

**Last Updated:** 2025-12-27
**Version:** 1.0
**Next Review:** After Week 2 completion
