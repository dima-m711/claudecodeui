# Unified Interaction System: Backend → Frontend Communication

**Status**: Design Proposal
**Created**: 2025-12-01
**Type**: Architecture / Enhancement
**Complexity**: Medium-High
**Estimated Effort**: 5-7 days

## Vision

Create a **single, generalized system** for all backend-to-frontend interactions that require user decisions:
- **Tool permissions** (existing: "Can I run this Bash command?")
- **Plan approvals** (existing modal, converting to inline)
- **User questions** (AskUserQuestion tool - future)
- **Other interactive prompts** (extensible for future needs)

## Problem Statement

Currently, each interaction type has its own separate implementation:

| Interaction Type | Backend Manager | Frontend Context | WebSocket Messages | Storage | UI Component |
|-----------------|-----------------|------------------|-------------------|---------|-------------|
| **Permissions** | PermissionManager | PermissionContext | `permission-request/response` | sessionStorage | PermissionInlineDialog |
| **Plans** | PlanApprovalManager | PlanApprovalContext | `plan-request/response` | None (modal only) | PlanApprovalDialog |
| **AskUser** | None yet | None yet | None yet | None yet | None yet |

**Problems**:
- Code duplication across managers, contexts, and UI
- Inconsistent patterns (permissions use inline, plans use modal)
- Hard to add new interaction types (would need to copy-paste entire stack)
- Storage logic duplicated
- WebSocket message handling duplicated

## Proposed Solution: Unified Interaction Architecture

### Core Concept

All interactions follow the same pattern:
1. **Backend** needs user input → creates interaction request
2. **Manager** queues request, emits event, returns Promise
3. **WebSocket** sends request to frontend
4. **Frontend Context** receives, stores in sessionStorage, displays
5. **User** responds via inline UI component
6. **Frontend** sends response back via WebSocket
7. **Manager** resolves Promise, backend continues

**Unify this pattern** so adding new interaction types is just configuration, not code duplication.

---

## Architecture Design

### Layer 1: Backend - Unified Interaction Manager

**File**: `server/services/interactionManager.js` (NEW)

**Purpose**: Single manager for ALL interaction types

```javascript
class InteractionManager extends EventEmitter {
  constructor() {
    super();
    this.pendingInteractions = new Map(); // All interaction types
    this.interactionsBySession = new Map(); // For session filtering
    this.statistics = new Map(); // Per-type stats
  }

  /**
   * Generic interaction request
   * @param {Object} interaction - Interaction configuration
   * @param {string} interaction.type - 'permission' | 'plan-approval' | 'ask-user' | custom
   * @param {string} interaction.sessionId - Session identifier
   * @param {Object} interaction.data - Type-specific data
   * @param {Object} interaction.metadata - Optional metadata (risk level, timeout, etc)
   * @returns {Promise} Resolves with user's response
   */
  async requestInteraction({ type, sessionId, data, metadata = {} }) {
    const interactionId = crypto.randomUUID();
    const timestamp = Date.now();
    const timeout = metadata.timeout || PERMISSION_TIMEOUT_MS;
    const expiresAt = timestamp + timeout;

    return new Promise((resolve, reject) => {
      const interaction = {
        id: interactionId,
        type,
        sessionId,
        data,
        metadata,
        status: 'pending',
        requestedAt: timestamp,
        expiresAt,
        decidedAt: null,
        response: null,
        resolve,
        reject,
        timeoutHandle: null
      };

      // Set timeout
      interaction.timeoutHandle = setTimeout(() => {
        this.handleTimeout(interactionId);
      }, timeout);

      // Store
      this.pendingInteractions.set(interactionId, interaction);

      // Track by session
      if (!this.interactionsBySession.has(sessionId)) {
        this.interactionsBySession.set(sessionId, new Set());
      }
      this.interactionsBySession.get(sessionId).add(interactionId);

      // Update stats
      if (!this.statistics.has(type)) {
        this.statistics.set(type, { total: 0, approved: 0, rejected: 0, timedOut: 0 });
      }
      this.statistics.get(type).total++;

      // Emit event (WebSocket layer listens)
      this.emit('interaction-request', {
        id: interactionId,
        type,
        sessionId,
        data,
        metadata,
        requestedAt: timestamp,
        expiresAt
      });
    });
  }

  /**
   * Resolve interaction with user's response
   */
  resolveInteraction(interactionId, response) {
    const interaction = this.pendingInteractions.get(interactionId);
    if (!interaction || interaction.status !== 'pending') {
      return { success: false, error: 'invalid_or_decided' };
    }

    clearTimeout(interaction.timeoutHandle);

    interaction.status = 'resolved';
    interaction.response = response;
    interaction.decidedAt = Date.now();

    this.statistics.get(interaction.type).approved++;

    interaction.resolve(response);
    this.pendingInteractions.delete(interactionId);

    return { success: true };
  }

  /**
   * Reject interaction
   */
  rejectInteraction(interactionId, reason = 'User rejected') {
    const interaction = this.pendingInteractions.get(interactionId);
    if (!interaction || interaction.status !== 'pending') {
      return { success: false, error: 'invalid_or_decided' };
    }

    clearTimeout(interaction.timeoutHandle);

    interaction.status = 'rejected';
    interaction.decidedAt = Date.now();

    this.statistics.get(interaction.type).rejected++;

    interaction.reject(new Error(reason));
    this.pendingInteractions.delete(interactionId);

    return { success: true };
  }

  /**
   * Get pending interactions for session(s)
   */
  getPendingInteractions(sessionIds, type = null) {
    const results = [];

    for (const sessionId of sessionIds) {
      const requestIds = this.interactionsBySession.get(sessionId);
      if (!requestIds) continue;

      for (const id of requestIds) {
        const interaction = this.pendingInteractions.get(id);
        if (!interaction || interaction.status !== 'pending') continue;
        if (type && interaction.type !== type) continue;

        results.push({
          id: interaction.id,
          type: interaction.type,
          sessionId: interaction.sessionId,
          data: interaction.data,
          metadata: interaction.metadata,
          requestedAt: interaction.requestedAt,
          expiresAt: interaction.expiresAt
        });
      }
    }

    return results;
  }
}
```

**Key Benefits**:
- Single manager for all interaction types
- Consistent Promise-based API
- Unified timeout and session tracking
- Statistics per interaction type
- Easy to add new interaction types (just pass different `type` string)

---

### Layer 2: Backend - Type-Specific Adapters

Keep existing managers as **thin adapters** over InteractionManager:

**File**: `server/services/permissionManager.js` (REFACTOR)

```javascript
import { getInteractionManager } from './interactionManager.js';

export class PermissionManager {
  constructor() {
    this.interactionManager = getInteractionManager();
    this.sessionPermissions = new Map(); // Session-level cache
  }

  async addRequest(id, toolName, input, sessionId, abortSignal) {
    // Check session cache first
    const cacheKey = this.getSessionCacheKey(toolName, input);
    const cached = this.getSessionPermission(sessionId, cacheKey);
    if (cached) {
      return createSdkPermissionResult(cached);
    }

    // Delegate to InteractionManager
    const response = await this.interactionManager.requestInteraction({
      type: 'permission',
      sessionId,
      data: {
        requestId: id,
        toolName,
        input,
        riskLevel: TOOL_RISK_LEVELS[toolName],
        category: TOOL_CATEGORIES[toolName]
      },
      metadata: {
        timeout: PERMISSION_TIMEOUT_MS,
        abortSignal
      }
    });

    // Cache session permissions
    if (response.decision === 'allow-session') {
      this.setSessionPermission(sessionId, cacheKey, response.decision);
    }

    return createSdkPermissionResult(response.decision, response.updatedInput);
  }
}
```

**File**: `server/services/planApprovalManager.js` (REFACTOR)

```javascript
import { getInteractionManager } from './interactionManager.js';

export class PlanApprovalManager {
  constructor() {
    this.interactionManager = getInteractionManager();
  }

  async requestPlanApproval(planContent, sessionId) {
    // Delegate to InteractionManager
    const response = await this.interactionManager.requestInteraction({
      type: 'plan-approval',
      sessionId,
      data: {
        planData: planContent
      },
      metadata: {
        timeout: PERMISSION_TIMEOUT_MS
      }
    });

    return {
      approved: true,
      permissionMode: response.permissionMode
    };
  }

  getPendingApprovals(sessionIds) {
    return this.interactionManager.getPendingInteractions(sessionIds, 'plan-approval');
  }
}
```

**Benefits**:
- Existing API surfaces stay the same (no breaking changes)
- Business logic stays in specific managers (caching, risk assessment, etc.)
- Core queue/timeout/session logic unified

---

### Layer 3: Backend - Unified WebSocket Message Types

**File**: `server/services/interactionTypes.js` (NEW)

```javascript
export const InteractionType = {
  PERMISSION: 'permission',
  PLAN_APPROVAL: 'plan-approval',
  ASK_USER: 'ask-user',
  // Easy to extend
};

export const WS_INTERACTION_MESSAGES = {
  // Generic messages (work for all types)
  INTERACTION_REQUEST: 'interaction-request',
  INTERACTION_RESPONSE: 'interaction-response',
  INTERACTION_SYNC_REQUEST: 'interaction-sync-request',
  INTERACTION_SYNC_RESPONSE: 'interaction-sync-response',
  INTERACTION_TIMEOUT: 'interaction-timeout',
  INTERACTION_ERROR: 'interaction-error',

  // Backward compatibility (map to generic)
  PERMISSION_REQUEST: 'interaction-request', // type: 'permission'
  PERMISSION_RESPONSE: 'interaction-response', // type: 'permission'
  PLAN_APPROVAL_REQUEST: 'interaction-request', // type: 'plan-approval'
  PLAN_APPROVAL_RESPONSE: 'interaction-response', // type: 'plan-approval'
};

// Generic message creators
export function createInteractionRequestMessage(interaction) {
  return {
    type: WS_INTERACTION_MESSAGES.INTERACTION_REQUEST,
    interactionType: interaction.type,
    id: interaction.id,
    sessionId: interaction.sessionId,
    data: interaction.data,
    metadata: interaction.metadata,
    requestedAt: interaction.requestedAt,
    expiresAt: interaction.expiresAt
  };
}

export function createInteractionResponseMessage(interactionId, response) {
  return {
    type: WS_INTERACTION_MESSAGES.INTERACTION_RESPONSE,
    interactionId,
    response,
    timestamp: Date.now()
  };
}
```

**WebSocket Handler** (in `server/routes/websocket.js` or equivalent):

```javascript
// Listen to InteractionManager events
interactionManager.on('interaction-request', (interaction) => {
  const message = createInteractionRequestMessage(interaction);
  ws.send(JSON.stringify(message));
});

// Handle responses
ws.on('message', (data) => {
  const message = JSON.parse(data);

  if (message.type === 'interaction-response') {
    interactionManager.resolveInteraction(message.interactionId, message.response);
  }

  if (message.type === 'interaction-sync-request') {
    const pending = interactionManager.getPendingInteractions(message.sessionIds);
    ws.send(JSON.stringify({
      type: 'interaction-sync-response',
      interactions: pending
    }));
  }
});
```

---

### Layer 4: Frontend - Unified Interaction Context

**File**: `src/contexts/InteractionContext.jsx` (NEW)

```javascript
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getInteractions,
  saveInteraction,
  removeInteraction,
  updateInteractionStatus
} from '../utils/interactionStorage';

const InteractionContext = createContext();

export function InteractionProvider({ children, currentSessionId }) {
  const [pendingInteractions, setPendingInteractions] = useState(new Map());
  const [interactionHistory, setInteractionHistory] = useState([]);

  // Load from sessionStorage on mount
  useEffect(() => {
    if (!currentSessionId) return;
    const stored = getInteractions(currentSessionId);
    setPendingInteractions(new Map(stored.map(i => [i.id, i])));
  }, [currentSessionId]);

  // Handle WebSocket messages
  useEffect(() => {
    const handleInteractionRequest = (message) => {
      if (message.sessionId !== currentSessionId) return;

      const interaction = {
        id: message.id,
        type: message.interactionType,
        sessionId: message.sessionId,
        data: message.data,
        metadata: message.metadata,
        status: 'pending',
        requestedAt: message.requestedAt,
        expiresAt: message.expiresAt,
        decidedAt: null,
        response: null
      };

      // Save to storage
      saveInteraction(currentSessionId, interaction);

      // Update state
      setPendingInteractions(prev => new Map(prev).set(interaction.id, interaction));
    };

    // Subscribe to WebSocket
    wsClient.addMessageListener('interaction-request', handleInteractionRequest);

    return () => {
      wsClient.removeMessageListener('interaction-request', handleInteractionRequest);
    };
  }, [currentSessionId]);

  // Handle user response
  const respondToInteraction = useCallback((interactionId, response) => {
    const interaction = pendingInteractions.get(interactionId);
    if (!interaction) return;

    // Update local state
    interaction.status = 'resolved';
    interaction.response = response;
    interaction.decidedAt = Date.now();

    // Save to storage
    updateInteractionStatus(currentSessionId, interactionId, 'resolved', response);

    // Send to backend
    wsClient.send({
      type: 'interaction-response',
      interactionId,
      response
    });

    // Remove from pending
    setPendingInteractions(prev => {
      const next = new Map(prev);
      next.delete(interactionId);
      return next;
    });

    // Add to history
    setInteractionHistory(prev => [...prev, interaction]);
  }, [pendingInteractions, currentSessionId]);

  // Sync on reconnect
  const syncInteractions = useCallback(() => {
    wsClient.send({
      type: 'interaction-sync-request',
      sessionIds: [currentSessionId]
    });
  }, [currentSessionId]);

  const value = {
    pendingInteractions,
    interactionHistory,
    respondToInteraction,
    syncInteractions
  };

  return (
    <InteractionContext.Provider value={value}>
      {children}
    </InteractionContext.Provider>
  );
}

export function useInteractions() {
  const context = useContext(InteractionContext);
  if (!context) {
    throw new Error('useInteractions must be used within InteractionProvider');
  }
  return context;
}

// Type-specific hooks (convenience)
export function usePendingPermissions() {
  const { pendingInteractions } = useInteractions();
  return Array.from(pendingInteractions.values())
    .filter(i => i.type === 'permission');
}

export function usePendingPlans() {
  const { pendingInteractions } = useInteractions();
  return Array.from(pendingInteractions.values())
    .filter(i => i.type === 'plan-approval');
}

export function usePendingQuestions() {
  const { pendingInteractions } = useInteractions();
  return Array.from(pendingInteractions.values())
    .filter(i => i.type === 'ask-user');
}
```

---

### Layer 5: Frontend - Unified Storage

**File**: `src/utils/interactionStorage.js` (NEW)

```javascript
const STORAGE_PREFIX = 'claude-ui:interactions:';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get all interactions for a session
 */
export function getInteractions(sessionId) {
  const key = `${STORAGE_PREFIX}${sessionId}`;
  try {
    const stored = sessionStorage.getItem(key);
    if (!stored) return [];

    const data = JSON.parse(stored);
    if (!data.interactions) return [];

    // Filter expired
    const now = Date.now();
    return data.interactions.filter(i => {
      return (now - i.requestedAt) < TTL_MS;
    });
  } catch (error) {
    console.warn('Failed to load interactions:', error);
    return [];
  }
}

/**
 * Save interaction
 */
export function saveInteraction(sessionId, interaction) {
  const key = `${STORAGE_PREFIX}${sessionId}`;
  try {
    const existing = getInteractions(sessionId);
    const updated = [
      ...existing.filter(i => i.id !== interaction.id),
      interaction
    ];

    sessionStorage.setItem(key, JSON.stringify({
      sessionId,
      interactions: updated,
      lastUpdated: Date.now()
    }));
  } catch (error) {
    console.warn('Failed to save interaction:', error);
  }
}

/**
 * Remove interaction
 */
export function removeInteraction(sessionId, interactionId) {
  const key = `${STORAGE_PREFIX}${sessionId}`;
  try {
    const existing = getInteractions(sessionId);
    const filtered = existing.filter(i => i.id !== interactionId);

    if (filtered.length === 0) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify({
        sessionId,
        interactions: filtered,
        lastUpdated: Date.now()
      }));
    }
  } catch (error) {
    console.warn('Failed to remove interaction:', error);
  }
}

/**
 * Update interaction status
 */
export function updateInteractionStatus(sessionId, interactionId, status, response = null) {
  const existing = getInteractions(sessionId);
  const interaction = existing.find(i => i.id === interactionId);
  if (!interaction) return;

  interaction.status = status;
  if (response) interaction.response = response;
  interaction.decidedAt = Date.now();

  saveInteraction(sessionId, interaction);
}
```

---

### Layer 6: Frontend - Unified Inline Component

**File**: `src/components/InteractionInlineMessage.jsx` (NEW)

```javascript
import { useInteractions } from '../contexts/InteractionContext';
import { PermissionDetails } from './interactions/PermissionDetails';
import { PlanApprovalDetails } from './interactions/PlanApprovalDetails';
import { AskUserDetails } from './interactions/AskUserDetails';

export function InteractionInlineMessage({ sessionId }) {
  const { pendingInteractions, respondToInteraction } = useInteractions();

  // Get first pending interaction for this session
  const activeInteraction = Array.from(pendingInteractions.values())
    .filter(i => i.sessionId === sessionId && i.status === 'pending')
    .sort((a, b) => a.requestedAt - b.requestedAt)[0];

  if (!activeInteraction) return null;

  const pendingCount = Array.from(pendingInteractions.values())
    .filter(i => i.sessionId === sessionId && i.status === 'pending')
    .length;

  // Render type-specific content
  const renderContent = () => {
    switch (activeInteraction.type) {
      case 'permission':
        return (
          <PermissionDetails
            interaction={activeInteraction}
            onRespond={respondToInteraction}
          />
        );

      case 'plan-approval':
        return (
          <PlanApprovalDetails
            interaction={activeInteraction}
            onRespond={respondToInteraction}
          />
        );

      case 'ask-user':
        return (
          <AskUserDetails
            interaction={activeInteraction}
            onRespond={respondToInteraction}
          />
        );

      default:
        return <div>Unknown interaction type: {activeInteraction.type}</div>;
    }
  };

  return (
    <div className="mx-4 mb-4 rounded-lg border-2 p-4 bg-white dark:bg-gray-800">
      {/* Queue indicator */}
      {pendingCount > 1 && (
        <div className="mb-2 text-xs text-gray-500">
          +{pendingCount - 1} more pending
        </div>
      )}

      {/* Type-specific content */}
      {renderContent()}
    </div>
  );
}
```

**Type-Specific Detail Components**:

```javascript
// src/components/interactions/PermissionDetails.jsx
export function PermissionDetails({ interaction, onRespond }) {
  const { data } = interaction;

  return (
    <>
      <h3 className="font-semibold">🔐 Permission Required</h3>
      <p className="text-sm">{data.toolName}: {data.summary}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onRespond(interaction.id, { decision: 'allow' })}>
          Allow
        </button>
        <button onClick={() => onRespond(interaction.id, { decision: 'deny' })}>
          Deny
        </button>
        <button onClick={() => onRespond(interaction.id, { decision: 'allow-session' })}>
          Allow Session
        </button>
      </div>
    </>
  );
}

// src/components/interactions/PlanApprovalDetails.jsx
export function PlanApprovalDetails({ interaction, onRespond }) {
  const { data } = interaction;

  return (
    <>
      <h3 className="font-semibold">📋 Plan Approval Required</h3>
      <p className="text-sm">{data.planData.title}</p>
      <p className="text-xs text-gray-600">{data.planData.description}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onRespond(interaction.id, {
          decision: 'approve',
          permissionMode: 'auto'
        })}>
          Approve & Auto-Execute
        </button>
        <button onClick={() => onRespond(interaction.id, {
          decision: 'approve',
          permissionMode: 'manual'
        })}>
          Approve & Manual
        </button>
        <button onClick={() => onRespond(interaction.id, { decision: 'reject' })}>
          Reject
        </button>
      </div>
    </>
  );
}

// src/components/interactions/AskUserDetails.jsx (future)
export function AskUserDetails({ interaction, onRespond }) {
  const { data } = interaction;
  const [answer, setAnswer] = useState('');

  return (
    <>
      <h3 className="font-semibold">❓ Question</h3>
      <p className="text-sm">{data.question}</p>
      <input
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        className="mt-2 w-full border rounded px-2 py-1"
      />
      <div className="mt-3 flex gap-2">
        <button onClick={() => onRespond(interaction.id, { answer })}>
          Submit
        </button>
      </div>
    </>
  );
}
```

---

## Migration Strategy

### Phase 1: Create Unified Backend (2 days)

- [ ] Create `InteractionManager` class
- [ ] Add WebSocket message types
- [ ] Refactor `PermissionManager` to use `InteractionManager`
- [ ] Refactor `PlanApprovalManager` to use `InteractionManager`
- [ ] Update WebSocket handlers
- [ ] Test backward compatibility

### Phase 2: Create Unified Frontend (2 days)

- [ ] Create `InteractionContext`
- [ ] Create `interactionStorage.js` utilities
- [ ] Create `InteractionInlineMessage` component
- [ ] Create type-specific detail components
- [ ] Test with permissions (existing functionality)

### Phase 3: Migrate Plan Approvals (1-2 days)

- [ ] Update `PlanApprovalContext` to use `InteractionContext`
- [ ] Replace modal with inline message
- [ ] Add sessionStorage persistence
- [ ] Test plan approval flow end-to-end

### Phase 4: Cleanup & Documentation (1 day)

- [ ] Remove old duplicate code
- [ ] Document interaction system
- [ ] Add examples for future interaction types
- [ ] Performance testing

---

## Benefits of Unified System

### For Development

✅ **Single point of maintenance** - Bug fixes apply to all interaction types
✅ **Consistent patterns** - Same storage, WebSocket, UI patterns everywhere
✅ **Easy extensibility** - Adding new interaction type is just configuration
✅ **Better testing** - Test interaction system once, not per type
✅ **Less code** - Eliminate ~60% duplication

### For Users

✅ **Consistent UX** - All interactions use same inline message pattern
✅ **Reliable persistence** - All interactions survive refresh
✅ **Clear queue management** - See all pending interactions in one place
✅ **Multi-session support** - Works consistently across sessions

### For Future Features

Easy to add:
- **AskUserQuestion** tool (Claude asks user for clarification)
- **ConfirmAction** prompts (confirm destructive operations)
- **FileConflictResolution** (merge conflict UI)
- **BreakpointDebugging** (interactive debugging)
- **Custom plugins** (third-party interaction types)

---

## Success Criteria

### Functional

- [ ] Permissions work identically through unified system
- [ ] Plan approvals work as inline messages with storage
- [ ] Multi-session support works for both types
- [ ] WebSocket sync restores all interaction types
- [ ] sessionStorage persists across refresh

### Code Quality

- [ ] < 400 LOC for unified backend manager
- [ ] < 300 LOC for unified frontend context
- [ ] < 200 LOC for unified storage
- [ ] Zero duplication between interaction types
- [ ] 80%+ test coverage

### Performance

- [ ] No regression in permission response time
- [ ] Storage operations < 16ms
- [ ] Component renders optimized (React.memo)
- [ ] Queue management handles 20+ pending interactions

---

## Open Questions

1. **Naming**: "Interaction" vs "Request" vs "Prompt"?
2. **Metadata extensibility**: What fields do all interaction types need?
3. **Response validation**: How to validate type-specific responses?
4. **Priority/ordering**: Should some interaction types have priority?
5. **Notification strategy**: How to alert user of new interactions?

---

## Comparison: Current vs Unified

### Lines of Code

| Component | Current (Separate) | Unified | Reduction |
|-----------|-------------------|---------|-----------|
| Backend Manager | 200 + 200 = 400 | 350 | -12% |
| Frontend Context | 280 + 112 = 392 | 300 | -23% |
| Storage | 104 + 0 = 104 | 100 | -4% |
| WebSocket | 150 + 50 = 200 | 100 | -50% |
| UI Components | 212 + 100 = 312 | 250 | -20% |
| **TOTAL** | **1408 LOC** | **1100 LOC** | **-22%** |

### Maintenance Burden

| Aspect | Current | Unified |
|--------|---------|---------|
| Add new interaction type | ~400 LOC (full stack) | ~50 LOC (detail component) |
| Fix storage bug | Fix in 2 places | Fix in 1 place |
| Update WebSocket protocol | Update 2 message types | Update 1 message type |
| Test new feature | Write 3 test suites | Write 1 test suite |

---

## Next Steps

1. **Review this design** - Discuss with team
2. **Prototype InteractionManager** - Validate backend design
3. **Prototype InteractionContext** - Validate frontend design
4. **Run DHH/Kieran/Simplicity reviews** - Get feedback
5. **Begin Phase 1 implementation** - Start with backend

---

**Ready for review and discussion.**
