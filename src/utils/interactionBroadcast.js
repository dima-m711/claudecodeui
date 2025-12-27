import { useEffect, useRef, useCallback } from 'react';

const CHANNEL_NAME = 'claude-interactions';

export function useBroadcastChannel(onMessage) {
  const channelRef = useRef(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('📡 [BroadcastChannel] Not supported - cross-tab sync disabled');
      return;
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    console.log('📡 [BroadcastChannel] Connected to channel:', CHANNEL_NAME);

    channel.onmessage = (event) => {
      console.log('📡 [BroadcastChannel] Received:', event.data?.type);
      onMessageRef.current?.(event.data);
    };

    return () => {
      console.log('📡 [BroadcastChannel] Disconnecting');
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const broadcast = useCallback((data) => {
    if (channelRef.current) {
      console.log('📡 [BroadcastChannel] Broadcasting:', data.type);
      channelRef.current.postMessage(data);
    }
  }, []);

  return {
    broadcast,
    isSupported: typeof BroadcastChannel !== 'undefined'
  };
}
