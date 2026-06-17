import type { LightDefinition } from "../lights/types";
import type { Problem } from "../problems/types";
import type { SceneSnapshot } from "../snapshot/types";
import { createDisplayMessageDescriptor } from "../i18n/display-messages";
import type { RuntimeLightShadowEntry, RuntimeLightShadowSummary } from "./light-projector";

export interface LightingDiagnosticsOptions {
  rendererShadowMapAvailable?: boolean;
  highMapSizeThreshold?: number;
  sceneTexelBudget?: number;
  broadDirectionalAreaThreshold?: number;
  broadRangeRatioThreshold?: number;
  broadRangeFarThreshold?: number;
}

const DEFAULT_HIGH_MAP_SIZE_THRESHOLD = 2048;
const DEFAULT_SCENE_TEXEL_BUDGET = 4096 * 4096;
const DEFAULT_BROAD_DIRECTIONAL_AREA_THRESHOLD = 1600;
const DEFAULT_BROAD_RANGE_RATIO_THRESHOLD = 100;
const DEFAULT_BROAD_RANGE_FAR_THRESHOLD = 250;

export function deriveLightingDiagnostics(
  snapshot: SceneSnapshot,
  shadowSummary: RuntimeLightShadowSummary,
  options: LightingDiagnosticsOptions = {}
): Problem[] {
  if (!shadowSummary.enabled) {
    return [];
  }

  const problems: Problem[] = [];
  const enabledEntries = shadowSummary.entries.filter((entry) => entry.enabled);
  if (options.rendererShadowMapAvailable === false) {
    problems.push(createRendererCapabilityProblem(snapshot.scene.id));
  }

  for (const entry of enabledEntries) {
    const light = snapshot.lights[entry.lightId];
    if (!light) {
      continue;
    }
    if (entry.kind === "point") {
      problems.push(createPointShadowCostProblem(entry, light));
    }
    if (entry.mapSize.width >= (options.highMapSizeThreshold ?? DEFAULT_HIGH_MAP_SIZE_THRESHOLD) ||
      entry.mapSize.height >= (options.highMapSizeThreshold ?? DEFAULT_HIGH_MAP_SIZE_THRESHOLD)) {
      problems.push(createHighMapSizeProblem(entry, light));
    }
    if (entry.kind === "directional" && isBroadDirectionalBounds(entry, options.broadDirectionalAreaThreshold ?? DEFAULT_BROAD_DIRECTIONAL_AREA_THRESHOLD)) {
      problems.push(createBroadDirectionalBoundsProblem(entry, light));
    }
    if (isBroadRange(entry, options)) {
      problems.push(createBroadRangeProblem(entry, light));
    }
  }

  if (shadowSummary.totalTexelCost > (options.sceneTexelBudget ?? DEFAULT_SCENE_TEXEL_BUDGET)) {
    problems.push(createSceneBudgetProblem(snapshot.scene.id, shadowSummary.totalTexelCost));
  }

  return problems;
}

function createRendererCapabilityProblem(sceneId: string): Problem {
  return {
    id: `lighting-shadow-renderer-missing:${sceneId}`,
    severity: "warning",
    code: "lighting-shadow-renderer-missing",
    source: "runtime",
    target: { kind: "scene", sceneId },
    recoverability: "automatic",
    message: "Shadows are authored, but this renderer does not expose shadow map support.",
    display: {
      title: "Renderer cannot display authored shadows",
      titleDescriptor: diagnosticDescriptor("rendererShadowMapMissing", "title", "Renderer cannot display authored shadows", { sceneId }),
      detail: "The active runtime renderer has no shadowMap capability, so shadow settings are preserved but not visible.",
      detailDescriptor: diagnosticDescriptor("rendererShadowMapMissing", "detail", "The active runtime renderer has no shadowMap capability, so shadow settings are preserved but not visible.", { sceneId })
    }
  };
}

function createPointShadowCostProblem(entry: RuntimeLightShadowEntry, light: LightDefinition): Problem {
  return {
    id: `lighting-point-shadow-cost:${entry.lightId}`,
    severity: "warning",
    code: "lighting-point-shadow-cost",
    source: "runtime",
    target: { kind: "light", lightId: entry.lightId },
    recoverability: "user-action",
    message: `Point light ${light.name} renders six shadow map faces.`,
    display: {
      title: "Point light shadow is expensive",
      titleDescriptor: diagnosticDescriptor("pointShadowCost", "title", "Point light shadow is expensive", {
        lightId: entry.lightId,
        lightName: light.name,
        faces: entry.faces,
        texelCost: entry.texelCost
      }),
      detail: `${light.name} uses ${formatTexels(entry.texelCost)} effective shadow texels because point shadows render six faces.`,
      detailDescriptor: diagnosticDescriptor("pointShadowCost", "detail", "{lightName} uses {formattedTexelCost} effective shadow texels because point shadows render six faces.", {
        lightId: entry.lightId,
        lightName: light.name,
        faces: entry.faces,
        texelCost: entry.texelCost,
        formattedTexelCost: formatTexels(entry.texelCost)
      })
    },
    metadata: {
      faces: entry.faces,
      texelCost: entry.texelCost
    }
  };
}

function createHighMapSizeProblem(entry: RuntimeLightShadowEntry, light: LightDefinition): Problem {
  return {
    id: `lighting-shadow-map-high:${entry.lightId}`,
    severity: "warning",
    code: "lighting-shadow-map-high",
    source: "runtime",
    target: { kind: "light", lightId: entry.lightId },
    recoverability: "user-action",
    message: `Shadow map for ${light.name} is large.`,
    display: {
      title: "Shadow map size is high",
      titleDescriptor: diagnosticDescriptor("shadowMapHigh", "title", "Shadow map size is high", {
        lightId: entry.lightId,
        lightName: light.name,
        width: entry.mapSize.width,
        height: entry.mapSize.height,
        texelCost: entry.texelCost
      }),
      detail: `${light.name} uses ${entry.mapSize.width} x ${entry.mapSize.height} shadow maps (${formatTexels(entry.texelCost)} effective texels).`,
      detailDescriptor: diagnosticDescriptor("shadowMapHigh", "detail", "{lightName} uses {width} x {height} shadow maps ({formattedTexelCost} effective texels).", {
        lightId: entry.lightId,
        lightName: light.name,
        width: entry.mapSize.width,
        height: entry.mapSize.height,
        texelCost: entry.texelCost,
        formattedTexelCost: formatTexels(entry.texelCost)
      })
    },
    metadata: {
      width: entry.mapSize.width,
      height: entry.mapSize.height,
      faces: entry.faces,
      texelCost: entry.texelCost
    }
  };
}

function createBroadDirectionalBoundsProblem(entry: RuntimeLightShadowEntry, light: LightDefinition): Problem {
  const width = Math.abs((entry.camera.right ?? 0) - (entry.camera.left ?? 0));
  const height = Math.abs((entry.camera.top ?? 0) - (entry.camera.bottom ?? 0));
  return {
    id: `lighting-directional-shadow-bounds-broad:${entry.lightId}`,
    severity: "info",
    code: "lighting-directional-shadow-bounds-broad",
    source: "runtime",
    target: { kind: "light", lightId: entry.lightId },
    recoverability: "user-action",
    message: `Directional shadow bounds for ${light.name} are broad.`,
    display: {
      title: "Directional shadow frustum is broad",
      titleDescriptor: diagnosticDescriptor("directionalShadowBoundsBroad", "title", "Directional shadow frustum is broad", {
        lightId: entry.lightId,
        lightName: light.name,
        width,
        height
      }),
      detail: `${light.name} covers ${formatNumber(width)} x ${formatNumber(height)} world units. Tightening bounds improves shadow detail.`,
      detailDescriptor: diagnosticDescriptor("directionalShadowBoundsBroad", "detail", "{lightName} covers {formattedWidth} x {formattedHeight} world units. Tightening bounds improves shadow detail.", {
        lightId: entry.lightId,
        lightName: light.name,
        width,
        height,
        formattedWidth: formatNumber(width),
        formattedHeight: formatNumber(height)
      })
    },
    metadata: {
      width,
      height,
      area: width * height
    }
  };
}

function createBroadRangeProblem(entry: RuntimeLightShadowEntry, light: LightDefinition): Problem {
  return {
    id: `lighting-shadow-camera-range-broad:${entry.lightId}`,
    severity: "info",
    code: "lighting-shadow-camera-range-broad",
    source: "runtime",
    target: { kind: "light", lightId: entry.lightId },
    recoverability: "user-action",
    message: `Shadow camera range for ${light.name} is broad.`,
    display: {
      title: "Shadow camera range is broad",
      titleDescriptor: diagnosticDescriptor("shadowCameraRangeBroad", "title", "Shadow camera range is broad", {
        lightId: entry.lightId,
        lightName: light.name,
        near: entry.camera.near,
        far: entry.camera.far
      }),
      detail: `${light.name} uses near ${formatNumber(entry.camera.near)} and far ${formatNumber(entry.camera.far)}. A tighter range improves shadow precision.`,
      detailDescriptor: diagnosticDescriptor("shadowCameraRangeBroad", "detail", "{lightName} uses near {formattedNear} and far {formattedFar}. A tighter range improves shadow precision.", {
        lightId: entry.lightId,
        lightName: light.name,
        near: entry.camera.near,
        far: entry.camera.far,
        formattedNear: formatNumber(entry.camera.near),
        formattedFar: formatNumber(entry.camera.far)
      })
    },
    metadata: {
      near: entry.camera.near,
      far: entry.camera.far
    }
  };
}

function createSceneBudgetProblem(sceneId: string, totalTexelCost: number): Problem {
  return {
    id: `lighting-shadow-budget-high:${sceneId}`,
    severity: "warning",
    code: "lighting-shadow-budget-high",
    source: "runtime",
    target: { kind: "scene", sceneId },
    recoverability: "user-action",
    message: "Enabled shadows exceed the conservative scene shadow budget.",
    display: {
      title: "Scene shadow budget is high",
      titleDescriptor: diagnosticDescriptor("sceneShadowBudgetHigh", "title", "Scene shadow budget is high", { sceneId, totalTexelCost }),
      detail: `Enabled shadows use ${formatTexels(totalTexelCost)} effective texels. Disable unused shadows or lower map sizes.`,
      detailDescriptor: diagnosticDescriptor("sceneShadowBudgetHigh", "detail", "Enabled shadows use {formattedTexelCost} effective texels. Disable unused shadows or lower map sizes.", {
        sceneId,
        totalTexelCost,
        formattedTexelCost: formatTexels(totalTexelCost)
      })
    },
    metadata: {
      totalTexelCost
    }
  };
}

function isBroadDirectionalBounds(entry: RuntimeLightShadowEntry, threshold: number): boolean {
  if (entry.kind !== "directional") {
    return false;
  }
  const left = entry.camera.left ?? 0;
  const right = entry.camera.right ?? 0;
  const top = entry.camera.top ?? 0;
  const bottom = entry.camera.bottom ?? 0;
  return Math.abs(right - left) * Math.abs(top - bottom) > threshold;
}

function isBroadRange(entry: RuntimeLightShadowEntry, options: LightingDiagnosticsOptions): boolean {
  const ratioThreshold = options.broadRangeRatioThreshold ?? DEFAULT_BROAD_RANGE_RATIO_THRESHOLD;
  const farThreshold = options.broadRangeFarThreshold ?? DEFAULT_BROAD_RANGE_FAR_THRESHOLD;
  if (entry.camera.far > farThreshold) {
    return true;
  }
  return entry.camera.near > 0 && entry.camera.far / entry.camera.near > ratioThreshold;
}

function formatTexels(value: number): string {
  if (value >= 1_000_000) {
    return `${formatNumber(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${formatNumber(value / 1_000)}K`;
  }
  return formatNumber(value);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function diagnosticDescriptor(
  path: string,
  field: "title" | "detail",
  fallback: string,
  values: Record<string, string | number>
) {
  return createDisplayMessageDescriptor({
    namespace: "problem",
    path: `lighting.${path}`,
    field,
    fallback,
    values
  });
}
