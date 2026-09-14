# FLY // CONNECTOME ARENA

Fly Connectome Arena is a self-contained retro-sci-fi browser game. A
simulated *Drosophila* navigates a walled flight-arena chamber, collects
restorative sucrose droplets, avoids hazards, and fires at chasing wasps and
patrolling drones. The simulation is fully autonomous: steering, foraging,
and evasion all come from a deterministic, connectome-inspired spiking
neural network plus a small reflex layer rather than a direct
sensor-to-command script.

There is no backend, CDN, remote asset, or external service. Three.js draws
the arena and Canvas 2D renders the live neural observatory.

## Procedural insects

The fly and every enemy are assembled at runtime by `game/insects.ts` from
primitive Three.js geometry: head, thorax, abdomen, compound eyes, antennae,
six articulated legs, translucent wings, and variant-specific details. Wasp
enemies are fast yellow/black chasers, beetles are armored slow rammers, and
drone-hornets patrol and fire. Legs and wings animate procedurally. Hits flash
materials white and add knockback; deaths tumble, fade, and trigger particle
bursts.

## Environments

The arena is built from real CC0 glTF models: floor tiles, walls, windowed
segments, columns, low partitions, and pipes from the Kenney Building Kit,
plus lab tables, bookcases, and shelves from the OpenGameArt 3D Interior Home
Assets pack (see `ASSETS.md`). Wall segments and floor tiles are drawn with
`InstancedMesh`, and a CC0 HDRI provides soft image-based lighting over a
flat neutral background. The seeded map is either **Bench Lab** or
**Night Lab**. The HUD MAP button cycles the active environment palette.
Every visible obstacle has matching collision bounds; a small reflex
steering layer keeps the fly out of walls and partitions it approaches
head-on. Lighting combines a hemisphere fill, a shadow-casting directional
key light, and GTAO post-processing.

## Controls

| Key | Action |
| --- | --- |
| Space | Start / restart |
| P | Pause |
| C | Cycle orbit-follow, chase, top-down, and free-orbit cameras |
| V | Toggle the connectome visualizer |
| M | Mute synthesized WebAudio |
| `[` / `]` | Change simulation speed from 0.5× to 4× |
| R | Reset the run |
| Enter | Skip the victory sequence |

The bottom control bar provides the same common actions with accessible
buttons and visible keyboard focus styles. A reproducible seed can be
selected with `?seed=123` in the URL.

## Architecture

```text
main.ts
 ├─ fixed 60 Hz accumulator
 ├─ Game
 │   ├─ Arena + obstacles + food
 │   ├─ Fly + collisions + health/lives
 │   ├─ Enemies + waves + pooled projectiles
 │   └─ Hazards + damage
 ├─ FlyBrain
 │   ├─ spatial sensors
 │   ├─ deterministic Connectome
 │   └─ typed-array LIFNetwork
 ├─ HUD + control bar
 └─ ConnectomeVisualizer
     ├─ population columns and synapses
     ├─ decaying spike glow
     ├─ two-second raster
     └─ population and motor readouts
```

## Neural model

The graph contains 156 named neurons:

* ORN (16): full-circle food/goal direction.
* VIS (24): retinotopic obstacle, wall, and enemy proximity over a frontal
  240° field, ordered far-left to far-right.
* TGT (12): frontal 180° enemy direction and aiming sensors.
* THR (8): full-circle incoming projectile direction.
* PN/KC/MBON: sparse olfactory projection and mushroom-body path.
* CX (16): a recurrent heading ring with local excitation and broad
  inhibition.
* LAL_L/LAL_R: bilateral steering channels.
* DN (6): turn-left, turn-right, forward, brake, fire, and evade.

VIS uses a crossed reflex: the left visual half excites `LAL_R` and the right
half excites `LAL_L`. TGT uses bilateral pursuit wiring, center TGT sensors
strongly excite `DN_fire`, and THR excites `DN_evade` while inhibiting
`DN_forward`. ORN travels through PN → KC → MBON before reaching steering.
Heading injects a bump into CX, whose small outputs provide persistence.
Tonic forward drive still enters `DN_forward`, so every motor output is
decoded from spikes.

The LIF network uses `dt = 1 ms`, 20 ms membrane time constant, 18 ms
synaptic-current decay, a two millisecond refractory period, a precise
100 ms firing-rate window, and a rolling two-second per-neuron spike-time
ring. Input currents are deterministic rather than Poisson spike trains.
This is **not** the real FlyWire connectome; the populations and wiring are
small, readable inspirations tuned for playability.

## Local development

```bash
npm install
npm run dev
```

The project also provides:

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

The tests cover seeded RNG behavior, LIF repeatability and raster history,
collision primitives, connectome determinism, and a 3000-tick headless
behavior run that checks arena bounds, activity, and firing.

## Victory sequence

The game has an explicit state machine in `game/state-machine.ts`:

```text
title → playing → spectate → elimination → victory
             │         │            │
             ├─ paused ┘            └─ gameover (only during playing)
             └───────────────────────────────┘
```

Victory requires surviving all five waves and clearing wave five. Control
locks while the fly hovers over the safe center pad. The camera widens for
1.5 seconds, then the arena purge eliminates remaining enemies one at a time
every 1.2 seconds with a beam, death animation, particles, and audio. The HUD
shows `PURGING SWARM n/N`; if there are no enemies left it shows a two-second
`LAST SURVIVOR` beat. Space, Enter, or clicking the sequence skips directly
to the victory report while preserving the same final tallies.

For screenshot or QA work, `?debug=win&autostart=1` starts a short wave-one
victory demonstration. `&stage=victory` jumps to the final report. These are
intentionally documented as debug-only paths.

## Deployment

The Pages workflow runs on pushes to `main` and can be started manually. It
installs with `npm ci`, builds with `GITHUB_PAGES=true`, uploads `dist`, and
deploys through GitHub Pages. In repository settings, choose **GitHub
Actions** as the Pages source.

## License

MIT © CommunityPokeOrg 2026
