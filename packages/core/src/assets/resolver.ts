import type { AssetReference } from "../snapshot/types";
import type { ProjectAssetStore } from "../project/asset-store";
import { createMissingAssetProblem } from "./problems";
import type { AssetResolver, ResolvedAsset } from "./types";

export class AssetResolverBridge {
  #resolver?: AssetResolver;
  #projectAssets?: ProjectAssetStore;

  constructor(resolver?: AssetResolver, projectAssets?: ProjectAssetStore) {
    this.#resolver = resolver;
    this.#projectAssets = projectAssets;
  }

  setResolver(resolver: AssetResolver | undefined): void {
    this.#resolver = resolver;
  }

  setProjectAssets(projectAssets: ProjectAssetStore | undefined): void {
    this.#projectAssets = projectAssets;
  }

  async resolve(asset: AssetReference): Promise<ResolvedAsset | null> {
    const projectResolved = this.#projectAssets?.resolve(asset);
    if (projectResolved) {
      return projectResolved;
    }

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
