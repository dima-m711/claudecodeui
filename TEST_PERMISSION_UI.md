# Testing the Permission UI System

## Quick Start Test

1. **Open the application** at http://localhost:3002
2. **Look for the purple "Test Permission" button** in the bottom-left corner
3. **Click it** to open the permission dialog

## What You Should See

### Permission Dialog
When you click "Test Permission", you should see:
- A modal dialog with:
  - Tool name: "bash"
  - Operation: "execute"
  - Risk level indicator (should be HIGH/red for bash)
  - Description of the request
  - Parameters showing `{ command: 'ls -la', path: '/home/user' }`
  - A blue countdown bar (30 seconds)
  - Decision buttons:
    - ✅ Allow Once (Green) - Keyboard: Y
    - ❌ Deny (Red) - Keyboard: N
    - Allow Session (Blue) - Keyboard: S
    - Always Allow (Purple) - Keyboard: A
    - Never Allow (Gray)

### Test Each Button
Try clicking each button or using keyboard shortcuts:
- **Allow Once (Y)**: Should approve and close dialog
- **Deny (N)**: Should deny and close dialog
- **Allow Session (S)**: Should remember for this session
- **Always Allow (A)**: Should remember permanently
- **X button or ESC**: Should deny and close

### Queue Indicator
If you click "Test Permission" multiple times quickly:
- A blue indicator appears in bottom-right showing "X Pending"
- Click it to see the queue with batch operations

## Console Output
Open browser console (F12) to see:
```javascript
// When you make a decision, you should see:
"Mock permission decision: {requestId: 'mock-...', decision: 'allow', updatedInput: null}"

// Check stored permissions:
localStorage.getItem('permanentPermissions')
localStorage.getItem('permissionHistory')
```

## Testing Session Permissions
1. Click "Test Permission"
2. Choose "Allow Session"
3. Click "Test Permission" again
4. It should auto-approve (check console for "Request auto-approved")

## Testing Permanent Permissions
1. Click "Test Permission"
2. Choose "Always Allow"
3. Refresh the page
4. Click "Test Permission" again
5. It should auto-approve even after refresh

## Troubleshooting

### If the button doesn't appear:
- Check that NODE_ENV is 'development'
- Look for any console errors

### If clicking doesn't work:
- Check browser console for errors
- Verify the server is running
- Try hard refresh (Ctrl+Shift+R)

### To reset all permissions:
```javascript
// Run in browser console:
localStorage.removeItem('permanentPermissions');
localStorage.removeItem('permissionHistory');
location.reload();
```

## Success Indicators
✅ Dialog opens when clicking test button
✅ All buttons work without errors
✅ Keyboard shortcuts work (Y/N/S/A/ESC)
✅ Session permissions persist until refresh
✅ Permanent permissions persist after refresh
✅ Queue indicator shows for multiple requests
✅ No console errors when interacting

The permission UI system is fully functional for testing!