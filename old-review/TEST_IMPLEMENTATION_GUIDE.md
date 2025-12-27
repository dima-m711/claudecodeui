# Test Implementation Guide

**Quick Start Guide for Adding Tests to Claude Code UI**

This guide provides concrete examples and templates for implementing the test strategy outlined in TEST_EVALUATION_REPORT.md.

---

## Quick Setup (5 minutes)

### 1. Install Test Dependencies

```bash
npm install -D vitest @vitest/ui @vitest/coverage-c8 \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  supertest ws \
  jsdom happy-dom
```

### 2. Create vitest.config.js

```javascript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.js',
        '**/*.spec.js',
        'server/cli.js'
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@server': path.resolve(__dirname, './server')
    }
  }
});
```

### 3. Create tests/setup.js

```javascript
import { expect, afterEach, beforeAll, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import fs from 'fs';
import path from 'path';

beforeAll(() => {
  const testDbPath = path.join(process.cwd(), 'tests', 'test.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  process.env.DATABASE_PATH = testDbPath;
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  const testDbPath = path.join(process.cwd(), 'tests', 'test.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
```

### 4. Update package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch",
    "test:run": "vitest --run",
    "test:security": "vitest --run --grep='Security'"
  }
}
```

---

## Example Test Suites

### Example 1: Authentication Middleware Tests

**File:** `server/middleware/__tests__/auth.test.js`

```javascript
import { describe, test, expect, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticateToken, generateToken, authenticateWebSocket } from '../auth.js';
import { userDb } from '../../database/db.js';

vi.mock('../../database/db.js', () => ({
  userDb: {
    getUserById: vi.fn(),
    getFirstUser: vi.fn()
  }
}));

describe('Authentication Middleware', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  let mockUser;

  beforeEach(() => {
    mockUser = {
      id: 1,
      username: 'testuser',
      password_hash: 'hashed_password',
      created_at: new Date().toISOString()
    };

    vi.clearAllMocks();
    delete process.env.VITE_IS_PLATFORM;
  });

  describe('generateToken()', () => {
    test('should generate valid JWT token with user payload', () => {
      const token = generateToken(mockUser);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.userId).toBe(mockUser.id);
      expect(decoded.username).toBe(mockUser.username);
    });

    test('should generate tokens without expiration', () => {
      const token = generateToken(mockUser);
      const decoded = jwt.verify(token, JWT_SECRET);

      expect(decoded.exp).toBeUndefined();
    });
  });

  describe('authenticateToken()', () => {
    test('should authenticate request with valid token', async () => {
      const token = generateToken(mockUser);
      userDb.getUserById.mockReturnValue(mockUser);

      const req = {
        headers: { authorization: `Bearer ${token}` }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
      expect(userDb.getUserById).toHaveBeenCalledWith(mockUser.id);
    });

    test('should reject request without token', async () => {
      const req = { headers: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied. No token provided.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject request with invalid token', async () => {
      const req = {
        headers: { authorization: 'Bearer invalid_token' }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject token for non-existent user', async () => {
      const token = generateToken(mockUser);
      userDb.getUserById.mockReturnValue(null);

      const req = {
        headers: { authorization: `Bearer ${token}` }
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token. User not found.'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Platform Mode', () => {
    test('should use first database user in platform mode', async () => {
      process.env.VITE_IS_PLATFORM = 'true';
      userDb.getFirstUser.mockReturnValue(mockUser);

      const req = { headers: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual(mockUser);
      expect(userDb.getFirstUser).toHaveBeenCalled();
    });

    test('should fail when no user exists in platform mode', async () => {
      process.env.VITE_IS_PLATFORM = 'true';
      userDb.getFirstUser.mockReturnValue(null);

      const req = { headers: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Platform mode: No user found in database'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('authenticateWebSocket()', () => {
    test('should authenticate WebSocket with valid token', () => {
      const token = generateToken(mockUser);

      const result = authenticateWebSocket(token);

      expect(result).toEqual({
        userId: mockUser.id,
        username: mockUser.username
      });
    });

    test('should return null for invalid WebSocket token', () => {
      const result = authenticateWebSocket('invalid_token');

      expect(result).toBeNull();
    });

    test('should use first user in platform mode for WebSocket', () => {
      process.env.VITE_IS_PLATFORM = 'true';
      userDb.getFirstUser.mockReturnValue(mockUser);

      const result = authenticateWebSocket(null);

      expect(result).toEqual({
        userId: mockUser.id,
        username: mockUser.username
      });
    });
  });
});

describe('Security Tests', () => {
  test('SECURITY: should reject expired tokens', () => {
    const expiredToken = jwt.sign(
      { userId: 1, username: 'test' },
      process.env.JWT_SECRET,
      { expiresIn: '-1h' }
    );

    expect(() => {
      jwt.verify(expiredToken, process.env.JWT_SECRET);
    }).toThrow('jwt expired');
  });

  test('SECURITY: should reject tokens with wrong signature', () => {
    const token = jwt.sign(
      { userId: 1, username: 'test' },
      'wrong-secret'
    );

    expect(() => {
      jwt.verify(token, process.env.JWT_SECRET);
    }).toThrow('invalid signature');
  });
});
```

---

### Example 2: Permission Manager Tests

**File:** `server/services/__tests__/permissionManager.test.js`

```javascript
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { PermissionManager, getPermissionManager, resetPermissionManager } from '../permissionManager.js';
import { PermissionDecision } from '../permissionTypes.js';
import { resetInteractionManager } from '../interactionManager.js';

describe('PermissionManager', () => {
  let permissionManager;

  beforeEach(() => {
    resetPermissionManager();
    resetInteractionManager();
    permissionManager = getPermissionManager();
  });

  afterEach(() => {
    resetPermissionManager();
    resetInteractionManager();
  });

  describe('addRequest()', () => {
    test('should queue permission request and return promise', async () => {
      const requestId = 'test-request-1';
      const toolName = 'Bash';
      const input = { command: 'ls -la' };
      const sessionId = 'session-123';

      const requestPromise = permissionManager.addRequest(
        requestId,
        toolName,
        input,
        sessionId
      );

      expect(requestPromise).toBeInstanceOf(Promise);

      const pendingRequests = permissionManager.getPendingRequests();
      expect(pendingRequests).toHaveLength(1);
      expect(pendingRequests[0].id).toBe(requestId);
      expect(pendingRequests[0].toolName).toBe(toolName);

      permissionManager.resolveRequest(requestId, PermissionDecision.ALLOW);

      const result = await requestPromise;
      expect(result.decision).toBe(PermissionDecision.ALLOW);
    });

    test('should associate request with sessionId', async () => {
      const requestId = 'test-request-2';
      const sessionId = 'session-abc';

      permissionManager.addRequest(
        requestId,
        'Write',
        { file_path: '/test.js', content: 'test' },
        sessionId
      );

      const sessionRequests = permissionManager.getRequestsForSession(sessionId);
      expect(sessionRequests).toHaveLength(1);
      expect(sessionRequests[0].id).toBe(requestId);
    });

    test('should assign risk level based on tool', async () => {
      const requestId = 'test-request-3';

      permissionManager.addRequest(
        requestId,
        'Bash',
        { command: 'rm -rf /' },
        'session-1'
      );

      const requests = permissionManager.getPendingRequests();
      const request = requests.find(r => r.id === requestId);

      expect(request.riskLevel).toBeDefined();
    });

    test('should handle abort signal', async () => {
      const requestId = 'test-request-4';
      const abortController = new AbortController();

      const requestPromise = permissionManager.addRequest(
        requestId,
        'Bash',
        { command: 'sleep 100' },
        'session-1',
        abortController.signal
      );

      abortController.abort();

      permissionManager.resolveRequest(requestId, PermissionDecision.DENY);

      const result = await requestPromise;
      expect(result.decision).toBe(PermissionDecision.DENY);
    });
  });

  describe('resolveRequest()', () => {
    test('should resolve pending request with ALLOW', async () => {
      const requestId = 'test-resolve-1';

      const requestPromise = permissionManager.addRequest(
        requestId,
        'Read',
        { file_path: '/test.txt' },
        'session-1'
      );

      const resolved = permissionManager.resolveRequest(
        requestId,
        PermissionDecision.ALLOW
      );

      expect(resolved).toBe(true);

      const result = await requestPromise;
      expect(result.decision).toBe(PermissionDecision.ALLOW);

      const pendingRequests = permissionManager.getPendingRequests();
      expect(pendingRequests).toHaveLength(0);
    });

    test('should resolve with modified input', async () => {
      const requestId = 'test-resolve-2';
      const originalInput = { command: 'ls -la' };
      const modifiedInput = { command: 'ls -lh' };

      const requestPromise = permissionManager.addRequest(
        requestId,
        'Bash',
        originalInput,
        'session-1'
      );

      permissionManager.resolveRequest(
        requestId,
        PermissionDecision.ALLOW,
        modifiedInput
      );

      const result = await requestPromise;
      expect(result.decision).toBe(PermissionDecision.ALLOW);
      expect(result.updatedInput).toEqual(modifiedInput);
    });

    test('should return false for non-existent request', () => {
      const resolved = permissionManager.resolveRequest(
        'non-existent-id',
        PermissionDecision.ALLOW
      );

      expect(resolved).toBe(false);
    });

    test('should emit permission-resolved event', async () => {
      const requestId = 'test-resolve-3';
      let eventEmitted = false;

      permissionManager.on('permission-resolved', () => {
        eventEmitted = true;
      });

      permissionManager.addRequest(
        requestId,
        'Write',
        { file_path: '/test.js' },
        'session-1'
      );

      permissionManager.resolveRequest(requestId, PermissionDecision.DENY);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(eventEmitted).toBe(false);
    });
  });

  describe('Session Management', () => {
    test('should isolate permissions by sessionId', async () => {
      permissionManager.addRequest('req-1', 'Bash', {}, 'session-A');
      permissionManager.addRequest('req-2', 'Write', {}, 'session-B');
      permissionManager.addRequest('req-3', 'Read', {}, 'session-A');

      const sessionARequests = permissionManager.getRequestsForSession('session-A');
      const sessionBRequests = permissionManager.getRequestsForSession('session-B');

      expect(sessionARequests).toHaveLength(2);
      expect(sessionBRequests).toHaveLength(1);

      expect(sessionARequests.map(r => r.id).sort()).toEqual(['req-1', 'req-3']);
      expect(sessionBRequests[0].id).toBe('req-2');
    });

    test('should remove all permissions on session cleanup', () => {
      const sessionId = 'session-cleanup';

      permissionManager.addRequest('req-1', 'Bash', {}, sessionId);
      permissionManager.addRequest('req-2', 'Write', {}, sessionId);

      expect(permissionManager.getRequestsForSession(sessionId)).toHaveLength(2);

      permissionManager.removeSession(sessionId);

      expect(permissionManager.getRequestsForSession(sessionId)).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    test('should track pending count', () => {
      expect(permissionManager.getPendingCount()).toBe(0);

      permissionManager.addRequest('req-1', 'Bash', {}, 'session-1');
      expect(permissionManager.getPendingCount()).toBe(1);

      permissionManager.addRequest('req-2', 'Write', {}, 'session-1');
      expect(permissionManager.getPendingCount()).toBe(2);

      permissionManager.resolveRequest('req-1', PermissionDecision.ALLOW);
      expect(permissionManager.getPendingCount()).toBe(1);
    });

    test('should provide statistics', () => {
      const stats = permissionManager.getStats();

      expect(stats).toHaveProperty('pendingCount');
      expect(typeof stats.pendingCount).toBe('number');
    });
  });
});

describe('Security Tests', () => {
  let permissionManager;

  beforeEach(() => {
    resetPermissionManager();
    resetInteractionManager();
    permissionManager = getPermissionManager();
  });

  afterEach(() => {
    resetPermissionManager();
    resetInteractionManager();
  });

  test('SECURITY: should prevent cross-session permission access', () => {
    permissionManager.addRequest('req-victim', 'Bash', {}, 'victim-session');

    const attackerRequests = permissionManager.getRequestsForSession('attacker-session');
    expect(attackerRequests).toHaveLength(0);

    const victimRequests = permissionManager.getRequestsForSession('victim-session');
    expect(victimRequests).toHaveLength(1);
  });

  test('SECURITY: should validate tool risk levels', () => {
    permissionManager.addRequest('req-1', 'Bash', { command: 'rm -rf /' }, 'session-1');

    const requests = permissionManager.getPendingRequests();
    expect(requests[0].riskLevel).toBeTruthy();
  });
});
```

---

### Example 3: API Integration Tests

**File:** `server/routes/__tests__/auth.test.js`

```javascript
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRouter from '../auth.js';
import { db, userDb } from '../../database/db.js';

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

describe('Auth API Integration Tests', () => {
  beforeAll(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `);
  });

  beforeEach(() => {
    db.exec('DELETE FROM users');
  });

  afterAll(() => {
    db.exec('DROP TABLE IF EXISTS users');
  });

  describe('POST /auth/register', () => {
    test('should register new user with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe('testuser');
    });

    test('should reject registration with short username', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          username: 'ab',
          password: 'password123'
        })
        .expect(400);

      expect(response.body.error).toContain('at least 3 characters');
    });

    test('should reject registration with weak password', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser',
          password: '12345'
        })
        .expect(400);

      expect(response.body.error).toContain('at least 6 characters');
    });

    test('should prevent duplicate user registration', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser',
          password: 'password123'
        })
        .expect(200);

      const response = await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser2',
          password: 'password123'
        })
        .expect(403);

      expect(response.body.error).toContain('User already exists');
    });

    test('should handle concurrent registration attempts', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/auth/register')
          .send({
            username: `user${i}`,
            password: 'password123'
          })
      );

      const responses = await Promise.allSettled(requests);

      const successful = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 200
      );

      expect(successful).toHaveLength(1);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/auth/register')
        .send({
          username: 'logintest',
          password: 'password123'
        });
    });

    test('should login with correct credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'logintest',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.username).toBe('logintest');
    });

    test('should reject login with incorrect password', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'logintest',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid username or password');
    });

    test('should reject login with non-existent username', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid username or password');
    });
  });

  describe('GET /auth/status', () => {
    test('should return needsSetup=true when no users exist', async () => {
      const response = await request(app)
        .get('/auth/status')
        .expect(200);

      expect(response.body.needsSetup).toBe(true);
    });

    test('should return needsSetup=false when users exist', async () => {
      await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      const response = await request(app)
        .get('/auth/status')
        .expect(200);

      expect(response.body.needsSetup).toBe(false);
    });
  });
});
```

---

## Test Templates

### Template: Service Unit Test

```javascript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { YourService } from '../yourService.js';

describe('YourService', () => {
  let service;

  beforeEach(() => {
    service = new YourService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('methodName()', () => {
    test('should [expected behavior] when [condition]', () => {
      const result = service.methodName(/* args */);
      expect(result).toBe(/* expected */);
    });
  });
});
```

### Template: API Integration Test

```javascript
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index.js';

describe('API /endpoint', () => {
  beforeAll(async () => {
    // Setup
  });

  afterAll(async () => {
    // Cleanup
  });

  test('GET /endpoint - should return expected data', async () => {
    const response = await request(app)
      .get('/endpoint')
      .expect(200);

    expect(response.body).toHaveProperty('data');
  });
});
```

### Template: React Component Test

```javascript
import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { YourComponent } from '../YourComponent.jsx';

describe('YourComponent', () => {
  test('should render correctly', () => {
    render(<YourComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  test('should handle user interaction', async () => {
    render(<YourComponent />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByText('Updated Text')).toBeInTheDocument();
  });
});
```

---

## Running Tests

```bash
npm test                # Run all tests in watch mode
npm run test:run        # Run once
npm run test:coverage   # Generate coverage report
npm run test:ui         # Visual test UI
npm run test:security   # Run only security tests
```

---

## Next Steps

1. Copy test configuration files to project root
2. Run `npm install -D` for test dependencies
3. Create first test file using examples above
4. Run `npm test` to verify setup
5. Add tests gradually, starting with critical paths
6. Monitor coverage with `npm run test:coverage`

---

**Document Version:** 1.0
**Last Updated:** 2025-12-27
