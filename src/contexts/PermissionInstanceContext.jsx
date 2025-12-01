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
    console.log('🔍 [PermissionInstance] Filtering requests:', {
      sessionId,
      hasActiveRequest: !!globalPermission.activeRequest,
      activeRequest: globalPermission.activeRequest ? {
        id: globalPermission.activeRequest.id,
        tool: globalPermission.activeRequest.tool,
        sessionId: globalPermission.activeRequest.sessionId
      } : null,
      totalPendingRequests: globalPermission.pendingRequests.length,
      pendingRequests: globalPermission.pendingRequests.map(req => ({
        id: req.id,
        tool: req.tool,
        sessionId: req.sessionId
      }))
    });

    if (sessionId) {
      // Collect all requests: activeRequest + pendingRequests
      const allRequests = [];

      if (globalPermission.activeRequest && globalPermission.activeRequest.sessionId === sessionId) {
        allRequests.push(globalPermission.activeRequest);
      }

      const matchingPending = globalPermission.pendingRequests.filter(
        req => req.sessionId === sessionId
      );
      allRequests.push(...matchingPending);

      console.log('✅ [PermissionInstance] Filtered results:', {
        matchingRequests: allRequests.length,
        requests: allRequests.map(req => ({
          id: req.id,
          tool: req.tool,
          sessionId: req.sessionId
        }))
      });

      setInstanceRequests(allRequests);
      setDialogVisible(allRequests.length > 0);
      setActiveInstanceRequest(allRequests[0] || null);
    }
  }, [sessionId, globalPermission.pendingRequests, globalPermission.activeRequest]);

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
        const success = wsClient.sendResponse(result.id, result.decision, result.updatedInput, sessionId);

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
