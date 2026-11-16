# Tower Defence V

A tower defence game that runs as a plain web page and as a native desktop app (Tauri v2).

## Run on the web

No build step — open `index.html` directly, or serve the folder:

```
npx serve .
```

## Desktop app (Tauri)

Prerequisites: [Rust](https://rustup.rs/) (MSVC toolchain on Windows) and Node.js.

```
npm install          # once, installs the Tauri CLI + esbuild
npm run dev          # dev app with hot window (compiles Rust, opens the game)
npm run build        # release build + installers (NSIS/MSI on Windows)
npm run build:exe    # release build, standalone exe only, no installers
```

Or double-click `build-installer.bat` — same as `npm run build`.

Every release build minifies the game first (`scripts/sync-dist.js --minify`),
so the code embedded in the exe is compressed and unreadable — your readable
source only ever lives in this folder. Dev builds (`npm run dev`) stay
unminified so you can debug them. The setup installer installs a single exe
per-user (no admin needed), adds Start Menu shortcuts and an uninstaller,
and never copies the source anywhere.

Artifacts:
- `src-tauri/target/release/tdv.exe` — standalone game exe
- `src-tauri/target/release/bundle/nsis/Tower Defence V_*_x64-setup.exe` — installer
- `src-tauri/target/release/bundle/msi/Tower Defence V_*_x64_en-US.msi` — MSI installer

Bump `version` in `src-tauri/tauri.conf.json` (and `package.json`) before
building a release so installer filenames and upgrade detection stay correct.

## How the pieces fit

- `index.html`, `js/`, `css/` — the game itself. This is the source of truth;
  the web version runs straight from it.
- `scripts/sync-dist.js` — copies the game into `dist/` before each Tauri
  dev/build; `dist/` is what Tauri embeds in the executable.
- `src-tauri/` — the native shell (Rust crate, window config, capabilities, icons).
- `src-tauri/icons/icon-source.svg` — the app icon source. After editing it,
  regenerate the icon set with `npx tauri icon src-tauri/icons/icon-source.svg`.

## Dev suite (Map Creator + Tower Creator)

Two standalone tools, never shipped in releases:

```
dev-editor.bat          (or: npm run editor)
```

- **Map Creator** — `http://localhost:8321/tools/map-creator.html`
  Paint water/hills/mountains/peaks, draw the enemy path waypoint by waypoint,
  place the base, give any tile a custom colour, recolour the whole map palette,
  and add a custom ground texture. Exports a `CUSTOM_MAPS` code block.
- **Tower Creator** — `http://localhost:8321/tools/tower-creator.html`
  Design towers (all stats, behaviours, both upgrade lanes, 24×24 pixel-art body
  and rotating turret, optional stone legs), enemies (stats, shields, stealth,
  bosses, behaviours, pixel art) and a custom mode with its wave list.
  Exports `CUSTOM_TOWERS` / `CUSTOM_ENEMIES` / mode + waves code blocks.

**The flow:** design → **EXPORT GAME CODE** → copy → paste into the marked
**PASTE ZONE** in `js/map.js` (maps) or `js/config.js` (towers/enemies/waves) →
launch the game. Pasted content becomes part of the game itself: maps appear in
the map select screen next to TEST PLACE, towers appear in the shop, custom
modes appear in the mode menu — in dev AND release builds. Test Place is never
replaced. Each tool autosaves locally and has project save/load for backups.

Release builds minify everything and strip the admin panel; anything you pasted
into the paste zones ships as part of the game, exactly like hand-written code.

## Updates (auto-updater)

Players never reinstall: the game checks an update endpoint on launch, shows an
**UPDATE** button on the main menu, downloads, verifies a cryptographic signature,
installs and restarts. Player data is never touched (settings/progress live outside
the install folder; cloud saves self-migrate between save versions).

To ship an update:

1. One-time setup — choose a free update host. The GitHub Releases pattern works:
   create a repo, then set the URL in **both** places:
   - `scripts/release.js` → `UPDATE_BASE` (currently `https://github.com/YOUR-USER/YOUR-REPO/...`)
   - `src-tauri/tauri.conf.json` → `plugins.updater.endpoints`
2. `npm run release` — bumps the version, builds the stripped installer, signs it
   with `src-tauri/keys/tdv.key`, and writes `updates/latest.json` + the setup exe.
3. Upload **both** files from `updates/` to your host (e.g. attach to a GitHub
   release tagged with the version).

**Keep `src-tauri/keys/tdv.key` private and back it up** — losing it means players
can't auto-update (they'd reinstall manually instead). It's gitignored.

## Cloud saves

The game saves locally (localStorage) and to a Cloudflare Worker
(`tdv-cloud-save.adamdalisanskas.workers.dev`). The desktop app's CSP in
`src-tauri/tauri.conf.json` allowlists that one domain — if the worker URL ever
changes, update `connect-src` there and `CLOUD_URL` in `js/save.js`.
