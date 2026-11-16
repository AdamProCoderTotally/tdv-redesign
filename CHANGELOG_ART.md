# ART V2 — full pass changelog

Presentation only. `js/config.js` is byte-identical to source (verified with `cmp`), so no gameplay stats changed.
Toggle: `var ART_V2=true` in `js/terrain.js`. Set it to `false` and the old art and old UI skin come back (verified headless).
Mockups: `mockups/v2/` (raw cells in `mockups/v2/raw/`). Phase-1 mockups are still in `mockups/`.

## Towers
- New sprites (44x62, ~22 px soldier) for every type, tier and lane:
  - Ranger, Grenadier and Sniper, including the Anti-Tank lane (pro scope, then stabiliser, then BFG-50 muzzle brake, then ember rounds).
  - Phaser, Viper (both lanes; the second gun at T4+ has its own muzzle point), and Voidtraitor (aura, cape, crown, giant blade; slash frame).
- Prestige Gold Ranger and Gold Grenadier: gold re-ramp plus hand-placed gold trim on the helmet rim and weapon. No more flat tint.
- Farm (T0–T5: crops, fruit trees, barn, sacks, windmill, GMO dome) and Village (both lanes: crates, flag, sandbags, lookout and walls / path, lamps, stalls, coin sign, bunting). Both are 64x72 with idle animation.
- Muzzle flashes per type: fire for most, blue for Phaser, toxic for Viper. Voidtraitor has no muzzle; it uses its slash frame.
- Projectiles and beams start at each sprite's own muzzle point.
- Tier pips use each lane's colour.
- Custom (Tower Creator) towers keep their own sprite and now sit on a pixel plinth with a shadow.

## Enemies and bosses
- All 27 normal enemy kinds and all 20 bosses redrawn. Each has a 4-frame front walk, a 4-frame **back walk** (used when walking up-screen, picked from path direction), mirroring for left, and a hit flash.
- Sizes are measured against the old game (`tools/art-src/enemy-size.js`).
  - **Bosses:** generated at a larger rig scale and drawn at 2x, so every boss is at least as tall as before (about 5–10% taller, often wider). Each has a distinct silhouette: crowns, wings, capes, tanks, drill, ghost, glitch.
  - **Large normal enemies** (brute types, molten/obsidian types, royal guard, faceless guardian, necromancer, blood soldier, lurker, tunneller, crawling obsidian): match their old height.
  - **Regular enemies:** keep the size approved in phase 1.
- HP bars follow the new sprite height. The boss-bar icon is a crop of the new boss sprite.
- Kill effects:
  - Normal kills get a puff themed by family (ecto, blood, void, ember, dust).
  - Bosses get a large death blast (flash, shockwave ring, fireball and debris, smoke column), with a violet version for void bosses.

## Maps
- **Ashlands (map 2, `m2`):** a new biome.
  - Ash ground with ember cracks, a lava sea and lava seams (lava follows the water rules, so it can't be built on), burnt trees and pines, charred stumps, obsidian, ember vents, bones and ruined walls/pillars.
  - The data lives in `js/ashlands.js` in Map Creator format plus `biome:'ash'`. `config.js` is not touched; the file fills in the empty `m2` entry at load and sets `unlock:true`.
  - ⚠️ **The layout is NEW and has NOT been balance tested.** Path length matches Grasslands (71.1 path units, 10 corners). The lava, mesas and base position are also new.
- **Grasslands:** the layout is unchanged. Crates and barrels now appear only off the build grid at the map edge next to the road, never in build space. The same rule applies to Ashlands ruins.

## UI
- New `css/art-ui.css`, scoped to `body.artv2`:
  - Pixel stepped borders with notched corners, a 2px bevel and hard drop shadows.
  - Art-palette colours (violet-black ink, parchment text, ember for actions, gold for money).
  - Square pixel coin.
  - Restyled HUD, speed buttons, tower dock, boss bar, side/info panels, upgrade rows, toasts and scrollbars.
  - Silkscreen font kept. Canvases use nearest-neighbour scaling.
- Tower dock and shop icons use the new tower sprites at whole-number scale. The boss icon uses the new boss sprite.

## Tools
- **Tower Creator:** new "Body canvas" option with 24x24 (classic, default, still drawn at 1.3x), 32x32, 44x62 (ART V2 soldier) and 64x72 (ART V2 building).
  - Larger canvases export `scale:1`.
  - Resizing keeps the drawing anchored bottom-centre.
  - Old 24x24 towers load and export unchanged (tested headless).
- **Art generator** (`tools/art-src/`): `node tools/art-src/build-art.js` regenerates `js/artpack.js`.
  - Rows are run-length encoded (~1.3 MB) and expanded by `js/art.js` at load.
  - Generators are split by subject: towers, buildings, enemies + rig, fx, deco, ash, enemy-size. This keeps a later move to PNG atlases a one-file change in `build-art.js`.

## Files touched in the game
- **New:** `js/art.js`, `js/artpack.js` (generated), `js/terrain.js`, `js/ashlands.js`, `css/art-ui.css`.
- **Small additive hooks, original line endings kept:** `index.html`, `js/map.js`, `js/visuals.js`, `js/sprites.js`, `js/particles.js`, `js/entities.js`, `js/ui.js`, `js/main.js` (lava backdrop colour), `tools/tower-creator.js`.

## Verification
- Headless Chrome on the live `index.html`: Grasslands and Ashlands, with ART_V2 on and off. Every tower type at T0/A5/B5, every enemy and all 20 bosses spawned, then a mass kill.
- No new console errors. The only errors are the same two seen in the source build: `updates/latest.json` 404 and a localhost:8322 connection refused.

## Open / needs Adamas
- Balance-test Ashlands. Confirm it should be unlocked by default (`unlock:true` is set in `js/ashlands.js`; one line to change).
- Bosses are drawn at 2x (chunkier pixels than the rest) to stay imposing. Say if you would rather have them at 1x at the same size, which would need much bigger hand-tuned sprites.
- With ART_V2 off, Ashlands still uses its ash/lava colours but the old green trees and rocks (the biome scenery is ART V2 only).
- The repo's own `scripts/test-*.cjs` could not be run here: they need `cloud/worker.js` (not in the copy) and Edge.
