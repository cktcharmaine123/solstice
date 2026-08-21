export type RevertInfo = {
  message: string;
  undo: () => void | Promise<void>;
  returnTo: string;
};

export type AnalysisState = {
  sunPaths: import("../screens/AnalysisScreen/AnalysisScreen").SunPathOverlay[];
  selectedDate: Date;
  selectedTime: number;
  primaryColor: string;
  primaryPathVisible?: boolean;
};

let pendingRevert: RevertInfo | null = null;
let pendingAnalysisState: AnalysisState | null = null;

export function setPendingRevert(info: RevertInfo | null): void {
  pendingRevert = info;
}

export function peekPendingRevert(): RevertInfo | null {
  return pendingRevert;
}

export function clearPendingRevert(): void {
  pendingRevert = null;
}

export function setPendingAnalysisState(state: AnalysisState | null): void {
  pendingAnalysisState = state;
}

export function peekPendingAnalysisState(): AnalysisState | null {
  return pendingAnalysisState;
}

export function clearPendingAnalysisState(): void {
  pendingAnalysisState = null;
}
