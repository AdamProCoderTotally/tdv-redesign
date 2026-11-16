// TDV release pipeline — one command prepares a signed update.
//
//   node scripts/release.js                stable: build current version, sign, emit updates/latest.json
//   node scripts/release.js --bump         stable: bump the patch first (0.2.11 -> 0.2.12)
//   node scripts/release.js --pre-release  pre-release: 0.2.11 -> 0.2.12-1 (then -2, -3 …)
//                                          emits updates/prerelease.json
//
// The channel is baked into THREE places, so a build knows what it is:
//   js/channel.js            TDV_VERSION + TDV_CHANNEL  (what the game shows/checks)
//   src-tauri/tauri.conf.json  version + updater endpoint (what the desktop updater hits)
//   package.json / Cargo.toml  version
//
// Output: src-tauri/target/release/bundle/nsis/*-setup.exe (+ .sig)
//         updates/latest.json      <- stable channel
//         updates/prerelease.json  <- pre-release channel
//         Upload BOTH the setup exe and the manifest to your update host.
//
// Update host layout (GitHub Releases works for free):
//   stable      .../releases/latest/download/<file>   (latest non-prerelease)
//   pre-release .../releases/download/prerelease/<file>  (rolling "prerelease" tag,
//                re-uploaded with --clobber on every pre-release build)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const confPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const keyPath = path.join(root, 'src-tauri', 'keys', 'tdv.key');
const channelPath = path.join(root, 'js', 'channel.js');

// >>> EDIT ME — public download folder for update files <<<
const RELEASES = 'https://github.com/AdamProCoderTotally/tower-defence-v/releases';
const UPDATE_BASE = RELEASES + '/latest/download';          // stable
const PRERELEASE_BASE = RELEASES + '/download/prerelease';  // pre-release

const bump = process.argv.includes('--bump');
const preRelease = process.argv.includes('--pre-release');
const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
let version = conf.version;

// ---- version arithmetic ----
//
// Stable releases own the bare numbers; a pre-release NEVER moves the base, it
// only appends a counter to whatever stable is currently sitting there:
//
//   0.2.11          --pre-release-->  0.2.11-1
//   0.2.11-1        --pre-release-->  0.2.11-2
//   0.2.11-2        --bump-------->   0.2.12
//   0.2.11          --bump-------->   0.2.12
//
// So 0.2.12 is never "spent" until it actually ships, and anyone still on
// stable reads a clean 0.2.11 the whole time.
//
// The suffix is NUMERIC ONLY ("-1", "-2", ...), not "-pre.N": Tauri's MSI
// bundler enforces this --
//   "optional pre-release identifier in app version must be numeric-only
//    and cannot be greater than 65535 for msi target"
//
// NOTE: plain semver ranks 0.2.11-1 BELOW 0.2.11, which would make the whole
// pre-release channel undiscoverable. That is corrected on purpose in
// js/channel.js (tdvNewer) and src-tauri/src/lib.rs (default_version_comparator).
const MAX_PRE = 65535;
function parseVer(v){
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(?:pre\.)?(\d+))?$/.exec(String(v));
  if (!m) return { major: 0, minor: 0, patch: 0, pre: null };
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] === undefined ? null : +m[4] };
}

if (preRelease) {
  const p = parseVer(version);
  const n = p.pre === null ? 1 : p.pre + 1;
  if (n > MAX_PRE) {
    console.error('Pre-release counter is capped at ' + MAX_PRE + ' by the MSI bundler.');
    process.exit(1);
  }
  version = p.major + '.' + p.minor + '.' + p.patch + '-' + n;   // base stays put
} else if (bump) {
  const p = parseVer(version);
  // shipping always advances the base and drops any suffix:
  //   0.2.11-N -> 0.2.12      0.2.11 -> 0.2.12
  version = p.major + '.' + p.minor + '.' + (p.patch + 1);
}

const channel = preRelease ? 'prerelease' : 'stable';
const updateBase = preRelease ? PRERELEASE_BASE : UPDATE_BASE;
const manifestName = preRelease ? 'prerelease.json' : 'latest.json';

// ---- write the version/channel into every place that bakes it ----
conf.version = version;
conf.plugins = conf.plugins || {};
conf.plugins.updater = conf.plugins.updater || {};
conf.plugins.updater.endpoints = [updateBase + '/' + manifestName];
fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');

{
  const pkgPath = path.join(root, 'package.json');
  // index.html is not touched: the menu reads TDV_VERSION from channel.js,
  // so the version the player sees is always the one the build was baked with.
  const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml');
  let cargo = fs.readFileSync(cargoPath, 'utf8');
  cargo = cargo.replace(/^version = ".*"$/m, 'version = "' + version + '"');
  fs.writeFileSync(cargoPath, cargo);

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // channel.js is what the game actually reads at runtime: keep the
  // helper functions, rewrite only the two baked-in values.
  const chan = fs.readFileSync(channelPath, 'utf8');
  const marker = 'window.TDV_CHANNEL=';
  const idx = chan.lastIndexOf(marker);
  let helpers = '';
  if (idx >= 0) {
    const tail = chan.slice(idx);
    const endOfLine = tail.indexOf('\n');
    helpers = endOfLine >= 0 ? tail.slice(endOfLine + 1) : '';
  }
  fs.writeFileSync(channelPath,
    '"use strict";\n' +
    '// ============================================================\n' +
    '//  channel.js — generated by scripts/release.js. Do not edit.\n' +
    '//  baked ' + new Date().toISOString() + '  (' + channel + ')\n' +
    '// ============================================================\n' +
    'window.TDV_VERSION=' + JSON.stringify(version) + ';\n' +
    'window.TDV_CHANNEL=' + JSON.stringify(channel) + ';\n' +
    helpers);
}
console.log('Version ' + version + ' (' + channel + ')');

if (!fs.existsSync(keyPath)) {
  console.error('Missing signing key: ' + keyPath +
    '\nRestore your backup, or regenerate with: npx tauri signer generate -w src-tauri/keys/tdv.key --password "" --ci');
  process.exit(1);
}

// Load the signing key ourselves. The bundler ONLY honours the key *content*
// (TAURI_SIGNING_PRIVATE_KEY_PATH does not reach it), and neither `tauri build`
// nor this script used to set it -- so a release only worked if the key happened
// to already be exported in the shell, which is easy to forget and impossible to
// reproduce. The file is right here in the repo, so read it once and pass the
// content down to the build.
const privateKey = fs.readFileSync(keyPath, 'utf8').trim();

console.log('Building release ' + version + '...');
const build = spawnSync('cmd', ['/c', 'npx', 'tauri', 'build'], {
  stdio: 'inherit', cwd: root,
  env: Object.assign({}, process.env, {
    TAURI_SIGNING_PRIVATE_KEY: privateKey,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ''
  })
});
if (build.status !== 0) process.exit(build.status || 1);

const nsisDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const exeName = 'Tower Defence V_' + version + '_x64-setup.exe';
const exePath = path.join(nsisDir, exeName);
if (!fs.existsSync(exePath)) {
  console.error('Expected installer not found: ' + exePath);
  process.exit(1);
}
// upload-safe name (no spaces) — the manifest URL must match the uploaded asset exactly
const safeName = exeName.replace(/ /g, '.');
const safePath = path.join(nsisDir, safeName);
fs.copyFileSync(exePath, safePath);

// sign the upload-safe copy (updater verifies this signature)
//
// TAURI_SIGNING_PRIVATE_KEY is deleted from the child env on purpose: the CLI
// maps BOTH TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PATH onto
// flags, so leaving the content var set (which `tauri build` above needs, and
// which the bundler does not accept as a path) makes this fail with
// "--private-key cannot be used with --private-key-path".
const signerEnv = Object.assign({}, process.env, {
  TAURI_SIGNING_PRIVATE_KEY_PATH: keyPath,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ''
});
delete signerEnv.TAURI_SIGNING_PRIVATE_KEY;
const sig = spawnSync('cmd', ['/c', 'npx', 'tauri', 'signer', 'sign', safePath], {
  stdio: 'inherit', cwd: root,
  env: signerEnv
});
if (sig.status !== 0) process.exit(sig.status || 1);

const signature = fs.readFileSync(safePath + '.sig', 'utf8').trim();
const manifest = {
  version: version,
  notes: 'Tower Defence V ' + version + (preRelease ? ' (pre-release)' : ''),
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: signature,
      url: updateBase + '/' + safeName
    }
  }
};
fs.mkdirSync(path.join(root, 'updates'), { recursive: true });
fs.writeFileSync(path.join(root, 'updates', manifestName), JSON.stringify(manifest, null, 2));
fs.copyFileSync(safePath, path.join(root, 'updates', safeName));

console.log('\nDone [' + channel + ']. Upload BOTH files from updates/ to your update host:');
console.log('  - ' + safeName);
console.log('  - ' + manifestName);
if (preRelease) {
  console.log('\nPre-release files go on the rolling "prerelease" release tag, e.g.:');
  console.log('  gh release upload prerelease "updates/' + safeName + '" "updates/' + manifestName + '" --clobber');
} else {
  console.log('\nStable files go on the latest GitHub release (or your update host).');
}
console.log('Updater endpoint (tauri.conf.json): ' + updateBase + '/' + manifestName);
console.log('Web manifest (same files): updates/' + manifestName);
