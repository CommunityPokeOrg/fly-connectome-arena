import { AnimationClip, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Async registry for the CC0 GLB models in public/models/.
 * Templates are kept in a module map; consumers clone them when available
 * and fall back to procedural geometry otherwise.
 */
export interface ModelTemplate {
  scene: Group;
  animations: AnimationClip[];
}

const templates = new Map<string, ModelTemplate>();
let ready = false;

const FILES = [
  'fly',
  'wasp',
  'ladybird',
  'bee-enemy',
  'rock',
  'rock-large',
  'flower-bushes',
] as const;
export type ModelAssetName = (typeof FILES)[number];
export type InsectAssetName = 'fly' | 'wasp' | 'ladybird' | 'bee-enemy';

export async function loadInsectAssets(baseUrl: string): Promise<void> {
  const loader = new GLTFLoader();
  const results = await Promise.allSettled(
    FILES.map(
      (name) =>
        new Promise<ModelTemplate>((resolve, reject) => {
          loader.load(
            `${baseUrl}models/${name}.glb`,
            (gltf) => resolve({ scene: gltf.scene as Group, animations: gltf.animations }),
            undefined,
            reject,
          );
        }),
    ),
  );
  for (const [index, result] of results.entries()) {
    const name = FILES[index] ?? 'unknown';
    if (result.status === 'fulfilled') {
      templates.set(name, result.value);
    } else {
      console.warn(`[assets] failed to load ${name}.glb; procedural fallback active`, result.reason);
    }
  }
  ready = true;
}

export function assetsReady(): boolean {
  return ready;
}

export function getTemplate(name: ModelAssetName): ModelTemplate | undefined {
  return templates.get(name);
}
