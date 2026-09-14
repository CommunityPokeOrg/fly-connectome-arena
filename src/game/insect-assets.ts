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

const FILES = {
  fly: 'models/fly.glb',
  wasp: 'models/wasp.glb',
  ladybird: 'models/ladybird.glb',
  'bee-enemy': 'models/bee-enemy.glb',
  'kit-floor': 'models/kit/floor.glb',
  'kit-wall': 'models/kit/wall.glb',
  'kit-wall-window': 'models/kit/wall-window-square.glb',
  'kit-column': 'models/kit/column.glb',
  'kit-partition': 'models/kit/wall-low.glb',
  'kit-pipe': 'models/kit/detail-pipe.glb',
  'lab-table': 'models/interior/table.glb',
  'lab-bookcase': 'models/interior/bookcase.glb',
  'lab-shelf': 'models/interior/shelf.glb',
} as const;
export type ModelAssetName = keyof typeof FILES;
export type InsectAssetName = 'fly' | 'wasp' | 'ladybird' | 'bee-enemy';

export async function loadInsectAssets(baseUrl: string): Promise<void> {
  const loader = new GLTFLoader();
  const results = await Promise.allSettled(
    Object.entries(FILES).map(
      ([, path]) =>
        new Promise<ModelTemplate>((resolve, reject) => {
          loader.load(
            `${baseUrl}${path}`,
            (gltf) => resolve({ scene: gltf.scene as Group, animations: gltf.animations }),
            undefined,
            reject,
          );
        }),
    ),
  );
  const names = Object.keys(FILES) as ModelAssetName[];
  for (const [index, result] of results.entries()) {
    const name = names[index] ?? 'unknown';
    if (result.status === 'fulfilled') {
      templates.set(name, result.value);
    } else {
      console.warn(`[assets] failed to load ${name}; procedural fallback active`, result.reason);
    }
  }
  ready = true;
}

export function assetsReady(): boolean {
  return ready;
}

export function getTemplate(name: string): ModelTemplate | undefined {
  return templates.get(name);
}
