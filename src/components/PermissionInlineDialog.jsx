import { useState, useCallback } from 'react';
import { Shield, AlertTriangle, Terminal, Code, FileText, Globe, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { usePermissionInstance } from '../contexts/PermissionInstanceContext';
import { PERMISSION_DECISIONS } from '../utils/permissionWebSocketClient';

const getRiskLevel = (tool, operation) => {
  const highRiskTools = ['bash', 'terminal', 'exec', 'shell'];
  const mediumRiskTools = ['file_write', 'file_delete', 'database', 'api'];
  const lowRiskTools = ['file_read', 'search', 'list'];

  const toolLower = tool?.toLowerCase() || '';
  const opLower = operation?.toLowerCase() || '';

  if (highRiskTools.some(t => toolLower.includes(t)) || opLower.includes('delete') || opLower.includes('remove')) {
    return { level: 'high', color: 'red', icon: AlertTriangle };
  }
  if (mediumRiskTools.some(t => toolLower.includes(t)) || opLower.includes('write') || opLower.includes('modify')) {
    return { level: 'medium', color: 'amber', icon: Shield };
  }
  return { level: 'low', color: 'green', icon: Shield };
};

const getToolIcon = (tool) => {
  const toolLower = tool?.toLowerCase() || '';
  if (toolLower.includes('bash') || toolLower.includes('terminal')) return Terminal;
  if (toolLower.includes('code') || toolLower.includes('script')) return Code;
  if (toolLower.includes('file')) return FileText;
  if (toolLower.includes('web') || toolLower.includes('url')) return Globe;
  if (toolLower.includes('database') || toolLower.includes('db')) return Database;
  return Shield;
};

export function PermissionInlineDialog() {
  const {
    activeInstanceRequest,
    dialogVisible,
    handleInstanceDecision,
    queueCount
  } = usePermissionInstance();

  const [showDetails, setShowDetails] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedInput, setEditedInput] = useState(null);

  const handleSubmit = useCallback((decision) => {
    if (!activeInstanceRequest) return;
    handleInstanceDecision(activeInstanceRequest.id, decision, editedInput);
  }, [activeInstanceRequest, handleInstanceDecision, editedInput]);

  const handleParameterEdit = () => {
    setIsEditing(true);
    setEditedInput(activeInstanceRequest.input || {});
  };

  const saveParameterEdits = () => {
    setIsEditing(false);
    try {
      if (typeof editedInput === 'string') {
        JSON.parse(editedInput);
      }
    } catch (error) {
      alert('Invalid JSON format');
      return;
    }
  };

  if (!dialogVisible || !activeInstanceRequest) return null;

  const risk = getRiskLevel(activeInstanceRequest.tool, activeInstanceRequest.operation);
  const ToolIcon = getToolIcon(activeInstanceRequest.tool);

  const riskColors = {
    high: 'border-red-500 bg-red-50 dark:bg-red-900/20',
    medium: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20',
    low: 'border-green-500 bg-green-50 dark:bg-green-900/20'
  };

  const riskTextColors = {
    high: 'text-red-600 dark:text-red-400',
    medium: 'text-amber-600 dark:text-amber-400',
    low: 'text-green-600 dark:text-green-400'
  };

  return (
    <div className={`mx-4 mb-4 rounded-lg border-2 p-4 ${riskColors[risk.level]} shadow-lg`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <ToolIcon className={`w-5 h-5 ${riskTextColors[risk.level]}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm flex items-center gap-2">
              ⚠️ Permission Required
              {queueCount > 1 && (
                <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                  +{queueCount - 1} queued
                </span>
              )}
            </span>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1"
            >
              {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showDetails ? 'Less' : 'More'}
            </button>
          </div>

          <div className="space-y-1 mb-3">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {activeInstanceRequest.tool}
              {activeInstanceRequest.operation && ` - ${activeInstanceRequest.operation}`}
            </p>
            {activeInstanceRequest.description && (
              <p className="text-xs text-gray-600 dark:text-gray-400 break-all">
                {activeInstanceRequest.description}
              </p>
            )}
          </div>

          {showDetails && (
            <div className="mb-3 p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
              <div className="text-xs space-y-1">
                {activeInstanceRequest.input && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Parameters:</span>
                    {isEditing ? (
                      <div className="mt-1">
                        <textarea
                          value={typeof editedInput === 'string' ? editedInput : JSON.stringify(editedInput, null, 2)}
                          onChange={(e) => setEditedInput(e.target.value)}
                          className="w-full p-2 text-xs font-mono bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded"
                          rows={5}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={saveParameterEdits}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setIsEditing(false)}
                            className="px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded overflow-x-auto text-gray-800 dark:text-gray-200">
                          {JSON.stringify(activeInstanceRequest.input, null, 2)}
                        </pre>
                        <button
                          onClick={handleParameterEdit}
                          className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Edit parameters
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {activeInstanceRequest.timestamp && (
                  <div className="text-gray-500 dark:text-gray-500">
                    Requested: {new Date(activeInstanceRequest.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleSubmit(PERMISSION_DECISIONS.ALLOW)}
              className="flex-1 min-w-[100px] px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors"
            >
              Allow
            </button>
            <button
              onClick={() => handleSubmit(PERMISSION_DECISIONS.DENY)}
              className="flex-1 min-w-[100px] px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded transition-colors"
            >
              Deny
            </button>
            <button
              onClick={() => handleSubmit(PERMISSION_DECISIONS.ALLOW_SESSION)}
              className="flex-1 min-w-[120px] px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
            >
              Allow Session
            </button>
            <button
              onClick={() => handleSubmit(PERMISSION_DECISIONS.ALLOW_ALWAYS)}
              className="flex-1 min-w-[120px] px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded transition-colors"
            >
              Always Allow
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
