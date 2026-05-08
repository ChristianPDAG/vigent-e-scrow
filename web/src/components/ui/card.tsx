import { cn } from "@/lib/utils";

interface CardProps {
  className?: string;
  children: React.ReactNode;
  elevated?: boolean;
  onClick?: () => void;
}

export function Card({ className, children, elevated, onClick }: CardProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border p-4 text-left",
        elevated ? "bg-bg-elevated" : "bg-bg-card",
        onClick && "cursor-pointer hover:border-primary/50 transition-colors w-full",
        className
      )}
    >
      {children}
    </Tag>
  );
}
