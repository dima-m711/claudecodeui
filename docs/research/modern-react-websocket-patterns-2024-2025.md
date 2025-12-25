# Modern React + WebSocket Patterns (2024-2025)

**Research Date:** 2024-12-24
**Focus Areas:** WebSocket + React Context, State Management, Reconnection Strategies, Dumb Pipe Pattern, Multi-Tab Communication

---

## Executive Summary

This document synthesizes modern best practices for integrating WebSockets with React applications, based on official documentation, production libraries, and your existing codebase patterns.

**Key Findings:**
1. **Dumb Pipe Pattern** - WebSocket should be a simple transport layer, not business logic
2. **Context + Hooks** - React Context for state, custom hooks for WebSocket logic
3. **BroadcastChannel** - Native browser API for same-origin tab communication
4. **Automatic Reconnection** - Essential with exponential backoff
5. **Message Filtering** - Client-side filtering prevents unnecessary re-renders

---

## 1. WebSocket + React Context Best Practices

### Pattern: Separation of Concerns (Dumb Pipe)

The WebSocket should be a **"dumb pipe"** - it only handles:
- Connection lifecycle (open, close, error)
- Message transport (send, receive)
- Reconnection logic
- Message queuing during disconnects

**Business logic should live in Context/Hooks**, not in WebSocket handlers.

#### Example Structure (From react-use-websocket)

```javascript
// ✅ GOOD: WebSocket layer is transport-only
export function useWebSocket(url, options) {
  const [ws, setWs] = useState(null);
  const [lastMessage, setLastMessage] = useState(null);
  const [readyState, setReadyState] = useState(ReadyState.CONNECTING);

  useEffect(() => {
    const websocket = new WebSocket(url);

    websocket.onopen = () => setReadyState(ReadyState.OPEN);
    websocket.onmessage = (event) => setLastMessage(event); // Just pass through
    websocket.onclose = () => handleReconnect();

    setWs(websocket);
  }, [url]);

  return { ws, lastMessage, readyState, sendMessage };
}

// ✅ GOOD: Business logic in separate context
export function usePermissions() {
  const { lastMessage, sendMessage } = useWebSocket();

  useEffect(() => {
    if (lastMessage?.type === 'permission-request') {
      // Handle permission logic here
      handlePermissionRequest(lastMessage);
    }
  }, [lastMessage]);
}
```

### Your Current Implementation Analysis

**Current Structure:**
```
WebSocketContext (Transport Layer)
    ↓
useWebSocket (Connection + Message Routing)
    ↓
permissionWebSocketClient (Permission-specific logic)
    ↓
PermissionContext (Business logic + UI state)
```

**✅ Strengths:**
- Clean separation between transport and business logic
- `permissionWebSocketClient` is a good abstraction
- Message filtering at the right layer

**⚠️ Areas for Improvement:**
- `currentSessionIdRef` creates race conditions (imperative state)
- Message filtering logic mixed with transport concerns
- No BroadcastChannel for multi-tab sync

---

## 2. State Management Patterns for Real-Time Data

### Pattern: Context + Reducer (Recommended by React Team)

From React official docs:

> "Reducers let you consolidate a component's state update logic. Context lets you pass information deep down to other components. You can combine reducers and context together to manage state of a complex screen."

#### Implementation Pattern

```javascript
// State management with useReducer
const interactionReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_INTERACTION':
      return [...state, action.payload];
    case 'REMOVE_INTERACTION':
      return state.filter(i => i.id !== action.id);
    case 'CLEAR_SESSION':
      return state.filter(i => i.sessionId !== action.sessionId);
    default:
      return state;
  }
};

// Context provider
export function InteractionProvider({ children, sessionIds }) {
  const [interactions, dispatch] = useReducer(interactionReducer, []);

  // WebSocket message handler
  useEffect(() => {
    const listener = wsClient.addMessageListener((message) => {
      if (message.type === 'interaction-request') {
        dispatch({ type: 'ADD_INTERACTION', payload: message });
      }
    });

    return () => wsClient.removeMessageListener(listener);
  }, []);

  return (
    <InteractionContext.Provider value={{ interactions, dispatch }}>
      {children}
    </InteractionContext.Provider>
  );
}
```

### Pattern: Separate State from Dispatch Contexts

From React docs:

> "In larger apps, it is common to combine context with a reducer to extract the logic related to some state out of components... all the 'wiring' is hidden in a dedicated context file which contains a reducer and two separate contexts - one for the state and one for the dispatch function."

This prevents unnecessary re-renders:

```javascript
// Create two contexts
const InteractionStateContext = createContext(null);
const InteractionDispatchContext = createContext(null);

export function InteractionProvider({ children }) {
  const [state, dispatch] = useReducer(interactionReducer, initialState);

  return (
    <InteractionStateContext.Provider value={state}>
      <InteractionDispatchContext.Provider value={dispatch}>
        {children}
      </InteractionDispatchContext.Provider>
    </InteractionStateContext.Provider>
  );
}

// Components can subscribe to only what they need
export function useInteractionState() {
  const context = useContext(InteractionStateContext);
  if (!context) throw new Error('Must be used within InteractionProvider');
  return context;
}

export function useInteractionDispatch() {
  const context = useContext(InteractionDispatchContext);
  if (!context) throw new Error('Must be used within InteractionProvider');
  return context;
}
```

### Your Current Implementation

**Current:**
```javascript
// ❌ Single context with all state and methods
return {
  ws,
  messages,
  isConnected,
  pendingPermissions,
  sendPermissionResponse,
  clearPermissionRequest,
  // ... 10+ more properties
};
```

**Recommended:**
```javascript
// ✅ Split into state and dispatch
// WebSocketStateContext
{ ws, isConnected, readyState }

// WebSocketDispatchContext
{ sendMessage, reconnect, disconnect }

// MessageContext (separate!)
{ messages, lastMessage }

// PermissionContext (separate!)
{ pendingPermissions, handlePermission }
```

---

## 3. Reconnection Strategies

### Pattern: Exponential Backoff with Jitter

From production libraries and best practices:

```javascript
function useWebSocket(url) {
  const reconnectAttemptRef = useRef(0);
  const maxReconnectAttempts = 10;

  const getReconnectDelay = (attempt) => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (max)
    const delay = Math.min(1000 * Math.pow(2, attempt), 32000);

    // Add jitter (±25%) to prevent thundering herd
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);

    return delay + jitter;
  };

  const reconnect = useCallback(() => {
    if (reconnectAttemptRef.current >= maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = getReconnectDelay(reconnectAttemptRef.current);
    reconnectAttemptRef.current += 1;

    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`);

    setTimeout(() => {
      connect();
    }, delay);
  }, []);

  // Reset on successful connection
  const onOpen = useCallback(() => {
    reconnectAttemptRef.current = 0;
    setReadyState(ReadyState.OPEN);
  }, []);
}
```

### Pattern: Message Queuing During Disconnects

From `react-use-websocket` and your `permissionWebSocketClient`:

```javascript
class WebSocketClient {
  constructor() {
    this.messageQueue = [];
    this.maxQueueSize = 50;
  }

  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    } else {
      // Queue for later
      this.queueMessage(message);
      return false;
    }
  }

  queueMessage(message) {
    this.messageQueue.push(message);

    // Prevent memory leaks
    if (this.messageQueue.length > this.maxQueueSize) {
      this.messageQueue.shift(); // Remove oldest
    }
  }

  processQueue() {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift();
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        // Put it back and stop
        this.messageQueue.unshift(message);
        break;
      }
    }
  }
}
```

### Pattern: Heartbeat/Ping-Pong

From `react-use-websocket`:

```javascript
const { sendMessage, lastMessage, readyState } = useWebSocket(url, {
  heartbeat: {
    message: 'ping',           // Message to send
    returnMessage: 'pong',     // Expected response
    timeout: 60000,            // 1 minute - close if no response
    interval: 25000,           // Send ping every 25 seconds
  },
});
```

**Why it matters:**
- Detects "zombie" connections (appear open but aren't)
- Keeps connection alive through firewalls/proxies
- Provides early warning of connection issues

---

## 4. Keeping WebSocket Simple (Dumb Pipe Pattern)

### Core Principles

1. **WebSocket handles ONLY transport:**
   - Opening/closing connections
   - Sending/receiving raw messages
   - Connection state tracking
   - Reconnection logic

2. **Business logic goes in hooks/contexts:**
   - Message parsing
   - State updates
   - Side effects
   - Persistence

3. **Clear boundaries:**
   ```
   WebSocket Layer      → Transport (dumb pipe)
   Client Layer         → Protocol (message types)
   Hook Layer           → Business Logic
   Context Layer        → State Management
   Component Layer      → UI
   ```

### Example: Your permissionWebSocketClient

**✅ Good patterns:**
```javascript
// Message queuing (transport concern)
queueMessage(message) {
  this.messageQueue.push(message);
}

// Connection state (transport concern)
handleConnectionStateChange(state) {
  this.connectionState = state;
  if (state === 'connected') {
    this.processMessageQueue();
  }
}
```

**⚠️ Could be simplified:**
```javascript
// Current: Client handles business logic
handlePermissionRequest(request) {
  this.pendingRequests.set(request.id, request);  // State management
  this.notifyListeners(request);                   // OK
  if (this.onRequestReceived) {                    // Legacy callback
    this.onRequestReceived(request);
  }
}

// Better: Just route the message
handleMessage(message) {
  // Parse once, notify all
  this.notifyListeners(message);
}

// Let hooks handle business logic
function usePermissions() {
  useEffect(() => {
    const listener = wsClient.addMessageListener((message) => {
      if (message.type === 'permission-request') {
        // Business logic here
        setPendingRequests(prev => [...prev, message]);
      }
    });
    return () => wsClient.removeMessageListener(listener);
  }, []);
}
```

---

## 5. BroadcastChannel for Multi-Tab Apps

### What is BroadcastChannel?

Native browser API for same-origin communication between tabs/windows/frames:

```javascript
// Tab 1
const channel = new BroadcastChannel('myApp');
channel.postMessage({ type: 'user-logged-in', userId: '123' });

// Tab 2 (same origin)
const channel = new BroadcastChannel('myApp');
channel.onmessage = (event) => {
  console.log('Received:', event.data);
  // { type: 'user-logged-in', userId: '123' }
};
```

**Browser Support:** Widely supported since March 2022 (Chrome, Firefox, Safari, Edge)

### Pattern: WebSocket + BroadcastChannel Architecture

**Problem:** Multiple tabs → multiple WebSocket connections → sync issues

**Solution:** Leader tab + BroadcastChannel

```javascript
class MultiTabWebSocket {
  constructor(url, channelName) {
    this.url = url;
    this.channel = new BroadcastChannel(channelName);
    this.isLeader = false;
    this.ws = null;

    this.electLeader();
    this.setupChannelListener();
  }

  electLeader() {
    // Simple election: first tab to acquire lock becomes leader
    navigator.locks.request('websocket-leader', { ifAvailable: true }, (lock) => {
      if (lock) {
        this.isLeader = true;
        this.connect();
        return new Promise(() => {}); // Hold lock forever
      } else {
        // Not leader, listen to BroadcastChannel
        this.isLeader = false;
      }
    });
  }

  connect() {
    if (!this.isLeader) return;

    this.ws = new WebSocket(this.url);

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      // Broadcast to all tabs (including this one)
      this.channel.postMessage({
        type: 'ws-message',
        data: message
      });
    };
  }

  setupChannelListener() {
    this.channel.onmessage = (event) => {
      if (event.data.type === 'ws-message') {
        // All tabs receive the message
        this.handleMessage(event.data.data);
      } else if (event.data.type === 'send-message') {
        // Only leader sends to server
        if (this.isLeader && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(event.data.data));
        }
      }
    };
  }

  send(message) {
    // Any tab can request to send
    this.channel.postMessage({
      type: 'send-message',
      data: message
    });
  }

  handleMessage(message) {
    // Your app's message handler
    // This runs in ALL tabs
  }
}
```

### Pattern: Sync State Across Tabs

```javascript
function useInteractionSync() {
  const [interactions, setInteractions] = useState([]);
  const channelRef = useRef(null);

  useEffect(() => {
    // Create channel
    const channel = new BroadcastChannel('claude-ui-interactions');
    channelRef.current = channel;

    // Listen for updates from other tabs
    channel.onmessage = (event) => {
      switch (event.data.type) {
        case 'interaction-added':
          setInteractions(prev => [...prev, event.data.interaction]);
          break;
        case 'interaction-removed':
          setInteractions(prev => prev.filter(i => i.id !== event.data.id));
          break;
        case 'session-changed':
          // Other tab switched sessions
          setInteractions(event.data.interactions);
          break;
      }
    };

    return () => channel.close();
  }, []);

  const addInteraction = useCallback((interaction) => {
    setInteractions(prev => [...prev, interaction]);

    // Notify other tabs
    channelRef.current?.postMessage({
      type: 'interaction-added',
      interaction
    });
  }, []);

  return { interactions, addInteraction };
}
```

### Your Use Case: Permission Requests Across Tabs

```javascript
// Tab A: User approves permission
function handlePermissionApproval(requestId, decision) {
  // Send to server
  sendPermissionResponse(requestId, decision);

  // Notify other tabs
  const channel = new BroadcastChannel('claude-ui-permissions');
  channel.postMessage({
    type: 'permission-resolved',
    requestId,
    decision,
    timestamp: Date.now()
  });
}

// Tab B: Remove pending request from UI
useEffect(() => {
  const channel = new BroadcastChannel('claude-ui-permissions');

  channel.onmessage = (event) => {
    if (event.data.type === 'permission-resolved') {
      // Remove from local state
      setPendingPermissions(prev =>
        prev.filter(p => p.id !== event.data.requestId)
      );
    }
  };

  return () => channel.close();
}, []);
```

---

## 6. Concrete Implementation Examples

### Example 1: Simple WebSocket Context (Dumb Pipe)

```javascript
import { createContext, useContext, useEffect, useState, useRef } from 'react';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ url, children }) {
  const [ws, setWs] = useState(null);
  const [readyState, setReadyState] = useState(WebSocket.CONNECTING);
  const [lastMessage, setLastMessage] = useState(null);
  const reconnectAttemptRef = useRef(0);

  const connect = useCallback(() => {
    const websocket = new WebSocket(url);

    websocket.onopen = () => {
      setReadyState(WebSocket.OPEN);
      reconnectAttemptRef.current = 0;
    };

    websocket.onmessage = (event) => {
      setLastMessage(event); // Just pass through
    };

    websocket.onclose = () => {
      setReadyState(WebSocket.CLOSED);

      // Reconnect with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 32000);
      reconnectAttemptRef.current += 1;

      setTimeout(connect, delay);
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);
  }, [url]);

  useEffect(() => {
    connect();
    return () => ws?.close();
  }, [connect]);

  const sendMessage = useCallback((message) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, [ws]);

  return (
    <WebSocketContext.Provider value={{ ws, readyState, lastMessage, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) throw new Error('Must be used within WebSocketProvider');
  return context;
}
```

### Example 2: Business Logic Hook

```javascript
function usePermissions(sessionId) {
  const { lastMessage, sendMessage } = useWebSocketContext();
  const [pendingRequests, setPendingRequests] = useState([]);

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage) return;

    try {
      const data = JSON.parse(lastMessage.data);

      if (data.type === 'permission-request' && data.sessionId === sessionId) {
        setPendingRequests(prev => [...prev, data]);
      } else if (data.type === 'permission-resolved') {
        setPendingRequests(prev => prev.filter(r => r.id !== data.requestId));
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }, [lastMessage, sessionId]);

  const respondToRequest = useCallback((requestId, decision) => {
    sendMessage({
      type: 'permission-response',
      requestId,
      decision,
      sessionId
    });

    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
  }, [sendMessage, sessionId]);

  return { pendingRequests, respondToRequest };
}
```

### Example 3: Multi-Tab Sync

```javascript
function useMultiTabSync(channelName, sessionId) {
  const [syncedState, setSyncedState] = useState([]);
  const channelRef = useRef(null);

  useEffect(() => {
    const channel = new BroadcastChannel(channelName);
    channelRef.current = channel;

    channel.onmessage = (event) => {
      // Only sync for current session
      if (event.data.sessionId === sessionId) {
        setSyncedState(event.data.state);
      }
    };

    return () => channel.close();
  }, [channelName, sessionId]);

  const broadcastState = useCallback((state) => {
    channelRef.current?.postMessage({
      sessionId,
      state,
      timestamp: Date.now()
    });
  }, [sessionId]);

  return { syncedState, broadcastState };
}
```

---

## 7. Recommendations for Your Codebase

### High Priority

1. **Fix Race Condition with Session Switching**
   - Replace `currentSessionIdRef` with React state
   - Use `useState` for `currentSessionId`
   - Update in `useEffect` when route changes

   ```javascript
   const [currentSessionId, setCurrentSessionId] = useState(null);

   useEffect(() => {
     setCurrentSessionId(sessionId); // From route params
   }, [sessionId]);

   // Message filtering now uses state (no stale ref)
   if (data.sessionId === currentSessionId) {
     // ...
   }
   ```

2. **Implement BroadcastChannel for Tab Sync**
   - Create `useTabSync` hook
   - Sync permission decisions across tabs
   - Prevent duplicate permission dialogs

   ```javascript
   // When permission approved in Tab A
   broadcastChannel.postMessage({
     type: 'permission-approved',
     requestId,
     sessionId
   });

   // Tab B removes from pending list
   ```

3. **Simplify permissionWebSocketClient**
   - Remove business logic (pending request tracking)
   - Keep only transport concerns
   - Move state to React hooks/contexts

### Medium Priority

4. **Add Exponential Backoff to Reconnection**
   - Current: Fixed 3-second delay
   - Better: 1s → 2s → 4s → 8s → 16s → 32s (max)
   - Add jitter to prevent thundering herd

5. **Split WebSocketContext**
   - Separate state and dispatch contexts
   - Reduce unnecessary re-renders
   - Follow React team recommendations

6. **Add Heartbeat/Ping**
   - Detect zombie connections
   - Keep connection alive through proxies

### Low Priority

7. **Implement Leader Election for Multi-Tab**
   - Use Web Locks API
   - Only leader maintains WebSocket
   - Other tabs use BroadcastChannel

8. **Add Circuit Breaker Pattern**
   - Stop reconnection after N failures
   - Show user-friendly error
   - Manual reconnect button

---

## 8. Code Examples Comparison

### Current vs Recommended

#### Current: Mixed Concerns
```javascript
// WebSocket hook handles routing AND business logic
websocket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  // ❌ Session filtering in transport layer
  if (data.sessionId === currentSessionIdRef.current) {
    setMessages(prev => [...prev, data]);
  }

  // ❌ Business logic in transport
  if (data.type === 'permission-request') {
    permissionWebSocketClient.handleMessage(data);
  }
};
```

#### Recommended: Clear Separation
```javascript
// WebSocket hook: Just transport
websocket.onmessage = (event) => {
  setLastMessage(event); // Pass through
};

// Business logic hook
useEffect(() => {
  if (!lastMessage) return;

  const data = JSON.parse(lastMessage.data);

  // Handle in appropriate hook
  if (data.type === 'permission-request') {
    handlePermissionRequest(data);
  }
}, [lastMessage]);
```

---

## 9. Key Takeaways

### Do's ✅

1. **Keep WebSocket dumb** - Only handle transport
2. **Use React state** - Not refs for session tracking
3. **Separate contexts** - State and dispatch contexts
4. **Implement reconnection** - With exponential backoff
5. **Use BroadcastChannel** - For multi-tab sync
6. **Message filtering** - In business logic layer, not transport
7. **Queue messages** - During disconnects
8. **Add heartbeat** - Detect zombie connections

### Don'ts ❌

1. **Don't mix concerns** - Transport vs business logic
2. **Don't use refs for reactive state** - Use useState
3. **Don't skip cleanup** - Always close connections/channels
4. **Don't reconnect infinitely** - Add max attempts
5. **Don't parse messages twice** - Parse once, route to handlers
6. **Don't store in sessionStorage** - For cross-tab data
7. **Don't create multiple WebSocket connections** - For same session
8. **Don't block render** - Use separate contexts

---

## 10. Documentation References

### Official React Docs
- [Scaling up with reducer and context](https://react.dev/learn/scaling-up-with-reducer-and-context)
- [useReducer Hook](https://react.dev/reference/react/useReducer)
- [useContext Hook](https://react.dev/reference/react/useContext)
- [Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)

### WebSocket Libraries
- [react-use-websocket](https://github.com/robtaussig/react-use-websocket) - React hook for WebSocket
- [websocket-ts](https://github.com/jjxxs/websocket-ts) - TypeScript WebSocket with auto-reconnect

### Browser APIs
- [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

### Best Practices
- [JavaScript.info - WebSocket](https://javascript.info/websocket)
- [LogRocket - WebSocket + React Tutorial](https://blog.logrocket.com/websocket-tutorial-real-time-node-react/)

---

## 11. Next Steps

1. **Review Current Implementation** ✅ (Done in ARCHITECTURE_PATTERNS.md)
2. **Fix Session Tracking Race Condition** (High Priority)
3. **Implement BroadcastChannel** (High Priority)
4. **Refactor permissionWebSocketClient** (Medium Priority)
5. **Add Exponential Backoff** (Medium Priority)
6. **Split Contexts** (Medium Priority)

---

**Document Version:** 1.0
**Last Updated:** 2024-12-24
**Next Review:** After implementing High Priority recommendations
