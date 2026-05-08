"use client";

import { useCountdown } from "@/hooks/use-countdown";
import { cn } from "@/lib/utils";

interface CountdownProps {
  expiresAt: string;
  className?: string;
  compact?: boolean;
}

export function Countdown({ expiresAt, className, compact }: CountdownProps) {
  const { hours, minutes, seconds, days, isExpired, isUrgent } = useCountdown(expiresAt);

  if (isExpired) {
    return (
      <span className={cn("text-danger font-mono text-sm font-medium", className)}>
        Expired
      </span>
    );
  }

  const urgentClass = isUrgent ? "text-danger" : "text-text-secondary";

  if (compact) {
    const totalHours = days * 24 + hours;
    if (totalHours > 0) {
      return (
        <span className={cn("font-mono text-sm", urgentClass, className)}>
          {totalHours}h {minutes}m
        </span>
      );
    }
    return (
      <span className={cn("font-mono text-sm font-medium", urgentClass, className)}>
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-1 font-mono text-sm", urgentClass, className)}>
      {days > 0 && <span>{days}d</span>}
      <span>{String(hours).padStart(2, "0")}h</span>
      <span>{String(minutes).padStart(2, "0")}m</span>
      <span>{String(seconds).padStart(2, "0")}s</span>
    </div>
  );
}
