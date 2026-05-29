import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { AssetResolverBridge } from "../assets/resolver";
import { createEmptySnapshot } from "../snapshot/defaults";
import type { SceneSnapshot } from "../snapshot/types";
import type { RuntimePmremAdapter } from "./pmrem-adapter";
import { disposeObjectTree } from "./disposal";
import { SceneProjector } from "./scene-projector";

describe("runtime disposal", () => {
  it("disposes geometries, materials, and removes objects from parents", () => {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const mesh = new Mesh(geometry, material);
    const parent = new Mesh();
    parent.add(mesh);

    disposeObjectTree(mesh);

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(mesh.parent).toBeNull();
  });

  it("disposes mapped hierarchy resources once through their root object", () => {
    const projector = new SceneProjector();
    const parent = new Object3D();
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const child = new Mesh(geometry, material);
    parent.add(child);
    projector.objects.set("parent", parent);
    projector.objects.set("child", child);

    projector.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(projector.objects.size).toBe(0);
  });

  it("disposes environment resources, PMREM resources, and runtime lights through the projector", async () => {
    const texture = new Texture();
    const pmremTexture = new Texture();
    const textureDispose = vi.spyOn(texture, "dispose");
    const pmremDispose = vi.fn();
    const adapterDispose = vi.fn();
    const pmrem: RuntimePmremAdapter = {
      fromEquirectangular: vi.fn(() => ({ texture: pmremTexture, dispose: pmremDispose })),
      dispose: adapterDispose
    };
    const projector = new SceneProjector({
      resolver: new AssetResolverBridge(() => ({ uri: "/studio.hdr" })),
      hdrLoader: { load: vi.fn(async () => texture) },
      pmrem
    });
    await projector.project(snapshotWithHdrAndLight());
    const light = projector.getLight("light-a");

    projector.dispose();

    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(pmremDispose).toHaveBeenCalledTimes(1);
    expect(adapterDispose).toHaveBeenCalledTimes(1);
    expect(light?.parent).toBeNull();
    expect(projector.scene.environment).toBeNull();
  });
});

function snapshotWithHdrAndLight(): SceneSnapshot {
  return {
    ...createEmptySnapshot(),
    assets: { "hdr-a": { id: "hdr-a", kind: "hdr" } },
    environment: {
      mode: "hdr",
      background: { mode: "none" },
      environment: { assetId: "hdr-a", intensity: 1, rotation: { x: 0, y: 0, z: 0 } }
    },
    lights: {
      "light-a": {
        id: "light-a",
        kind: "ambient",
        name: "Fill",
        color: "#ffffff",
        intensity: 1
      }
    }
  };
}
