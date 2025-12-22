import { EventEmitter } from 'events';
import crypto from 'crypto';
import { PERMISSION_TIMEOUT_MS } from './permissionTypes.js';

const PLAN_TTL_MS = 24 * 60 * 60 * 1000;

class PlanApprovalManager extends EventEmitter {
  constructor() {
    super();
    this.pendingPlans = new Map();
    this.statistics = {
      totalRequests: 0,
      approved: 0,
      rejected: 0,
      timedOut: 0
    };
    this.cleanupInterval = setInterval(() => this.cleanExpiredPlans(), 60 * 60 * 1000);
  }

  async requestPlanApproval(planContent, sessionId) {
    const planId = crypto.randomUUID();
    const timestamp = Date.now();
    const expiresAt = timestamp + PERMISSION_TIMEOUT_MS;

    console.log(`📋 [PlanApproval] Requesting approval for plan ${planId} (session: ${sessionId})`);

    return new Promise((resolve, reject) => {
      const plan = {
        planId,
        planData: planContent,
        sessionId,
        status: 'pending',
        requestedAt: timestamp,
        expiresAt,
        decidedAt: null,
        decision: null,
        resolve,
        reject
      };

      this.pendingPlans.set(planId, plan);
      this.statistics.totalRequests++;

      this.emit('plan-request', {
        planId,
        planData: planContent,
        sessionId,
        requestedAt: timestamp,
        expiresAt
      });

      const timeoutHandle = setTimeout(() => {
        const pendingPlan = this.pendingPlans.get(planId);
        if (pendingPlan && pendingPlan.status === 'pending') {
          console.log(`⏱️  [PlanApproval] Plan ${planId} timed out`);
          this.statistics.timedOut++;
          this.emit('plan-timeout', { planId });
          pendingPlan.reject(new Error('Plan approval timed out'));
          this.pendingPlans.delete(planId);
        }
      }, PERMISSION_TIMEOUT_MS);

      plan.timeoutHandle = timeoutHandle;
    });
  }

  resolvePlanApproval(planId, permissionMode = 'default') {
    const plan = this.pendingPlans.get(planId);
    if (!plan) {
      console.warn(`⚠️  [PlanApproval] No pending plan found with ID ${planId}`);
      return { success: false, error: 'invalid_plan' };
    }

    if (plan.status !== 'pending') {
      console.warn(`⚠️  [PlanApproval] Plan ${planId} already decided`);
      return { success: false, error: 'already_decided' };
    }

    console.log(`✅ [PlanApproval] Plan ${planId} approved with mode: ${permissionMode}`);

    clearTimeout(plan.timeoutHandle);
    this.statistics.approved++;

    plan.status = 'approved';
    plan.decision = permissionMode === 'auto' ? 'approve_execute' : 'approve_manual';
    plan.decidedAt = Date.now();
    plan.permissionMode = permissionMode;

    const result = {
      approved: true,
      permissionMode
    };

    plan.resolve(result);
    this.pendingPlans.delete(planId);

    return { success: true };
  }

  rejectPlanApproval(planId, reason = 'Plan rejected by user') {
    const plan = this.pendingPlans.get(planId);
    if (!plan) {
      console.warn(`⚠️  [PlanApproval] No pending plan found with ID ${planId}`);
      return { success: false, error: 'invalid_plan' };
    }

    if (plan.status !== 'pending') {
      console.warn(`⚠️  [PlanApproval] Plan ${planId} already decided`);
      return { success: false, error: 'already_decided' };
    }

    console.log(`❌ [PlanApproval] Plan ${planId} rejected: ${reason}`);

    clearTimeout(plan.timeoutHandle);
    this.statistics.rejected++;

    plan.status = 'rejected';
    plan.decision = 'reject';
    plan.decidedAt = Date.now();

    plan.reject(new Error(reason));
    this.pendingPlans.delete(planId);

    return { success: true };
  }

  getPendingApprovals(sessionIds) {
    const approvals = [];
    const now = Date.now();

    for (const [planId, plan] of this.pendingPlans.entries()) {
      if (plan.status === 'pending' && sessionIds.includes(plan.sessionId)) {
        if (now - plan.requestedAt < PLAN_TTL_MS) {
          approvals.push({
            planId: plan.planId,
            planData: plan.planData,
            sessionId: plan.sessionId,
            requestedAt: plan.requestedAt
          });
        }
      }
    }

    return approvals;
  }

  hasPendingPlan() {
    return this.pendingPlans.size > 0;
  }

  getPendingPlan() {
    const firstPlan = this.pendingPlans.values().next().value;
    return firstPlan ? {
      planId: firstPlan.planId,
      content: firstPlan.planData,
      sessionId: firstPlan.sessionId,
      timestamp: firstPlan.requestedAt,
      expiresAt: firstPlan.expiresAt
    } : null;
  }

  getStatistics() {
    return { ...this.statistics };
  }

  clearPendingPlan() {
    for (const [planId, plan] of this.pendingPlans.entries()) {
      clearTimeout(plan.timeoutHandle);
      plan.reject(new Error('Plan approval cancelled'));
      this.pendingPlans.delete(planId);
    }
  }

  cleanExpiredPlans() {
    const now = Date.now();
    for (const [planId, plan] of this.pendingPlans.entries()) {
      if (now - plan.requestedAt > PLAN_TTL_MS) {
        console.log(`🧹 [PlanApproval] Cleaning expired plan ${planId}`);
        clearTimeout(plan.timeoutHandle);
        plan.reject(new Error('Plan expired'));
        this.pendingPlans.delete(planId);
      }
    }
  }

  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clearPendingPlan();
  }
}

let planApprovalManagerInstance = null;

export function getPlanApprovalManager() {
  if (!planApprovalManagerInstance) {
    planApprovalManagerInstance = new PlanApprovalManager();
  }
  return planApprovalManagerInstance;
}

export { PlanApprovalManager };
