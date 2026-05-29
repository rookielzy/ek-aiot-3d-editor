import type { Problem } from "../problems/types";

export { createMissingAssetProblem } from "../assets/problems";
export type { Problem } from "../problems/types";

export type EnvironmentProjectionRole = "background" | "environment";

export function createEnvironmentAssetUnresolvedProblem(assetId: string, role: EnvironmentProjectionRole): Problem {
  return {
    id: `environment-asset-unresolved:${role}:${assetId}`,
    severity: "warning",
    code: "environment-asset-unresolved",
    assetId,
    source: "runtime",
    target: { kind: "environment", assetId },
    recoverability: "user-action",
    message: `${formatRole(role)} asset ${assetId} could not be resolved.`,
    display: {
      title: `${formatRole(role)} asset could not be resolved`,
      detail: `Asset ${assetId} is missing or unavailable.`
    },
    metadata: { role }
  };
}

export function createEnvironmentAssetLoadProblem(
  assetId: string,
  role: EnvironmentProjectionRole,
  error: unknown
): Problem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: `environment-asset-load-failed:${role}:${assetId}`,
    severity: "error",
    code: "environment-asset-load-failed",
    assetId,
    source: "runtime",
    target: { kind: "environment", assetId },
    recoverability: "user-action",
    message,
    display: {
      title: `${formatRole(role)} asset failed to load`,
      detail: message
    },
    metadata: { role }
  };
}

export function createEnvironmentAssetResolveProblem(
  assetId: string,
  role: EnvironmentProjectionRole,
  error: unknown
): Problem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: `environment-asset-resolve-failed:${role}:${assetId}`,
    severity: "error",
    code: "environment-asset-resolve-failed",
    assetId,
    source: "runtime",
    target: { kind: "environment", assetId },
    recoverability: "user-action",
    message,
    display: {
      title: `${formatRole(role)} asset failed to resolve`,
      detail: message
    },
    metadata: { role }
  };
}

export function createEnvironmentPmremProblem(assetId: string, role: EnvironmentProjectionRole, error: unknown): Problem {
  const message = error instanceof Error ? error.message : String(error);
  return {
    id: `environment-pmrem-failed:${role}:${assetId}`,
    severity: "error",
    code: "environment-pmrem-failed",
    assetId,
    source: "runtime",
    target: { kind: "environment", assetId },
    recoverability: "automatic",
    message,
    display: {
      title: `${formatRole(role)} PMREM generation failed`,
      detail: message
    },
    metadata: { role }
  };
}

function formatRole(role: EnvironmentProjectionRole): string {
  return role === "background" ? "Background" : "Environment";
}
