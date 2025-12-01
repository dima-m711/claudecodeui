const STORAGE_KEY_PREFIX = 'claude-ui:plan-approvals:';
const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export function getPlanApprovals(sessionId) {
  if (!sessionId) return [];
  const key = `${STORAGE_KEY_PREFIX}${sessionId}`;
  try {
    const stored = sessionStorage.getItem(key);
    if (!stored) return [];
    const data = JSON.parse(stored);

    if (!data || typeof data !== 'object' || !data.version || !data.approvals) {
      console.warn('Invalid plan approval storage format, clearing');
      sessionStorage.removeItem(key);
      return [];
    }

    const now = Date.now();
    const validApprovals = [];

    for (const [planId, approval] of Object.entries(data.approvals)) {
      if (!approval || typeof approval !== 'object') continue;
      if (!approval.planId || typeof approval.planId !== 'string') continue;
      if (typeof approval.requestedAt !== 'number') continue;

      if (now - approval.requestedAt < APPROVAL_TTL_MS) {
        validApprovals.push(approval);
      }
    }

    return validApprovals;
  } catch (e) {
    console.warn('Failed to parse plan approval storage:', e);
    sessionStorage.removeItem(key);
    return [];
  }
}

export function savePlanApproval(sessionId, approval) {
  if (!sessionId) return;
  const key = `${STORAGE_KEY_PREFIX}${sessionId}`;

  try {
    const stored = sessionStorage.getItem(key);
    let data = {
      version: 1,
      sessionId,
      approvals: {},
      lastUpdated: Date.now()
    };

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.approvals) {
          data.approvals = parsed.approvals;
        }
      } catch (e) {
        console.warn('Failed to parse existing storage, creating new:', e);
      }
    }

    data.approvals[approval.planId] = {
      ...approval,
      requestedAt: approval.requestedAt || Date.now()
    };
    data.lastUpdated = Date.now();

    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.error('Storage quota exceeded, cleaning expired approvals');
      cleanExpiredPlanApprovals();
      try {
        const minimalData = {
          version: 1,
          sessionId,
          approvals: { [approval.planId]: approval },
          lastUpdated: Date.now()
        };
        sessionStorage.setItem(key, JSON.stringify(minimalData));
      } catch (retryError) {
        console.error('Failed to save approval even after cleanup:', retryError);
      }
    } else {
      console.warn('Failed to persist plan approval:', e);
    }
  }
}

export function removePlanApproval(sessionId, planId) {
  if (!sessionId) return;
  const key = `${STORAGE_KEY_PREFIX}${sessionId}`;

  try {
    const stored = sessionStorage.getItem(key);
    if (!stored) return;

    const data = JSON.parse(stored);
    if (!data.approvals) return;

    delete data.approvals[planId];
    data.lastUpdated = Date.now();

    if (Object.keys(data.approvals).length > 0) {
      sessionStorage.setItem(key, JSON.stringify(data));
    } else {
      sessionStorage.removeItem(key);
    }
  } catch (e) {
    console.warn('Failed to remove plan approval:', e);
  }
}

export function updatePlanApprovalStatus(sessionId, planId, status, decision = null) {
  if (!sessionId) return;
  const key = `${STORAGE_KEY_PREFIX}${sessionId}`;

  try {
    const stored = sessionStorage.getItem(key);
    if (!stored) return;

    const data = JSON.parse(stored);
    if (!data.approvals || !data.approvals[planId]) return;

    data.approvals[planId].status = status;
    if (decision) {
      data.approvals[planId].decision = decision;
      data.approvals[planId].decidedAt = Date.now();
    }
    data.lastUpdated = Date.now();

    sessionStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to update plan approval status:', e);
  }
}

export function cleanExpiredPlanApprovals() {
  const now = Date.now();
  const keysToCheck = [];

  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
      keysToCheck.push(key);
    }
  }

  keysToCheck.forEach(key => {
    try {
      const stored = sessionStorage.getItem(key);
      if (!stored) return;

      const data = JSON.parse(stored);
      if (!data.approvals) {
        sessionStorage.removeItem(key);
        return;
      }

      let hasValidApprovals = false;
      const cleanedApprovals = {};

      for (const [planId, approval] of Object.entries(data.approvals)) {
        if (approval && approval.requestedAt && (now - approval.requestedAt < APPROVAL_TTL_MS)) {
          cleanedApprovals[planId] = approval;
          hasValidApprovals = true;
        }
      }

      if (hasValidApprovals) {
        data.approvals = cleanedApprovals;
        data.lastUpdated = now;
        sessionStorage.setItem(key, JSON.stringify(data));
      } else {
        sessionStorage.removeItem(key);
      }
    } catch (e) {
      console.warn('Failed to clean expired approvals for key:', key, e);
      sessionStorage.removeItem(key);
    }
  });
}

export function clearAllPlanApprovals(sessionId) {
  if (!sessionId) return;
  const key = `${STORAGE_KEY_PREFIX}${sessionId}`;
  sessionStorage.removeItem(key);
}
