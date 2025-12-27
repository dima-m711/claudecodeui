import React from 'react';
import Markdown from './Markdown';

const PlanResultCard = ({ message }) => {
  if (!message.toolInput) {
    return null;
  }

  let planContent = null;
  try {
    const input = JSON.parse(message.toolInput);
    planContent = input.plan || null;
  } catch (e) {
    console.error('Error parsing ExitPlanMode input:', e);
    return null;
  }

  if (!planContent) {
    return null;
  }

  if (!message.toolResult) {
    return null;
  }

  const isApproved = !message.toolResult.isError;

  return (
    <div className="relative mt-3">
      <div className={`bg-gradient-to-br rounded-lg p-6 border ${
        isApproved
          ? 'from-blue-50/50 to-indigo-50/50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200/50 dark:border-blue-800/50'
          : 'from-red-50/50 to-rose-50/50 dark:from-red-950/30 dark:to-rose-950/30 border-red-200/50 dark:border-red-800/50'
      }`}>
        <div className={`flex items-center gap-3 mb-4 pb-3 border-b ${
          isApproved
            ? 'border-blue-200/50 dark:border-blue-800/50'
            : 'border-red-200/50 dark:border-red-800/50'
        }`}>
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-lg ${
            isApproved
              ? 'from-blue-500 to-indigo-600 dark:from-blue-400 dark:to-indigo-500 shadow-blue-500/20'
              : 'from-red-500 to-rose-600 dark:from-red-400 dark:to-rose-500 shadow-red-500/20'
          }`}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isApproved ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              )}
            </svg>
          </div>
          <span className={`text-lg font-semibold ${
            isApproved
              ? 'text-blue-900 dark:text-blue-100'
              : 'text-red-900 dark:text-red-100'
          }`}>
            Implementation Plan
          </span>
        </div>
        <Markdown className={`prose prose-sm max-w-none dark:prose-invert ${
          isApproved
            ? 'prose-headings:text-blue-900 dark:prose-headings:text-blue-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-strong:text-blue-800 dark:prose-strong:text-blue-200'
            : 'prose-headings:text-red-900 dark:prose-headings:text-red-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-strong:text-red-800 dark:prose-strong:text-red-200'
        }`}>
          {planContent}
        </Markdown>
      </div>

      <div className={`flex items-center gap-2 mt-4 p-3 rounded-lg text-sm ${
        isApproved
          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
          : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
      }`}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isApproved ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          )}
        </svg>
        <span className="font-medium">
          {isApproved ? 'Plan Approved' : 'Plan Rejected'}
        </span>
      </div>
    </div>
  );
};

export default PlanResultCard;
