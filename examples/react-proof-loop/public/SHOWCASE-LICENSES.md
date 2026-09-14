# Showcase assets

The example bundles its assets locally; no runtime request to a third-party asset
host is required. These assets have their own licenses, separate from the code.

## Toy Car — CC0 1.0

- Model: Guido Odendahl (2020).
- Extensions and scene composition: Eric Chadwick (2020).
- Source: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ToyCar
- Download: https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ToyCar/glTF-Binary/ToyCar.glb
- License: https://creativecommons.org/publicdomain/zero/1.0/legalcode
- Retrieved 2026-09-14. Upstream README is preserved at
  `src/showcase/ToyCar-LICENSE.md` in this repository.
- Modification: `prepare-model.py` excludes the Fabric display cloth and sample
  camera roots from the active scene. Car/glass geometry, materials and embedded
  textures are unchanged. The hidden, unused payload data remains in the GLB.
  Reproduce with `python3 src/showcase/prepare-model.py /path/to/original.glb`.

The prototype's DamagedHelmet asset is not distributed by this example; its
mixed CC BY / CC BY-NC provenance is not treated as a general product license.

## Studio environment — CC0 1.0

`src/showcase/studio.hdr` is an original analytic studio environment generated
for this repository. It uses no photographs or third-party image inputs. It and
its generator are dedicated to the public domain under CC0 1.0:
https://creativecommons.org/publicdomain/zero/1.0/legalcode

Reproduce with `python3 src/showcase/generate-studio.py`. The radiance values are
encoded as a 512 × 256 RGBE panorama. Runtime-generated PMREM is not an asset;
it is regenerated from the HDR when the project is opened.

The project bundle stores the GLB and HDR payloads, plus source and license
metadata on each asset. Vite also copies this notice into the demo distribution.
