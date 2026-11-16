// Deploys cloud/worker.js to Cloudflare Workers.
//
// Why this exists: the worker is NOT part of the Tauri build. `npm run build`
// bundles the game's HTML/JS into the installer, but multiplayer, cloud saves
// and the STAFF roles all live in a separate Cloudflare deployment. Change
// cloud/worker.js without running this and both clients silently keep talking
// to the OLD worker — which reads as broken multiplayer (no towers, "BASE —",
// no spawn queue) rather than as a version mismatch.
//
// This probes the deployed worker first and prints exactly which features it
// is missing, so a stale deploy is obvious instead of mysterious.
//
// Usage:
//   npm run deploy:worker
//
// One-time setup:
//   npx wrangler login

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKER = 'https://tdv-cloud-save.adamdalisanskas.workers.dev';

// wrangler.toml ships with a placeholder KV id because the namespace id is
// account-specific. Once wrangler is authenticated we can look it up rather
// than asking you to go hunting for it in the dashboard.
const CONFIG = path.join(__dirname, '..', 'wrangler.toml');
const KV_PLACEHOLDER = 'REPLACE_WITH_KV_NAMESPACE_ID';

function listNamespaces() {
  const r = spawnSync('npx', ['wrangler', 'kv', 'namespace', 'list'],
    { encoding: 'utf8', shell: true });
  if (r.status !== 0) return { error: (r.stderr || r.stdout || '').trim() };
  try { return { list: JSON.parse(r.stdout) } } catch (e) {
    return { error: 'could not parse `wrangler kv namespace list` output' };
  }
}

// Fill the placeholder in wrangler.toml with the real namespace id.
function ensureKvId() {
  const toml = fs.readFileSync(CONFIG, 'utf8');
  if (toml.indexOf(KV_PLACEHOLDER) < 0) return true;   // already filled in

  console.log('wrangler.toml has no KV namespace id yet — looking it up...\n');
  const { list, error } = listNamespaces();
  if (error) {
    console.log('  could not list KV namespaces: ' + error);
    console.log('\n  Run `npx wrangler login` first, then re-run this script.');
    return false;
  }
  if (!Array.isArray(list) || !list.length) {
    console.log('  This account has no KV namespace yet. Create one:');
    console.log('\n      npx wrangler kv namespace create KV\n');
    return false;
  }
  // Prefer a namespace that looks like ours; fall back to the only one.
  const pick = list.filter(n => /tdv|cloud|save/i.test(n.title || ''))
    .concat(list.length === 1 ? list : []);
  if (!pick.length) {
    console.log('  More than one KV namespace and none match tdv/cloud/save.');
    console.log('  Put the right id into wrangler.toml (binding = "KV") yourself:\n');
    for (const n of list) console.log('    ' + (n.id || '?') + '   ' + (n.title || '(untitled)'));
    return false;
  }
  const ns = pick[0];
  fs.writeFileSync(CONFIG, toml.replace(KV_PLACEHOLDER, ns.id), 'utf8');
  console.log('  KV id ' + ns.id + '  (' + (ns.title || 'untitled') + ')\n');
  return true;
}

// Probes that only the CURRENT cloud/worker.js answers. A miss means stale.
const PROBES = [
  { field: 'winSecs',    path: 'mp/game',  body: {}, ok: r => r.winSecs != null,
    what: '10-minute survival clock (PVP win condition)' },
  { field: 'baseHp',     path: 'mp/game',  body: {}, ok: r => r.baseHp !== undefined,
    what: 'base HP shown to the invader' },
  { field: 'towers',     path: 'mp/game',  body: {}, ok: r => Array.isArray(r.towers),
    what: "defender's towers synced to the invader" },
  // was silently missing for a while: towers synced, but stripped back to
  // base stats on the invader's screen because `ups` was never round-tripped
  { field: 'ups',        path: 'mp/game',  body: {},
    ok: r => !!(Array.isArray(r.towers) && r.towers[0] && Array.isArray(r.towers[0].ups)
      && r.towers[0].ups[0] === 2 && r.towers[0].ups[1] === 1),
    what: 'upgrade levels preserved on synced towers' },
];

async function post(path, body) {
  const r = await fetch(WORKER + '/api/' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  try { return await r.json(); } catch (e) { return { ok: false, err: 'HTTP ' + r.status }; }
}

// The /api surface is byte-for-byte identical before and after the move to
// Durable Objects, so no feature probe can tell them apart. Ask the worker to
// identify its own architecture via GET /. Without this, `deploy:worker`
// reports "up to date" against a KV-era deployment and exits — silently
// never shipping the Durable Object split.
async function probeBackend() {
  try {
    const r = await fetch(WORKER + '/', { method: 'GET' });
    const j = await r.json();
    return !!(j && j.durable === true);
  } catch (e) { return false; }
}

// ---- pre-flight: how stale is the deployment right now? ----
async function probe() {
  console.log('Probing deployed worker: ' + WORKER + '\n');
  const ts = Date.now().toString(36);
  const a = await post('register', { username: 'zzpA' + ts, password: 'probePass1' });
  const b = await post('register', { username: 'zzpB' + ts, password: 'probePass1' });
  if (!a.ok || !b.ok) {
    console.log('  could not create probe accounts: ' + (a.err || b.err || 'unknown'));
    return false;
  }
  const cr = await post('mp/create', { token: a.token, mode: 'pvp' });
  const code = cr && cr.lobby && cr.lobby.code;
  if (!code) {
    // Everything below is built on a successful create, so there is nothing
    // left to feature-probe. Reporting this as stale rather than throwing on
    // `.lobby.code` is what lets `npm run deploy:worker` run AT ALL against a
    // worker that is failing on multiplayer — which is the exact state we are
    // here to repair (code uploaded, Durable Object migration never applied).
    console.log('  mp/create failed: ' + ((cr && cr.err) || 'no lobby returned'));
    console.log('  Cannot feature-probe a worker that errors on multiplayer.');
    console.log('  Treating as stale and continuing to deploy.\n');
    return false;
  }
  await post('mp/join', { token: b.token, code });
  const gA = (await post('mp/start', { token: a.token, code })).game || {};
  const view = (await post('mp/game', { token: b.token, cursor: 0 })).game || {};
  const defTok = gA.role === 'defender' ? a.token : b.token;
  await post('mp/game', { token: defTok, cursor: 0, hp: 1, maxHp: 2,
    towers: [{ type: 'ranger', x: 3.5, y: 2.5, ups: [2, 1] }] });
  const after = (await post('mp/game', { token: b.token, cursor: 0 })).game || {};

  let stale = [];
  // Architecture check first — it is the one thing feature probes miss.
  const isDurable = await probeBackend();
  console.log('  ' + (isDurable ? 'ok  ' : 'MISS') + '  ' + 'durable'.padEnd(9) +
    ' — Durable Object multiplayer (Match + Directory, no KV lag)');
  if (!isDurable) stale.push('durableObjects');
  for (const p of PROBES) {
    const good = p.ok(after) || p.ok(view);
    console.log('  ' + (good ? 'ok  ' : 'MISS') + '  ' + p.field.padEnd(9) + ' — ' + p.what);
    if (!good) stale.push(p.field);
  }
  console.log('');
  if (stale.length)
    console.log('  Deployed worker is STALE: ' + stale.join(', ') + ' missing.\n');
  else
    console.log('  Deployed worker is up to date.\n');
  return stale.length === 0;
}

// ---- deploy ----
function deploy() {
  if (!ensureKvId()) return false;
  console.log('Deploying cloud/worker.js (worker + Directory/Match Durable Objects) ...\n');
  // No script argument: wrangler reads wrangler.toml, which is what carries
  // the KV binding and the DO migrations. Deploying by path alone would
  // silently drop both.
  const r = spawnSync('npx', ['wrangler', 'deploy'], { stdio: 'inherit', shell: true });
  if (r.error) { console.log('  could not run wrangler: ' + r.error.message); return false }
  return r.status === 0;
}

// `--force` deploys even when the probe says production is current. Needed
// whenever the change is invisible to the probes (a comment, a tuning value),
// and to re-run the Durable Object migration.
const FORCE = process.argv.slice(2).indexOf('--force') >= 0;

(async () => {
  const already = await probe();
  if (already && !FORCE) {
    console.log('Nothing to do — re-run with --force to deploy anyway.');
    process.exit(0);
  }
  if (FORCE) console.log('--force: deploying regardless of probe result.\n');
  if (!deploy()) {
    console.log('\nDeploy did not complete. Most likely wrangler is not authenticated.');
    console.log('Run this once in a normal terminal (it opens a browser):');
    console.log('\n    npx wrangler login\n');
    console.log('then re-run:  npm run deploy:worker');
    process.exit(1);
  }
  console.log('');
  const ok = await probe();
  console.log(ok ? '\nDeployed and verified.' : '\nDeployed, but probes still miss — check the output above.');
  process.exit(ok ? 0 : 1);
})();
