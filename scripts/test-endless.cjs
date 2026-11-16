// Endless-mode regression checks against the real frontend and an isolated
// worker. Uses a temporary loopback server and a throwaway test account; never
// production data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const { default: worker } = await import(pathToFileURL(path.join(root, 'cloud/worker.js')).href);
  const values = new Map();
  const env = { KV: {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { values.set(key, String(value)); },
    async delete(key) { values.delete(key); }
  } };
  const registration = await worker.fetch(new Request('https://tdv.test/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'endless_tester', password: 'isolated-endless-check-only' })
  }), env);
  const account = await registration.json();
  assert.ok(account.ok);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
      const data = await fs.readFile(file);
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  let browser, passed = 0;
  const ok = label => { passed++; console.log('PASS ' + label); };
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
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
      if (url.hostname === 'localhost' && url.port === '8322') {
        return route.fulfill({ status: 200, contentType: 'application/json', headers: cors,
          body: JSON.stringify({ ok: true, durable: true }) });
      }
      if (url.hostname === '127.0.0.1' && url.port === String(port)) return route.continue();
      return route.abort();
    });
    await context.addInitScript(({ token }) => {
      localStorage.setItem('tdv_cloud_token', token);
      localStorage.setItem('tdv_cloud_user', 'endless_tester');
    }, { token: account.token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready && document.getElementById('bootScreen').classList.contains('gone'));
    await page.evaluate(() => clearToasts());

    // ---- 1. every endless spawn resolves to real content ----
    const roster = await page.evaluate(() => {
      const waves = [];
      for (let n = 1; n <= 60; n++) waves.push(n);              // every pool threshold
      for (let i = 1; i <= 14; i++) waves.push(i * 15);          // one full boss cycle
      const seen = { types: new Set(), bosses: new Set() }, unknown = { types: [], bosses: [] };
      for (const n of waves)
        for (let i = 0; i < 20; i++) for (const s of buildWaveQueue('endless', n)) {
          if (s.big) { seen.bosses.add(s.big); if (!BIGS[s.big]) unknown.bosses.push(s.big); }
          else { seen.types.add(s.type); if (!ENEMIES[s.type]) unknown.types.push(s.type); }
        }
      const nightmare = ['damned', 'blood_clot', 'splitter', 'demonic_spirit', 'cloaker',
        'blood_soldier', 'royal_guard', 'necromancer', 'healer'];
      const minibosses = ['necro_monarch', 'deformed_king', 'endbringer_guardian',
        'error_void_leak', 'the_misplaced'];
      return { unknown, count: seen.types.size,
        missing: nightmare.filter(k => !seen.types.has(k)),
        missingBosses: minibosses.filter(k => !seen.bosses.has(k)) };
    });
    assert.deepEqual(roster.unknown, { types: [], bosses: [] }, 'endless spawns an unknown enemy');
    assert.deepEqual(roster.missing, [], 'nightmare enemies never reach the endless pool');
    assert.deepEqual(roster.missingBosses, [], 'nightmare minibosses never reach the endless rotation');
    ok('Endless fields the whole nightmare roster (' + roster.count + ' enemy types) and every spawn resolves');

    // ---- 1b. a royal guard escorts a living monarch and stops escorting when
    // the king falls: the last chase multiplier used to stick for the match ----
    const escort = await page.evaluate(() => {
      startGame('endless');
      enemies.length = 0;
      const mon = spawnBig('necro_monarch');
      mon.d = 8;                                   // far ahead, so the guard sprints
      const guard = spawnEnemy('royal_guard', 2, 0);
      updEnemy(guard, 1 / 60);
      const chase = { spd: guard.spd, expect: mon.cfg.spd * G.mode.spdMul * 2.2 };
      mon.dead = true;
      updEnemy(guard, 1 / 60);
      return { chase: chase, after: guard.spd, own: ENEMIES.royal_guard.spd * G.mode.spdMul };
    });
    assert.ok(Math.abs(escort.chase.spd - escort.chase.expect) < 1e-9,
      'a guard well behind its king should close at the monarch pace x 2.2, got ' + escort.chase.spd);
    assert.ok(Math.abs(escort.after - escort.own) < 1e-9,
      'with the monarch dead the guard should walk at its own pace, got ' + escort.after);
    ok('A royal guard drops the escort sprint once its monarch is gone');

    // ---- 2. the record follows every cleared wave, and only forward ----
    const record = await page.evaluate(async () => {
      startGame('endless');
      SV.lbEndlessWave = 0;
      const seen = [];
      for (const n of [3, 7, 7, 12]) { WaveMgr.n = n; WaveMgr.finish(); seen.push(SV.lbEndlessWave); }
      await new Promise(resolve => setTimeout(resolve, 400));
      const top = await lbTop('endless');
      return { seen, stored: JSON.parse(localStorage.getItem(Save.key)).lbEndlessWave,
        board: top.filter(e => e.u === 'endless_tester') };
    });
    assert.deepEqual(record.seen, [3, 7, 7, 12]);
    assert.equal(record.stored, 12, 'the record was not written to the save');
    assert.deepEqual(record.board, [{ u: 'endless_tester', v: 12 }]);
    ok('Highest endless wave only moves forward, saves locally and reaches the board');

    // ---- 3. wave 500 asks the question ----
    const gate = await page.evaluate(() => {
      startGame('endless');
      WaveMgr.n = ENDLESS_CHALLENGE_WAVE;
      WaveMgr.finish();
      return { shown: document.getElementById('challengeMenu').classList.contains('show'),
        state: G.state, secret: G.secret, wave: WaveMgr.n,
        hudHidden: getComputedStyle(document.getElementById('hudTop')).display === 'none' &&
          getComputedStyle(document.getElementById('towerbar')).display === 'none',
        opaque: getComputedStyle(document.getElementById('challengeMenu')).backgroundColor,
        focused: document.activeElement.id,
        buttons: [...document.querySelectorAll('#challengeMenu .scrFoot .btn')].map(b => b.textContent.trim()) };
    });
    assert.equal(gate.shown, true, 'the prompt did not open after wave 500');
    assert.equal(gate.state, 'challenge');
    assert.equal(gate.secret, 'pending');
    assert.equal(gate.wave, 500, 'the prompt must not advance the wave counter');
    assert.equal(gate.hudHidden, true, 'the match HUD is still on screen behind the prompt');
    assert.equal(gate.opaque, 'rgb(0, 0, 0)', 'the challenge screen is not black');
    assert.deepEqual(gate.buttons, ['YES', 'NO']);
    assert.equal(gate.focused, 'chYes');
    await page.locator('#challengeMenu').screenshot({ path: path.join(root, 'outputs', 'secret-challenge.png') });
    ok('Clearing endless wave 500 freezes the match on a black YES/NO prompt');

    // ---- 4. NO keeps endless normal ----
    const declined = await page.evaluate(() => {
      document.getElementById('chNo').click();
      const queue = buildWaveQueue('endless', ENDLESS_LAST_WAVE);
      return { shown: document.getElementById('challengeMenu').classList.contains('show'),
        state: G.state, secret: G.secret, cd: WaveMgr.cd,
        hudBack: getComputedStyle(document.getElementById('hudTop')).display === 'flex',
        endbringer: queue.some(s => s.big === 'endbringer'),
        wave: SV.lbEndlessWave };
    });
    assert.equal(declined.shown, false);
    assert.equal(declined.state, 'playing');
    assert.equal(declined.secret, 'declined');
    assert.equal(declined.hudBack, true, 'the HUD never came back after declining');
    assert.ok(declined.cd > 0, 'declining must leave the run on its normal countdown');
    assert.equal(declined.endbringer, false, 'a declined challenge still spawns the Endbringer');
    assert.equal(declined.wave, 500);
    const declinedAgain = await page.evaluate(() => {
      WaveMgr.n = ENDLESS_CHALLENGE_WAVE; WaveMgr.finish();
      return { asked: document.getElementById('challengeMenu').classList.contains('show'), state: G.state };
    });
    assert.equal(declinedAgain.asked, false, 'the question was asked twice in one run');
    assert.equal(declinedAgain.state, 'playing');
    ok('NO hands the match back and endless keeps playing past wave 500');

    // ---- 5. YES runs the Endbringer and ends the match ----
    const accepted = await page.evaluate(() => {
      startGame('endless');
      WaveMgr.n = ENDLESS_CHALLENGE_WAVE;
      WaveMgr.finish();
      document.getElementById('chYes').click();
      const started = { shown: document.getElementById('challengeMenu').classList.contains('show'),
        state: G.state, secret: G.secret, wave: WaveMgr.n, active: WaveMgr.active,
        queue: WaveMgr.queue.map(s => s.big || s.type) };
      WaveMgr.queue = []; enemies.length = 0; WaveMgr.residual.length = 0;
      WaveMgr.finish();
      return { started, ended: { state: G.state, screen: document.getElementById('endMenu').classList.contains('show') } };
    });
    assert.equal(accepted.started.shown, false);
    assert.equal(accepted.started.secret, 'accepted');
    assert.equal(accepted.started.state, 'playing');
    assert.equal(accepted.started.wave, 501);
    assert.deepEqual(accepted.started.queue, ['endbringer']);
    assert.equal(accepted.ended.state, 'ending', 'beating wave 501 did not start the ending');
    assert.equal(accepted.ended.screen, false, 'the ending must play out before the results card');
    ok('YES opens wave 501 against the ENDBRINGER and beating it runs the ending');

    // ---- 6. no way into wave 501 without answering ----
    const guarded = await page.evaluate(() => {
      startGame('endless');
      WaveMgr.n = ENDLESS_CHALLENGE_WAVE; WaveMgr.active = false; WaveMgr.cd = .1;
      WaveMgr.update(.2);                     // the inter-wave countdown rolling over
      const out = { asked: document.getElementById('challengeMenu').classList.contains('show'),
        state: G.state, wave: WaveMgr.n };
      document.getElementById('chNo').click();
      out.after = { state: G.state, wave: WaveMgr.n, cd: WaveMgr.cd };
      return out;
    });
    assert.equal(guarded.asked, true, 'the countdown slipped into wave 501 without asking');
    assert.equal(guarded.state, 'challenge');
    assert.equal(guarded.wave, 500, 'the guard must not advance the wave counter');
    assert.equal(guarded.after.state, 'playing');
    assert.ok(guarded.after.cd > 0);
    ok('Wave 501 cannot be entered without answering, whatever started the countdown');

    // ---- 7. the board renders in the menu ----
    await page.evaluate(async () => { await lbReport(); toMenu(); clearToasts(); });
    await page.locator('#btnLb').click();
    await page.waitForFunction(() => document.getElementById('lbList').getAttribute('aria-busy') === 'false');
    await page.locator('#lbGroups button').filter({ hasText: /^ENDLESS/ }).click();
    await page.waitForFunction(() => document.querySelector('#lbList .lbRow.me .val')?.textContent.startsWith('WAVE '));
    const board = await page.evaluate(() => ({ title: document.getElementById('lbBoardTitle').textContent,
      metric: document.getElementById('lbMetric').textContent,
      desc: document.getElementById('lbBoardDesc').textContent,
      mine: document.getElementById('lbMyScore').textContent,
      row: document.querySelector('#lbList .lbRow.me .val')?.textContent,
      modes: document.getElementById('lbTabs').hidden }));
    assert.equal(board.title, 'ENDLESS WAVE');
    assert.equal(board.desc, 'Highest wave cleared in Endless mode.');
    assert.equal(board.metric, 'WAVE');
    assert.equal(board.row, 'WAVE 501', 'the record the earlier runs pushed is not on the board');
    assert.equal(board.mine, board.row, 'your rank line disagrees with your board entry');
    assert.equal(board.modes, true, 'the mode sub-tabs must stay hidden off the win boards');
    await page.locator('#lbMenu').screenshot({ path: path.join(root, 'outputs', 'endless-wave-board.png') });
    ok('The ENDLESS WAVE board renders with wave formatting and my own rank');

    assert.deepEqual(errors, []);
    ok('No browser runtime errors');
    await context.close();
    console.log('ALL ' + passed + ' ENDLESS CHECKS PASSED (isolated test account only)');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
