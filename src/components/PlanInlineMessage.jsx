import { useState, useCallback } from 'react';
import { ClipboardList, ChevronDown, ChevronUp, Check, X, Zap, Hand } from 'lucide-react';
import { usePlanInstance } from '../contexts/PlanInstanceContext';

export function PlanInlineMessage() {
  const {
    activePlanForSession,
    dialogVisible,
    handleInstanceDecision,
    pendingCount
  } = usePlanInstance();

  console.log('📋 [PlanInlineMessage] Render:', {
    dialogVisible,
    hasActivePlan: !!activePlanForSession,
    pendingCount
  });

  const [showDetails, setShowDetails] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDecision = useCallback(async (decision) => {
    if (!activePlanForSession || isProcessing) return;

    setIsProcessing(true);
    try {
      await handleInstanceDecision(activePlanForSession.planId, decision);
    } catch (error) {
      console.error('Failed to handle decision:', error);
    } finally {
      setTimeout(() => setIsProcessing(false), 500);
    }
  }, [activePlanForSession, handleInstanceDecision, isProcessing]);

  if (!dialogVisible || !activePlanForSession) return null;

  const planData = activePlanForSession.planData || {};
  const title = planData.title || 'Plan Approval Required';
  const description = planData.description || '';
  const steps = planData.steps || [];

  return (
    <div className="mx-4 mb-4 rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 p-4 shadow-lg">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-lg">
                {title}
              </h3>
              {description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {description}
                </p>
              )}
            </div>
          </div>

          {steps.length > 0 && (
            <div className="mb-4">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Hide Details
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Show Details ({steps.length} steps)
                  </>
                )}
              </button>

              {showDetails && (
                <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border border-blue-200 dark:border-blue-700">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                    Plan Steps:
                  </p>
                  <ul className="space-y-2">
                    {steps.map((step, index) => (
                      <li key={index} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span className="flex-shrink-0 text-blue-500 font-medium">
                          {index + 1}.
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={() => handleDecision('approve_execute')}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
            >
              <Zap className="w-4 h-4" />
              Approve & Auto-Execute
            </button>

            <button
              onClick={() => handleDecision('approve_manual')}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
            >
              <Hand className="w-4 h-4" />
              Approve & Manual
            </button>

            <button
              onClick={() => handleDecision('reject')}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium text-sm transition-colors shadow-sm"
            >
              <X className="w-4 h-4" />
              Reject
            </button>
          </div>

          {pendingCount > 1 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              +{pendingCount - 1} more pending approval{pendingCount - 1 > 1 ? 's' : ''}
            </p>
          )}
    </div>
  );
}
