import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePermission } from './PermissionContext';

const PermissionInstanceContext = createContext(null);

export function PermissionInstanceProvider({ sessionId, children }) {
  const globalPermission = usePermission();
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

  const handleInstanceDecision = useCallback(async (requestId, decision) => {
    await globalPermission.handleDecision(requestId, decision);
  }, [globalPermission]);

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
