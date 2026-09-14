# Third-party asset provenance

All third-party files under `public/models/` and `public/env/` are released
under the **Creative Commons CC0 1.0 Universal** public-domain dedication
(https://creativecommons.org/publicdomain/zero/1.0/). CC0 imposes no
attribution requirement, but the sources are recorded here so the provenance
of every redistributed file is verifiable. The only texture generated
procedurally at runtime is the wing-venation map, which has no external
source.

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

## Arena architecture (Kenney Building Kit)

Source page: https://kenney.nl/assets/building-kit. Direct archive:
https://kenney.nl/media/pages/assets/building-kit/0de7aaa492-1743244741/kenney_building-kit.zip
The `License.txt` inside the archive reads:

```text
License: (Creative Commons Zero, CC0)
http://creativecommons.org/publicdomain/zero/1.0/
You can use this content for personal, educational, and commercial purposes.
```

| File | Kit piece | SHA-256 |
| --- | --- | --- |
| `public/models/kit/floor.glb` | floor (2×0.1×2) | `fbe8e907e502381db5d9f87676ef9e34522e35fc95a401a754d3e4984819338b` |
| `public/models/kit/wall.glb` | wall (0.1×2.4×2) | `769a02a70327132ba864c04299631c65fb08e96e01e1796ba73ddf7f44679a36` |
| `public/models/kit/wall-window-square.glb` | square window wall | `099d332de4c632cb03692140f9a4004b5d6508cea6a7e3a80268564976cc8b7e` |
| `public/models/kit/column.glb` | column (0.5×2.4×0.5) | `f2bbc1799caa57c433f18b4b35ed69b9a464285eefe2c291cec04b8a01795f30` |
| `public/models/kit/wall-low.glb` | low wall partition (0.1×1.2×2) | `21954aa215ae8243126be5a7aff9a48552134c399e1b16c9d46f807ae20b8ca3` |
| `public/models/kit/detail-pipe.glb` | pipe detail | `d380dc7c5b7960ad537633bede26420ca311afa7b453827bf9e4032ca52d724f` |
| `public/models/kit/Textures/colormap.png` | shared colormap (relative URI referenced by the kit GLBs) | `01741a46a279bef667de3143ee653d0073ed7cae925d88341281391d9220092b` |

Usage: instanced floor tiles cover the arena floor, wall and window pieces
form the 24-sided boundary polygon, columns mark polygon vertices and an
inner ring, low walls form radial partitions, and pipes decorate the
perimeter. Materials are neutralized on load (metalness 0, roughness ≥0.75,
no emissive).

## Interior obstacles (OpenGameArt 3D Interior Home Assets)

Source page: https://opengameart.org/content/3d-interior-home-assets
(creator: mabaci). Direct archive:
https://opengameart.org/sites/default/files/homeinteriorassets.zip
The page lists `License(s): CC0` and the bundled license (also shipped as
`public/models/interior/LICENSE.txt`) reads `License: CC0 1.0 Universal
(Public Domain Dedication)`.

| File | Piece | SHA-256 |
| --- | --- | --- |
| `public/models/interior/table.glb` | lab bench | `968001befa285aca1500ad442cda52dfd10ad3893f6176fff81525cce949e54d` |
| `public/models/interior/bookcase.glb` | wall bookcase | `44edd82ab573d272efe54512a812fe282305e941b70c301932e6f65f4e2c47e0` |
| `public/models/interior/shelf.glb` | decorative wall shelf | `2e4e36eaf68cc8c285912bad8af88bacd3f66dcaa48cd5b5f05a733fe04edcbd` |
| `public/models/interior/LICENSE.txt` | license text | `211a6f058dbf80c0bd88e7b753c7578b7ea068eecb603b699a4677a58239d2a9` |

Usage: tables are scaled to a 3-unit long side and placed as lab benches,
bookcases sit against the wall interior, and shelves decorate wall segments.
Bench and bookcase positions carry matching collision circles.

## Environment map (Poly Haven)

Every asset on Poly Haven is published under CC0 1.0
(https://polyhaven.com/license). The file was fetched through the public API
(`https://api.polyhaven.com/files/<slug>`), which returned the
`dl.polyhaven.org` URL below; authorship comes from
`https://api.polyhaven.com/info/<slug>`.

| File | Asset | Author | Source page | License | Verified | SHA-256 |
| --- | --- | --- | --- | --- | --- | --- |
| `public/env/abandoned_greenhouse_1k.hdr` | Abandoned Greenhouse (HDRI, 1k) | Andreas Mischok | https://polyhaven.com/a/abandoned_greenhouse | CC0 1.0 | 2026-09-14 | `d6c3d214ecbb76a1e132bc9b5afe7d1c98fdb5f106ff598077f23bd3e566b466` |

Download URL:
`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/abandoned_greenhouse_1k.hdr`.

Usage: the HDRI is loaded with `RGBELoader` and used only as
`scene.environment` (image-based lighting / reflections). The scene
background is a flat neutral color. If the file fails to load the renderer
falls back to the analytic lights and flat materials.

## Excluded

Models that were only available under CC-BY or unclear terms were
excluded. Sketchfab and Smithsonian 3D were not used because their per-asset
license pages could not be verified from this environment.
