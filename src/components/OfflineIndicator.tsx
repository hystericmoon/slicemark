import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/usePWAInstall';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-md bg-surface border border-border-strong px-3 py-1.5 text-[12px] font-medium text-primary shadow-md"
    >
      <WifiOff className="w-3.5 h-3.5 text-warning shrink-0" />
      <span>Offline Mode · Local video cutting active</span>
    </div>
  );
};
