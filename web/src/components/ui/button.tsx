import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
          {
            "bg-primary hover:bg-primary-hover text-white active:scale-95": variant === "primary",
            "bg-bg-elevated border border-border text-text-main hover:bg-border": variant === "secondary",
            "bg-transparent text-text-secondary hover:text-text-main hover:bg-bg-elevated": variant === "ghost",
            "bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20": variant === "danger",
            "bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20": variant === "accent",
          },
          {
            "text-xs px-3 h-8": size === "sm",
            "text-sm px-4 h-10": size === "md",
            "text-base px-6 h-12": size === "lg",
          },
          className
        )}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
