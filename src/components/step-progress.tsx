import { Check } from "lucide-react";
import { useBillStore } from "@/store/useBillStore";
import { availableStep } from "@/lib/session";
import type { WizardStep } from "@/types/bill";

const STEPS: { step: WizardStep; label: string }[] = [
  { step: "home", label: "Start" }, { step: "receipt", label: "Receipt" }, { step: "people", label: "Friends" }, { step: "split", label: "Split" }, { step: "result", label: "Result" },
];

/** Done steps show a check and can be revisited; the current step is outlined; later steps stay muted. */
export function StepProgress() {
  const s = useBillStore();
  const current = STEPS.findIndex(entry => entry.step === s.step);
  return <nav aria-label="Bill progress" className="step-progress"><ol>{STEPS.map(({ step, label }, index) => {
    const state = index < current ? "done" : index === current ? "current" : "upcoming";
    const status = state === "done" ? ", completed" : state === "current" ? ", current step" : "";
    const marker = <><span className="step-marker" aria-hidden="true">{state === "done" ? <Check size={14} strokeWidth={3}/> : index + 1}</span><small>{label}<span className="sr-only">{status}</span></small></>;
    const reachable = step !== "home" && state !== "current" && availableStep(s, step) === step;
    return <li key={step} className={state} aria-current={state === "current" ? "step" : undefined}>
      {reachable ? <button type="button" onClick={() => s.goTo(step)}>{marker}</button> : <div>{marker}</div>}
    </li>;
  })}</ol></nav>;
}
