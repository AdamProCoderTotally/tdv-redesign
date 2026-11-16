# Tower Defence V: Art Redesign Plan ("ART V2")

Status: **art plan + working mockups.** Everything below marked *rendered* was drawn by the game's own
code (headless Chrome, `index.html` / game scripts) and saved under `mockups/`. Gameplay is untouched:
`js/config.js` is byte-identical to the source, the path and grid data are identical, and every code
change is a cosmetic draw hook that falls back to the old art when ART V2 has no sprite for something.

---

## 1. Audit of the current art

| Area | What's there now |
|---|---|
| Format | No bitmap assets. Built-in towers, enemies, decos and projectiles are **procedural `fillRect` art** in `js/visuals.js` (`drawFieldTower`, `drawFieldWeapon`, `drawFieldEnemy`, `drawFieldDeco`, `drawFieldProjectile`, `drawFieldLandmark`), with bosses and extras in `js/sprites.js` (1,397 lines, ~600 distinct hex colours). Custom towers/enemies from the Tower Creator use the palette-row sprite format `{w,h,pal:[hex…],rows:['0a.'…]}` drawn by `drawSpriteRows` (base-36 indices, so ≤36 colours per sprite, 24×24 in the tool). |
| Towers | 10 types in `TOWERS`: `ranger`, `grenadier`, `phaser`, `farm`, `village`, `sniper`, `viper`, `voidtraitor` (admin), prestige `goldranger`, `goldgrenadier`. **All soldier towers share one body template**, recoloured; the weapon is a rotated rect group. Tiers 0–5 and both lanes differ only by small pips/colour changes. About 26×40 px, no outlines. |
| Enemies | 28 in `ENEMIES` + 20 bosses (`BIGS`). Normal enemies use **one generic visor-humanoid template** keyed by regex on `kind`, varied by palette and size. The walk is a small bob with no real frames. Low contrast against the grass. |
| Map | `MAPS`: `test` "Grasslands" (playable) and `m2` (locked, empty), plus `CUSTOM_MAPS` from the Map Creator. 26×26 iso grid (TW 64, TH 32), pre-rendered to a 2560×1324 `terrain` canvas; ~686 decos (tree/rock/bush/flower/tuft). Flat green tiles with a grid look, uniform pines, lots of identical grey rocks, flat water/ocean, no props or cliffs worth noticing. |
| Effects | `burst` (square dots), `smoke`, `ringFX` ellipse, floating text. No muzzle flash sprite, hit spark or death animation; a projectile is a rotated rect. |
| UI | `style.css` "EMBER WATCH": graphite slate panels, ember `#ff7a33`, gold `#ffc247`, Silkscreen font. This is already solid. |
| **Bug found** | The old terrain painter draws each tile diamond **32 px right of its gameplay cell** (`PADX+isoX(x,y)+TW/2` vs `worldToMap(x+.5,y+.5)`; e.g. tile (15,20) drawn at x=1152, cell centre 1120). Water/ponds therefore look half a tile off the cells that really block building. The ART V2 painter aligns to `worldToMap`. You can see the difference in `before_after_fullmap.png` and `before_after_ingame.png`. |

**Main weaknesses:** same silhouette for every tower and tier, no outlines (units melt into the grass), enemies hard to tell apart, a "programmer-art" flat map, and effects that barely register.

## 2. Style direction

TDX readability in crisp 2D isometric pixel art:
- **Silhouette first.** Every tower type gets its own pose and weapon (standing rifleman, wide-stance grenadier with drum launcher, kneeling ghillie sniper). The base plate changes at T2 and T4 (dirt pallet → sandbag ring → steel deck with hazard stripes and a lane banner), so you can read the tier from across the map.
- **1 px dark outline** (`#1b1526`, a warm violet-black, never pure black) around each part separately for a cel look. Light from the upper-left.
- **Hue-shifted ramps.** Shadows lean violet/blue and highlights lean warm yellow; 5–7 steps per material.
- **Lane colour language.** Each lane has its own accent on the banner, stripes and pips. Ranger: MG = ember, Juggernaught = blue. Grenadier: Shrapnel = blue, Incendiary = ember. Sniper: Futuristic = red, Anti-Tank = ember.
- **Motion.** Each tower has 2 idle frames (breathing bob) and a fire frame (recoil + shell casing + muzzle flash at the sprite's `tip`). Enemies have a 4-frame walk at 7 fps and flash as a white silhouette when hit.
- **Juice.** Sprite effects for muzzle, hit spark, explosion (flash → fireball → smoke ring) and death puff, plus brighter projectiles with a glow.
- **Ground stays calm.** Low-contrast grass with a faint build-grid checker, so units and the path pop. Saturation goes on units and FX, not on terrain.

## 3. Palette (master ramps, dark → light)

```
ink      #1b1526 (outline)
olive    #1e2a1f #2f4429 #486336 #6c8a45 #9db45e #cfd88a      (Ranger)
khaki    #3a2a22 #5c4430 #86663f #b08d55 #d8b878 #f0dca0
skin     #4a2a2a #7a4434 #b06a48 #dc9a6a #f4c69a
steel    #1f2233 #33384d #4f5670 #77819a #a9b4c6 #e0e8f0      (T4-5 armour, decks)
gun      #16151f #26283a #3b3f55 #5a6178 #8790a8
wood     #2e1a16 #4e2e1e #7a4a2a #a46a3a #c8925a
red      #3a0f1e #6e1a28 #a8282c #de4a32 #ff8a4a #ffc89a
fire     #7a2410 #c2410c #ff7a33 #ffb347 #ffe28a #fffbe0      (= UI ember)
gold     #4a2a10 #8a5a18 #c98e26 #f2c14a #ffe68a #fffbd6      (prestige, = UI gold)
blue     #141c4a #1e3a8a #2f6ad8 #4aa8ff #a8e4ff #f0ffff      (Juggernaught, lasers)
teal     #0e2630 #14394a #1d5866 #2a8088 #4cb0a8 #9ae0c8
void     #1a0f2e #341a5c #5a2e94 #8a50d0 #c08aff #eed8ff      (voidmare, Void Traitor, corrupt)
toxic    #132a14 #1f5020 #3a8a2a #78d040 #c4f06a #f0ffc0      (VIPER venom, ecto death)
zskin    #1f2b2a #33463e #4f6a56 #759070 #a8bd8e #d8e2b8      (walkers)
zcloth   #1e2433 #2f3a50 #46556e #66788f #94a5b6 #c8d4de
orange   #3e1a10 #7a3414 #c0601c #ec9234 #ffc860 #fff0b0      (sprinters)
leather  #2a1a18 #4a2c24 #6e4636 #96644a #c4906a #e8bc8c
flesh    #2a0a14 #5a1220 #8e2030 #c43a40 #ec7a6a #ffb8a0      (blood enemies)
bone     #3e3640 #5a4e48 #8a7e6e #b8ae96 #e2dcc4 #fffbea
grass    #1d3a26 #2a5430 #3d7a36 #5b9e3e #86c04c #b8de6a
dirt     #2e1c1a #4a2e24 #6e4630 #946440 #b88a52 #d8b070
stone    #22202e #383648 #55546a #7a7a8e #a4a6b6 #d4d6de
sand     #6a5034 #9a7a4c #c4a468 #e2c88a #f4e2b0
```
Terrain base colours (`DEFAULT_MAP_COLORS` in the copy): ocean `#1d5068`, water `#2b7c8c`, sand `#d6bc7c`, forest `#336a35`,
grass `#4f9a3e`, plateau `#5aa444`, cliff `#7a5a48`, road `#a87c4c`, base plaza `#8c8a80`. `rampFrom(hex)` in
`terrain.js` builds a 7-step hue-shifted ramp from any single colour, so Map Creator colour overrides
and custom maps get the same shading.

## 4. Towers (ids from `config.js`)

Authored size 44×62 canvas, anchor at the feet (22,50); tier bases: T0–1 dirt+pallet, T2–3 sandbags, T4–5 steel deck + lane banner.

| id | Redesign | Done in mockup? |
|---|---|---|
| `ranger` | Olive rifleman, M1-style helmet, carbine. **Lane 0 Machine Gunner:** goggles + bandolier at T3, belt-fed MG with ammo box from T3, glowing hot barrel at T5. **Lane 1 Juggernaught:** radio antenna T2, steel chest + big pauldrons T3, full power armour + heavy blue-lit rifle T5. | All 11 tier/lane sprites ✅ rendered |
| `grenadier` | Leather/steel, wide stance, visor helmet, drum grenade launcher, chest plate. **Lane 1 Incendiary:** red/fire armour from T3, gas mask + napalm tank T5, orange-banded drum. **Lane 0 Shrapnel:** steel/blue accents (same body, blue banner). | All 11 ✅ |
| `sniper` | Kneeling, ghillie hood + cape, long scoped rifle. **Lane 0 Futuristic:** dark suit, steel visor with red eye-slit, energy rifle from T3. **Lane 1 Anti-Tank:** *(planned)* bigger bolt rifle with muzzle brake, bipod, ember accents. | 11 ✅ (Anti-Tank uses the base look for now) |
| `phaser` | *Planned:* tech tripod/emitter with a crystal lens, teal/blue charge-up glow frames, beam sprite strip. | – |
| `farm` | *Planned:* small field plot with crop rows growing per tier, a scarecrow, then a barn at T4–5; coin-pop effect on income. | – |
| `village` | *Planned:* tent → cabin → watchtower with a flag; aura ring sprite in the lane colour. | – |
| `viper` | *Planned:* compact twin-barrel turret on a tripod. Venom Payload: toxic-green canisters + drip. Twin Barrels: second barrel appears (matches `guns:2`). Directional, like the current one. | – |
| `voidtraitor` | *Planned:* hooded void figure using the `void` ramp, with floating shards. | – |
| `goldranger` / `goldgrenadier` | The ranger/grenadier sprites with a gold tint (`ART_GOLD` in art.js). A hand-painted gold variant is better (see questions). | code path exists (`ART_GOLD`), **not rendered yet** |

## 5. Enemies (ids from `config.js`)

Layered parts, each outlined; 4-frame walk; white-silhouette hit flash; void tint when Corrupt-held.

| id(s) | Redesign |
|---|---|
| `walker`, `fakewalker` (kind walker) | ✅ Hunched zombie in torn slate fatigues, arms forward, sickly green skin, yellow eyes. |
| `sprinter` | ✅ Lean runner in an orange hoodie, spiky hair, leaning forward, speed-streak pixels. |
| `brute` | ✅ Big mauve-grey hide, harness, spiked pauldron, tusks, huge fists. |
| `rwalker` `rsprinter` `rbrute` | Same rigs + a palette swap (bone/grey skin, glowing teal eyes, stitched wounds). |
| `molten`, `mmolten` | Magma golem: obsidian crust over the `fire` ramp, cracks lit by an animated glow frame; the Mega version is bigger with a lava drip. |
| `obsidian`, `mobsidian`, `crawling_obsidian` | Faceted black-glass golem (stone + void highlights); the crawler goes on all fours. |
| `blitz` | Tiny goblin-runner with long ears and an afterimage trail. |
| `tunneller` | Mole-miner with a helmet lamp; "dirt mound" frame while underground. |
| `nightstalker`, `wraithling`, `whisper`, `cloaker` | Shadow family: void ramp, 50% dither-transparent body, single bright eye; the cloaker uses a shimmering outline only while cloaked. |
| `lurker` | Low tendrilled crawler. |
| `faceless_guardian` | Tall armoured figure with a blank faceplate and a tower shield. |
| `blood_clot`, `blood_soldier`, `splitter`, `damned`, `demonic_spirit` | Flesh ramp: a blob with a pulse frame, an armoured flesh soldier, a split-blob (two halves visible), a chained ghoul, a horned flame spirit. |
| `necromancer`, `healer` | Robed casters: necromancer with a skull staff and toxic glow; healer in white/teal with a cross staff. Both get a cast frame. |
| `royal_guard` (kind royalguard) | Steel+gold plate, halberd, red plume. |
| Bosses (`tank`, `rtank`, `fbrute`, `crawler`, `rmmolten`, `oknight`, `mking`, `wfbrute`, `oking`, `endbringer`, `silent_exec`, `stealth_tunneller`, `faceless`, `fallen_oking`, `the_unseen`, `necro_monarch`, `deformed_king`, `endbringer_guardian`, `error_void_leak`, `the_misplaced`) | Same pipeline at 64–96 px with 6-frame walks and a phase-change frame. These stay on old art until authored, because the hook falls through. |

## 6. Maps (art only, same path and grid)

**Grasslands (`test`)**: ✅ rendered.
- Per-pixel terrain painter (`js/terrain.js`) is fed the **same** `grid`, `PATH`/`dirtShape` ribbon and elevation data.
- **Road:** a sunken dirt track with a shaded upper bank, lit lower bank, cart ruts, pebbles, and grass nibbling the edge.
- **Bridges:** plank decks with hand rails where the path crosses water.
- **Grass:** calm broad patches, clustered tufts, rare flower clusters, and a faint build-grid checker (TDX-style placement readability with no grid lines).
- **Plateau:** elevated tiles with real cliff faces (strata) and rim light only on drops.
- **Water and shore:** rivers/pond with foam near land, ocean with soft swells, and a wet-sand band at the shoreline.
- **Base plaza:** stone bricks.
- **Decos:** bigger multi-tier outlined pines, round broadleaf trees, bushes and mossy rocks. In-grid rock decos are thinned into pebbles/bushes/flowers so the play area isn't a rock field. Decos stay cosmetic, as now (towers still remove them).

**`m2` (locked, empty):** a different biome is suggested so maps feel distinct, e.g. **Ashlands** (charred dirt, lava cracks next to the path, dead trees, obsidian rocks) via colour overrides + deco set. That needs a path from Adamas first.

**Custom maps:** colours/overrides from the Map Creator go through `rampFrom`, so any custom colour gets the same hue-shifted look automatically.

## 7. Effects plan

Sprite FX are added *alongside* the existing particle calls (`js/particles.js` `fxSprite()` → a `'spr'` particle):

| Event | Call site | Sprite |
|---|---|---|
| Enemy death | `entities.js` death burst (~l.134) | `deathpuff` 5f: green ecto pop + skull wisp ✅ |
| Grenade blast | `explodeGrenade` (~l.682) | `explosion` 6f: white star flash → fireball → smoke + fire → smoke ring → puffs ✅ |
| Bullet hit | projectile hit (~l.1022) | `spark` 4f ✅ |
| Tower fire | `drawArtTower` (fire frame while `flashT>0`) | `muzzle` 3f at the sprite tip + recoil + shell casing ✅ |
| Projectiles | `drawFieldProjectile` hook | tapered tracers (bullet / laser / plasma) with glow; outlined grenade with a fizzing fuse ✅ |
| *Planned* | burn patches, venom pools, phaser beam, slow/stun icons, boss phase flash, gold "+$" coin pop, tower placement dust ring | – |

## 8. UI / CSS look

EMBER WATCH already fits. Planned (not yet done, CSS only):
- Tower bar icons rendered from the new sprites (idle frame 0 at 2×) instead of the old body. They are still old in the live screenshot.
- Pixel 9-slice panel borders: 2 px ink outer, 1 px lit inner bevel; ember top rule kept.
- Tier pips match the in-world lane-coloured chevrons.
- Upgrade cards show the next-tier sprite preview with the lane colour.
- Boss bar gets a pixel portrait.
- `image-rendering: pixelated` on all sprite canvases.
- No font change: Silkscreen stays.

## 9. Implementation approach

**Files changed in `/workspace/tdv/redesign`** (source untouched; original CRLF/LF line endings preserved):

| File | Change |
|---|---|
| `index.html` | + `js/terrain.js` (before `map.js`), + `js/artpack.js` and `js/art.js` (after `sprites.js`). |
| `js/map.js` | `renderTerrainInto` early-returns into `paintPixelTerrain` when `ART_V2`; `DEFAULT_MAP_COLORS` retuned (9 values). |
| `js/visuals.js` | 5 one-line hooks (tower, deco, enemy, projectile, `enemyArt` size for health-bar placement). |
| `js/sprites.js` | Skip the white hit-flash box for ART V2 enemies (they flash as a silhouette). |
| `js/particles.js` | `fxSprite()` + `'spr'` particle draw. |
| `js/entities.js` | 3 additive `fxSprite(...)` lines next to the existing `burst` calls. No logic touched. |
| **new** `js/terrain.js` | `ART_V2` toggle, `rampFrom`, per-pixel terrain painter (~0.5 s bake once per map load, same as the current pre-render). |
| **new** `js/art.js` | Runtime: frame selection, facing via `cos(aim)` + flip, idle/fire frames, muzzle at sprite `tip`, lane pips, prestige gold tint, deco mapping, projectile sprites. |
| **new** `js/artpack.js` | **Generated** `var ART={towers,enemies,fx,deco}` in the game's own `{w,h,pal,rows}` format plus `frames`, `ax/ay` anchor and `tip` (452 KB for now; 33 tower sprites × 3 frames, 3 enemies, 7 FX, 17 decos). |
| **new** `tools/art-src/` | Dev-only Node generator (`pix.js` ramps/primitives, `towers.js`, `enemies.js`, `fx.js`, `deco.js`, `build-art.js`). `node tools/art-src/build-art.js` regenerates the artpack. It is not loaded by the game. |
| `mockups/` | The PNGs below + `raw/` cells. |

**Compatibility:**
- Set `ART_V2=false` (top of `terrain.js`) and the game is visually the old build again. That makes A/B testing trivial.
- Anything without an ART V2 sprite (phaser, farm, village, viper, other enemies, bosses, custom towers/enemies) falls through to the existing draw code, so the art can ship incrementally.
- `config.js` is untouched: no stats, costs, ranges, paths or waves changed.
- **Tower Creator** sprites keep priority (the custom-sprite check runs before the ART V2 hook), and the format is the same one the tool emits. However, the tool's editor is fixed at 24×24 while ART V2 towers are 44×62. Opening ART V2 sprites in it would need a canvas-size option (small change in `tools/tower-creator.js`, not done).
- **Map Creator** is standalone (doesn't load game JS) and is unaffected; its colour overrides are honoured by the new painter.
- Headless check: both builds load `index.html` with no page errors. The only console errors (a 404 and a refused connection to the cloud server) are identical in source and redesign.

## 10. Mockups (all rendered by game code)

| File | Content |
|---|---|
| `mockups/before_after_towers.png` | Ranger T0 / T3 Machine Gunner / T5 Juggernaught, Grenadier T0 / T5 Incendiary, Sniper T0 / T5 Futuristic; idle + firing; 3× nearest |
| `mockups/before_after_enemies.png` | walker, sprinter, brute; 4 walk phases + hit flash; 3× |
| `mockups/before_after_effects.png` | grenade blast, bullet hit, enemy death at 20–450 ms + projectiles; 3× |
| `mockups/before_after_map.png` | Grasslands section with path, bridge, river, plateau edge, decos; 2× |
| `mockups/before_after_scene.png` | same section with towers, enemies, projectiles and FX via `drawTower`/`drawEnemy`/`drawParts`; 2× |
| `mockups/before_after_ingame.png` | **Live `index.html`** screenshots (real loop, HUD, Easy mode, same placements and spawns, zoom 2). Upgrade levels were set directly on the tower objects for display, and the sign-in overlay was hidden for the screenshot |
| `mockups/before_after_fullmap.png` | whole Grasslands terrain bake, 1× |

Render harness (outside the game copy): `/workspace/tdv/tooling/` (`mockups.js`, `ingame.js`, `compose.py`, `scenes.js`).

## 11. Open questions for Adamas

1. **Unit scale.** ART V2 soldiers are slightly smaller than the current ones (roughly 22 vs 30 px tall), which gives cleaner readability and room for FX. Should they stay this size, or should the next pass author at about 1.3× for a chunkier TDX feel?
2. **Terrain alignment bug.** The old painter draws tiles half a tile off their gameplay cells; ART V2 fixes it. Do you want the fix (water then sits exactly where building is blocked)?
3. **Directions.** Towers and enemies currently have a front (SE) view + mirror. Should back-facing (NE/NW) frames be added for enemies walking "up" the screen? That doubles the enemy frame count.
4. **Prestige gold.** Is a tinted gold variant enough, or should the gold towers get hand-painted trim?
5. **Props.** Should the play area get military props (crates, barrels, sandbag piles)? Supported, but removed for now because they cluttered the build space.
6. **Artpack size.** The artpack is 452 KB as plain JS. That's fine for Tauri, but should it go to PNG sprite sheets once all towers and bosses are in (likely 2–3 MB as text)?
7. **Tower Creator.** Add a canvas-size option so ART V2 sprites can be edited in it?
8. **m2.** What biome and path should the second map have?
