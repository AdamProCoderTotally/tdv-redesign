// Sync the game's static files into dist/ — the folder Tauri embeds at build time.
// The web build needs no step; open index.html directly or serve the project root.
//
// Modes:
//   node scripts/sync-dist.js           release: minifies JS/CSS. admin.js is
//                                       KEPT — it is gated at runtime by the
//                                       staff roles in cloud/worker.js (see the
//                                       header of js/admin.js)
//   node scripts/sync-dist.js --dev     dev: copies everything, readable
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const DEV = process.argv.includes('--dev');
const minify = !DEV; // release builds always minify
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
fs.cpSync(path.join(root, 'css'), path.join(dist, 'css'), { recursive: true });
fs.cpSync(path.join(root, 'js'), path.join(dist, 'js'), { recursive: true });

// NOTE: js/admin.js used to be deleted here. It ships now — the bar refuses
// to open without a staff role (ADMIN.canUse()), so there is nothing to strip.
// The [ADMIN HOOK] guards in input.js / entities.js / main.js stay in place.

// ---- minify (release) ----
if (minify) {
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  let jsBytes = 0, cssBytes = 0;
  for (const file of walk(dist)) {
    const ext = path.extname(file);
    if (ext === '.js') {
      const out = esbuild.transformSync(fs.readFileSync(file, 'utf8'), { minify: true }).code;
      jsBytes += out.length;
      fs.writeFileSync(file, out);
    } else if (ext === '.css') {
      const out = esbuild.transformSync(fs.readFileSync(file, 'utf8'), { loader: 'css', minify: true }).code;
      cssBytes += out.length;
      fs.writeFileSync(file, out);
    }
  }
  const kb = n => (n / 1024).toFixed(1) + ' KB';
  console.log('dist/ synced (RELEASE, minified): js ' + kb(jsBytes) + ', css ' + kb(cssBytes));
} else {
  console.log('dist/ synced (DEV, readable)');
}
