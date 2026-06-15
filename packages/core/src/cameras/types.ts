import type { JsonValue } from "../snapshot/types";

export type CameraId = string;
export type CameraViewId = CameraId;

export interface PerspectiveCameraViewProjection {
  kind: "perspective";
  fov: number;
}

export type AuthoredCameraViewProjection = PerspectiveCameraViewProjection;
export type AuthoredCameraProjection = AuthoredCameraViewProjection;

export interface AuthoredCameraDefinition {
  id: CameraId;
  name: string;
  projection: AuthoredCameraProjection;
  position: [number, number, number];
  target: [number, number, number];
  near: number;
  far: number;
  metadata?: Record<string, JsonValue>;
}

export type AuthoredCameraView = AuthoredCameraDefinition;

export type AuthoredCameraMap = Record<CameraId, AuthoredCameraDefinition>;

export interface ScenePresentationState {
  defaultCameraId: CameraId | null;
}

export type AuthoredCameraViewInput = {
  id?: CameraId;
  name?: string;
  projection?: Partial<PerspectiveCameraViewProjection> & { kind?: "perspective" };
  position?: readonly [number, number, number];
  target?: readonly [number, number, number];
  near?: number;
  far?: number;
  metadata?: Record<string, JsonValue>;
};

export type AuthoredCameraViewPatch = Partial<Omit<AuthoredCameraViewInput, "id">>;
export type AuthoredCameraInput = AuthoredCameraViewInput;
export type AuthoredCameraPatch = AuthoredCameraViewPatch;
