import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected';

export const useRealtime = () => {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    const channel = supabase.channel('realtime-status');
    
    channel.on('presence', { event: 'sync' }, () => {
      setStatus('connected');
    });

    const subscription = channel.subscribe((channelStatus) => {
      if (channelStatus === 'SUBSCRIBED') {
        setStatus('connected');
      } else if (channelStatus === 'CHANNEL_ERROR') {
        setStatus('disconnected');
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { status };
};