import React, { useState } from 'react';
import Markdown from './Markdown';

const PlanApprovalDetails = ({ interaction, onResponse, onDismiss }) => {
  const { data } = interaction;
  const { planData } = data || {};

  const [permissionMode, setPermissionMode] = useState('default');

  const handleApprove = () => {
    onResponse({
      permissionMode
    });
  };

  const handleReject = () => {
    onDismiss();
  };

  const permissionOptions = [
    {
      value: 'default',
      label: 'Default',
      description: 'Use current permission settings'
    },
    {
      value: 'acceptEdits',
      label: 'Auto-approve Read/Write',
      description: 'Automatically approve read/write operations'
    },
    {
      value: 'bypassPermissions',
      label: 'bypass All',
      description: 'Automatically approve all operations for this plan'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900 max-h-96 overflow-auto">
        <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-3">
          Proposed Plan:
        </h4>

        <div className="prose prose-sm dark:prose-invert max-w-none
          prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-2 prose-pre:rounded prose-pre:overflow-auto prose-pre:text-sm
          prose-code:bg-gray-900 prose-code:text-gray-100 prose-code:px-1 prose-code:rounded prose-code:text-sm
          prose-headings:mt-4 prose-headings:mb-2
          prose-ul:pl-6 prose-ol:pl-6">
          {typeof planData === 'string' ? (
            <Markdown>{planData}</Markdown>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No plan data available
            </p>
          )}
        </div>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      <div>
        <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-3">
          Permission Mode
        </h4>
        <div className="space-y-2">
          {permissionOptions.map((option) => (
            <label
              key={option.value}
              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors
                ${permissionMode === option.value
                  ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              <input
                type="radio"
                name="permissionMode"
                value={option.value}
                checked={permissionMode === option.value}
                onChange={(e) => setPermissionMode(e.target.value)}
                className="mt-0.5 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {option.label}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
        >
          Approve Plan
        </button>
        <button
          onClick={handleReject}
          className="flex-1 px-4 py-2 border border-red-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium rounded-lg transition-colors"
        >
          Reject Plan
        </button>
      </div>
    </div>
  );
};

export default PlanApprovalDetails;
