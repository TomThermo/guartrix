import type { ScheduleStep, ScheduleStepKind } from "@guartrix/shared";

export type DraftStep = {
  key: string;
  kind: ScheduleStepKind;
  command: string;
  delaySeconds: number;
  onlyIfRunning: boolean;
  continueOnFailure: boolean;
};

export function describeSteps(steps: ScheduleStep[]): string {
  return steps
    .map((s) => {
      if (s.kind === "command") return `/${s.command || "…"}`;
      if (s.kind === "restart") return "restart";
      if (s.kind === "backup") return "backup";
      return `wait ${s.delaySeconds || 0}s`;
    })
    .join(" → ");
}

export function newDraftStep(kind: ScheduleStepKind = "command"): DraftStep {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    command: "say Scheduled task",
    delaySeconds: 30,
    onlyIfRunning: true,
    continueOnFailure: false,
  };
}

export function toPayloadSteps(steps: DraftStep[]): ScheduleStep[] {
  return steps.map((s) => {
    const step: ScheduleStep = { kind: s.kind };
    if (s.kind === "command") step.command = s.command.trim();
    if (s.kind === "wait") step.delaySeconds = s.delaySeconds;
    if (s.kind === "command" || s.kind === "restart") {
      step.onlyIfRunning = s.onlyIfRunning;
    }
    if (s.continueOnFailure) step.continueOnFailure = true;
    return step;
  });
}
