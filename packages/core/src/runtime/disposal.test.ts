import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from "three";
import { describe, expect, it, vi } from "vitest";
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
});
