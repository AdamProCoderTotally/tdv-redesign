// Regression tests for the PVP match bridge — the money, and the walk-away rule.
//
// The invader's gold is derived server-side, because only the worker can stop
// them buying an enemy they cannot pay for. The defender's purse is plain local
// G.cash, so their share of the same drip has to be paid by the client — off the
// same server-synced clock, or the two sides drift apart and one of them is
// quietly richer. These checks pin that parity down, and pin the constants the
// client mirrors from cloud/worker.js, since a one-sided retune breaks the same
// promise. Isolated worker with in-memory KV; production untouched.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const { default: worker } = await import(pathToFileURL(path.join(root, 'cloud/worker.js')).href);
  const workerSrc = await fs.readFile(path.join(root, 'cloud/worker.js'), 'utf8');
  const values = new Map();
  const env = { KV: {
    async get(key) { return values.get(key) ?? null },
    async put(key, value) { values.set(key, String(value)) },
    async delete(key) { values.delete(key) }
  } };
  const registration = await worker.fetch(new Request('https://tdv.test/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'mp_tester', password: 'isolated-mp-check-only' })
  }), env);
  const account = await registration.json();
  assert.ok(account.ok);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return }
      const data = await fs.readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end() }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  let browser, passed = 0;
  const ok = label => { passed++; console.log('PASS ' + label) };
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      const cors = { 'Access-Control-Allow-Origin': '*' };
      if (url.pathname.startsWith('/api/')) {
        const response = await worker.fetch(new Request('https://tdv.test' + url.pathname, {
          method: req.method(), headers: { 'content-type': 'application/json' },
          body: req.postData() || '{}'
        }), env);
        return route.fulfill({ status: response.status, contentType: 'application/json',
          headers: cors, body: await response.text() });
      }
      if (url.hostname === 'localhost' && url.port === '8322')
        return route.fulfill({ status: 200, contentType: 'application/json', headers: cors,
          body: JSON.stringify({ ok: true, durable: true }) });
      if (url.hostname === '127.0.0.1' && url.port === String(port)) return route.continue();
      return route.abort();
    });
    await context.addInitScript(({ token }) => {
      localStorage.setItem('tdv_cloud_token', token);
      localStorage.setItem('tdv_cloud_user', 'mp_tester');
      window.close = () => {};
    }, { token: account.token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready &&
      document.getElementById('bootScreen').classList.contains('gone'));

    // ---- 1. the client's mirrored tuning still matches the worker's ----
    // The worker owns the invader's purse, so these five numbers exist twice on
    // purpose. Nothing but this check stops them drifting apart.
    const srv = k => {
      const m = new RegExp(k + ':\\s*(\\d+)').exec(workerSrc);
      assert.ok(m, 'cloud/worker.js no longer declares ' + k);
      return +m[1]
    };
    const mirror = await page.evaluate(() => ({
      START_GOLD: MP.START_GOLD, INC_BASE: MP.INC_BASE, INC_PERIOD: MP.INC_PERIOD,
      INC_MINUTE: MP.INC_MINUTE, INC_STEP: MP.INC_STEP
    }));
    assert.equal(mirror.START_GOLD, srv('START_GOLD'), 'starting gold');
    assert.equal(mirror.INC_BASE, srv('INCOME_BASE'), 'the base drip');
    assert.equal(mirror.INC_PERIOD, srv('INCOME_PERIOD'), 'how often it pays');
    assert.equal(mirror.INC_MINUTE, srv('INCOME_MINUTE'), 'how often the rate steps up');
    assert.equal(mirror.INC_STEP, srv('INCOME_STEP'), 'how far it steps up');
    ok('The client mirrors the worker income tuning exactly');

    // Enter a match without a server: MP.api is stubbed, and MP.now is pinned so
    // the income clock says what the test needs instead of what wall time says.
    await page.evaluate(() => {
      window.MPT = {
        T: 1100,
        view(role) {
          return { role: role, startedAt: 1000, elapsed: 100, winSecs: 600,
            pendingCount: 0, income: MP.INC_BASE, nextIncomeIn: MP.INC_PERIOD,
            players: [{ user: 'mp_tester', role: role }], enemies: {} } },
        enter(role) {
          SV.owned = ['ranger']; SV.loadout = ['ranger'];
          toMenu(); startGame('pvp');
          MP.api = () => new Promise(() => {});          // no request ever leaves
          MP.now = () => MPT.T;                          // frozen match clock
          MP.active = true;                              // tick() ignores a idle client
          MP.enterMatch(MPT.view(role));
          MP._lastT = performance.now();                 // so the next tick has a dt
        },
        async run(seconds) {                             // let the real pumps fire
          const until = performance.now() + seconds * 1000;
          while (performance.now() < until) { MP.tick(); await new Promise(r => setTimeout(r, 15)) }
        }
      };
    });

    // ---- 2. the defender is handed the invader's drip, minus the stake ----
    const def = await page.evaluate(async () => {
      MPT.T = 1100;                                      // 100s in: 14 ticks due
      MPT.enter('defender');
      const start = G.cash, ticks = MP.ticks();
      await MPT.run(.5);
      return { start: start, cash: G.cash, ticks: ticks, drip: MP.earned(ticks),
        paid: MP.defPaid, sub: document.getElementById('waveSub').textContent }
    });
    assert.equal(def.ticks, 14, 'the clock reads 14 income ticks 100 seconds in');
    assert.equal(def.cash, def.start + def.drip,
      'the defender holds their start cash plus every tick owed: ' + def.cash);
    assert.equal(def.drip, 1900, 'the drip after 14 ticks is 9*$100 then 5*$200: ' + def.drip);
    assert.equal(def.start, 750, 'and the PVP start cash is untouched by it');
    assert.equal(def.paid, def.drip, 'the paid total is recorded, not re-guessed');
    assert.ok(/income \+\$100 in \d+s/.test(def.sub),
      'the defender HUD quotes the income: ' + def.sub);
    ok('The defender earns the invader income drip on the same clock');

    // ---- 3. parity: the same tick count pays both sides the same total ----
    const parity = await page.evaluate(() => {
      MPT.enter('invader');
      const n = MP.ticks();
      // gold() is the worker's derivation replayed: stake + every tick - spend.
      // Strip the stake and the invader's earnings ARE the defender's.
      MP.game.spent = 0;
      return { invader: MP.gold() - MP.START_GOLD, defender: MP.earned(n), n: n,
        rate: MP.incomeRate() }
    });
    assert.equal(parity.invader, parity.defender,
      'both sides have earned the same by tick ' + parity.n + ': ' +
      parity.invader + ' vs ' + parity.defender);
    assert.equal(parity.rate, 200, 'the rate at tick 14 has stepped up to $200');
    ok('Invader and defender earn identical gold per second, tick for tick');

    // ---- 4. a stalled tab catches up instead of skipping paydays ----
    const catchup = await page.evaluate(async () => {
      MPT.T = 1100;
      MPT.enter('defender');
      await MPT.run(.4);
      const before = G.cash, paid = MP.defPaid;
      MPT.T += 21;                                       // three ticks fell due
      await MPT.run(.4);
      return { gain: G.cash - before, paid: MP.defPaid - paid, ticks: MP.ticks(),
        before: before, cash: G.cash }
    });
    assert.equal(catchup.ticks, 17, 'the clock has moved on by three ticks');
    assert.equal(catchup.gain, 600, 'one catch-up pays all three: ' + catchup.gain);
    assert.equal(catchup.paid, 600, 'and the ledger moves by exactly that much');
    ok('Missed ticks are paid in one go, not lost');

    // ---- 5. nobody is paid twice, and the invader is not paid locally at all --
    const once = await page.evaluate(async () => {
      MPT.T = 1100;
      MPT.enter('defender');
      await MPT.run(.6);
      const first = G.cash;
      MPT.T += 3;                                        // still inside tick 14
      await MPT.run(.6);
      const same = G.cash;
      MPT.enter('invader');
      await MPT.run(.4);
      return { first: first, same: same, invaderCash: G.cash, role: MP.role }
    });
    assert.equal(once.same, once.first,
      'time that has not crossed a tick boundary pays nothing: ' + once.same);
    assert.equal(once.invaderCash, 0,
      'the invader spends server gold, so no local drip runs for them');
    ok('The drip is idempotent, and defender-only');

    // ---- 6. farms still top it up on their own clock ----
    const farm = await page.evaluate(async () => {
      MPT.T = 1100;
      MPT.enter('defender');
      await MPT.run(.4);
      const fm = placeTower('farm', 4.5, 2.5);
      const before = G.cash;
      MP.farmT = 30;                                     // the 30s farm clock is due
      MP.tick();
      return { gain: G.cash - before, placed: !!fm,
        toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ') }
    });
    assert.equal(farm.placed, true, 'a farm fits on the PVP map');
    assert.equal(farm.gain, 100, 'a farm pays its own income on top of the drip');
    assert.ok(/Farm income/.test(farm.toast), 'and says so: ' + farm.toast);
    ok('Farm income survives the shared drip untouched');

    // ---- 7. a walk-away ends the match, and the claim reads the MATCH poll ----
    // The lobby roster stops being polled the moment play starts, so the old
    // lobby-based check looked at numbers frozen at match start and never fired.
    const afk = await page.evaluate(() => {
      const sent = [];
      MPT.T = 1100;
      MPT.enter('defender');
      MP.api = (op, body) => { sent.push({ op: op, reason: body && body.reason });
        return new Promise(() => {}) };              // nothing actually leaves
      // Backdate the tick clock so each call has a real dt: tick() bails out on
      // a zero delta, and two synchronous calls in one evaluate would be free.
      const beat = seen => { MP.game.oppSeen = seen; MP.gameT = 99; MP._lastT -= 100; MP.tick() };
      beat(5);                                         // opponent still breathing
      const early = sent.slice();
      beat(46);                                        // silent for 46s
      return { early: early, sent: sent, reported: MP.reported };
    });
    assert.deepEqual(afk.early, [], 'a live opponent must not trigger a forfeit claim');
    assert.equal(afk.sent.length, 1, 'exactly one claim: ' + JSON.stringify(afk.sent));
    assert.equal(afk.sent[0].op, 'result');
    assert.equal(afk.sent[0].reason, 'opponent_left');
    ok('A silent opponent is claimed off the match poll, not the frozen lobby list');

    // ---- 8. the worker judges both halves by the same number ----
    assert.match(workerSrc, /function oppUnseen\(/,
      'cloud/worker.js lost the shared opponent-silence helper');
    assert.match(workerSrc, /view\.oppSeen = oppUnseen\(/,
      'the match poll must carry it, because lobby polling stops during play');
    assert.match(workerSrc, /if \(oppUnseen\(this\.lob, g, user, t\) < MP\.DISCONNECT_SECS\)/,
      'and the forfeit must be judged by that same figure');
    ok('Client claim and server forfeit rule read one helper');

    assert.deepEqual(errors, [], 'browser runtime errors: ' + JSON.stringify(errors));
    ok('No browser runtime errors at any point');
    console.log('ALL ' + passed + ' MULTIPLAYER CHECKS PASSED');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
