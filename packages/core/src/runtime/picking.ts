import { Raycaster, Vector2, type Camera, type Object3D } from "three";
import type { CommandDispatcher } from "../commands/dispatcher";
import type { CommandResult } from "../commands/types";
import type { ThreeObjectMap } from "./three-object-map";

export class ObjectPicker {
  #raycaster = new Raycaster();
  #pointer = new Vector2();

  constructor(
    private readonly camera: Camera,
    private readonly objects: ThreeObjectMap,
    private readonly dispatcher: CommandDispatcher
  ) {}

  selectObject(objectId: string | null): CommandResult {
    return this.dispatcher.dispatch({ type: "select-object", objectId });
  }

  pickFromClientPoint(container: HTMLElement, clientX: number, clientY: number, candidates: Object3D[]): CommandResult {
    const rect = container.getBoundingClientRect();
    const width = rect.width || container.clientWidth || 1;
    const height = rect.height || container.clientHeight || 1;

    this.#pointer.x = ((clientX - rect.left) / width) * 2 - 1;
    this.#pointer.y = -((clientY - rect.top) / height) * 2 + 1;
    this.#raycaster.setFromCamera(this.#pointer, this.camera);

    const hit = this.#raycaster.intersectObjects(candidates, true)[0];
    const objectId = hit ? this.objects.getId(hit.object) ?? null : null;
    return this.selectObject(objectId);
  }
}
