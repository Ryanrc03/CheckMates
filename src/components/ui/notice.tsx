import type { ReactNode } from "react";
import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
const icons = { info: Info, warning: TriangleAlert, error: CircleAlert, success: Check };
export type NoticeTone = keyof typeof icons;
// Tone is shown by icon and color together; role stays the caller's choice (status, alert or none).
export function Notice({ tone, title, role, className, children }: { tone: NoticeTone; title?: string; role?: "status" | "alert"; className?: string; children: ReactNode }) {
  const Icon = icons[tone];
  return <div className={className ? `notice ${className}` : "notice"} data-tone={tone} role={role}><Icon aria-hidden="true"/><div className="notice-body">{title && <h2 className="notice-title">{title}</h2>}{children}</div></div>;
}
