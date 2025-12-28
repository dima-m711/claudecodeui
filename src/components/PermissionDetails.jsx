import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const PERMISSION_DECISIONS = {
  ALLOW: 'allow',
  ALLOW_SESSION: 'allow-session',
  DENY: 'deny',
  MODIFY: 'modify'
};

const PermissionDetails = ({ interaction, onResponse, onDismiss }) => {
  const { data } = interaction;
  const { toolName, input, riskLevel = 'medium', category = 'general' } = data || {};

  const [decision, setDecision] = useState(null);
  const [modifiedInput, setModifiedInput] = useState(JSON.stringify(input, null, 2));
  const [showInputEditor, setShowInputEditor] = useState(false);
  const [showParameters, setShowParameters] = useState(false);
  const inputPreviewRef = useRef(null);

  const handleDecision = (selectedDecision) => {
    if (selectedDecision === PERMISSION_DECISIONS.MODIFY) {
      setShowInputEditor(true);
      setDecision(selectedDecision);
      return;
    }

    const response = {
      decision: selectedDecision,
      updatedInput: input
    };

    onResponse(response);
  };

  const handleSubmitModified = () => {
    try {
      const parsedInput = JSON.parse(modifiedInput);
      const response = {
        decision: PERMISSION_DECISIONS.ALLOW,
        updatedInput: parsedInput
      };
      onResponse(response);
    } catch (error) {
      alert('Invalid JSON: ' + error.message);
    }
  };

  useEffect(() => {
    if (inputPreviewRef.current) {
      inputPreviewRef.current.textContent = JSON.stringify(input, null, 2);
    }
  }, [input]);

  const getRiskStyles = (risk) => {
    switch (risk) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRiskStyles(riskLevel)}`}>
          Risk: {riskLevel}
        </span>
        <span className="px-2 py-1 text-xs font-medium rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">
          Category: {category}
        </span>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Tool: {toolName}
        </p>

        <div className="border border-gray-200 dark:border-gray-700 rounded">
          <button
            onClick={() => setShowParameters(!showParameters)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span>View Input Parameters</span>
            {showParameters ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {showParameters && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-2">
              <pre ref={inputPreviewRef} className="text-xs overflow-auto max-h-48 bg-gray-900 text-gray-100 p-2 rounded m-0" />
            </div>
          )}
        </div>
      </div>

      {showInputEditor ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Modify Input (JSON):
          </p>
          <textarea
            value={modifiedInput}
            onChange={(e) => setModifiedInput(e.target.value)}
            rows={10}
            className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-gray-100"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmitModified}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Allow with Modifications
            </button>
            <button
              onClick={() => {
                setShowInputEditor(false);
                setDecision(null);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleDecision(PERMISSION_DECISIONS.ALLOW)}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
          >
            Allow Once
          </button>
          <button
            onClick={() => handleDecision(PERMISSION_DECISIONS.ALLOW_SESSION)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Allow for Session
          </button>
          <button
            onClick={() => handleDecision(PERMISSION_DECISIONS.MODIFY)}
            className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            Modify Input
          </button>
          <button
            onClick={() => handleDecision(PERMISSION_DECISIONS.DENY)}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
};

export default PermissionDetails;
