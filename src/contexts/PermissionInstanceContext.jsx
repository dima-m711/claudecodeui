import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePermission } from './PermissionContext';
import { useWebSocketContext } from './WebSocketContext';
import { removePendingRequest } from '../utils/permissionStorage';

const PermissionInstanceContext = createContext(null);

export function PermissionInstanceProvider({ sessionId, children }) {
  const globalPermission = usePermission();
  const { wsClient, isConnected } = useWebSocketContext();
  const [instanceRequests, setInstanceRequests] = useState([]);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [activeInstanceRequest, setActiveInstanceRequest] = useState(null);

  useEffect(() => {
    if (sessionId) {
      const requests = globalPermission.pendingRequests.filter(
        req => req.sessionId === sessionId
      );
      setInstanceRequests(requests);
      setDialogVisible(requests.length > 0);
      setActiveInstanceRequest(requests[0] || null);
    }
  }, [sessionId, globalPermission.pendingRequests]);

  const handleInstanceDecision = useCallback(async (requestId, decision, updatedInput = null) => {
    console.log('👤 [PermissionInstance] User decision:', { requestId, decision, sessionId });

    const result = await globalPermission.handleDecision(requestId, decision, updatedInput);

    if (!result) {
      console.error('❌ [PermissionInstance] handleDecision returned null');
      return;
    }

    if (wsClient && isConnected) {
      console.log('📤 [PermissionInstance] Sending WebSocket response:', {
        id: result.id,
        decision: result.decision,
        hasUpdatedInput: !!result.updatedInput
      });

      try {
        const success = wsClient.sendResponse(result.id, result.decision, result.updatedInput);

        if (success) {
          if (sessionId) {
            removePendingRequest(sessionId, result.id);
          }
        } else {
          console.error('❌ [PermissionInstance] Failed to send response');
        }
      } catch (error) {
        console.error('❌ [PermissionInstance] Error sending response:', error);
      }
    } else {
      console.warn('⚠️ [PermissionInstance] WebSocket not connected, cannot send response');
    }
  }, [globalPermission, wsClient, isConnected, sessionId]);

  return (
    <PermissionInstanceContext.Provider value={{
      instanceRequests,
      activeInstanceRequest,
      dialogVisible,
      setDialogVisible,
      handleInstanceDecision,
      queueCount: instanceRequests.length,
      sessionId
    }}>
      {children}
    </PermissionInstanceContext.Provider>
  );
}

export const usePermissionInstance = () => {
  const context = useContext(PermissionInstanceContext);
  if (!context) {
    throw new Error('usePermissionInstance must be used within a PermissionInstanceProvider');
  }
  return context;
};
