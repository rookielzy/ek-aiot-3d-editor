import {
  ThreeGltfLoaderAdapter,
  type GltfDecoderConfiguration
} from "@ek-aiot/3d-editor-core";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const DRACO_DECODER_PATH = `${import.meta.env.BASE_URL}decoders/draco/`;

export function createDemoGltfLoader(): ThreeGltfLoaderAdapter {
  return new ThreeGltfLoaderAdapter({
    decoders: createDemoGltfDecoderConfiguration()
  });
}

export function createDemoGltfDecoderConfiguration(): GltfDecoderConfiguration {
  return {
    draco: () => new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH),
    meshopt: async () => {
      await MeshoptDecoder.ready;
      return MeshoptDecoder;
    }
  };
}
