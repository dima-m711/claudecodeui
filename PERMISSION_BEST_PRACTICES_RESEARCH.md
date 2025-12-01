# Permission System Best Practices Research

## Research Date: November 30, 2025

This document consolidates best practices from authoritative sources for implementing non-blocking, per-instance permission systems in chat/IDE applications.

---

## 1. Non-Blocking Permission Dialogs in Chat/IDE Applications

### Key Principles (Nielsen Norman Group)
**Source:** https://www.nngroup.com/articles/permission-requests/

#### Communication Strategy
- **Clearly explain WHY** permission is needed, focusing on user benefits
- Use active voice and plain language
- Avoid vague phrases like "better user experience"
- Use formula: "[App] would like to access your [resource] so that you can [specific benefit/task]"

#### Timing Best Practices
- **Don't request all permissions on first launch**
- **Initiate permission requests in context** when users select a related feature
- Avoid interrupting users during critical tasks
- Request only core permissions initially

#### Design Principles
- Provide context for why a specific permission is necessary
- Make it easy to reverse permission decisions
- Clearly explain functionality limitations if permission is denied
- Include a direct link to adjust settings

#### Critical Insight
> "Users perform a cost-benefit analysis when deciding whether to accept a permission request."

### Modal vs Non-Modal Dialogs (Nielsen Norman Group)
**Source:** https://www.nngroup.com/articles/modal-nonmodal-dialog/

#### Use Modal Dialogs When:
- Preventing critical, irreversible errors
- Requesting essential information to continue a process
- Breaking complex workflows into simpler steps
- Asking for information that significantly reduces user effort

#### Avoid Modal Dialogs When:
- Presenting non-essential information
- Interrupting high-stakes processes (like checkout)
- Requiring complex decision-making
- User needs additional context not available in the dialog

#### Key Quote
> "No one likes to be interrupted, but if you must, make sure it's worth the cost."

### VS Code Notification Patterns
**Source:** https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/parts/notifications/notificationsToasts.ts

#### Non-Blocking Implementation
1. **Spam Protection:** Limits maximum simultaneous notifications using an interval counter
2. **Visibility Management:** Tracks toast visibility states (hidden/visible)
3. **Dynamic Layout:** Adjusts notification container height based on available space
4. **Prevents Overlapping:** With critical UI elements like input fields

#### Automatic Lifecycle
- Auto-purge non-sticky notifications after severity-based timeouts
- Respects user interactions (mouse hover) to prevent dismissal
- Tracks notification center visibility to prevent redundant toasts

#### Performance
- Uses `scheduleAtNextAnimationFrame` to prevent performance bottlenecks
- Manages notification lists with efficient DOM manipulation
- Supports dynamic styling and theming

### Electron Desktop Pattern
**Source:** https://github.com/electron/electron/blob/main/docs/api/dialog.md

#### Async Dialog Methods
```javascript
dialog.showOpenDialog(mainWindow, options)
  .then(result => {
    console.log(result.filePaths)
  })
```

#### Window-Modal Context
- Dialogs can be attached to specific windows, making them modal per-window
- The `window` argument allows dialog to attach itself to a parent window
- Supports platform-specific dialog features

---

## 2. Per-Instance State Management in Multi-Instance Applications

### React Context for Instance Scoping
**Source:** https://react.dev/reference/react/useContext

#### Multiple Provider Instances
```jsx
function App() {
  return (
    <>
      <InstanceProvider id="chat-1">
        <ChatWindow />
      </InstanceProvider>
      <InstanceProvider id="chat-2">
        <ChatWindow />
      </InstanceProvider>
    </>
  );
}
```

#### Scoping Pattern
- Override context for parts of the tree by wrapping in a provider with different value
- Context can be nested and "accumulated" through component hierarchies
- Each provider creates an isolated scope for its children

#### Performance Optimization
- Use `useMemo` and `useCallback` for objects/functions in context
- Prevents unnecessary re-renders when underlying data hasn't changed

### Zustand Per-Instance Stores
**Source:** https://github.com/pmndrs/zustand

#### Creating Multiple Store Instances
```typescript
const CounterStoresProvider = ({ children }) => {
  const [stores] = useState(
    () => new Map<string, ReturnType<typeof createCounterStore>>()
  );

  return (
    <CounterStoresContext.Provider value={stores}>
      {children}
    </CounterStoresContext.Provider>
  );
};
```

#### Pattern Benefits
- Each instance gets its own isolated store
- Stores can be dynamically created and destroyed
- No global state pollution between instances

#### Multiple Scoped Stores Example
```tsx
export default function RootApp() {
  return (
    <div style={{ display: 'flex' }}>
      <PositionStoreProvider>
        <MovingDot color="red" />
      </PositionStoreProvider>
      <PositionStoreProvider>
        <MovingDot color="blue" />
      </PositionStoreProvider>
    </div>
  );
}
```

### State Management Principles (Kent C. Dodds)
**Source:** https://kentcdodds.com/blog/application-state-management-with-react

#### Core Guidelines
1. **Keep state as local as possible**
2. **Lift state up** when components need to share it
3. **Use React's built-in tools** before reaching for external libraries

#### State Categories
- **UI State:** Interactive component states (should be local)
- **Server Cache:** Data fetched from servers

#### Key Quote
> "React is a state management library"

---

## 3. Deferred Decision Patterns for Permission Systems

### Command Pattern for Deferred Actions
**Source:** https://refactoring.guru/design-patterns/command

#### Pattern Benefits
1. Transform requests into standalone objects
2. Parameterize objects with operations
3. Queue and delay execution of commands
4. Implement reversible operations

#### Implementation Approach
```typescript
interface PermissionCommand {
  execute(): void;
  canExecute(): boolean;
  requiresPermission(): string[];
}

class PendingCommandQueue {
  private commands: PermissionCommand[] = [];

  add(command: PermissionCommand) {
    this.commands.push(command);
  }

  executeWhenPermissionGranted(permission: string) {
    this.commands
      .filter(cmd => cmd.requiresPermission().includes(permission))
      .forEach(cmd => {
        cmd.execute();
        this.remove(cmd);
      });
  }
}
```

#### Use Cases
- Queue file operations that require file system permissions
- Defer clipboard access until user grants permission
- Batch multiple permission-requiring operations

### React Event Handler Pattern
**Source:** https://react.dev/learn/you-might-not-need-an-effect

#### Keep Transient State in Event Handlers
```typescript
function handleFileOperation() {
  if (hasFilePermission) {
    executeFileOperation();
  } else {
    setShowPermissionRequest({
      type: 'file',
      onGrant: () => executeFileOperation(),
      onDeny: () => showErrorMessage()
    });
  }
}
```

#### Key Principles
- Keep interaction-specific logic in event handlers, not Effects
- Calculate derived state during rendering
- Use component keys to reset state when needed

---

## 4. Session-Scoped UI State Persistence

### LocalStorage Persistence Pattern
**Source:** https://www.joshwcomeau.com/react/persisting-react-state-in-localstorage/

#### Custom Hook Implementation
```typescript
function useStickyState<T>(defaultValue: T, key: string): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stickyValue = window.localStorage.getItem(key);
    return stickyValue !== null
      ? JSON.parse(stickyValue)
      : defaultValue;
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}
```

#### Per-Instance Persistence
```typescript
function useInstanceState<T>(instanceId: string, key: string, defaultValue: T) {
  const storageKey = `${instanceId}:${key}`;
  return useStickyState(defaultValue, storageKey);
}

function ChatInstance({ instanceId }) {
  const [permissions, setPermissions] = useInstanceState(
    instanceId,
    'permissions',
    { fileSystem: false, clipboard: false }
  );
}
```

#### Use Cases
- Sticky form controls
- Remembering user preferences
- Preserving UI state between page reloads
- Per-instance permission states

### React State Structure Best Practices
**Source:** https://react.dev/learn/managing-state

#### State Organization Principles
1. **Avoid Redundant State:** Calculate derived values during rendering
2. **Be Intentional:** Design state to minimize potential error points
3. **Lift State Up:** Move shared state to closest common parent
4. **Use Context:** For deeply nested component communication

#### State Update Best Practices
- Describe UI changes as state changes
- Trigger state updates in response to user interactions
- Keep event handlers concise by centralizing update logic

---

## 5. React Patterns for Instance-Scoped Modals/Dialogs

### Radix UI Dialog Pattern
**Source:** https://www.radix-ui.com/primitives/docs/components/dialog

#### Composition Pattern
```jsx
<Dialog.Root open={open} onOpenChange={setOpen}>
  <Dialog.Trigger />
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title />
      <Dialog.Description />
      <Dialog.Close />
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

#### Accessibility Features
- Automatically traps focus within modal
- Supports both controlled and uncontrolled modes
- Closes on Escape key press
- Manages screen reader announcements

#### State Management
- Supports `open`, `defaultOpen`, and `onOpenChange` props
- Can be programmatically controlled
- Allows asynchronous operations and dialog closing

### Modal State Management (Redux/Local)
**Source:** Stack Overflow Community Best Practices

#### Local State Approach (Recommended for Instance-Scoped)
```typescript
function ChatInstance({ instanceId }) {
  const [permissionModal, setPermissionModal] = useState<{
    open: boolean;
    type?: string;
    onApprove?: () => void;
    onDeny?: () => void;
  }>({ open: false });

  const requestPermission = (type: string, onApprove: () => void) => {
    setPermissionModal({
      open: true,
      type,
      onApprove: () => {
        onApprove();
        setPermissionModal({ open: false });
      },
      onDeny: () => setPermissionModal({ open: false })
    });
  };

  return (
    <>
      <ChatUI onNeedPermission={requestPermission} />
      {permissionModal.open && (
        <PermissionDialog {...permissionModal} />
      )}
    </>
  );
}
```

#### Portal Approach
```typescript
import { createPortal } from 'react-dom';

function PermissionDialog({ instanceId, ...props }) {
  return createPortal(
    <Dialog {...props} data-instance={instanceId} />,
    document.body
  );
}
```

#### Benefits
- Keeps modal logic close to triggering components
- Simplifies state management with local component state
- Solves z-index and rendering challenges
- Easy to make instance-specific

### React Context + Reducer Pattern
**Source:** https://react.dev/learn/scaling-up-with-reducer-and-context

#### Combined Pattern
```typescript
interface PermissionState {
  pendingRequests: Map<string, PermissionRequest>;
  grantedPermissions: Set<string>;
}

type PermissionAction =
  | { type: 'REQUEST_PERMISSION'; request: PermissionRequest }
  | { type: 'GRANT_PERMISSION'; permission: string }
  | { type: 'DENY_PERMISSION'; requestId: string };

function permissionReducer(state: PermissionState, action: PermissionAction): PermissionState {
  switch (action.type) {
    case 'REQUEST_PERMISSION':
      return {
        ...state,
        pendingRequests: new Map(state.pendingRequests).set(
          action.request.id,
          action.request
        )
      };
    case 'GRANT_PERMISSION':
      const newState = { ...state };
      newState.grantedPermissions.add(action.permission);
      return newState;
    default:
      return state;
  }
}

function PermissionProvider({ instanceId, children }) {
  const [state, dispatch] = useReducer(permissionReducer, {
    pendingRequests: new Map(),
    grantedPermissions: new Set()
  });

  return (
    <PermissionStateContext.Provider value={state}>
      <PermissionDispatchContext.Provider value={dispatch}>
        {children}
      </PermissionDispatchContext.Provider>
    </PermissionStateContext.Provider>
  );
}
```

---

## 6. Recommended Implementation Strategy

### Architecture Overview

```
ChatApplication
├── ChatInstance (per-instance wrapper)
│   ├── PermissionProvider (instance-scoped context)
│   │   ├── PermissionState (local to instance)
│   │   └── PendingCommands Queue
│   ├── ChatUI
│   └── PermissionDialog (portal-rendered, non-blocking)
└── GlobalPermissionStore (optional, for cross-instance consistency)
```

### Implementation Steps

#### 1. Create Instance-Scoped Permission Provider
```typescript
// src/contexts/PermissionContext.tsx
interface PermissionContextValue {
  requestPermission: (type: string, reason: string) => Promise<boolean>;
  hasPermission: (type: string) => boolean;
  revokePermission: (type: string) => void;
}

export function PermissionProvider({
  instanceId,
  children
}: {
  instanceId: string;
  children: ReactNode;
}) {
  const [permissions, setPermissions] = useInstanceState(
    instanceId,
    'permissions',
    new Set<string>()
  );

  const [pendingRequest, setPendingRequest] = useState<{
    type: string;
    reason: string;
    resolve: (granted: boolean) => void;
  } | null>(null);

  const requestPermission = useCallback((type: string, reason: string) => {
    if (permissions.has(type)) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      setPendingRequest({ type, reason, resolve });
    });
  }, [permissions]);

  const handleApprove = useCallback(() => {
    if (pendingRequest) {
      const newPermissions = new Set(permissions);
      newPermissions.add(pendingRequest.type);
      setPermissions(newPermissions);
      pendingRequest.resolve(true);
      setPendingRequest(null);
    }
  }, [pendingRequest, permissions]);

  const handleDeny = useCallback(() => {
    if (pendingRequest) {
      pendingRequest.resolve(false);
      setPendingRequest(null);
    }
  }, [pendingRequest]);

  return (
    <PermissionContext.Provider value={{ requestPermission, hasPermission, revokePermission }}>
      {children}
      {pendingRequest && createPortal(
        <PermissionDialog
          instanceId={instanceId}
          type={pendingRequest.type}
          reason={pendingRequest.reason}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />,
        document.body
      )}
    </PermissionContext.Provider>
  );
}
```

#### 2. Create Non-Blocking Permission Dialog
```typescript
// src/components/PermissionDialog.tsx
export function PermissionDialog({
  instanceId,
  type,
  reason,
  onApprove,
  onDeny
}: PermissionDialogProps) {
  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onDeny()}>
      <Dialog.Portal>
        <Dialog.Overlay className="permission-overlay" />
        <Dialog.Content
          className="permission-dialog"
          data-instance={instanceId}
        >
          <Dialog.Title>Permission Required</Dialog.Title>
          <Dialog.Description>
            This chat instance would like to access your {type} so that {reason}
          </Dialog.Description>
          <div className="permission-actions">
            <button onClick={onDeny}>Deny</button>
            <button onClick={onApprove}>Allow</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

#### 3. Position Dialog Per-Instance
```css
/* Position dialog near the requesting instance */
.permission-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  max-width: 400px;
  padding: 24px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

/* Non-blocking overlay - allows interaction with other instances */
.permission-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  pointer-events: none; /* Allow clicking through to other instances */
}

/* Only block the specific instance */
[data-instance][data-permission-pending] {
  pointer-events: none;
  opacity: 0.6;
}
```

#### 4. Usage in Chat Component
```typescript
function ChatWindow({ instanceId }) {
  const { requestPermission, hasPermission } = usePermission();

  const handleFileUpload = async () => {
    const granted = await requestPermission(
      'filesystem',
      'upload and process your files'
    );

    if (granted) {
      // Proceed with file operation
      uploadFile();
    } else {
      // Handle denial gracefully
      showMessage('File upload requires permission');
    }
  };

  return (
    <div data-instance={instanceId}>
      <button onClick={handleFileUpload}>Upload File</button>
    </div>
  );
}
```

### Key Design Decisions

1. **Non-Blocking by Design**
   - Dialog uses portal to render outside instance DOM
   - Overlay doesn't block other instances
   - Only the requesting instance is visually disabled

2. **Per-Instance Scoping**
   - Each chat instance has its own PermissionProvider
   - Permissions are stored with instance ID prefix
   - No global modal state

3. **Promise-Based API**
   - Async/await makes permission requests natural
   - Easy to integrate into existing async workflows
   - Clean error handling

4. **Session Persistence**
   - Permissions are stored in localStorage per instance
   - Survive page refreshes
   - Can be cleared per instance or globally

5. **Deferred Execution**
   - Operations naturally wait for permission resolution
   - No need for separate command queue
   - Promise handles the deferral

---

## 7. Additional Resources

### Official Documentation
- **React Context API:** https://react.dev/reference/react/useContext
- **React State Management:** https://react.dev/learn/managing-state
- **Zustand Documentation:** https://github.com/pmndrs/zustand
- **Radix UI Dialog:** https://www.radix-ui.com/primitives/docs/components/dialog

### Articles & Guides
- **Nielsen Norman Group - Permission Requests:** https://www.nngroup.com/articles/permission-requests/
- **Nielsen Norman Group - Modal Dialogs:** https://www.nngroup.com/articles/modal-nonmodal-dialog/
- **Kent C. Dodds - State Management:** https://kentcdodds.com/blog/application-state-management-with-react
- **Josh Comeau - Persisting State:** https://www.joshwcomeau.com/react/persisting-react-state-in-localstorage/

### Design Patterns
- **Command Pattern:** https://refactoring.guru/design-patterns/command
- **Provider Pattern:** React community standard
- **Portal Pattern:** React createPortal documentation

### Real-World Examples
- **VS Code Notifications:** https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/parts/notifications/notificationsToasts.ts
- **Electron Dialogs:** https://github.com/electron/electron/blob/main/docs/api/dialog.md

---

## 8. Summary of Key Recommendations

### Must Have
1. **Per-instance permission state** - Each chat instance manages its own permissions
2. **Non-blocking UI** - Dialogs don't prevent interaction with other instances
3. **Promise-based API** - Natural async/await integration
4. **Session persistence** - Permissions survive refreshes
5. **Clear communication** - Explain WHY permission is needed

### Recommended
1. **Context-in-context timing** - Request when user triggers relevant feature
2. **Portal rendering** - Render dialogs in document.body
3. **Keyboard accessibility** - Full keyboard navigation support
4. **Visual feedback** - Dim only the requesting instance
5. **Easy reversal** - Clear UI to revoke permissions

### Optional
1. **Permission groups** - Bundle related permissions
2. **Remember choice** - "Don't ask again" option (use carefully)
3. **Global override** - Admin setting to pre-approve permissions
4. **Analytics** - Track permission grant/deny rates
5. **A/B testing** - Experiment with permission request copy

### Anti-Patterns to Avoid
1. **Global modal blocking all instances**
2. **Requesting all permissions upfront**
3. **Vague permission explanations**
4. **No way to revoke permissions**
5. **Interrupting critical workflows**
6. **Storing permission state in global Redux/Zustand**
7. **Not explaining consequences of denial**
8. **Using technical jargon in permission requests**

---

## Conclusion

The optimal permission system for a multi-instance chat application should:

1. **Be non-blocking** - Use portals and instance-specific overlays
2. **Be instance-scoped** - Each chat manages its own permission state
3. **Use React Context** - For instance-local state distribution
4. **Persist per-instance** - Store permissions with instance ID prefix
5. **Request in-context** - Only when user triggers relevant feature
6. **Communicate clearly** - Explain benefits, not technical features
7. **Allow easy reversal** - Clear UI for permission management
8. **Handle gracefully** - Degrade functionality when denied, don't break

This approach balances user experience, technical implementation, and accessibility requirements while following industry best practices from leading organizations and frameworks.
