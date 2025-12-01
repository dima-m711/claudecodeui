# Testing Permission System - Phase 1, 2, 3

## Quick Test Steps

### 1. Visual Test (Frontend Only)
1. Open http://localhost:3002 in your browser
2. Look for a **purple "Test Permission" button** at the bottom-left
3. Click it to see the permission dialog
4. Test the following features:
   - **Keyboard shortcuts**: Y (allow), N (deny), S (session), A (always)
   - **Parameter editing**: Click "Show Details" then "Edit"
   - **Timeout countdown**: Watch the blue progress bar (30 seconds)
   - **Risk assessment**: Notice the color coding (high/medium/low)

### 2. Console Test (Browser DevTools)
Open browser console (F12) and run:

```javascript
// Get the mock function from React DevTools or window
// This will trigger a test permission dialog
const mockPermission = () => {
  const event = new CustomEvent('mockPermission', {
    detail: {
      tool: 'bash',
      operation: 'execute',
      description: 'Run a bash command',
      input: { command: 'ls -la' }
    }
  });
  window.dispatchEvent(event);
};

mockPermission();
```

### 3. WebSocket Test (Full Integration)
To test the actual WebSocket flow:

```javascript
// In browser console, send a permission request via WebSocket
const ws = window.wsClient; // If exposed
if (ws) {
  ws.send(JSON.stringify({
    type: 'permission-request',
    id: 'test-' + Date.now(),
    tool: 'file_write',
    operation: 'create',
    description: 'Creating a new configuration file',
    input: {
      path: '/config/settings.json',
      content: '{"theme": "dark"}'
    }
  }));
}
```

## What You Should See

### Permission Dialog Features:
- **Tool Icon**: Changes based on tool type (Terminal, File, Database, etc.)
- **Risk Level**: Color-coded (Red=High, Yellow=Medium, Green=Low)
- **Decision Options**:
  - ✅ Allow Once (Green)
  - ❌ Deny (Red)
  - 📅 Allow Session (Blue)
  - ♾️ Always Allow (Purple)
  - 🚫 Never Allow (Gray)

### Queue Indicator (Bottom-Right):
- Shows pending permission count
- Pulsing red dot for new requests
- Dropdown with batch operations
- Individual quick approve/deny buttons

## Current Integration Status

### ✅ Working:
- Frontend UI components
- Permission context and state management
- Mock permission testing
- Local storage for permanent permissions
- Dark mode support
- Keyboard shortcuts
- Animations and transitions

### ⚠️ Needs Backend Integration:
- Real WebSocket permission messages from server
- Actual tool execution based on approval
- Server-side permission enforcement

### 🔄 Next Steps (Phase 4):
- Memory optimization for permission tracking
- Performance improvements for large queues
- Advanced filtering and search

## Debugging

Check browser console for:
```javascript
// Check if components are loaded
console.log('Permission Context:', window.PermissionContext);
console.log('WebSocket Client:', window.wsClient);

// Check localStorage for saved permissions
console.log('Permanent Permissions:', localStorage.getItem('permanentPermissions'));
console.log('Permission History:', localStorage.getItem('permissionHistory'));
```

## Common Issues

1. **No Test Button Visible**: Make sure NODE_ENV is set to 'development'
2. **Dialog Not Appearing**: Check browser console for errors
3. **WebSocket Not Connected**: Verify server is running on port 3002