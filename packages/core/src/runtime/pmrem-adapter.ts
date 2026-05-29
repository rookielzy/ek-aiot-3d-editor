import { PMREMGenerator, type Texture, type WebGLRenderer, type WebGLRenderTarget } from "three";

export interface RuntimePmremResult {
  texture: Texture;
  dispose(): void;
}

export interface RuntimePmremAdapter {
  fromEquirectangular(texture: Texture): RuntimePmremResult;
  dispose(): void;
}

export class NoopPmremAdapter implements RuntimePmremAdapter {
  fromEquirectangular(texture: Texture): RuntimePmremResult {
    return {
      texture,
      dispose() {}
    };
  }

  dispose(): void {}
}

export class ThreePmremAdapter implements RuntimePmremAdapter {
  #generator: PMREMGenerator;

  constructor(renderer: WebGLRenderer) {
    this.#generator = new PMREMGenerator(renderer);
  }

  fromEquirectangular(texture: Texture): RuntimePmremResult {
    const renderTarget: WebGLRenderTarget = this.#generator.fromEquirectangular(texture);
    return {
      texture: renderTarget.texture,
      dispose() {
        renderTarget.dispose();
      }
    };
  }

  dispose(): void {
    this.#generator.dispose();
  }
}
