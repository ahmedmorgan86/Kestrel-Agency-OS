# MORGAN GROUP asset register

## 3D human models currently used by the virtual headquarters

The 3D scene loads four rigged GLB models from `public/assets/avatars/`. The adjacent `public/assets/avatars/LICENSE.md` identifies the pinned Tevy v1 model releases as CC0 1.0 and documents a 56-bone humanoid rig with idle, walk, wave, and look-around clips.

| File | Identified source | License recorded in repository | Use and limitation |
| --- | --- | --- | --- |
| `casual-walker.glb` | [Tevy Casual Walker](https://tevy.dev/models/casual-walker) | CC0 1.0, as recorded in the adjacent license note | Rigged character and included animation clips; reused across the roster |
| `dog-walker.glb` | [Tevy Dog Walker](https://tevy.dev/models/dog-walker) | CC0 1.0, as recorded in the adjacent license note | Rigged character and included animation clips; reused across the roster |
| `hiker.glb` | [Tevy Hiker](https://tevy.dev/models/hiker) | CC0 1.0, as recorded in the adjacent license note | Rigged character and included animation clips; reused across the roster |
| `road-worker.glb` | [Tevy Road Worker](https://tevy.dev/models/road-worker) | CC0 1.0, as recorded in the adjacent license note | Rigged character and included animation clips; reused across the roster |

These are stylized, low-detail virtual models, not photorealistic human scans. The current application reuses four source meshes among 30 fictional employees. The Arabic appearance descriptions in employee profiles are descriptive data and are not currently used to generate individual faces, bodies, or outfits. A seated pose is applied to the rig in code; it is not a separately sourced sitting animation.

## Other files in the avatar folder

`human-01.png` through `human-12.png` are not loaded by the 3D headquarters. Their source and license are not recorded, so do not add them to production use until provenance is verified.

## Verification note

This register reports the provenance recorded in the repository; it does not independently verify the upstream downloads or any later changes to the vendor pages. Recheck the source release and CC0 notice before replacing or redistributing these files.
