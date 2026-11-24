import { CanvasTexture, Group, Sprite, SpriteMaterial, SRGBColorSpace } from "three";
import { formatDataDisplayText } from "../data-sources/device-response";
import type { SceneDataDisplayNode } from "../snapshot/types";

export class RuntimeDataDisplayCard extends Group {
  readonly #sprite = new Sprite(new SpriteMaterial({ sizeAttenuation: false, toneMapped: false }));
  readonly #canvas: HTMLCanvasElement | undefined;
  readonly #context: CanvasRenderingContext2D | null;
  #node: SceneDataDisplayNode | undefined;
  #content: string | undefined;

  constructor() {
    super();
    this.#canvas = typeof document === "undefined" ? undefined : document.createElement("canvas");
    this.#context = this.#canvas?.getContext("2d") ?? null;
    this.#sprite.geometry = this.#sprite.geometry.clone();
    this.#sprite.frustumCulled = false;
    if (this.#canvas && this.#context) {
      const texture = new CanvasTexture(this.#canvas);
      texture.colorSpace = SRGBColorSpace;
      this.#sprite.material.map = texture;
    }
    this.add(this.#sprite);
  }

  sync(node: SceneDataDisplayNode, value: string | undefined): void {
    this.#node = node;
    this.setValue(value);
  }

  setValue(value: string | undefined): void {
    const node = this.#node;
    const canvas = this.#canvas;
    const context = this.#context;
    const texture = this.#sprite.material.map;
    if (!node || !canvas || !context || !texture) return;
    const style = node.style;
    const content = JSON.stringify([style, value]);
    if (this.#content === content) return;
    this.#content = content;
    if (canvas.width !== style.width) canvas.width = style.width;
    if (canvas.height !== style.height) canvas.height = style.height;
    context.fillStyle = style.borderColor;
    context.fillRect(0, 0, style.width, style.height);
    context.fillStyle = style.backgroundColor;
    context.fillRect(1, 1, style.width - 2, style.height - 2);
    context.save();
    context.beginPath();
    context.rect(1, 1, style.width - 2, style.height - 2);
    context.clip();
    context.fillStyle = style.textColor;
    context.font = `${style.fontSize}px system-ui, sans-serif`;
    context.textBaseline = "middle";
    context.fillText(formatDataDisplayText(style, value), 8, style.height / 2);
    context.restore();
    texture.needsUpdate = true;
  }

  resize(pixelScale: number): void {
    const style = this.#node?.style;
    if (style) this.#sprite.scale.set(style.width * pixelScale, style.height * pixelScale, 1);
  }

  get pixelSize(): { width: number; height: number } | undefined {
    return this.#node?.style;
  }
}
