# P2: Excessive Console Logging in Production

---
status: ready
priority: p2
issue_id: "013"
tags: [logging, performance, production, operations]
dependencies: []
---

**Status**: ready
**Priority**: P2 (Important - Production Readiness)
**Issue ID**: 013
**Tags**: logging, performance, production, operations

## Problem Statement

The codebase uses excessive `console.log` statements for debugging (75+ occurrences), causing performance degradation in production and making it difficult to identify real issues.

**Evidence**:
```bash
$ grep -r "console.log" server/ src/ | wc -l
78

# Examples:
server/services/interactionManager.js:15:    console.log(`📋 New interaction: ${type} (${interactionId})`);
server/services/interactionManager.js:42:    console.log(`🔄 Session ${sessionId} has ${interactions.size} pending`);
server/index.js:725:    console.log(`📡 New WebSocket connection: ${clientId}`);
src/contexts/InteractionContext.jsx:88:    console.log('📤 Broadcasting interaction-added:', interaction.id);
```

**Risk Level**: MEDIUM
- Production logs flooded with debug messages
- Difficulty finding errors in production
- Minor performance impact (string formatting overhead)
- Potential data leaks in logs (user input, session IDs)

## Findings from Agents

**Pattern Recognition Specialist (Agent a374b62)**:
> "The codebase has 78 console.log statements, many with emoji prefixes (📋, 🔄, 📡). This indicates debug logging left in production code. Console logging is synchronous and can block the event loop in high-throughput scenarios."

**Security Sentinel (Agent af22acf)**:
> "Console logs may leak sensitive data. Several logs include interaction IDs, session IDs, and tool inputs which could contain credentials or API keys."

## Proposed Solutions

### Option 1: Structured Logging with Winston (Recommended)
**Implementation**:
```javascript
// server/utils/logger.js
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'claude-ui' },
  transports: [
    // Write errors to error.log
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // Write all logs to combined.log
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Console output in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;

// Replace console.log with logger
// Before:
console.log(`📋 New interaction: ${type} (${interactionId})`);

// After:
logger.info('New interaction created', {
  type,
  interactionId,
  sessionId
});
```

**Pros**:
- Structured logs (JSON format)
- Log levels (debug, info, warn, error)
- Automatic log rotation
- Queryable by log aggregators (ELK, Datadog)
- Async logging (non-blocking)

**Cons**:
- Requires winston dependency
- Requires refactoring all console.log calls

**Effort**: 100 LOC + 78 replacements
**Risk**: Low

### Option 2: Custom Logger Wrapper (Lightweight)
**Implementation**:
```javascript
// server/utils/logger.js
export const logger = {
  debug: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[DEBUG]', new Date().toISOString(), ...args);
    }
  },
  info: (...args) => {
    console.log('[INFO]', new Date().toISOString(), ...args);
  },
  warn: (...args) => {
    console.warn('[WARN]', new Date().toISOString(), ...args);
  },
  error: (...args) => {
    console.error('[ERROR]', new Date().toISOString(), ...args);
  }
};

// Replace console.log
// Before:
console.log(`📋 New interaction: ${type}`);

// After:
logger.debug(`New interaction: ${type}`);
```

**Pros**:
- No dependencies
- Easy migration (find/replace)
- Debug logs disabled in production

**Cons**:
- Still synchronous
- No structured logging
- Manual log rotation

**Effort**: 30 LOC + 78 replacements
**Risk**: Very Low

### Option 3: Remove Non-Essential Logs
**Implementation**:
```javascript
// Remove all debug logs (📋, 🔄, 📡 emoji prefix)
// Keep only error/warn logs

// Remove:
console.log(`📋 New interaction: ${type}`);
console.log(`🔄 Session ${sessionId} has ${interactions.size} pending`);

// Keep:
console.error('Failed to resolve interaction:', error);
console.warn('WebSocket connection timeout');
```

**Pros**:
- Minimal effort
- No dependencies
- Cleaner production logs

**Cons**:
- Loses valuable debugging information
- Harder to diagnose issues in production

**Effort**: Remove ~60 logs manually
**Risk**: Low

## Technical Details

**Affected Files** (78 console.log locations):
- `server/services/interactionManager.js` - 18 logs
- `server/index.js` - 24 logs
- `server/claude-sdk.js` - 12 logs
- `src/contexts/InteractionContext.jsx` - 10 logs
- `src/hooks/useInteractions.js` - 8 logs
- `src/utils/interactionBroadcast.js` - 6 logs

**Log Levels Mapping**:
```
Current                           → New Level
console.log('📋 New interaction') → logger.debug()
console.log('✅ Resolved')         → logger.info()
console.warn('⚠️  Not found')      → logger.warn()
console.error('🚨 Failed')         → logger.error()
```

**Performance Impact**:
- Console.log is synchronous and blocks event loop
- String concatenation/template literals happen even if log is suppressed
- Winston's async transport prevents blocking

**Example Structured Log**:
```json
{
  "level": "info",
  "message": "Interaction resolved",
  "timestamp": "2025-12-27T10:30:15.123Z",
  "service": "claude-ui",
  "interactionId": "abc-123",
  "sessionId": "xyz-789",
  "duration": 245
}
```

## Acceptance Criteria

- [ ] All console.log replaced with structured logger
- [ ] Debug logs disabled in production (LOG_LEVEL=info)
- [ ] Error logs include stack traces
- [ ] Log rotation configured (daily, 10 file max)
- [ ] No sensitive data in logs (sanitize tool inputs)
- [ ] Performance: <1ms overhead per log call

**Estimated LOC**: 100 (Option 1), 30 (Option 2), 0 (Option 3 - just deletions)
**Estimated Effort**: 6 hours (Option 1), 3 hours (Option 2), 1 hour (Option 3)

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
