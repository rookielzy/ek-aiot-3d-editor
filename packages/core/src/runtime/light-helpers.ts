import {
  BufferGeometry,
  CameraHelper,
  DirectionalLight,
  DirectionalLightHelper,
  HemisphereLight,
  HemisphereLightHelper,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  PointLightHelper,
  SphereGeometry,
  SpotLight,
  SpotLightHelper,
  Vector3
} from "three";
import { disposeObjectTree } from "./disposal";
import type { ThreeObjectMap } from "./three-object-map";
import type { ViewportHelperStateSnapshot } from "../editor/viewport-helper-state";

interface RuntimeLightHelperEntry {
  lightGizmo?: Object3D;
  targetHelper?: Object3D;
  shadowCamera?: CameraHelper;
}

export class RuntimeLightHelpers {
  #scene: Object3D;
  #objects: ThreeObjectMap;
  #snapshot: ViewportHelperStateSnapshot | null = null;
  #entries = new Map<string, RuntimeLightHelperEntry>();
  #disposed = false;

  constructor(scene: Object3D, objects: ThreeObjectMap) {
    this.#scene = scene;
    this.#objects = objects;
  }

  setState(snapshot: ViewportHelperStateSnapshot): boolean {
    if (this.#disposed) {
      return false;
    }
    this.#snapshot = snapshot;
    return this.sync();
  }

  sync(): boolean {
    if (this.#disposed) {
      return false;
    }
    const visibility = this.#snapshot?.visibility;
    const activeLightIds = new Set<string>();
    let changed = false;

    for (const [, target] of this.#objects.targetEntries()) {
      if (target.kind !== "light" || !target.lightId) {
        continue;
      }
      activeLightIds.add(target.lightId);
      const entry = this.#entries.get(target.lightId) ?? {};
      changed = this.#syncLightGizmo(entry, target.object, target.lightId, visibility?.lightGizmos ?? false) || changed;
      changed = this.#syncTargetHelper(entry, target.object, target.lightId, visibility?.lightTargets ?? false) || changed;
      changed = this.#syncShadowCamera(entry, target.object, target.lightId, visibility?.shadowCameras ?? false) || changed;
      this.#entries.set(target.lightId, entry);
    }

    for (const [lightId, entry] of [...this.#entries]) {
      if (!activeLightIds.has(lightId)) {
        this.#disposeEntry(entry);
        this.#entries.delete(lightId);
        changed = true;
      }
    }
    return changed;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const entry of this.#entries.values()) {
      this.#disposeEntry(entry);
    }
    this.#entries.clear();
  }

  get size(): number {
    let size = 0;
    for (const entry of this.#entries.values()) {
      size += entry.lightGizmo ? 1 : 0;
      size += entry.targetHelper ? 1 : 0;
      size += entry.shadowCamera ? 1 : 0;
    }
    return size;
  }

  #syncLightGizmo(entry: RuntimeLightHelperEntry, light: Object3D, lightId: string, visible: boolean): boolean {
    if (!visible) {
      return disposeKey(entry, "lightGizmo");
    }
    const helperKind = lightGizmoKind(light);
    if (!helperKind) {
      return disposeKey(entry, "lightGizmo");
    }
    if (entry.lightGizmo && entry.lightGizmo.userData.lightHelperKind !== helperKind) {
      disposeKey(entry, "lightGizmo");
    }
    if (!entry.lightGizmo) {
      entry.lightGizmo = createLightGizmo(light, helperKind, lightId);
      this.#markHelper(entry.lightGizmo, "lightGizmos", lightId);
      this.#scene.add(entry.lightGizmo);
      return true;
    }
    updateHelper(entry.lightGizmo);
    return false;
  }

  #syncTargetHelper(entry: RuntimeLightHelperEntry, light: Object3D, lightId: string, visible: boolean): boolean {
    if (!visible || !(light instanceof DirectionalLight || light instanceof SpotLight)) {
      return disposeKey(entry, "targetHelper");
    }
    const target = light.target;
    const points = targetLinePoints(light, target);
    if (!entry.targetHelper) {
      entry.targetHelper = createTargetHelper(lightId, points);
      this.#markHelper(entry.targetHelper, "lightTargets", lightId);
      this.#scene.add(entry.targetHelper);
      return true;
    }
    const line = entry.targetHelper.children.find((child) => child instanceof Line) as Line<BufferGeometry, LineBasicMaterial> | undefined;
    const marker = entry.targetHelper.children.find((child) => child instanceof Mesh) as Mesh | undefined;
    if (line) {
      line.geometry.dispose();
      line.geometry = new BufferGeometry().setFromPoints(points);
    }
    if (marker) {
      marker.position.copy(points[1]);
    }
    return false;
  }

  #syncShadowCamera(entry: RuntimeLightHelperEntry, light: Object3D, lightId: string, visible: boolean): boolean {
    if (!visible || !hasShadowCamera(light) || !light.castShadow) {
      return disposeKey(entry, "shadowCamera");
    }
    if (!entry.shadowCamera || entry.shadowCamera.camera !== light.shadow.camera) {
      disposeKey(entry, "shadowCamera");
      entry.shadowCamera = new CameraHelper(light.shadow.camera);
      entry.shadowCamera.name = `Shadow camera helper ${lightId}`;
      this.#markHelper(entry.shadowCamera, "shadowCameras", lightId);
      this.#scene.add(entry.shadowCamera);
      return true;
    }
    entry.shadowCamera.update();
    return false;
  }

  #disposeEntry(entry: RuntimeLightHelperEntry): void {
    disposeKey(entry, "lightGizmo");
    disposeKey(entry, "targetHelper");
    disposeKey(entry, "shadowCamera");
  }

  #markHelper(object: Object3D, helperType: string, lightId: string): void {
    object.userData.runtimeOnly = true;
    object.userData.lightHelper = helperType;
    object.userData.runtimeLightId = lightId;
    object.traverse((child) => {
      child.userData.runtimeOnly = true;
      child.userData.lightHelper = helperType;
      child.userData.runtimeLightId = lightId;
    });
    this.#objects.markRuntimeOnly(object);
  }
}

function lightGizmoKind(light: Object3D): "directional" | "point" | "spot" | "hemisphere" | null {
  if (light instanceof DirectionalLight) {
    return "directional";
  }
  if (light instanceof PointLight) {
    return "point";
  }
  if (light instanceof SpotLight) {
    return "spot";
  }
  if (light instanceof HemisphereLight) {
    return "hemisphere";
  }
  return null;
}

function createLightGizmo(light: Object3D, kind: NonNullable<ReturnType<typeof lightGizmoKind>>, lightId: string): Object3D {
  let helper: Object3D;
  switch (kind) {
    case "directional":
      helper = new DirectionalLightHelper(light as DirectionalLight, 1);
      break;
    case "point":
      helper = new PointLightHelper(light as PointLight, 0.75);
      break;
    case "spot":
      helper = new SpotLightHelper(light as SpotLight);
      break;
    case "hemisphere":
      helper = new HemisphereLightHelper(light as HemisphereLight, 1);
      break;
    default:
      return assertNever(kind);
  }
  helper.name = `Light gizmo helper ${lightId}`;
  helper.userData.lightHelperKind = kind;
  updateHelper(helper);
  return helper;
}

function createTargetHelper(lightId: string, points: [Vector3, Vector3]): Object3D {
  const group = new Object3D();
  group.name = `Light target helper ${lightId}`;
  const line = new Line(
    new BufferGeometry().setFromPoints(points),
    new LineBasicMaterial({ color: 0xf59e0b })
  );
  line.name = `Light target line ${lightId}`;
  const marker = new Mesh(
    new SphereGeometry(0.12, 12, 8),
    new MeshBasicMaterial({ color: 0xf59e0b, depthTest: false, depthWrite: false })
  );
  marker.name = `Light target marker ${lightId}`;
  marker.position.copy(points[1]);
  group.add(line, marker);
  return group;
}

function targetLinePoints(light: DirectionalLight | SpotLight, target: Object3D): [Vector3, Vector3] {
  light.updateWorldMatrix(true, false);
  target.updateWorldMatrix(true, false);
  return [
    light.getWorldPosition(new Vector3()),
    target.getWorldPosition(new Vector3())
  ];
}

function updateHelper(helper: Object3D): void {
  const candidate = helper as Object3D & { update?: () => void };
  candidate.update?.();
}

function hasShadowCamera(object: Object3D): object is DirectionalLight | PointLight | SpotLight {
  return object instanceof DirectionalLight || object instanceof PointLight || object instanceof SpotLight;
}

function disposeKey<Key extends keyof RuntimeLightHelperEntry>(entry: RuntimeLightHelperEntry, key: Key): boolean {
  const object = entry[key];
  if (!object) {
    return false;
  }
  disposeObjectTree(object);
  delete entry[key];
  return true;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported light helper kind: ${String(value)}`);
}
