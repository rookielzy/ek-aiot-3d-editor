import type { JsonValue } from "../snapshot/types";

export type ProblemSeverity = "info" | "warning" | "error";
export type ProblemSource = "validation" | "command" | "asset-resolver" | "runtime";
export type ProblemRecoverability = "automatic" | "user-action" | "not-recoverable";

export type ProblemTarget =
  | { kind: "scene"; sceneId: string }
  | { kind: "object"; objectId: string }
  | { kind: "asset"; assetId: string }
  | { kind: "material"; materialId: string }
  | { kind: "texture-slot"; materialId: string; slot: string; assetId?: string }
  | { kind: "environment"; assetId?: string }
  | { kind: "light"; lightId: string }
  | { kind: "imported-target"; objectId: string; nodeId: string; importKey: string }
  | { kind: "imported-material-slot"; objectId: string; nodeId: string; importKey: string; slotId: string }
  | { kind: "command"; commandType: string };

export interface ProblemDisplay {
  title: string;
  detail?: string;
  actionLabel?: string;
  metadata?: Record<string, JsonValue>;
}

export interface Problem {
  id: string;
  severity: ProblemSeverity;
  code: string;
  source: ProblemSource;
  target: ProblemTarget;
  message: string;
  objectId?: string;
  assetId?: string;
  recoverability: ProblemRecoverability;
  display?: ProblemDisplay;
  metadata?: Record<string, JsonValue>;
}

export interface AuthoredProblemState {
  acknowledged: Record<string, { problemId: string; acknowledgedAt?: string; metadata?: Record<string, JsonValue> }>;
}
