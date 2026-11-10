export type CommandLayerHandler = (event: KeyboardEvent) => boolean;

const layers: { id: string | undefined; handlers: CommandLayerHandler[] }[] = [];

/**
 * Layer identity. Escape has several legitimate listeners on one layer (the panel's Radix focus
 * loop, the command list, and the component that owns the open state); the first of them to claim
 * the key marks the event so the rest of the same layer stand down instead of contradicting it.
 */
const handled = new WeakSet<KeyboardEvent>();

export interface CommandLayerOptions {
  /** Folds this registration into the top-most layer instead of claiming a layer of its own. */
  join?: string;
}

/** Registers a top-most interactive layer (menu, dialog, drawer) that may claim a key first. */
export function registerCommandLayer(handler: CommandLayerHandler, options: CommandLayerOptions = {}): () => void {
  const existing = options.join ? layers.find((candidate) => candidate.id === options.join) : undefined;
  if (existing) {
    existing.handlers.push(handler);
    return () => {
      const index = existing.handlers.indexOf(handler);
      if (index >= 0) existing.handlers.splice(index, 1);
    };
  }
  const layer = { id: options.join, handlers: [handler] };
  layers.push(layer);
  return () => {
    const index = layers.indexOf(layer);
    if (index >= 0) layers.splice(index, 1);
  };
}

/** Offers a keyboard event to layers from the top down; returns true once one handled it. */
export function closeTopLayer(event: KeyboardEvent): boolean {
  if (handled.has(event)) return true;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (!layer) continue;
    for (const handler of layer.handlers) {
      if (!handler(event)) continue;
      handled.add(event);
      return true;
    }
  }
  return false;
}
