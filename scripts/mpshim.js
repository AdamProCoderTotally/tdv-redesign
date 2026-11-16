// TDV multiplayer dev shim — runs cloud/worker.js (the REAL worker code) on
// localhost:8322 with an in-memory KV *and* emulated Durable Objects, so two
// browser tabs can play a match locally without deploying to Cloudflare.
//
//   npm run mp        start it (keep it running while testing MP)
//   npm run dev       the game on 8321 (mp.js talks to localhost:8322 on http)
//
// Everything the worker does (sign-in, saves, lobbies, buys, heartbeats) is
// exercised exactly as in production — only the storage is swapped out:
//   KV        -> a Map with Cloudflare's TTL semantics
//   Match     -> one Map per lobby code (the DO name)
//   Directory -> a single Map holding the user -> lobby index
//
// The emulator deliberately builds a FRESH object per request, the way
// Cloudflare may evict and recreate one between requests. worker.js is
// therefore forced to re-read its state from storage every fetch; if it ever
// starts caching in instance fields, it breaks here first rather than in
// production.
const http = require('http');
const path = require('path');

const PORT = 8322;

// ---- in-memory KV with Cloudflare-compatible TTL semantics ----
// Cloudflare's KV get/put/delete are async; `expirationTtl` is seconds from now.
// Built per env so the shim server and a regression run never share accounts.
function makeKV() {
  const store = new Map(); // key -> { value, exp|null }
  return {
    async get(key) {
      const e = store.get(key);
      if (!e) return null;
      if (e.exp && Date.now() > e.exp) { store.delete(key); return null }
      return e.value;
    },
    async put(key, value, opts) {
      const ttl = opts && opts.expirationTtl;
      store.set(key, {
        value: String(value),
        exp: ttl ? Date.now() + ttl * 1000 : null
      });
    },
    async delete(key) { store.delete(key) },
    async list() { return { keys: [...store.keys()].map(name => ({ name })) } }
  };
}

// ---- Durable Object emulation ----
// Mirrors state.storage (SQLite-backed KV-style API) with per-name storage
// that outlives individual requests, which is the part that actually matters.
function durableNamespace(cls, env) {
  const stores = new Map();   // object name -> Map(key -> value)

  function storageFor(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async get(key) { return store.has(key) ? structuredClone(store.get(key)) : undefined },
      async put(key, value) { store.set(key, structuredClone(value)) },
      async delete(key) { return store.delete(key) },
      async deleteAll() { store.clear(); return true },
      async list() { return { keys: [...store.keys()].map(k => ({ name: k })) } },
      async getAlarm() { return null },
      async setAlarm() {},
      async deleteAlarm() {}
    };
  }

  return {
    idFromName(name) { return String(name) },
    getByName(name) {
      const key = String(name);
      return {
        // Fresh instance every call — see the comment at the top of this file.
        fetch(request) {
          const state = {
            storage: storageFor(key),
            id: { name: key, toString() { return key } },
            waitUntil() {}
          };
          return Promise.resolve(new cls(state, env).fetch(request));
        }
      };
    }
  };
}

// ---- load the real worker (ES module) ----
// Shared with the regression suites: an isolated worker + KV + Durable Objects
// in one process is the only way a two-party rule (a gift crossing a match, say)
// can be tested without touching the deployment.
async function makeEnv() {
  const workerPath = path.join(__dirname, '..', 'cloud', 'worker.js');
  // Flags the shim as a local dev host so worker.js registers the
  // alice_tdv/bob_tdv test roles for exercising staff gating. This global
  // only exists in this process — a deployed Cloudflare worker never defines
  // it, so the published STAFF list stays administrator-only.
  globalThis.__TDV_DEV_SHIM__ = true;
  const mod = await import('file:///' + workerPath.replace(/\\/g, '/'));
  const worker = mod.default;
  if (!worker || typeof worker.fetch !== 'function')
    throw new Error('cloud/worker.js did not export a fetch handler');
  if (typeof mod.Match !== 'function' || typeof mod.Directory !== 'function')
    throw new Error('cloud/worker.js must export classes Match and Directory');

  // Binding names must match wrangler.toml and the worker's BIND_* constants.
  // The env object is built first and populated immediately after, so the
  // closures inside the namespaces see the complete bindings when they run.
  const env = { KV: makeKV() };
  env.MATCH = durableNamespace(mod.Match, env);
  env.DIRECTORY = durableNamespace(mod.Directory, env);
  return { worker: worker, env: env };
}

async function main() {
  const { worker, env } = await makeEnv();

  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const buf = Buffer.concat(chunks);

      // Build a Request the worker can consume (headers + body as text).
      const url = 'http://localhost:' + PORT + req.url;
      const headers = {};
      for (let i = 0; i < req.rawHeaders.length; i += 2)
        headers[req.rawHeaders[i]] = req.rawHeaders[i + 1];
      const init = { method: req.method, headers };
      if (buf.length && req.method !== 'GET' && req.method !== 'HEAD') init.body = buf.toString('utf8');
      const request = new Request(url, init);

      const out = await worker.fetch(request, env, { waitUntil() {} });

      res.statusCode = out.status;
      out.headers.forEach((v, k) => { try { res.setHeader(k, v) } catch (e) {} });
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) {
      console.error('[mpshim]', e);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, err: 'shim error: ' + e.message }));
    }
  });

  server.listen(PORT, () => {
    console.log('');
    console.log('  TDV multiplayer shim  ->  http://localhost:' + PORT);
    console.log('  running cloud/worker.js with in-memory KV + Durable Objects');
    console.log('  (start the game with `npm run dev` and open two tabs to test)');
    console.log('');
  });
}

module.exports = { makeEnv };
// `npm run mp` starts the server; a regression suite only wants makeEnv() and
// drives the worker in its own process.
if (require.main === module) main().catch(e => { console.error(e); process.exit(1) });
