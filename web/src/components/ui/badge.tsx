import { cn } from "@/lib/utils";
import type { EscrowStatus } from "@/types/escrow";

const STATUS_CONFIG: Record<EscrowStatus, { label: string; className: string }> = {
  created: {
    label: "Created",
    className: "bg-text-muted/15 text-text-muted border-text-muted/30",
  },
  funded: {
    label: "Funded",
    className: "bg-accent/10 text-accent border-accent/30",
  },
  release_pending: {
    label: "Release Pending",
    className: "bg-primary/10 text-primary border-primary/30 animate-pulse",
  },
  released: {
    label: "Released",
    className: "bg-success/10 text-success border-success/30",
  },
  expired: {
    label: "Expired",
    className: "bg-danger/10 text-danger border-danger/30",
  },
  refunded: {
    label: "Refunded",
    className: "bg-warning/10 text-warning border-warning/30",
  },
};

interface EscrowStatusBadgeProps {
  status: EscrowStatus;
  className?: string;
}

export function EscrowStatusBadge({ status, className }: EscrowStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {config.label}
    </span>
  );
}
