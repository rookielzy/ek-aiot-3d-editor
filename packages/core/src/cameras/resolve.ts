import type { AuthoredCameraView } from "./types";
import { getAuthoredCameraView } from "./defaults";
import type { SceneSnapshot } from "../snapshot/types";

export type DefaultPresentationViewResolution =
  | {
      status: "resolved";
      view: AuthoredCameraView;
      defaultViewId: string;
    }
  | {
      status: "none";
      view: null;
      defaultViewId: null;
      reason: string;
    }
  | {
      status: "missing";
      view: null;
      defaultViewId: string;
      reason: string;
    };

export function resolveDefaultPresentationView(snapshot: SceneSnapshot): DefaultPresentationViewResolution {
  const defaultViewId = snapshot.presentation.defaultViewId;
  if (defaultViewId === null) {
    return {
      status: "none",
      view: null,
      defaultViewId: null,
      reason: "No default presentation camera view is set."
    };
  }

  const view = getAuthoredCameraView(snapshot.presentation.cameraViews, defaultViewId);
  if (!view) {
    return {
      status: "missing",
      view: null,
      defaultViewId,
      reason: `Default presentation camera view ${defaultViewId} does not exist.`
    };
  }

  return {
    status: "resolved",
    view,
    defaultViewId
  };
}
