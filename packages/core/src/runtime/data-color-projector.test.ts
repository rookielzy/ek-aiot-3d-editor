import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Texture
} from "three";
import { describe, expect, it, vi } from "vitest";
import { DataColorProjector } from "./data-color-projector";
import { ThreeObjectMap } from "./three-object-map";

describe("data color projector", () => {
  it("recolors only the target object when two objects share an authored material", () => {
    const shared = new MeshStandardMaterial({ color: "#ffffff", opacity: 0.4, transparent: true });
    const map = new ThreeObjectMap();
    const meshA = new Mesh(new BoxGeometry(), shared);
    const meshB = new Mesh(new BoxGeometry(), shared);
    const rootA = new Group();
    const rootB = new Group();
    rootA.add(meshA);
    rootB.add(meshB);
    registerObject(map, "object-a", rootA);
    registerObject(map, "object-b", rootB);
    const projector = new DataColorProjector({ objects: map });

    const report = projector.set([{ objectNodeId: "object-a", color: "#ff0000" }]);

    expect(report).toEqual([{
      objectNodeId: "object-a",
      status: "applied",
      meshCount: 1,
      slotCount: 1,
      supportedSlotCount: 1,
      problems: []
    }]);
    const applied = meshA.material as MeshStandardMaterial;
    expect(applied).not.toBe(shared);
    expect(applied.color.getHexString()).toBe("ff0000");
    expect(applied.opacity).toBe(0.4);
    expect(applied.transparent).toBe(true);
    expect(meshB.material).toBe(shared);
    expect(shared.color.getHexString()).toBe("ffffff");

    projector.set([]);
    expect(meshA.material).toBe(shared);
    expect(meshB.material).toBe(shared);
    expect(shared.color.getHexString()).toBe("ffffff");
    projector.dispose();
  });

  it.each([false, true])("isolates nested object materials with a child binding: %s", (bindChild) => {
    const shared = new MeshStandardMaterial({ color: "#ffffff" });
    const meshA = new Mesh(new BoxGeometry(), shared);
    const meshB = new Mesh(new BoxGeometry(), shared);
    const rootA = new Group();
    const rootB = new Group();
    rootA.add(meshA, rootB);
    rootB.add(meshB);
    const map = new ThreeObjectMap();
    registerObject(map, "object-a", rootA);
    registerObject(map, "object-b", rootB);
    map.set("imported-a", meshA, { kind: "imported", ownerObjectId: "object-a" });
    const projector = new DataColorProjector({ objects: map });

    const reports = projector.set([
      { objectNodeId: "object-a", color: "#ff0000" },
      ...(bindChild ? [{ objectNodeId: "object-b", color: "#00ff00" }] : [])
    ]);

    expect((meshA.material as MeshStandardMaterial).color.getHexString()).toBe("ff0000");
    expect((meshB.material as MeshStandardMaterial).color.getHexString()).toBe(bindChild ? "00ff00" : "ffffff");
    expect(reports.every((report) => report.meshCount === 1 && report.slotCount === 1)).toBe(true);
    const disposeA = vi.spyOn(meshA.material as MeshStandardMaterial, "dispose");
    const disposeB = bindChild ? vi.spyOn(meshB.material as MeshStandardMaterial, "dispose") : null;

    projector.set([]);

    expect(meshA.material).toBe(shared);
    expect(meshB.material).toBe(shared);
    expect(disposeA).toHaveBeenCalledTimes(1);
    if (disposeB) expect(disposeB).toHaveBeenCalledTimes(1);
    projector.dispose();
  });

  it("reports partial material support and keeps unsupported slots authored", () => {
    const standard = new MeshStandardMaterial({ color: "#ffffff" });
    const basic = new MeshBasicMaterial({ color: "#00ff00" });
    const mesh = new Mesh(new BoxGeometry(), [standard, basic]);
    const root = new Group();
    root.add(mesh);
    const map = new ThreeObjectMap();
    registerObject(map, "object-a", root);
    const projector = new DataColorProjector({ objects: map });

    const [report] = projector.set([{ objectNodeId: "object-a", color: "#112233" }]);

    expect(report).toMatchObject({
      status: "partial",
      meshCount: 1,
      slotCount: 2,
      supportedSlotCount: 1,
      problems: [{
        code: "color-material-unsupported",
        slotIndex: 1,
        materialType: "MeshBasicMaterial"
      }]
    });
    const materials = mesh.material as [MeshStandardMaterial, MeshBasicMaterial];
    expect(materials[0].color.getHexString()).toBe("112233");
    expect(materials[1]).toBe(basic);
    expect(basic.color.getHexString()).toBe("00ff00");

    projector.dispose();
    expect(mesh.material).toEqual([standard, basic]);
  });

  it("reports unsupported objects and does not mutate their materials", () => {
    const basic = new MeshBasicMaterial({ color: "#123456" });
    const mesh = new Mesh(new BoxGeometry(), basic);
    const root = new Group();
    root.add(mesh);
    const map = new ThreeObjectMap();
    registerObject(map, "object-a", root);
    const projector = new DataColorProjector({ objects: map });

    const [report] = projector.set([{ objectNodeId: "object-a", color: "#ffffff" }]);

    expect(report).toMatchObject({
      status: "unsupported",
      supportedSlotCount: 0,
      problems: [{ code: "color-material-unsupported", slotIndex: null }]
    });
    expect(mesh.material).toBe(basic);
    expect(basic.color.getHexString()).toBe("123456");
    projector.dispose();
  });

  it("reports an unavailable object until the runtime target exists", () => {
    const map = new ThreeObjectMap();
    const projector = new DataColorProjector({ objects: map });

    expect(projector.set([{ objectNodeId: "object-a", color: "#ffffff" }])).toEqual([{
      objectNodeId: "object-a",
      status: "unavailable",
      meshCount: 0,
      slotCount: 0,
      supportedSlotCount: 0,
      problems: []
    }]);
    projector.dispose();
  });

  it("reapplies the current color after materials are projected again", () => {
    const first = new MeshStandardMaterial({ color: "#ffffff" });
    const second = new MeshStandardMaterial({ color: "#336699", roughness: 0.2 });
    const mesh = new Mesh(new BoxGeometry(), first);
    const root = new Group();
    root.add(mesh);
    const map = new ThreeObjectMap();
    registerObject(map, "object-a", root);
    const projector = new DataColorProjector({ objects: map });

    projector.set([{ objectNodeId: "object-a", color: "#ff0000" }]);
    projector.restoreAll();
    expect(mesh.material).toBe(first);
    // A scene projection replaces the authored base material with a new clone.
    mesh.material = second;

    const [report] = projector.reapply();
    expect(report.status).toBe("applied");
    expect((mesh.material as MeshStandardMaterial).color.getHexString()).toBe("ff0000");
    expect((mesh.material as MeshStandardMaterial).roughness).toBe(0.2);
    expect(second.color.getHexString()).toBe("336699");

    projector.dispose();
    expect(mesh.material).toBe(second);
  });

  it("disposes projection-owned materials without touching shared textures", () => {
    const texture = new Texture();
    const disposeTexture = vi.spyOn(texture, "dispose");
    const authored = new MeshStandardMaterial({ map: texture });
    const disposeAuthored = vi.spyOn(authored, "dispose");
    const mesh = new Mesh(new BoxGeometry(), authored);
    const root = new Group();
    root.add(mesh);
    const map = new ThreeObjectMap();
    registerObject(map, "object-a", root);
    const projector = new DataColorProjector({ objects: map });

    projector.set([{ objectNodeId: "object-a", color: "#ff0000" }]);
    const owned = mesh.material as MeshStandardMaterial;
    const disposeOwned = vi.spyOn(owned, "dispose");
    projector.dispose();

    expect(disposeOwned).toHaveBeenCalledTimes(1);
    expect(disposeAuthored).not.toHaveBeenCalled();
    expect(disposeTexture).not.toHaveBeenCalled();
    expect(mesh.material).toBe(authored);
  });

  it("restores removed objects while keeping other assignments applied", () => {
    const map = new ThreeObjectMap();
    const meshA = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const meshB = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const rootA = new Group();
    const rootB = new Group();
    rootA.add(meshA);
    rootB.add(meshB);
    registerObject(map, "object-a", rootA);
    registerObject(map, "object-b", rootB);
    const projector = new DataColorProjector({ objects: map });

    projector.set([
      { objectNodeId: "object-a", color: "#ff0000" },
      { objectNodeId: "object-b", color: "#00ff00" }
    ]);
    projector.set([{ objectNodeId: "object-b", color: "#00ff00" }]);

    expect((meshA.material as MeshStandardMaterial).color.getHexString()).toBe("ffffff");
    expect((meshB.material as MeshStandardMaterial).color.getHexString()).toBe("00ff00");
    projector.dispose();
  });
});

function registerObject(map: ThreeObjectMap, nodeId: string, object: Group): void {
  map.set(nodeId, object, { kind: "object", objectId: nodeId });
}
