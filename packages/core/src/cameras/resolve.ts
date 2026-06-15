import type { AuthoredCameraView } from "./types";
import { getAuthoredCameraView } from "./defaults";
import type { SceneSnapshot } from "../snapshot/types";

export type DefaultPresentationViewResolution =
  | {
      status: "resolved";
      view: AuthoredCameraView;
      defaultCameraId: string;
    }
  | {
      status: "none";
      view: null;
      defaultCameraId: null;
      reason: string;
    }
  | {
      status: "missing";
      view: null;
      defaultCameraId: string;
      reason: string;
    };

export function resolveDefaultPresentationView(snapshot: SceneSnapshot): DefaultPresentationViewResolution {
  const defaultCameraId = snapshot.presentation.defaultCameraId;
  if (defaultCameraId === null) {
    return {
      status: "none",
      view: null,
      defaultCameraId: null,
      reason: "No default presentation camera view is set."
    };
  }

  const view = getAuthoredCameraView(snapshot.cameras, defaultCameraId);
  if (!view) {
    return {
      status: "missing",
      view: null,
      defaultCameraId,
      reason: `Default presentation camera view ${defaultCameraId} does not exist.`
    };
  }

  return {
    status: "resolved",
    view,
    defaultCameraId
  };
}
