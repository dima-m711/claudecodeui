import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePlanApproval } from './PlanApprovalContext';

const PlanInstanceContext = createContext(null);

export function PlanInstanceProvider({ sessionId, children }) {
  const globalPlanApproval = usePlanApproval();
  const [instanceApprovals, setInstanceApprovals] = useState([]);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [activePlanForSession, setActivePlanForSession] = useState(null);

  useEffect(() => {
    console.log('🔍 [PlanInstance] Filtering approvals:', {
      sessionId,
      totalSessions: globalPlanApproval.pendingApprovals.size,
      allApprovals: Array.from(globalPlanApproval.pendingApprovals.entries()).map(([sid, approvals]) => ({
        sessionId: sid,
        count: approvals.length
      }))
    });

    if (sessionId) {
      const sessionApprovals = globalPlanApproval.pendingApprovals.get(sessionId) || [];

      console.log('✅ [PlanInstance] Filtered results:', {
        sessionId,
        matchingApprovals: sessionApprovals.length,
        approvals: sessionApprovals.map(a => ({
          planId: a.planId,
          status: a.status
        }))
      });

      setInstanceApprovals(sessionApprovals);
      setDialogVisible(sessionApprovals.length > 0);
      setActivePlanForSession(sessionApprovals[0] || null);
    } else {
      setInstanceApprovals([]);
      setDialogVisible(false);
      setActivePlanForSession(null);
    }
  }, [sessionId, globalPlanApproval.pendingApprovals]);

  const handleInstanceDecision = useCallback(async (planId, decision) => {
    console.log('👤 [PlanInstance] User decision:', { planId, decision, sessionId });

    const result = await globalPlanApproval.handleDecision(planId, decision);

    if (!result) {
      console.error('❌ [PlanInstance] handleDecision returned null');
      return;
    }

    const permissionMode = decision === 'approve_execute' ? 'auto' : 'default';
    const wsDecision = decision === 'reject' ? 'reject' : 'approve';

    console.log('📤 [PlanInstance] Sending decision with permissionMode:', permissionMode);

    const success = globalPlanApproval.sendDecision(result.planId, wsDecision, permissionMode);

    if (!success) {
      console.error('❌ [PlanInstance] Failed to send decision via WebSocket');
    }
  }, [globalPlanApproval, sessionId]);

  return (
    <PlanInstanceContext.Provider value={{
      instanceApprovals,
      activePlanForSession,
      dialogVisible,
      setDialogVisible,
      handleInstanceDecision,
      pendingCount: instanceApprovals.length,
      sessionId
    }}>
      {children}
    </PlanInstanceContext.Provider>
  );
}

export const usePlanInstance = () => {
  const context = useContext(PlanInstanceContext);
  if (!context) {
    throw new Error('usePlanInstance must be used within a PlanInstanceProvider');
  }
  return context;
};
