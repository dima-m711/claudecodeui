import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import {
  getPlanApprovals,
  savePlanApproval,
  removePlanApproval,
  updatePlanApprovalStatus,
  cleanExpiredPlanApprovals
} from '../utils/planApprovalStorage';

const PlanApprovalContext = createContext();

export const usePlanApproval = () => {
  const context = useContext(PlanApprovalContext);
  if (!context) {
    throw new Error('usePlanApproval must be used within a PlanApprovalProvider');
  }
  return context;
};

export const PlanApprovalProvider = ({ children, websocket, currentSessionId }) => {
  const [pendingApprovals, setPendingApprovals] = useState(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const lastSessionIdRef = useRef(null);
  const syncedRef = useRef(false);

  useEffect(() => {
    cleanExpiredPlanApprovals();
  }, []);

  useEffect(() => {
    if (!currentSessionId) {
      if (lastSessionIdRef.current) {
        setPendingApprovals(new Map());
      }
      lastSessionIdRef.current = null;
      syncedRef.current = false;
      return;
    }

    if (currentSessionId !== lastSessionIdRef.current) {
      lastSessionIdRef.current = currentSessionId;
      syncedRef.current = false;

      console.log('🔄 [PlanApproval] Session changed, clearing state, waiting for sync:', currentSessionId);
      setPendingApprovals(new Map());
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (!websocket) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'plan-approval-request') {
          console.log('📋 [PlanApproval] Received plan approval request:', {
            planId: data.planId,
            sessionId: data.sessionId
          });

          const approval = {
            planId: data.planId,
            planData: data.planData || data.content,
            sessionId: data.sessionId,
            status: 'pending',
            requestedAt: data.requestedAt || data.timestamp,
            expiresAt: data.expiresAt,
            decidedAt: null,
            decision: null
          };

          enqueuePlanApproval(data.sessionId, approval);
        } else if (data.type === 'plan-approval-timeout') {
          console.log('⏱️  [PlanApproval] Plan approval timed out:', data.planId);
          handleTimeout(data.planId);
        } else if (data.type === 'plan-approval-sync-response') {
          console.log('🔄 [PlanApproval] Received sync response:', data.approvals?.length || 0, 'approvals');
          handleSyncResponse(data.approvals);
        } else if (data.type === 'plan-approval-decision-ack') {
          console.log('✅ [PlanApproval] Decision acknowledged:', {
            planId: data.planId,
            success: data.success,
            error: data.error
          });
        }
      } catch (error) {
        console.error('Error handling plan approval message:', error);
      }
    };

    const handleOpen = () => {
      console.log('🔌 [PlanApproval] WebSocket connected');
      setIsConnected(true);
      if (!syncedRef.current && currentSessionId) {
        syncWithBackend([currentSessionId]);
      }
    };

    const handleClose = () => {
      console.log('🔌 [PlanApproval] WebSocket disconnected');
      setIsConnected(false);
      syncedRef.current = false;
    };

    websocket.addEventListener('message', handleMessage);
    websocket.addEventListener('open', handleOpen);
    websocket.addEventListener('close', handleClose);

    if (websocket.readyState === WebSocket.OPEN) {
      setIsConnected(true);
      if (!syncedRef.current && currentSessionId) {
        syncWithBackend([currentSessionId]);
      }
    }

    return () => {
      websocket.removeEventListener('message', handleMessage);
      websocket.removeEventListener('open', handleOpen);
      websocket.removeEventListener('close', handleClose);
    };
  }, [websocket, currentSessionId]);

  const enqueuePlanApproval = useCallback((sessionId, approval) => {
    setPendingApprovals(prev => {
      const updated = new Map(prev);
      const sessionApprovals = updated.get(sessionId) || [];

      const exists = sessionApprovals.find(a => a.planId === approval.planId);
      if (exists) {
        console.log('📋 [PlanApproval] Duplicate approval ignored:', approval.planId);
        return prev;
      }

      updated.set(sessionId, [...sessionApprovals, approval]);
      savePlanApproval(sessionId, approval);
      return updated;
    });
  }, []);

  const handleDecision = useCallback(async (planId, decision) => {
    const allApprovals = Array.from(pendingApprovals.values()).flat();
    const approval = allApprovals.find(a => a.planId === planId);

    if (!approval) {
      console.error('❌ [PlanApproval] No approval found for planId:', planId);
      return null;
    }

    console.log('👤 [PlanApproval] User decision:', { planId, decision });

    updatePlanApprovalStatus(approval.sessionId, planId, 'decided', decision);

    setPendingApprovals(prev => {
      const updated = new Map(prev);
      const sessionApprovals = updated.get(approval.sessionId) || [];
      updated.set(
        approval.sessionId,
        sessionApprovals.filter(a => a.planId !== planId)
      );
      removePlanApproval(approval.sessionId, planId);
      return updated;
    });

    return {
      planId,
      decision,
      sessionId: approval.sessionId
    };
  }, [pendingApprovals]);

  const sendDecision = useCallback((planId, decision, permissionMode) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return false;
    }

    const response = {
      type: 'plan-approval-response',
      planId,
      decision,
      permissionMode,
      timestamp: Date.now()
    };

    websocket.send(JSON.stringify(response));
    return true;
  }, [websocket]);

  const handleTimeout = useCallback((planId) => {
    setPendingApprovals(prev => {
      const updated = new Map(prev);
      for (const [sessionId, approvals] of updated.entries()) {
        const filtered = approvals.filter(a => a.planId !== planId);
        if (filtered.length !== approvals.length) {
          updated.set(sessionId, filtered);
          removePlanApproval(sessionId, planId);
        }
      }
      return updated;
    });
  }, []);

  const syncWithBackend = useCallback((sessionIds) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ [PlanApproval] Cannot sync - WebSocket not connected');
      return;
    }

    console.log('🔄 [PlanApproval] Requesting sync for sessions:', sessionIds);
    syncedRef.current = true;

    websocket.send(JSON.stringify({
      type: 'plan-approval-sync-request',
      sessionIds,
      timestamp: Date.now()
    }));
  }, [websocket]);

  const handleSyncResponse = useCallback((approvals) => {
    if (!approvals || !Array.isArray(approvals)) return;

    setPendingApprovals(prev => {
      const updated = new Map(prev);

      approvals.forEach(approval => {
        const sessionApprovals = updated.get(approval.sessionId) || [];
        const exists = sessionApprovals.find(a => a.planId === approval.planId);

        if (!exists) {
          const fullApproval = {
            ...approval,
            status: 'pending',
            decidedAt: null,
            decision: null
          };
          updated.set(approval.sessionId, [...sessionApprovals, fullApproval]);
          savePlanApproval(approval.sessionId, fullApproval);
        }
      });

      return updated;
    });
  }, []);

  const value = {
    pendingApprovals,
    isConnected,
    enqueuePlanApproval,
    handleDecision,
    sendDecision,
    syncWithBackend
  };

  return (
    <PlanApprovalContext.Provider value={value}>
      {children}
    </PlanApprovalContext.Provider>
  );
};
