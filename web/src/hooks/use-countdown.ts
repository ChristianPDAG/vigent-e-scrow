"use client";

import { useEffect, useState } from "react";

interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
  isExpired: boolean;
  isUrgent: boolean;
}

export function useCountdown(expiresAt: string): CountdownResult {
  const [total, setTotal] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    setTotal(new Date(expiresAt).getTime() - Date.now());
    const interval = setInterval(() => {
      setTotal(new Date(expiresAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const safeTotal = Math.max(0, total);
  return {
    total: safeTotal,
    isExpired: total <= 0,
    isUrgent: total > 0 && total <= 2 * 60 * 1000,
    days: Math.floor(safeTotal / (1000 * 60 * 60 * 24)),
    hours: Math.floor((safeTotal % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((safeTotal % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((safeTotal % (1000 * 60)) / 1000),
  };
}
