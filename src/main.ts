import * as THREE from 'three';
import './styles.css';
import { FlyBrain } from './brain/fly-brain.ts';
import { Arena } from './game/arena.ts';
import { Game } from './game/game.ts';
import { GameCamera } from './game/camera.ts';
import { loadInsectAssets } from './game/insect-assets.ts';
import { HUD } from './ui/hud.ts';
import { ConnectomeVisualizer } from './viz/connectome-viz.ts';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const params = new URLSearchParams(window.location.search);
const requestedSeed = params.get('seed');
const seed: number | string = requestedSeed ?? Math.floor(Math.random() * 1_000_000);
const app = document.querySelector('#app');
if (!app) {
  throw new Error('Application root is missing');
}

// Load the CC0 GLB insect/prop models before the game constructs its rigs;
// missing assets simply fall back to procedural geometry.
await loadInsectAssets(import.meta.env.BASE_URL);

const arena = new Arena(seed);
const canvas = document.createElement('canvas');
canvas.className = 'game-canvas';
canvas.setAttribute('aria-label', 'Three dimensional fly arena');
app.append(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const camera = new GameCamera(canvas);
const brain = new FlyBrain(seed);
const game = new Game(arena, brain, { debugWin: params.get('debug') === 'win' });
const visualizer = new ConnectomeVisualizer(brain, () => game.lastVision);
app.append(visualizer.element);
const hud = new HUD(
  game,
  camera,
  visualizer,
  seed,
  () => game.start(),
  () => {
    game.reset();
    game.start();
  },
  () => arena.cycleVariant(),
);
app.append(hud.root);
if (params.get('autostart') === '1') {
  game.start();
  if (params.get('stage') === 'victory') {
    game.debugVictory();
  }
}

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(arena.scene, camera.camera);
composer.addPass(renderPass);
let gtaoPass: GTAOPass | undefined;
try {
  gtaoPass = new GTAOPass(arena.scene, camera.camera, window.innerWidth, window.innerHeight);
  gtaoPass.output = GTAOPass.OUTPUT.Default;
  gtaoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1, scale: 1, samples: 16 });
  gtaoPass.blendIntensity = 0.9;
  composer.addPass(gtaoPass);
} catch (error) {
  console.warn('[main] GTAO unavailable, rendering without AO', error);
  gtaoPass = undefined;
}
composer.addPass(new OutputPass());

function resize(): void {
  const vizWidth = window.innerWidth > 900 && !visualizer.element.classList.contains('collapsed') ? 380 : 0;
  const width = Math.max(320, window.innerWidth - vizWidth);
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  gtaoPass?.setSize(width, height);
  camera.resize(width, height);
}
window.addEventListener('resize', resize);
resize();

let previous = performance.now();
let accumulator = 0;
let fps = 60;
const fixedStep = 1 / 60;
function frame(now: number): void {
  const elapsed = Math.min(0.1, Math.max(0, (now - previous) / 1000));
  previous = now;
  accumulator += elapsed * game.simulationSpeed;
  while (accumulator >= fixedStep) {
    game.fixedStep(fixedStep);
    accumulator -= fixedStep;
  }
  if (game.state === 'spectate' || game.state === 'elimination' || game.state === 'victory') {
    camera.victoryShot(game.fly.group.position, elapsed);
  } else {
    camera.update(game.fly.group, game.fly.heading, elapsed);
  }
  visualizer.update(elapsed);
  composer.render();
  fps += (1 / Math.max(0.001, elapsed) - fps) * 0.06;
  hud.update(fps);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
