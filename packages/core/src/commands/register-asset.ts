import type { AssetRegistry } from "../assets/registry";
import type { SceneSnapshot } from "../snapshot/types";
import type { RegisterAssetCommand } from "./types";

export function applyRegisterAsset(snapshot: SceneSnapshot, command: RegisterAssetCommand, assets: AssetRegistry): SceneSnapshot {
  const asset = assets.register(command.asset);

  return {
    ...snapshot,
    assets: {
      ...snapshot.assets,
      [asset.id]: asset
    }
  };
}
