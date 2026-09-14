# Third-party asset provenance

All third-party files under `public/models/`, `public/env/`, and
`public/textures/` are released under the **Creative Commons CC0 1.0
Universal** public-domain dedication
(https://creativecommons.org/publicdomain/zero/1.0/). CC0 imposes no
attribution requirement, but the sources are recorded here so the provenance
of every redistributed file is verifiable. The only textures generated
procedurally at runtime are small utility maps (wing venation, nectar, spot
masks) that have no external source.

## Insect models (Poly Pizza)

Verification method: each Poly Pizza model page embeds a
`window.__SERVER_APP_STATE__` JSON object whose `model.Licence` field was read
directly (`"CC0 1.0"`) and whose rendered page header reads
"Public Domain (CC0)". The GLB was downloaded from the `static.poly.pizza`
URL referenced by that page. SHA-256 digests of the files committed here are
listed so the redistributed bytes can be matched to the source.

| File | Title | Creator | Source page | License | Verified | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `public/models/fly.glb` | Fly | Kohyzazi | https://poly.pizza/m/kCLW4c0kGx | CC0 1.0 | 2026-09-14 | `1fd53c0636500bb2229b90462c7c29df1b36548e8b37e4d1c2567261778ab101` |
| `public/models/wasp.glb` | Wasp | Quaternius (https://quaternius.com/) | https://poly.pizza/m/3aQgc75sUR | CC0 1.0 | 2026-09-14 | `050fe9f39c61f62c00691303fa44f85cbd6548d385f27d95011fa9936d2b48a3` |
| `public/models/ladybird.glb` | Ladybird | Exceptional_3D | https://poly.pizza/m/3tCnJC9UYA | CC0 1.0 | 2026-09-14 | `718b2be1cd6c1b4361e9e4cb7610459b994575d9e3e7b7818348670f53612166` |
| `public/models/bee-enemy.glb` | Bee Enemy | Quaternius (https://quaternius.com/) | https://poly.pizza/m/6HsU6GQt3a | CC0 1.0 | 2026-09-14 | `29a3ac29e6859208bdab9db3d34387e1d154f14564bd17cdc57eda669cb557cf` |

Original download URLs (as referenced by the source pages at verification time):

* fly.glb — https://static.poly.pizza/2eeae94c-7eae-452a-b0ea-838a37863498.glb
* wasp.glb — https://static.poly.pizza/71cadefd-8e65-423a-9a95-3cdf7e012586.glb
* ladybird.glb — https://static.poly.pizza/8e228e46-8838-4362-80ef-297b8d281966.glb
* bee-enemy.glb — https://static.poly.pizza/19203489-125b-41f5-b9c9-801a522cb775.glb

Usage in this project:

* `fly.glb` — player *Drosophila*. Static mesh; wing primitives are split
  left/right at load time so they can be fluttered procedurally. Materials are
  replaced with the project's chitin / compound-eye / wing-membrane materials.
* `wasp.glb` — wasp enemy. Skinned, with `Wasp_Flying`, `Wasp_Attack`, and
  `Wasp_Death` animation clips driven by `THREE.AnimationMixer`.
* `ladybird.glb` — beetle enemy. Static mesh; materials replaced.
* `bee-enemy.glb` — drone-hornet enemy. Skinned, with `Flying`, `Bite_Front`,
  `HitRecieve`, and `Death` clips.

If a model fails to load (offline, blocked asset host, unit tests in Node),
`src/game/insects.ts` falls back to the procedural multi-part insect rig so
the game stays playable.

## Environment props (Poly Pizza)

Verified with the same method as the insect models (`model.Licence ==
"CC0 1.0"` in the page state, header "Public Domain (CC0)").

| File | Title | Creator | Source page | License | Verified | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `public/models/rock.glb` | Rock | Quaternius | https://poly.pizza/m/34W5ymEePk | CC0 1.0 | 2026-09-14 | `b51a7737c6322b241336c621e0568344c58d34d4e741fc2e0ca176763b852ff7` |
| `public/models/rock-large.glb` | Rock Large | Quaternius | https://poly.pizza/m/54jZKTAt5p | CC0 1.0 | 2026-09-14 | `c4e9f04c04419e67e919c4533dfd6044abc5f0640afa9d0e174cf474285d380c` |
| `public/models/flower-bushes.glb` | Flower Bushes | Quaternius | https://poly.pizza/m/1X06RgvSr6 | CC0 1.0 | 2026-09-14 | `71d438bf6693a76c6dc5e8d85417d9b738a7d85eb643358a8937c9ee872953b5` |

Download URLs: rock.glb — https://static.poly.pizza/0ffcfce1-6983-4cb1-b055-77f71d50f3f1.glb;
rock-large.glb — https://static.poly.pizza/c14651f6-9ef8-41e8-8aca-cafed61d9ca2.glb;
flower-bushes.glb — https://static.poly.pizza/029d08a8-f7de-47ab-b00f-34970698ce21.glb.

Usage: `rock.glb` / `rock-large.glb` dress the arena's obstacle columns and
boundary (collision cylinders are unchanged; the meshes are scaled to the
existing radii). `flower-bushes.glb` decorates the nectar (food) sites.

## Environment map and PBR textures (Poly Haven)

Every asset on Poly Haven is published under CC0 1.0
(https://polyhaven.com/license). Files were fetched through the public API
(`https://api.polyhaven.com/files/<slug>`), which returned the `dl.polyhaven.org`
URLs below; authorship comes from `https://api.polyhaven.com/info/<slug>`.

| File | Asset | Author | Source page | License | Verified | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `public/env/abandoned_greenhouse_1k.hdr` | Abandoned Greenhouse (HDRI, 1k) | Andreas Mischok | https://polyhaven.com/a/abandoned_greenhouse | CC0 1.0 | 2026-09-14 | `d6c3d214ecbb76a1e132bc9b5afe7d1c98fdb5f106ff598077f23bd3e566b466` |
| `public/textures/forest_floor_diff_1k.jpg` | Forest Floor — diffuse | eye-candy.xyz | https://polyhaven.com/a/forest_floor | CC0 1.0 | 2026-09-14 | `f12e5adea1741f9eb7a528bfc621f8267885b9530b74c3a8afdb823899bdbf0b` |
| `public/textures/forest_floor_nor_gl_1k.jpg` | Forest Floor — normal (GL) | eye-candy.xyz | https://polyhaven.com/a/forest_floor | CC0 1.0 | 2026-09-14 | `681f3de8c756c4d19bcda33039f953295498f38b1425ce9d56b37d6f97f6e518` |
| `public/textures/forest_floor_rough_1k.jpg` | Forest Floor — roughness | eye-candy.xyz | https://polyhaven.com/a/forest_floor | CC0 1.0 | 2026-09-14 | `ece0b331f08c03f3edcd8ab6815b74a5ae20768beef64cd4f96a5b2fa26e116e` |
| `public/textures/mossy_stone_wall_diff_1k.jpg` | Mossy Stone Wall — diffuse | Amal Kumar | https://polyhaven.com/a/mossy_stone_wall | CC0 1.0 | 2026-09-14 | `7240e55cfc662ea403600fc7d5143f72983fbe8098d55fc6ccae75d21421dce4` |
| `public/textures/mossy_stone_wall_nor_gl_1k.jpg` | Mossy Stone Wall — normal (GL) | Amal Kumar | https://polyhaven.com/a/mossy_stone_wall | CC0 1.0 | 2026-09-14 | `e159e429269bc933743ee47051b4081261e6131e994242bf26e05ab0a0df4542` |
| `public/textures/mossy_stone_wall_rough_1k.jpg` | Mossy Stone Wall — roughness | Amal Kumar | https://polyhaven.com/a/mossy_stone_wall | CC0 1.0 | 2026-09-14 | `06b19bedb07c6f81acdd8a461e73e7c3d5bfa0afedba8b4e9bda9cb50fb0b1fb` |
| `public/textures/bark_brown_02_diff_1k.jpg` | Bark Brown 02 — diffuse | Rob Tuytel | https://polyhaven.com/a/bark_brown_02 | CC0 1.0 | 2026-09-14 | `920fa0bed0c9d78c1d530e99795113afd532d7db746de440f4a85d7c83ed0f1a` |
| `public/textures/bark_brown_02_nor_gl_1k.jpg` | Bark Brown 02 — normal (GL) | Rob Tuytel | https://polyhaven.com/a/bark_brown_02 | CC0 1.0 | 2026-09-14 | `0d5e691e8ad8bcd093a3587887fda2a6b4a948b5708a4f256f7919584c6eb857` |
| `public/textures/bark_brown_02_rough_1k.jpg` | Bark Brown 02 — roughness | Rob Tuytel | https://polyhaven.com/a/bark_brown_02 | CC0 1.0 | 2026-09-14 | `68125592de36e15bae7aa6db85c4d135aeb7e5653199ba226483a70f6d69837d` |

Download URLs follow the pattern
`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/<slug>_1k.hdr` and
`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<slug>/<slug>_<map>_1k.jpg`.
The 1k resolutions were chosen deliberately to keep the deployed bundle small.

Usage: the HDRI is loaded with `RGBELoader` and used as `scene.environment`
(image-based lighting / reflections) with a low-intensity blurred copy as the
background; the forest-floor set textures the arena floor, the mossy stone
set textures the boundary wall and stone obstacles, and the bark set textures
the reed/post obstacles. If any file fails to load the renderer falls back to
the analytic lights and flat materials.

## Excluded

Models that were only available under CC-BY or unclear terms were
excluded. Sketchfab and Smithsonian 3D were not used because their per-asset
license pages could not be verified from this environment.
