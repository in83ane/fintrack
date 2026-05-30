"use client";

import React, { useEffect, useState } from "react";
import { WifiOff, AlertCircle } from "lucide-react";
import { networkManager } from "@/src/lib/network";

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);
  const [queuedRequests, setQueuedRequests] = useState(0);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check initial status
    const status = networkManager.getStatus();
    setIsOnline(status.isOnline);
    setQueuedRequests(status.queuedRequests);

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      setShowBanner(true);
      // Hide banner after 3 seconds
      setTimeout(() => setShowBanner(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Poll status every 5 seconds
    const interval = setInterval(() => {
      const status = networkManager.getStatus();
      setQueuedRequests(status.queuedRequests);
    }, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (!showBanner && isOnline) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 flex items-center gap-3 text-sm font-bold transition-all duration-300 ${
        isOnline
          ? "bg-[#4EDEA3]/20 border border-[#4EDEA3] text-[#4EDEA3]"
          : "bg-[#FFB4AB]/20 border border-[#FFB4AB] text-[#FFB4AB]"
      }`}
    >
      {isOnline ? (
        <>
          <div className="w-2 h-2 bg-[#4EDEA3] rounded-full animate-pulse" />
          <span>Back online</span>
        </>
      ) : (
        <>
          <WifiOff size={18} />
          <div className="flex flex-col">
            <span>You&apos;re offline</span>
            {queuedRequests > 0 && (
              <span className="text-xs opacity-75">
                {queuedRequests} request{queuedRequests > 1 ? "s" : ""} queued
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Network status hook for components
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState(() => networkManager.getStatus());

  useEffect(() => {
    const handleOnline = () => setStatus(networkManager.getStatus());
    const handleOffline = () => setStatus(networkManager.getStatus());

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(
      () => setStatus(networkManager.getStatus()),
      5000
    );

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return status;
}
