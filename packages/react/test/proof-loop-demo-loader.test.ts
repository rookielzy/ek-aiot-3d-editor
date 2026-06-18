import { describe, expect, it, vi } from "vitest";
import { configureGltfLoader } from "../../core/src/runtime/gltf-loader-adapter";
import { createDemoGltfDecoderConfiguration as createReactDemoGltfDecoderConfiguration } from "../../../examples/react-proof-loop/src/demo-gltf-loader";
import { createDemoGltfDecoderConfiguration as createVueDemoGltfDecoderConfiguration } from "../../../examples/vue-proof-loop/src/demo-gltf-loader";

describe("proof-loop demo GLB loader", () => {
  it("configures Draco and Meshopt decoders for the React and Vue demos", async () => {
    for (const createDecoderConfiguration of [
      createReactDemoGltfDecoderConfiguration,
      createVueDemoGltfDecoderConfiguration
    ]) {
      const loader = createFakeGltfLoader();

      await configureGltfLoader(loader as never, createDecoderConfiguration());

      expect(loader.setDRACOLoader).toHaveBeenCalledTimes(1);
      expect(loader.setMeshoptDecoder).toHaveBeenCalledTimes(1);
      expect(loader.dracoLoader).toMatchObject({ decoderPath: expect.stringContaining("decoders/draco/") });
      expect(loader.meshoptDecoder).toMatchObject({ supported: true });
    }
  });
});

function createFakeGltfLoader() {
  return {
    dracoLoader: null as unknown,
    meshoptDecoder: null as unknown,
    setDRACOLoader: vi.fn(function (this: { dracoLoader: unknown }, value: unknown) {
      this.dracoLoader = value;
      return this;
    }),
    setKTX2Loader: vi.fn(function () {
      return this;
    }),
    setMeshoptDecoder: vi.fn(function (this: { meshoptDecoder: unknown }, value: unknown) {
      this.meshoptDecoder = value;
      return this;
    })
  };
}
