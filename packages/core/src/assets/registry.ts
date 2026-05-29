import { createId } from "../snapshot/defaults";
import type { AssetReference } from "../snapshot/types";
import { isJsonCompatible } from "../snapshot/validation";
import type { AssetInput, RegisteredAsset } from "./types";

export class AssetRegistry {
  #assets = new Map<string, RegisteredAsset>();

  register(input: AssetInput): AssetReference {
    const id = input.id ?? createId("asset");
    const reference: AssetReference = {
      id,
      kind: input.kind ?? "glb",
      ...(input.label ? { label: input.label } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {})
    };

    if (reference.metadata && !isJsonCompatible(reference.metadata)) {
      throw new Error("Asset metadata must be JSON-compatible.");
    }

    this.#assets.set(reference.id, {
      reference,
      source: input.source
    });

    return reference;
  }

  get(assetId: string): RegisteredAsset | undefined {
    return this.#assets.get(assetId);
  }

  remove(assetId: string): void {
    this.#assets.delete(assetId);
  }

  clear(): void {
    this.#assets.clear();
  }

  get size(): number {
    return this.#assets.size;
  }
}
