---
id: "035"
title: "WebSocket send failures ignored - state inconsistency"
priority: P1
category: reliability
status: pending
created: 2024-12-27
source: pr-review
files:
  - src/hooks/useInteractions.js
---

# WebSocket Send Failures Ignored - State Inconsistency

## Problem
The `sendInteractionResponse` function removes the interaction from local state immediately after sending, without waiting for server acknowledgment. If the WebSocket send fails, the interaction is removed from UI but the server never received the response, causing inconsistent state.

## Location
- `src/hooks/useInteractions.js:73-98` - `sendInteractionResponse` function

## Risk
- **Severity**: HIGH (P1)
- **Impact**: Lost permission responses, stuck interactions
- **Trigger**: Network issues, server restart, WebSocket disconnect

## Root Cause
```javascript
// src/hooks/useInteractions.js
const sendInteractionResponse = useCallback((interactionId, response) => {
    const interaction = getInteractionById(interactionId);
    if (!interaction) return;

    try {
        ws.send(JSON.stringify({
            type: 'interaction-response',
            interactionId,
            response
        }));

        removeInteraction(interactionId);  // ❌ Removed immediately!
        // If ws.send failed silently or network drops, server never got response
        // But UI shows interaction as handled
    } catch (error) {
        console.error('Failed to send response:', error);
        // ❌ Still might have removed interaction before error
    }
}, [ws, getInteractionById, removeInteraction]);
```

## Scenario
1. User clicks "Allow" on permission dialog
2. `sendInteractionResponse` sends message, removes from UI
3. Network hiccup - message never reaches server
4. UI shows no pending interactions
5. Claude is still waiting for permission response
6. Session stuck indefinitely

## Recommended Fix

### Option 1: Wait for acknowledgment
```javascript
const sendInteractionResponse = useCallback(async (interactionId, response) => {
    const interaction = getInteractionById(interactionId);
    if (!interaction) return false;

    // Mark as "sending" in UI
    updateInteractionStatus(interactionId, 'sending');

    try {
        // Send and wait for ack
        const ackReceived = await sendWithAck(ws, {
            type: 'interaction-response',
            interactionId,
            response
        }, 5000);  // 5 second timeout

        if (ackReceived) {
            removeInteraction(interactionId);
            return true;
        } else {
            // Restore to pending, show retry button
            updateInteractionStatus(interactionId, 'failed');
            return false;
        }
    } catch (error) {
        console.error('Failed to send response:', error);
        updateInteractionStatus(interactionId, 'failed');
        return false;
    }
}, [ws, getInteractionById, removeInteraction, updateInteractionStatus]);
```

### Option 2: Optimistic with retry
```javascript
const sendInteractionResponse = useCallback((interactionId, response) => {
    const interaction = getInteractionById(interactionId);
    if (!interaction) return;

    const message = {
        type: 'interaction-response',
        interactionId,
        response,
        retryCount: 0
    };

    const sendWithRetry = (msg, maxRetries = 3) => {
        try {
            if (ws.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not connected');
            }
            ws.send(JSON.stringify(msg));

            // Remove after successful send, but keep in retry queue
            pendingAcks.current.set(interactionId, {
                message: msg,
                sentAt: Date.now(),
                retries: msg.retryCount
            });

            removeInteraction(interactionId);
        } catch (error) {
            if (msg.retryCount < maxRetries) {
                setTimeout(() => {
                    sendWithRetry({ ...msg, retryCount: msg.retryCount + 1 }, maxRetries);
                }, 1000 * (msg.retryCount + 1));
            } else {
                // Show error to user, restore interaction
                addInteraction(interaction);
                showError('Failed to send response after 3 retries');
            }
        }
    };

    sendWithRetry(message);
}, [ws, getInteractionById, removeInteraction, addInteraction]);
```

## Testing
- [ ] Unit test: Interaction not removed on send failure
- [ ] Unit test: Retry mechanism works after failure
- [ ] Integration test: Simulated network failure handling
- [ ] E2E test: Disconnect during response, reconnect and verify state

## Estimated Effort
2-3 hours
