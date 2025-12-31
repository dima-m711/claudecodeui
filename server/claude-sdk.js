/**
 * Claude SDK Integration
 *
 * This module provides SDK-based integration with Claude using the @anthropic-ai/claude-agent-sdk.
 * It mirrors the interface of claude-cli.js but uses the SDK internally for better performance
 * and maintainability.
 *
 * Key features:
 * - Direct SDK integration without child processes
 * - Session management with abort capability
 * - Options mapping between CLI and SDK formats
 * - WebSocket message streaming
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { CLAUDE_MODELS } from '../shared/modelConstants.js';
import crypto from 'crypto';
import { getInteractionManager } from './services/interactionManager.js';
import {
  InteractionType,
  createSdkPermissionResult,
  TOOL_RISK_LEVELS,
  TOOL_CATEGORIES,
  RiskLevel
} from './services/interactionTypes.js';
import { AskUserQuestionHandler } from './handlers/AskUserQuestionHandler.js';
import { ExitPlanModeHandler } from './handlers/ExitPlanModeHandler.js';
import { PermissionManager } from './services/PermissionManager.js';

const activeSessions = new Map();

function createCanUseToolHandler(runtimeState, ws, sessionIdRef) {
  const interactionManager = getInteractionManager();
  const askUserHandler = new AskUserQuestionHandler(interactionManager);
  const exitPlanHandler = new ExitPlanModeHandler(interactionManager);
  const permissionManager = new PermissionManager(interactionManager);

  return async (toolName, input, options) => {
    const abortSignal = options?.signal || options;
    const suggestions = options?.suggestions;
    const toolUseID = options?.toolUseID;

    switch (toolName) {
      case 'AskUserQuestion':
        return await askUserHandler.handle(input, sessionIdRef);

      case 'ExitPlanMode':
        return await exitPlanHandler.handle(input, sessionIdRef, runtimeState);

      default:
        return await permissionManager.checkPermission(
          toolName, input, runtimeState, ws, sessionIdRef, abortSignal, suggestions
        );
    }
  };
}

/**
 * Maps CLI options to SDK-compatible options format
 * @param {Object} options - CLI options
 * @param {Object} ws - WebSocket connection for permission communication
 * @param {Object} sessionIdRef - Reference object containing capturedSessionId
 * @returns {Object} SDK-compatible options
 */
function mapCliOptionsToSDK(options = {}, ws = null, sessionIdRef = null) {
  const { sessionId, cwd, toolsSettings, permissionMode, images } = options;

  const runtimeState = { permissionMode: permissionMode || 'default' };

  const sdkOptions = {};

  // Map working directory
  if (cwd) {
    sdkOptions.cwd = cwd;
  }

  // Map permission mode
  if (runtimeState.permissionMode && runtimeState.permissionMode !== 'default') {
    sdkOptions.permissionMode = runtimeState.permissionMode;
  }

  // Map tool settings
  const settings = toolsSettings || {
    allowedTools: [],
    disallowedTools: [],
    skipPermissions: false
  };

  // Handle tool permissions
  if (settings.skipPermissions && runtimeState.permissionMode !== 'plan') {
    sdkOptions.permissionMode = 'bypassPermissions';
    runtimeState.permissionMode = 'bypassPermissions';
  } else {
    // Map allowed tools
    let allowedTools = [...(settings.allowedTools || [])];

    // Add plan mode default tools
    if (runtimeState.permissionMode === 'plan') {
      const planModeTools = [
            'Read',             // Read files for context
            'Glob',             // Search for files by pattern
            'Grep',             // Search code content
            'Task',             // Launch subagents
            'ExitPlanMode',     // Exit planning mode
            'TodoRead',         // Read todos
            'TodoWrite',
            'WebFetch',
            'WebSearch',
            'AskUserQuestion'   // Ask clarifying questions
      ];
      for (const tool of planModeTools) {
        if (!allowedTools.includes(tool)) {
          allowedTools.push(tool);
        }
      }
    }

    if (allowedTools.length > 0) {
      sdkOptions.allowedTools = allowedTools;
    }

    // Map disallowed tools
    if (settings.disallowedTools && settings.disallowedTools.length > 0) {
      sdkOptions.disallowedTools = settings.disallowedTools;
    }
  }

  // Map model (default to sonnet)
  // Valid models: sonnet, opus, haiku, opusplan, sonnet[1m]
  sdkOptions.model = options.model || CLAUDE_MODELS.DEFAULT;
  console.log(`Using model: ${sdkOptions.model}`);

  // Map system prompt configuration
  sdkOptions.systemPrompt = {
    type: 'preset',
    preset: 'claude_code'  // Required to use CLAUDE.md
  };

  // Map setting sources for CLAUDE.md loading
  // This loads CLAUDE.md from project, user (~/.config/claude/CLAUDE.md), and local directories
  sdkOptions.settingSources = ['project', 'user', 'local'];

  // Map resume session
  if (sessionId) {
    sdkOptions.resume = sessionId;
  }

  // Add canUseTool callback for permission handling
  // Only if not in bypassPermissions mode
  if (runtimeState.permissionMode !== 'bypassPermissions' && ws) {
    sdkOptions.canUseTool = createCanUseToolHandler(runtimeState, ws, sessionIdRef);
  }

  return { sdkOptions, runtimeState };
}

/**
 * Adds a session to the active sessions map
 * @param {string} sessionId - Session identifier
 * @param {Object} queryInstance - SDK query instance
 * @param {Array<string>} tempImagePaths - Temp image file paths for cleanup
 * @param {string} tempDir - Temp directory for cleanup
 */
function addSession(sessionId, queryInstance, tempImagePaths = [], tempDir = null) {
  activeSessions.set(sessionId, {
    instance: queryInstance,
    startTime: Date.now(),
    status: 'active',
    tempImagePaths,
    tempDir
  });
}

/**
 * Removes a session from the active sessions map
 * @param {string} sessionId - Session identifier
 */
function removeSession(sessionId) {
  activeSessions.delete(sessionId);
}

/**
 * Gets a session from the active sessions map
 * @param {string} sessionId - Session identifier
 * @returns {Object|undefined} Session data or undefined
 */
function getSession(sessionId) {
  return activeSessions.get(sessionId);
}

/**
 * Gets all active session IDs
 * @returns {Array<string>} Array of active session IDs
 */
function getAllSessions() {
  return Array.from(activeSessions.keys());
}

/**
 * Transforms SDK messages to WebSocket format expected by frontend
 * @param {Object} sdkMessage - SDK message object
 * @returns {Object} Transformed message ready for WebSocket
 */
function transformMessage(sdkMessage) {
  // SDK messages are already in a format compatible with the frontend
  // The CLI sends them wrapped in {type: 'claude-response', data: message}
  // We'll do the same here to maintain compatibility
  return sdkMessage;
}

/**
 * Extracts token usage from SDK result messages
 * @param {Object} resultMessage - SDK result message
 * @returns {Object|null} Token budget object or null
 */
function extractTokenBudget(resultMessage) {
  if (resultMessage.type !== 'result' || !resultMessage.modelUsage) {
    return null;
  }

  // Get the first model's usage data
  const modelKey = Object.keys(resultMessage.modelUsage)[0];
  const modelData = resultMessage.modelUsage[modelKey];

  if (!modelData) {
    return null;
  }

  const inputTokens = modelData.cumulativeInputTokens || modelData.inputTokens || 0;
  const outputTokens = modelData.cumulativeOutputTokens || modelData.outputTokens || 0;
  const cacheReadTokens = modelData.cumulativeCacheReadInputTokens || modelData.cacheReadInputTokens || 0;
  const cacheCreationTokens = modelData.cumulativeCacheCreationInputTokens || modelData.cacheCreationInputTokens || 0;

  const totalUsed = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;

  const contextWindow = parseInt(process.env.CONTEXT_WINDOW) || 160000;

  console.log(`Token calculation: input=${inputTokens}, output=${outputTokens}, cache=${cacheReadTokens + cacheCreationTokens}, total=${totalUsed}/${contextWindow}`);

  return {
    used: totalUsed,
    total: contextWindow
  };
}

/**
 * Handles image processing for SDK queries
 * Saves base64 images to temporary files and returns modified prompt with file paths
 * @param {string} command - Original user prompt
 * @param {Array} images - Array of image objects with base64 data
 * @param {string} cwd - Working directory for temp file creation
 * @returns {Promise<Object>} {modifiedCommand, tempImagePaths, tempDir}
 */
async function handleImages(command, images, cwd) {
  const tempImagePaths = [];
  let tempDir = null;

  if (!images || images.length === 0) {
    return { modifiedCommand: command, tempImagePaths, tempDir };
  }

  try {
    // Create temp directory in the project directory
    const workingDir = cwd || process.cwd();
    tempDir = path.join(workingDir, '.tmp', 'images', Date.now().toString());
    await fs.mkdir(tempDir, { recursive: true });

    // Save each image to a temp file
    for (const [index, image] of images.entries()) {
      // Extract base64 data and mime type
      const matches = image.data.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        console.error('Invalid image data format');
        continue;
      }

      const [, mimeType, base64Data] = matches;
      const extension = mimeType.split('/')[1] || 'png';
      const filename = `image_${index}.${extension}`;
      const filepath = path.join(tempDir, filename);

      // Write base64 data to file
      await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
      tempImagePaths.push(filepath);
    }

    // Include the full image paths in the prompt
    let modifiedCommand = command;
    if (tempImagePaths.length > 0 && command && command.trim()) {
      const imageNote = `\n\n[Images provided at the following paths:]\n${tempImagePaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
      modifiedCommand = command + imageNote;
    }

    console.log(`Processed ${tempImagePaths.length} images to temp directory: ${tempDir}`);
    return { modifiedCommand, tempImagePaths, tempDir };
  } catch (error) {
    console.error('Error processing images for SDK:', error);
    return { modifiedCommand: command, tempImagePaths, tempDir };
  }
}

/**
 * Cleans up temporary image files
 * @param {Array<string>} tempImagePaths - Array of temp file paths to delete
 * @param {string} tempDir - Temp directory to remove
 */
async function cleanupTempFiles(tempImagePaths, tempDir) {
  if (!tempImagePaths || tempImagePaths.length === 0) {
    return;
  }

  try {
    // Delete individual temp files
    for (const imagePath of tempImagePaths) {
      await fs.unlink(imagePath).catch(err =>
        console.error(`Failed to delete temp image ${imagePath}:`, err)
      );
    }

    // Delete temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(err =>
        console.error(`Failed to delete temp directory ${tempDir}:`, err)
      );
    }

    console.log(`Cleaned up ${tempImagePaths.length} temp image files`);
  } catch (error) {
    console.error('Error during temp file cleanup:', error);
  }
}

/**
 * Loads MCP server configurations from ~/.claude.json
 * @param {string} cwd - Current working directory for project-specific configs
 * @returns {Object|null} MCP servers object or null if none found
 */
async function loadMcpConfig(cwd) {
  try {
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');

    // Check if config file exists
    try {
      await fs.access(claudeConfigPath);
    } catch (error) {
      // File doesn't exist, return null
      console.log('No ~/.claude.json found, proceeding without MCP servers');
      return null;
    }

    // Read and parse config file
    let claudeConfig;
    try {
      const configContent = await fs.readFile(claudeConfigPath, 'utf8');
      claudeConfig = JSON.parse(configContent);
    } catch (error) {
      console.error('Failed to parse ~/.claude.json:', error.message);
      return null;
    }

    let mcpServers = {};

    if (claudeConfig.mcpServers && typeof claudeConfig.mcpServers === 'object') {
      mcpServers = { ...claudeConfig.mcpServers };
      console.log(`Loaded ${Object.keys(mcpServers).length} global MCP servers`);
    }

    if (claudeConfig.claudeProjects && cwd) {
      const projectConfig = claudeConfig.claudeProjects[cwd];
      if (projectConfig && projectConfig.mcpServers && typeof projectConfig.mcpServers === 'object') {
        mcpServers = { ...mcpServers, ...projectConfig.mcpServers };
        console.log(`Loaded ${Object.keys(projectConfig.mcpServers).length} project-specific MCP servers`);
      }
    }

    if (Object.keys(mcpServers).length === 0) {
      console.log('No MCP servers configured');
      return null;
    }

    console.log(`Total MCP servers loaded: ${Object.keys(mcpServers).length}`);
    return mcpServers;
  } catch (error) {
    console.error('Error loading MCP config:', error.message);
    return null;
  }
}

/**
 * Executes a Claude query using the SDK
 * @param {string} command - User prompt/command
 * @param {Object} options - Query options
 * @param {Object} ws - WebSocket connection
 * @returns {Promise<void>}
 */
async function queryClaudeSDK(command, options = {}, ws) {
  const { sessionId, cwd, projectPath, resume, model, permissionMode } = options;
  let capturedSessionId = sessionId;
  let sessionCreatedSent = false;
  let tempImagePaths = [];
  let tempDir = null;

  console.log('[SDK] ========== Starting queryClaudeSDK ==========');
  console.log('[SDK] Timestamp:', new Date().toISOString());
  console.log('[SDK] Options:', JSON.stringify({
    sessionId,
    cwd,
    projectPath,
    resume,
    model,
    permissionMode,
    hasImages: !!(options.images && options.images.length)
  }, null, 2));
  console.log('[SDK] Command length:', command?.length || 0);

  if (cwd) {
    try {
      const cwdStats = await fs.stat(cwd);
      console.log('[SDK] CWD validation:', JSON.stringify({
        exists: true,
        isDirectory: cwdStats.isDirectory(),
        path: cwd
      }));
    } catch (cwdError) {
      console.warn('[SDK] CWD validation failed:', cwd, cwdError.message);
    }
  }

  const sessionIdRef = { current: capturedSessionId };

  try {
    const { sdkOptions, runtimeState } = mapCliOptionsToSDK(options, ws, sessionIdRef);

    console.log('[SDK] Loading MCP config for cwd:', options.cwd);
    const mcpServers = await loadMcpConfig(options.cwd);
    console.log('[SDK] MCP servers loaded:', mcpServers ? Object.keys(mcpServers) : 'none');
    if (mcpServers) {
      sdkOptions.mcpServers = mcpServers;
    }

    const imageResult = await handleImages(command, options.images, options.cwd);
    const finalCommand = imageResult.modifiedCommand;
    tempImagePaths = imageResult.tempImagePaths;
    tempDir = imageResult.tempDir;

    console.log('[SDK] Mapped SDK options:', JSON.stringify({
      ...sdkOptions,
      mcpServers: sdkOptions.mcpServers ? Object.keys(sdkOptions.mcpServers) : null,
      canUseTool: !!sdkOptions.canUseTool
    }, null, 2));
    console.log('[SDK] Creating query instance...');
    console.log('[SDK] Prompt length:', finalCommand?.length || 0);

    const queryInstance = query({
      prompt: finalCommand,
      options: sdkOptions
    });

    // Track the query instance for abort capability
    if (capturedSessionId) {
      addSession(capturedSessionId, queryInstance, tempImagePaths, tempDir);
    }

    // Process streaming messages
    console.log('Starting async generator loop for session:', capturedSessionId || 'NEW');
    for await (const message of queryInstance) {

      // Capture session ID from first message
      if (message.session_id && !capturedSessionId) {

        capturedSessionId = message.session_id;
        sessionIdRef.current = capturedSessionId; // Update the reference for canUseTool callback
        addSession(capturedSessionId, queryInstance, tempImagePaths, tempDir);

        // Set session ID on writer
        if (ws.setSessionId && typeof ws.setSessionId === 'function') {
          ws.setSessionId(capturedSessionId);
        }

        // Send session-created event only once for new sessions
        if (!sessionId && !sessionCreatedSent) {
          sessionCreatedSent = true;
          ws.send({
            type: 'session-created',
            sessionId: capturedSessionId
          });
        } else {
          console.log('Not sending session-created. sessionId:', sessionId, 'sessionCreatedSent:', sessionCreatedSent);
        }
      } else {
        console.log('No session_id in message or already captured. message.session_id:', message.session_id, 'capturedSessionId:', capturedSessionId);
      }


      // Transform and send message to WebSocket
      const transformedMessage = transformMessage(message);
      ws.send({
        type: 'claude-response',
        data: transformedMessage
      });

      // Extract and send token budget updates from result messages
      if (message.type === 'result') {
        const tokenBudget = extractTokenBudget(message);
        if (tokenBudget) {
          console.log('Token budget from modelUsage:', tokenBudget);
          ws.send({
            type: 'token-budget',
            data: tokenBudget
          });
        }
      }
    }

    // Normal completion path
    if (capturedSessionId) {
      removeSession(capturedSessionId);
    }

    // Clean up temporary image files
    await cleanupTempFiles(tempImagePaths, tempDir);

    // Send completion event
    console.log('Streaming complete, sending claude-complete event');
    ws.send({
      type: 'claude-complete',
      sessionId: capturedSessionId,
      exitCode: 0,
      isNewSession: !sessionId && !!command
    });
    console.log('claude-complete event sent');

  } catch (error) {
    console.error('[SDK] ========== Query Error ==========');
    console.error('[SDK] Error name:', error.name);
    console.error('[SDK] Error message:', error.message);
    console.error('[SDK] Error stack:', error.stack);
    console.error('[SDK] Options at error:', JSON.stringify({
      sessionId: capturedSessionId,
      cwd: options.cwd,
      projectPath: options.projectPath,
      model: options.model
    }));

    if (capturedSessionId) {
      removeSession(capturedSessionId);
    }

    await cleanupTempFiles(tempImagePaths, tempDir);

    ws.send({
      type: 'claude-error',
      error: error.message
    });

    throw error;
  }
}

/**
 * Aborts an active SDK session
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if session was aborted, false if not found
 */
async function abortClaudeSDKSession(sessionId) {
  const session = getSession(sessionId);

  if (!session) {
    console.log(`Session ${sessionId} not found`);
    return false;
  }

  try {
    console.log(`Aborting SDK session: ${sessionId}`);

    // Call interrupt() on the query instance
    await session.instance.interrupt();

    // Update session status
    session.status = 'aborted';

    // Clean up temporary image files
    await cleanupTempFiles(session.tempImagePaths, session.tempDir);

    // Clean up session
    removeSession(sessionId);

    return true;
  } catch (error) {
    console.error(`Error aborting session ${sessionId}:`, error);
    return false;
  }
}

/**
 * Checks if an SDK session is currently active
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if session is active
 */
function isClaudeSDKSessionActive(sessionId) {
  const session = getSession(sessionId);
  return session && session.status === 'active';
}

/**
 * Gets all active SDK session IDs
 * @returns {Array<string>} Array of active session IDs
 */
function getActiveClaudeSDKSessions() {
  return getAllSessions();
}

// Export public API
export {
  queryClaudeSDK,
  abortClaudeSDKSession,
  isClaudeSDKSessionActive,
  getActiveClaudeSDKSessions
};
