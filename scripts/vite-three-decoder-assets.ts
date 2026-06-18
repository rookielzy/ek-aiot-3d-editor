import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

const require = createRequire(import.meta.url);
const threeRoot = dirname(dirname(require.resolve("three")));

interface DecoderAsset {
  publicPath: string;
  sourcePath: string;
  contentType: string;
}

const decoderAssets: readonly DecoderAsset[] = [
  {
    publicPath: "/decoders/draco/draco_decoder.js",
    sourcePath: join(threeRoot, "examples/jsm/libs/draco/draco_decoder.js"),
    contentType: "application/javascript; charset=utf-8"
  },
  {
    publicPath: "/decoders/draco/draco_decoder.wasm",
    sourcePath: join(threeRoot, "examples/jsm/libs/draco/draco_decoder.wasm"),
    contentType: "application/wasm"
  },
  {
    publicPath: "/decoders/draco/draco_wasm_wrapper.js",
    sourcePath: join(threeRoot, "examples/jsm/libs/draco/draco_wasm_wrapper.js"),
    contentType: "application/javascript; charset=utf-8"
  }
];

const decoderAssetsByPath = new Map(decoderAssets.map((asset) => [asset.publicPath, asset]));

export function threeDecoderAssetsPlugin(): Plugin {
  let base = "/";

  return {
    name: "ek-aiot-three-decoder-assets",
    configResolved(config: ResolvedConfig) {
      base = normalizeBase(config.base);
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const asset = decoderAssetsByPath.get(getRequestPath(request.url, base));
        if (!asset) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader("Content-Type", asset.contentType);
        response.end(readFileSync(asset.sourcePath));
      });
    },
    generateBundle() {
      for (const asset of decoderAssets) {
        this.emitFile({
          type: "asset",
          fileName: asset.publicPath.slice(1),
          source: readFileSync(asset.sourcePath)
        });
      }
    }
  };
}

function normalizeBase(value: string): string {
  if (!value) {
    return "/";
  }
  return value.endsWith("/") ? value : `${value}/`;
}

function getRequestPath(requestUrl: string | undefined, base: string): string {
  const pathname = requestUrl?.split("?")[0] ?? "";
  if (base !== "/" && base.startsWith("/") && pathname.startsWith(base)) {
    return `/${pathname.slice(base.length)}`;
  }
  return pathname;
}
