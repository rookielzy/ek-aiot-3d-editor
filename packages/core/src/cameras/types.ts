import type { JsonValue } from "../snapshot/types";

export type CameraViewId = string;

export interface PerspectiveCameraViewProjection {
  kind: "perspective";
  fov: number;
}

export type AuthoredCameraViewProjection = PerspectiveCameraViewProjection;

export interface AuthoredCameraView {
  id: CameraViewId;
  name: string;
  projection: AuthoredCameraViewProjection;
  position: [number, number, number];
  target: [number, number, number];
  near: number;
  far: number;
  metadata?: Record<string, JsonValue>;
}

export interface ScenePresentationState {
  cameraViews: Record<CameraViewId, AuthoredCameraView>;
  defaultViewId: CameraViewId | null;
}

export type AuthoredCameraViewInput = {
  id?: CameraViewId;
  name?: string;
  projection?: Partial<PerspectiveCameraViewProjection> & { kind?: "perspective" };
  position?: readonly [number, number, number];
  target?: readonly [number, number, number];
  near?: number;
  far?: number;
  metadata?: Record<string, JsonValue>;
};

export type AuthoredCameraViewPatch = Partial<Omit<AuthoredCameraViewInput, "id">>;
