import { EventEmitter } from 'events';
import { getInteractionManager } from './interactionManager.js';
import { InteractionType } from './interactionTypes.js';

class PlanApprovalManager extends EventEmitter {
  constructor() {
    super();
    this.interactionManager = getInteractionManager();

    // Forward interaction-request events from InteractionManager
    this.interactionManager.on('interaction-request', (interaction) => {
      if (interaction.type === InteractionType.PLAN_APPROVAL) {
        this.emit('plan-request', {
          planId: interaction.id,
          content: interaction.data.planData,
          sessionId: interaction.sessionId,
          timestamp: interaction.requestedAt
        });
      }
    });
  }

  async requestPlanApproval(planContent, sessionId) {
    console.log(`📋 [PlanApproval] Requesting approval for plan`);

    try {
      const response = await this.interactionManager.requestInteraction({
        type: InteractionType.PLAN_APPROVAL,
        sessionId,
        data: {
          planData: planContent
        },
        metadata: {}
      });

      return {
        approved: true,
        permissionMode: response.permissionMode || 'default'
      };
    } catch (error) {
      console.error(`❌ [PlanApproval] Plan approval failed:`, error.message);
      throw error;
    }
  }

  resolvePlanApproval(planId, permissionMode = 'default') {
    console.log(`✅ [PlanApproval] Plan ${planId} approved with mode: ${permissionMode}`);

    const result = this.interactionManager.resolveInteraction(planId, {
      permissionMode
    });

    return result.success;
  }

  rejectPlanApproval(planId, reason = 'Plan rejected by user') {
    console.log(`❌ [PlanApproval] Plan ${planId} rejected: ${reason}`);

    const result = this.interactionManager.rejectInteraction(planId, reason);

    return result.success;
  }

  hasPendingPlan() {
    const pending = Array.from(this.interactionManager.pendingInteractions.values())
      .filter(i => i.type === InteractionType.PLAN_APPROVAL);
    return pending.length > 0;
  }

  getPendingPlan() {
    const pending = Array.from(this.interactionManager.pendingInteractions.values())
      .filter(i => i.type === InteractionType.PLAN_APPROVAL);

    if (pending.length === 0) return null;

    const plan = pending[0];
    return {
      planId: plan.id,
      content: plan.data.planData,
      sessionId: plan.sessionId,
      timestamp: plan.requestedAt
    };
  }

  getPendingApprovals(sessionIds) {
    return this.interactionManager.getPendingInteractions(sessionIds, InteractionType.PLAN_APPROVAL);
  }

  getStatistics() {
    const stats = this.interactionManager.getStatistics();
    return stats['plan-approval'] || { total: 0, resolved: 0, rejected: 0 };
  }

  clearPendingPlan() {
    const pending = this.getPendingPlan();
    if (pending) {
      this.rejectPlanApproval(pending.planId, 'Plan approval cancelled');
    }
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
