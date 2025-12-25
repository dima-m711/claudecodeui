# Pattern Analysis Report: Session/WebSocket/Interaction Sync Architecture

## Executive Summary

This report analyzes the real-time synchronization architecture for a Claude Code UI application, focusing on patterns, anti-patterns, and architectural issues related to WebSocket communication, React state management, and cross-tab synchronization.

**Key Finding:** The architecture exhibits a **hybrid pattern** with both **server-side event sourcing** (InteractionManager) and **client-side state management** (sessionStorage), creating synchronization challenges across browser tabs.

---

## 1. Identified Design Patterns

### 1.1 Context Provider Pattern (React)
**Location:** `/src/contexts/*.jsx` (8 context providers, ~1312 total lines)

**Implementation:**
- `InteractionContext` - Manages interaction lifecycle (permission, plan-approval, ask-user)
- `PermissionContext` - Permission queue and decision management
- `WebSocketContext` - WebSocket connection and message handling
- `TaskMasterContext`, `AuthContext`, `ThemeContext`, etc.

**Pattern Quality:** ⚠️ **Moderate** - Proper separation of concerns but excessive nesting

**Provider Hierarchy:**
```
ThemeProvider
└─ AuthProvider
   └─ Router
      └─ WebSocketProvider
         └─ TasksSettingsProvider
            └─ TaskMasterProvider
               └─ InteractionProvider (route-aware)
                  └─ PermissionProvider (route-aware)
                     └─ AppContent
```

**Issues:**
- **Deep nesting** (8 levels) increases complexity
- Route-aware wrappers (`InteractionProviderWrapper`, `PermissionProviderWrapper`) introduce indirection
- Provider dependencies not explicitly documented

---

### 1.2 Event Emitter Pattern (Node.js)
**Location:** `/server/services/*.js` (6 EventEmitter classes)

**Implementation:**
```javascript
// InteractionManager, PermissionManager, PlanApprovalManager, etc.
class InteractionManager extends EventEmitter {
  requestInteraction({ type, sessionId, data }) {
    // ...
    this.emit('interaction-request', { id, type, sessionId, data });
  }
}
```

**Pattern Quality:** ✅ **Good** - Proper decoupling of server components

**Event Flow:**
```
InteractionManager.requestInteraction()
  └─ emit('interaction-request')
     └─ PermissionWebSocketHandler.broadcastPermissionRequest()
        └─ WebSocket.send() → All connected clients
```

---

### 1.3 Observer Pattern (WebSocket Message Handling)
**Location:** `/src/utils/websocket.js`, `/src/hooks/usePermissions.js`

**Implementation:**
```javascript
// Client-side WebSocket listener
websocket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  // Filter by session
  if (data.sessionId === currentSessionIdRef.current) {
    setMessages(prev => [...prev, data]);
  }
};
```

**Pattern Quality:** ⚠️ **Problematic** - Uses imperative ref for session filtering

**Issue:** `currentSessionIdRef` is set imperatively via `setSessionId()` callback, not synchronized with React state transitions. This creates race conditions.

---

### 1.4 Command Pattern (WebSocket Message Types)
**Location:** `/server/services/permissionTypes.js`, `/src/utils/permissionWebSocketClient.js`

**Implementation:**
```javascript
export const WS_MESSAGE_TYPES = {
  PERMISSION_REQUEST: 'permission-request',
  PERMISSION_RESPONSE: 'permission-response',
  PERMISSION_TIMEOUT: 'permission-timeout',
  // ...
};
```

**Pattern Quality:** ✅ **Good** - Well-defined message contracts

---

### 1.5 Repository Pattern (Storage Abstraction)
**Location:** `/src/utils/interactionStorage.js`, `/src/utils/permissionStorage.js`

**Implementation:**
```javascript
export function savePendingInteraction(sessionId, interaction) {
  const key = `${STORAGE_KEY_PREFIX}${sessionId}`;
  const existing = getPendingInteractions([sessionId]);
  const updated = [...existing.filter(i => i.id !== interaction.id), interaction];
  sessionStorage.setItem(key, JSON.stringify(updated));
}
```

**Pattern Quality:** ⚠️ **Flawed** - Uses `sessionStorage` (tab-local, not synchronized)

---

## 2. Anti-Patterns Identified

### 2.1 **God Object: `InteractionContext`**
**Location:** `/src/contexts/InteractionContext.jsx` (205 lines)

**Responsibilities:**
1. Interaction state management (add/remove/update)
2. Session filtering logic
3. Storage persistence (sessionStorage)
4. Type-based filtering (permissions, plan-approval, ask-user)
5. Computed counts (permissionCount, planApprovalCount, etc.)

**Violation:** **Single Responsibility Principle**

**Recommendation:** Split into:
- `InteractionStore` (pure state)
- `InteractionPersistence` (storage logic)
- `InteractionFilters` (computed selectors)

---

### 2.2 **Imperative Refs in Reactive System**
**Location:** `/src/utils/websocket.js:11`

```javascript
const currentSessionIdRef = useRef(null);  // ❌ Not reactive

// Later...
const setSessionId = useCallback((sessionId) => {
  currentSessionIdRef.current = sessionId;  // ❌ No React update
}, []);
```

**Problem:**
- `currentSessionIdRef` is set imperatively, bypassing React's rendering cycle
- Message filtering happens based on stale ref value
- Race condition: WebSocket message arrives before `setSessionId` is called

**Impact:** Messages appear in wrong session (Bug #3 in plan)

**Recommendation:** Use React state (`useState`) instead of refs for values that affect rendering logic

---

### 2.3 **Tab-Local Storage for Cross-Tab Data**
**Location:** `/src/utils/interactionStorage.js:16`

```javascript
const stored = sessionStorage.getItem(key);  // ❌ Tab-local only
```

**Problem:**
- `sessionStorage` is tab-specific, not shared across browser tabs
- User responds to interaction in Tab A → Tab B still shows it
- Violates user expectation: "Everything should be in sync" (Requirement #6)

**Impact:** Interactions don't sync across tabs (Bug #1 in plan)

**Recommendation:** Use `localStorage` + `BroadcastChannel` API or move to server-side state

---

### 2.4 **Race Condition: Session Change vs WebSocket Message**
**Location:** `/src/contexts/InteractionContext.jsx:29-46`

```javascript
useEffect(() => {
  if (sessionIdsChanged) {
    lastSessionIdsRef.current = sessionIds;

    // Clear state first
    if (sessionIds.length === 0) {
      setPendingInteractions([]);
      return;
    }

    // Load from storage
    const stored = getPendingInteractions(sessionIds);
    setPendingInteractions(stored);
  }
}, [sessionIds]);
```

**Problem:**
1. User switches from Session A to Session B (URL changes)
2. `InteractionContext` receives new `sessionIds` prop
3. State clears (`setPendingInteractions([])`)
4. WebSocket message arrives for Session B
5. `addInteraction` checks `sessionIds` - still old value!
6. Interaction saved to storage but not added to state

**Impact:** Interaction appears in wrong session or gets lost (Bugs #2 and #3)

**Root Cause:** React prop updates are not synchronous with WebSocket message handlers

---

### 2.5 **Duplication: Permission and Interaction Systems**
**Location:** `/src/contexts/PermissionContext.jsx`, `/src/contexts/InteractionContext.jsx`

**Overlap:**
- Both maintain pending request queues
- Both persist to sessionStorage
- Both handle WebSocket messages
- Both implement TTL cleanup

**Code Smell:** **Feature Envy** - Permission system duplicates interaction infrastructure

**Recommendation:** Unify under `InteractionContext` with type-based specialization

---

### 2.6 **Missing Error Boundaries**
**Location:** Only 1 ErrorBoundary found (`/src/components/ErrorBoundary.jsx`)

**Risk:** Context providers can throw errors (e.g., parsing stored JSON), but no boundaries protect the app

**Recommendation:** Add error boundaries around each major context provider

---

## 3. Real-Time Sync Patterns Analysis

### 3.1 Current Implementation: Partial CQRS
**Command:** Client sends permission response → Server processes → Broadcasts to all clients
**Query:** Client reads from local sessionStorage (stale)

**Problem:** No read consistency across tabs

---

### 3.2 Missing Patterns

#### 3.2.1 Event Sourcing (Partial)
Server has `InteractionManager` with event emission, but:
- Events not persisted (ephemeral, lost on restart)
- No event replay capability
- Can't reconstruct state from history

**Plan Recommendation:** Store interactions in JSONL for recovery (Section "Can Interactions Be Loaded from History?")

---

#### 3.2.2 Pub/Sub for Cross-Tab Sync
**Current:** No cross-tab communication
**Needed:** BroadcastChannel API or server-side broadcast

**Plan Recommendation:** Solution 2 (BroadcastChannel) or Solution 1 (Server-side state)

---

#### 3.2.3 Optimistic Updates
**Current:** Client waits for server confirmation before UI update
**Result:** Slow perceived performance

**Plan Recommendation:** Solution 3 (Hybrid with optimistic updates)

---

## 4. React State Management Patterns

### 4.1 Props Drilling (Moderate)
**Depth:** Up to 4 levels (Provider → Wrapper → Route → Content)

**Mitigation:** Context API used effectively to avoid deep props drilling

---

### 4.2 useState + useEffect (Overuse)
**Count:** 57 `useRef` usages across 15 files

**Concern:** High reliance on refs suggests imperative code mixed with declarative React

**Example Anti-Pattern:**
```javascript
const lastSessionIdsRef = useRef([]);  // ❌ Manual tracking
useEffect(() => {
  if (sessionIds.length !== lastSessionIdsRef.current.length) {
    // Custom change detection instead of useEffect dependency
  }
}, [sessionIds]);
```

**Better Approach:** Use `useMemo` or let React handle dependency tracking

---

### 4.3 Custom Hooks (Good Practice)
**Examples:**
- `usePermissions.js` - Encapsulates permission logic
- `useInteractions.js` - Abstracts interaction operations
- `useWebSocket.js` - WebSocket lifecycle management

**Quality:** ✅ **Good** - Proper abstraction

---

## 5. WebSocket Lifecycle Management

### 5.1 Connection Management
**Location:** `/src/utils/websocket.js:43-145`

**Features:**
- Auto-reconnect on disconnect (3s delay)
- Heartbeat/ping-pong (server-side)
- Connection state tracking (`isConnected`)

**Quality:** ✅ **Good** - Robust reconnection logic

---

### 5.2 Message Filtering (Flawed)
**Location:** `/src/utils/websocket.js:76-119`

**Implementation:**
```javascript
const globalMessageTypes = [
  'session-created',
  'interaction-request',  // ❌ Global but session-specific
  // ...
];

const isGlobalMessage = globalMessageTypes.includes(data.type);

if (isGlobalMessage) {
  setMessages(prev => [...prev, data]);  // ❌ No session filtering
} else if (data.sessionId === currentSessionIdRef.current) {
  setMessages(prev => [...prev, data]);
}
```

**Problem:** `interaction-request` marked as "global" but contains `sessionId` - should be filtered

**Impact:** Interactions appear in all tabs, not just session owner

---

### 5.3 Permission Client Integration
**Location:** `/src/utils/permissionWebSocketClient.js`

**Pattern:** Singleton client with handler callbacks

**Quality:** ⚠️ **Mixed** - Good encapsulation but duplicates `InteractionContext` logic

---

## 6. Error Handling and Recovery Patterns

### 6.1 Storage Parsing Errors
**Location:** `/src/utils/interactionStorage.js:19-24`

```javascript
try {
  const interactions = JSON.parse(stored);
  if (!Array.isArray(interactions)) {
    console.warn('Invalid interaction storage format, clearing');
    sessionStorage.removeItem(key);  // ✅ Self-healing
  }
} catch (e) {
  console.warn('Failed to parse interaction storage:', e);
  sessionStorage.removeItem(key);  // ✅ Self-healing
}
```

**Quality:** ✅ **Good** - Graceful degradation

---

### 6.2 WebSocket Reconnection
**Location:** `/src/utils/websocket.js:125-136`

```javascript
websocket.onclose = () => {
  setIsConnected(false);
  permissionWebSocketClient.handleConnectionStateChange('disconnected');

  reconnectTimeoutRef.current = setTimeout(() => {
    connect();  // ✅ Auto-reconnect
  }, 3000);
};
```

**Quality:** ✅ **Good** - Automatic recovery

---

### 6.3 Missing: Request Timeout Handling (Client)
**Server:** Has timeout logic in `PermissionManager`
**Client:** Relies on server `permission-timeout` message

**Risk:** If server timeout message is lost (network issue), client shows stale request forever

**Recommendation:** Add client-side timeout (e.g., 5 minutes) with auto-cleanup

---

## 7. Architectural Boundary Violations

### 7.1 Cross-Layer Dependencies
**Violation:** `usePermissions.js` imports both `PermissionContext` and `WebSocketContext`

```javascript
import { usePermission } from '../contexts/PermissionContext';
import { useWebSocketContext } from '../contexts/WebSocketContext';
```

**Issue:** Hook depends on two contexts - tight coupling

**Better:** WebSocket events should be handled in `PermissionContext` internally, hook only imports `PermissionContext`

---

### 7.2 Storage Abstraction Leakage
**Location:** Multiple files directly import storage functions

```javascript
// ❌ Direct storage access in hook
import { savePendingRequest, removePendingRequest } from '../utils/permissionStorage';
```

**Recommendation:** Storage should be encapsulated in context, not accessed by hooks

---

### 7.3 Server-Client Coupling
**Issue:** Client code knows server message formats (`WS_MESSAGE_TYPES`)

**Better:** Use protocol versioning and message adapters for decoupling

---

## 8. Code Duplication Analysis

### 8.1 High Duplication: Storage Functions
**Files:** `interactionStorage.js`, `permissionStorage.js`

**Duplicated Logic:**
- TTL-based filtering (1 hour)
- JSON serialization/deserialization
- Error handling for invalid data
- sessionStorage key generation

**Recommendation:** Extract to `baseStorage.js` with generic functions

---

### 8.2 Medium Duplication: Context Patterns
**Files:** All 8 context providers

**Duplicated Structure:**
- `createContext()` + custom hook
- `useEffect` for initialization
- `useCallback` for actions
- Provider wrapper

**Recommendation:** Create `createContextProvider` factory function

---

## 9. Naming Conventions

### 9.1 Consistency: ✅ Good
- Contexts: `*Context.jsx` (e.g., `InteractionContext.jsx`)
- Hooks: `use*.js` (e.g., `usePermissions.js`)
- Components: PascalCase (e.g., `ChatInterface.jsx`)
- Utilities: camelCase (e.g., `websocket.js`)

### 9.2 Inconsistencies

**Storage Keys:**
```javascript
// ❌ Different prefixes
'claude-ui:interactions:${sessionId}'  // interactionStorage.js
'claude-ui:permissions:${sessionId}'   // permissionStorage.js
'permanentPermissions'                  // No prefix (PermissionContext.jsx)
```

**Recommendation:** Standardize to `claude-ui:*` for all localStorage/sessionStorage keys

---

## 10. Patterns Missing from Implementation

### 10.1 Redux Saga / Middleware Pattern
**Purpose:** Centralized side-effect management (WebSocket, storage, etc.)

**Current:** Side effects scattered across contexts and hooks

**Benefit:** Easier testing and debugging of async flows

---

### 10.2 Circuit Breaker Pattern
**Purpose:** Prevent cascading failures when server is down

**Current:** Infinite reconnection attempts (every 3s)

**Recommendation:** Exponential backoff + max retries

---

### 10.3 Idempotency Keys
**Purpose:** Prevent duplicate message processing

**Current:** No protection against duplicate WebSocket messages

**Risk:** User clicks "Allow" twice → two responses sent

---

## 11. Recommendations Summary

### Priority 1: Critical
1. **Implement Solution 1 from plan** (Server-side interaction state) to fix cross-tab sync
2. **Replace `currentSessionIdRef` with React state** to eliminate race conditions
3. **Add client-side timeout** for stale interactions (5 min TTL)

### Priority 2: High
4. **Unify Permission and Interaction systems** under single context
5. **Add error boundaries** around context providers
6. **Implement BroadcastChannel** for same-browser tab sync (optimization)

### Priority 3: Medium
7. **Extract shared storage logic** to `baseStorage.js`
8. **Add idempotency keys** to WebSocket messages
9. **Implement exponential backoff** for reconnection
10. **Standardize storage key prefixes**

### Priority 4: Low
11. **Create context factory** to reduce boilerplate
12. **Add protocol versioning** for WebSocket messages
13. **Refactor message filtering** logic

---

## 12. Pattern Fit Analysis for Plan Solutions

### Solution 1: Server-Side State ⭐ **BEST FIT**
**Patterns Applied:**
- Event Sourcing (full)
- CQRS (command/query separation)
- Pub/Sub (WebSocket broadcast)

**Pros:**
- Aligns with existing EventEmitter pattern on server
- Single source of truth
- Works across devices, not just tabs

**Cons:**
- Requires server changes (but architecture already supports it)

---

### Solution 2: BroadcastChannel ⚠️ **PARTIAL FIT**
**Patterns Applied:**
- Observer (cross-tab)
- Optimistic Updates (client-side)

**Pros:**
- No server changes
- Fast sync (no network latency)

**Cons:**
- Only works for same-browser tabs
- Doesn't fix server-client consistency issue
- Still uses sessionStorage (tab-local)

**Recommendation:** Use as **optimization** on top of Solution 1, not replacement

---

### Solution 3: Hybrid ✅ **IDEAL**
**Patterns Applied:**
- Event Sourcing (server)
- Optimistic Updates (client)
- CQRS (eventual consistency)

**Pros:**
- Best UX (instant feedback)
- Server authority (consistency)
- Handles network failures gracefully

**Cons:**
- Most complex to implement
- Requires rollback logic

**Recommendation:** Implement after Solution 1 is stable

---

## 13. Architecture Diagram: Current vs Recommended

### Current (Problematic)
```
┌─────────────────────────────────────────────────────────────┐
│                     CURRENT ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐        WebSocket (Separate)   ┌─────────┐    │
│  │ Server  │ ◀──────────────────────────▶   │  Tab A  │    │
│  │         │                                │         │    │
│  │ - JSONL │                                │ sessionStorage│
│  │ - InteractionManager (ephemeral)        │ React State │
│  └─────────┘                                └─────────┘    │
│       │                                           ╳ NOT SYNCED│
│       │                                     ┌─────────┐    │
│       └──────────────────────────────────▶  │  Tab B  │    │
│              WebSocket (Separate)           │         │    │
│                                             │ sessionStorage│
│                                             └─────────┘    │
│                                                             │
│  Issues:                                                   │
│  1. sessionStorage is tab-local                           │
│  2. currentSessionIdRef race condition                    │
│  3. No cross-tab sync                                     │
│  4. Interactions not in JSONL (lost on refresh)          │
└─────────────────────────────────────────────────────────────┘
```

### Recommended (Solution 1)
```
┌─────────────────────────────────────────────────────────────┐
│              RECOMMENDED: SERVER-SIDE STATE                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    SERVER                           │   │
│  │                                                     │   │
│  │  ┌──────────────┐    ┌────────────────────────┐   │   │
│  │  │ JSONL Files  │    │ InteractionStore       │   │   │
│  │  │ (messages)   │    │ - Map<sessionId, []>   │   │   │
│  │  └──────────────┘    │ - Broadcast on change  │   │   │
│  │                      │ - Optional persistence │   │   │
│  │                      └────────────────────────┘   │   │
│  │                           │         │             │   │
│  └───────────────────────────┼─────────┼─────────────┘   │
│                              │         │                  │
│          ┌───────────────────┘         └─────────────┐    │
│          │                                           │    │
│          ▼                                           ▼    │
│  ┌──────────────┐                          ┌──────────────┐│
│  │   Tab A      │   Broadcast: "removed"   │   Tab B      ││
│  │              │ ◀───────────────────────▶ │              ││
│  │ React State  │                          │ React State  ││
│  │ (view only)  │                          │ (view only)  ││
│  └──────────────┘                          └──────────────┘│
│                                                             │
│  Benefits:                                                 │
│  ✓ Single source of truth (server)                        │
│  ✓ Automatic cross-tab sync via WebSocket                 │
│  ✓ No race conditions (server sequences updates)          │
│  ✓ Survives page refresh (server state)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 14. Technical Debt Items

### Code Smells Found
1. **Long Methods:** `InteractionContext.addInteraction` (34 lines)
2. **Magic Numbers:** TTL values hardcoded (`60 * 60 * 1000`)
3. **Console Logging:** Excessive `console.log` in production code
4. **TODOs:** 3 TODO comments in `GitPanel.jsx` (all related to error messages)

### Refactoring Opportunities
1. Extract session change logic from `InteractionContext` to hook
2. Create `useSessionSync` hook for consistent session tracking
3. Move WebSocket message filtering to dedicated service
4. Create `InteractionValidator` for schema validation

---

## 15. Conclusion

### Strengths
1. ✅ Clean separation between server (EventEmitter) and client (React Context)
2. ✅ Robust WebSocket reconnection logic
3. ✅ Good error recovery in storage layer
4. ✅ Consistent naming conventions

### Critical Issues
1. ❌ `sessionStorage` prevents cross-tab sync (architectural flaw)
2. ❌ Imperative refs (`currentSessionIdRef`) create race conditions
3. ❌ No interaction persistence in JSONL (data loss on refresh)
4. ❌ Duplication between Permission and Interaction systems

### Recommended Path Forward
**Phase 1 (Critical):** Implement Solution 1 (server-side state)
- Create `InteractionStore` class on server
- Add WebSocket broadcast for state changes
- Update frontend to be WebSocket-driven (remove sessionStorage)

**Phase 2 (Optimization):** Add BroadcastChannel for same-browser tabs
- Reduce latency for cross-tab sync
- Keep as fallback if WebSocket is slow

**Phase 3 (Enhancement):** Add optimistic updates (Solution 3)
- Improve perceived performance
- Add rollback logic for failures

---

## Appendix A: File Inventory

### Context Providers (8)
- InteractionContext.jsx (205 lines)
- PermissionContext.jsx (289 lines)
- WebSocketContext.jsx (30 lines)
- TaskMasterContext.jsx
- AuthContext.jsx
- ThemeContext.jsx
- TasksSettingsContext.jsx
- PermissionInstanceContext.jsx

### Server Services (6)
- interactionManager.js (265 lines)
- permissionManager.js
- permissionWebSocketHandler.js (EventEmitter)
- planApprovalManager.js (EventEmitter)
- askUserHandler.js (EventEmitter)
- consoleApproval.js

### Storage Utilities (2)
- interactionStorage.js (142 lines)
- permissionStorage.js (104 lines)

### Custom Hooks (5)
- usePermissions.js (283 lines)
- useInteractions.js
- useWebSocket.js (187 lines)
- useLocalStorage.jsx
- useVersionCheck.js

---

## Appendix B: Pattern Catalog

| Pattern | Status | Location | Quality |
|---------|--------|----------|---------|
| Context API | ✅ Used | 8 contexts | Good |
| Event Emitter | ✅ Used | Server services | Good |
| Observer | ⚠️ Flawed | WebSocket handlers | Needs fix |
| Repository | ⚠️ Flawed | Storage utils | sessionStorage issue |
| Command | ✅ Used | WebSocket types | Good |
| Pub/Sub | ❌ Missing | - | Needed for cross-tab |
| Event Sourcing | ⚠️ Partial | InteractionManager | Needs persistence |
| CQRS | ⚠️ Partial | - | Read inconsistency |
| Optimistic Updates | ❌ Missing | - | Future enhancement |
| Circuit Breaker | ❌ Missing | - | Recommended |
| Idempotency | ❌ Missing | - | Recommended |

---

**Report Generated:** 2024-12-24
**Codebase:** claudecodeui
**Total Files Analyzed:** ~77 source files
**Lines of Code (Contexts):** 1,312 lines