import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cloudSteps } from "@/lib/llm/progress";
/** Step list for cloud recognition, rendered inside the caller's role="status" box. The elapsed counter is hidden from screen readers so it is not announced every second. */
export function CloudProgress({ stage }: { stage: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const timer = setInterval(() => setSeconds(s => s + 1), 1000); return () => clearInterval(timer); }, []);
  return <div className="cloud-progress" lang="zh-Hans">
    <div className="cloud-scan" aria-hidden="true"><span/></div>
    <ol>{cloudSteps(stage).map(step => <li key={step.label} className={`cloud-step ${step.state}`} aria-current={step.state === "active" ? "step" : undefined}><span className="cloud-step-icon" aria-hidden="true">{step.state === "done" && <Check size={14}/>}</span><span><b>{step.label}</b><small>{step.detail}</small></span></li>)}</ol>
    <p className="cloud-elapsed" aria-hidden="true">已用 {seconds} 秒 · {seconds > 25 ? "比平时久一些，最多等 90 秒" : "通常 10–20 秒"}</p>
  </div>;
}
