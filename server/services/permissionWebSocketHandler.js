import { EventEmitter } from 'events';
import {
  WS_INTERACTION_MESSAGES,
  createInteractionRequestMessage,
  validateInteractionResponse
} from './interactionTypes.js';

class PermissionWebSocketHandler extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map();
    this.pendingAcks = new Map();
    this.messageQueue = new Map();
    this.sequenceNumber = 0;
    this.heartbeatInterval = null;

    // Memory protection limits
    this.maxQueuedMessagesPerClient = 100;
    this.maxPendingAcks = 1000;
  }

  /**
   * Initialize the WebSocket handler with the server
   */
  initialize(wss) {
    this.wss = wss;
    this.startHeartbeat();
  }

  /**
   * Add a client connection
   */
  addClient(ws, clientId, sessionId = null) {
    const clientInfo = {
      ws,
      id: clientId,
      sessionId,
      isAlive: true,
      lastSeen: Date.now(),
      pendingRequests: new Set()
    };

    this.clients.set(clientId, clientInfo);

    ws.on('pong', () => {
      clientInfo.isAlive = true;
      clientInfo.lastSeen = Date.now();
    });

    ws.on('close', () => {
      this.removeClient(clientId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      this.removeClient(clientId);
    });

    this.sendQueuedMessages(clientId);
  }

  /**
   * Remove a client connection
   */
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      client.pendingRequests.forEach(requestId => {
        this.emit('client-disconnected', { clientId, requestId });
      });
      this.clients.delete(clientId);
      this.messageQueue.delete(clientId);
    }
  }

  /**
   * Broadcast an interaction request to all connected clients
   */
  broadcastInteractionRequest(interaction) {
    const message = createInteractionRequestMessage(interaction);
    message.sequenceNumber = ++this.sequenceNumber;

    console.log(`🔄 [WebSocket] Broadcasting ${interaction.type} interaction ${interaction.id}`);
    console.log(`🔄 [WebSocket] Interaction data:`, JSON.stringify(interaction.data, null, 2));

    this.broadcastToAll(message);

    if (this.clients.size === 0) {
      console.warn('No clients connected to receive interaction request');
      this.emit('no-clients', interaction);
    }
  }

  /**
   * Handle a generic interaction response from a client
   */
  handleInteractionResponse(clientId, message) {
    try {
      validateInteractionResponse(message);

      const client = this.clients.get(clientId);
      if (!client) {
        console.warn(`Interaction response from unknown client: ${clientId}`);
        return;
      }

      console.log(`🔄 [WebSocket] Received interaction response from client ${clientId}:`, {
        interactionId: message.interactionId,
        responseKeys: Object.keys(message.response)
      });

      this.emit('interaction-response', {
        clientId,
        interactionId: message.interactionId,
        response: message.response
      });
    } catch (error) {
      console.error('Invalid interaction response:', error);
      this.sendError(clientId, message.interactionId, error.message);
    }
  }

  /**
   * Handle a generic interaction sync request from a client
   */
  handleInteractionSyncRequest(clientId, message, interactionManager) {
    const { sessionIds } = message;
    if (!sessionIds || !Array.isArray(sessionIds)) {
      console.warn('Interaction sync request missing or invalid sessionIds');
      return;
    }

    console.log(`🔄 [WebSocket] Interaction sync request for sessions:`, sessionIds);

    const interactions = interactionManager.getPendingInteractions(sessionIds);

    const client = this.clients.get(clientId);
    if (client?.ws?.readyState === client.ws.OPEN) {
      const response = {
        type: WS_INTERACTION_MESSAGES.INTERACTION_SYNC_RESPONSE,
        sessionIds,
        interactions
      };
      console.log(`🔄 [WebSocket] Sending sync response with ${interactions.length} interactions`);
      client.ws.send(JSON.stringify(response));
    }
  }

  /**
   * Send an error message to a specific client
   */
  sendError(clientId, interactionId, error) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === client.ws.OPEN) {
      const message = {
        type: 'interaction-error',
        interactionId,
        error,
        timestamp: Date.now()
      };
      try {
        client.ws.send(JSON.stringify(message));
      } catch (err) {
        console.error(`Failed to send error to client ${clientId}:`, err);
      }
    }
  }

  /**
   * Broadcast a message to all connected clients
   */
  broadcastToAll(message) {
    const messageStr = JSON.stringify(message);

    this.clients.forEach((client, clientId) => {
      if (client.ws.readyState === client.ws.OPEN) {
        try {
          client.ws.send(messageStr);
        } catch (error) {
          console.error(`Failed to send message to client ${clientId}:`, error);
          this.queueMessage(clientId, message);
        }
      } else {
        this.queueMessage(clientId, message);
      }
    });
  }

  /**
   * Queue a message for a client that's temporarily unavailable
   */
  queueMessage(clientId, message) {
    // Only queue for known clients to prevent unbounded growth
    if (!this.clients.has(clientId)) {
      return;
    }

    if (!this.messageQueue.has(clientId)) {
      this.messageQueue.set(clientId, []);
    }

    const queue = this.messageQueue.get(clientId);
    queue.push(message);

    // Enforce per-client queue limit
    while (queue.length > this.maxQueuedMessagesPerClient) {
      queue.shift();
    }
  }

  /**
   * Send queued messages to a reconnected client
   */
  sendQueuedMessages(clientId) {
    const queue = this.messageQueue.get(clientId);
    if (!queue || queue.length === 0) return;

    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== client.ws.OPEN) return;

    const sentMessages = [];
    for (const message of queue) {
      try {
        client.ws.send(JSON.stringify(message));
        sentMessages.push(message);
      } catch (error) {
        console.error(`Failed to send queued message to client ${clientId}:`, error);
        break;
      }
    }

    const remainingMessages = queue.filter(m => !sentMessages.includes(m));
    if (remainingMessages.length > 0) {
      this.messageQueue.set(clientId, remainingMessages);
    } else {
      this.messageQueue.delete(clientId);
    }
  }

  /**
   * Start heartbeat mechanism
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          console.log(`Client ${clientId} failed heartbeat check`);
          this.removeClient(clientId);
          return;
        }

        client.isAlive = false;
        try {
          client.ws.ping();
        } catch (error) {
          console.error(`Failed to ping client ${clientId}:`, error);
          this.removeClient(clientId);
        }
      });
    }, 30000);
  }

  /**
   * Stop heartbeat mechanism
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Shutdown the handler gracefully
   */
  shutdown() {
    this.stopHeartbeat();

    this.clients.forEach((client, clientId) => {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch (error) {
        console.error(`Error closing client ${clientId}:`, error);
      }
    });

    this.clients.clear();
    this.messageQueue.clear();
    this.pendingAcks.clear();
  }

  /**
   * Get current handler statistics
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      queuedMessages: Array.from(this.messageQueue.values()).reduce((sum, queue) => sum + queue.length, 0),
      pendingRequests: Array.from(this.clients.values()).reduce((sum, client) => sum + client.pendingRequests.size, 0),
      sequenceNumber: this.sequenceNumber
    };
  }
}

export default PermissionWebSocketHandler;