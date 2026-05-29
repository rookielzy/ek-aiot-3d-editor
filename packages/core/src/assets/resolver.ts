import type { AssetReference } from "../snapshot/types";
import { createMissingAssetProblem } from "./problems";
import type { AssetResolver, ResolvedAsset } from "./types";

export class AssetResolverBridge {
  #resolver?: AssetResolver;

  constructor(resolver?: AssetResolver) {
    this.#resolver = resolver;
  }

  setResolver(resolver: AssetResolver | undefined): void {
    this.#resolver = resolver;
  }

  async resolve(asset: AssetReference): Promise<ResolvedAsset | null> {
    if (!this.#resolver) {
      return null;
    }

    return await this.#resolver(asset);
  }

  async problemForMissing(asset: AssetReference, objectId?: string) {
    const resolved = await this.resolve(asset);
    return resolved ? null : createMissingAssetProblem(asset.id, objectId);
  }
}
