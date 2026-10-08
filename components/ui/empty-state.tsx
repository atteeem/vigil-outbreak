import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ title, children, className, testId }: { title: string; children?: ReactNode; className?: string; testId?: string }) {
  return (
    <div data-testid={testId} className={cn("flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong px-4 py-8 text-center", className)}>
      <p className="text-sm font-medium text-ink-dim">{title}</p>
      {children ? <div className="max-w-md text-xs leading-relaxed text-ink-faint">{children}</div> : null}
    </div>
  );
}
