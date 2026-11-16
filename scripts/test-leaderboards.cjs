// Regression tests use the real frontend and worker with isolated in-memory KV.
// No live account, live database or production worker is touched.
// NODE_PATH must include an isolated Playwright installation.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'outputs');
  const { default: worker } = await import(pathToFileURL(path.join(root, 'cloud/worker.js')).href);
  const values = new Map();
  const env = { KV: {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { values.set(key, String(value)); },
    async delete(key) { values.delete(key); }
  } };
  let passed = 0;
  const ok = name => { passed++; console.log('PASS ' + name); };
  async function api(endpoint, body) {
    const response = await worker.fetch(new Request('https://tdv.test' + endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }), env);
    return { status: response.status, data: await response.json() };
  }
  const registered = await api('/api/register', { username: 'ember_tester', password: 'isolated-test-only' });
  assert.equal(registered.status, 200);
  const token = registered.data.token;
  const missing = await api('/api/lb/top', { board: 'win:easy' });
  assert.equal(missing.status, 401);
  ok('Reproduced old failure: omitting the session returns HTTP 401');
  const names = ['emberwarden', 'flamekeeper', 'towerforge', 'nightwatch', 'ashranger',
    'ember_tester', 'stonewall', 'goldenarrow', 'runebuilder', 'skylancer'];
  const rows = Array.from({ length: 100 }, (_, i) => ({
    u: names[i] || 'defender_' + String(i + 1).padStart(3, '0'), v: 500 - i * 4
  }));
  for (const mode of ['easy', 'intermediate', 'hard', 'expert', 'nightmare', 'pvp'])
    values.set('lb:win:' + mode, JSON.stringify(rows));
  values.set('lb:gold', JSON.stringify(rows.map(e => ({ u: e.u, v: e.v * 1200 }))));
  values.set('lb:level', JSON.stringify(rows.map((e, i) => ({ u: e.u, v: Math.max(1, 60 - i) }))));
  const report = await api('/api/lb/report', { token, stats: { wins: { easy: 480, pvp: 400 }, gold: 600000, lvl: 57, endless: 512 } });
  assert.equal(report.status, 200);
  // only the boards the report actually beat are written back: the seeded rows
  // already rank ember_tester higher on win:easy (480) and win:pvp (480)
  assert.deepEqual(report.data.updated.sort(), ['endless', 'gold', 'level']);
  const read = await api('/api/lb/top', { token, board: 'win:easy' });
  assert.equal(read.status, 200);
  assert.equal(read.data.board.length, 100);
  assert.equal(read.data.board.find(e => e.u === 'ember_tester').v, 480);
  ok('Authenticated report persists and authenticated top-100 read returns it');
  const waves = await api('/api/lb/top', { token, board: 'endless' });
  assert.deepEqual(waves.data.board, [{ u: 'ember_tester', v: 512 }]);
  ok('The endless-wave board accepts a reported wave and reads back');

  // The frontend needs to be served over http:// for fetch() and the cloud
  // routes to behave, so hand out the project folder from a throwaway loopback
  // port instead of assuming something else is already running.
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
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [], requests = [];
    let boardDelay = null, boardFailure = null;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url());
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const body = req.postDataJSON() || {};
      if (url.pathname.startsWith('/api/lb/')) requests.push({ path: url.pathname, authenticated: body.token === token });
      if (url.pathname === '/api/lb/top' && boardDelay && body.board === boardDelay.board)
        await new Promise(resolve => setTimeout(resolve, boardDelay.ms));
      if (url.pathname === '/api/lb/top' && boardFailure) {
        return route.fulfill({ status: boardFailure.status, contentType: 'application/json',
          body: JSON.stringify({ ok: false, err: boardFailure.message }),
          headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      const response = await worker.fetch(new Request('https://tdv.test' + url.pathname, {
        method: req.method(), headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      }), env);
      await route.fulfill({ status: response.status, contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' }, body: await response.text() });
    });
    await page.route('http://localhost:8322/', route => route.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ ok: true, durable: true }),
      headers: { 'Access-Control-Allow-Origin': '*' } }));
    await context.addInitScript(({ token }) => {
      localStorage.setItem('tdv_cloud_token', token);
      localStorage.setItem('tdv_cloud_user', 'ember_tester');
    }, { token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready === true);
    await page.locator('#btnLb').click();
    await page.waitForFunction(() => document.querySelectorAll('#lbList .lbRow').length === 100);
    assert.ok(requests.length >= 2 && requests.every(r => r.authenticated));
    assert.equal(await page.locator('#lbMyRank').textContent(), '#6');
    assert.equal(await page.locator('#lbPodium .lbChampion').count(), 3);
    assert.equal(await page.locator('#lbList').getAttribute('aria-busy'), 'false');
    ok('Actual menu reads and reports include current session; renders podium and personal rank');

    for (const label of ['INTERMEDIATE', 'HARD', 'EXPERT', 'NIGHTMARE', 'PVP']) {
      await page.locator('#lbTabs button').filter({ hasText: new RegExp('^' + label + '$') }).click();
      await page.waitForFunction(label => document.querySelector('#lbBoardTitle').textContent === label + ' WINS' &&
        document.querySelector('#lbList').getAttribute('aria-busy') === 'false', label);
      assert.equal(await page.locator('#lbList .lbRow').count(), 100);
    }
    ok('All six win-mode categories render with the correct board');

    boardDelay = { board: 'win:easy', ms: 500 };
    await page.locator('#lbTabs button').filter({ hasText: /^EASY$/ }).click();
    await page.locator('#lbGroups button').filter({ hasText: /^GOLD/ }).click();
    await page.waitForFunction(() => document.querySelector('#lbList .val')?.textContent.endsWith(' G'));
    // Allow the already-issued old response to arrive and check it did not overwrite Gold.
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#lbBoardTitle').textContent(), 'GOLD');
    assert.match(await page.locator('#lbList .val').first().textContent(), / G$/);
    assert.equal(await page.locator('#lbTabs').isVisible(), false);
    boardDelay = null;
    ok('Rapid category switches ignore stale responses and keep score formatting correct');

    await page.locator('#lbGroups button').filter({ hasText: /^LEVEL/ }).click();
    await page.waitForFunction(() => document.querySelector('#lbList .val')?.textContent.startsWith('LVL '));
    ok('Gold and Level have dedicated navigation and score formats');

    boardFailure = { status: 503, message: 'Service temporarily unavailable' };
    await page.locator('#lbRefresh').click();
    await page.waitForFunction(() => document.querySelector('#lbList').textContent.includes('RANKINGS UNAVAILABLE'));
    assert.equal(await page.locator('#lbRefresh').isEnabled(), true);
    assert.equal(await page.evaluate(() => Cloud.ready), true);
    boardFailure = { status: 401, message: 'Not signed in — sign in again' };
    await page.locator('#lbRefresh').click();
    await page.waitForFunction(() => document.querySelector('#lbList').textContent.includes('SESSION NOT ACCEPTED'));
    assert.equal(await page.evaluate(() => Cloud.ready), true);
    boardFailure = null;
    await page.locator('#lbRefresh').click();
    await page.waitForFunction(() => document.querySelectorAll('#lbList .lbRow').length === 100);
    ok('Network/auth errors have recoverable states without discarding the current session');

    const saved = await page.evaluate(() => {
      const previous = SV.lbWins.pvp || 0;
      MP.active = true; MP.inMatch = true; MP.role = 'defender'; MP.game = { winSecs: 600 };
      MP.finishMatch({ winner: 'defender', reason: 'survived', elapsed: 600, rewards: { defender: 100 } });
      return { previous, stored: JSON.parse(localStorage.getItem(Save.key)).lbWins.pvp, current: SV.lbWins.pvp };
    });
    assert.equal(saved.current, saved.previous + 1);
    assert.equal(saved.stored, saved.current);
    ok('PVP win is written to local save after increment, before any reload');
    // This is a simulated local result, not a real multiplayer lobby.
    await page.evaluate(() => { toMenu(); clearToasts(); });
    await page.locator('#btnLb').click();
    await page.locator('#lbGroups button').filter({ hasText: /^WINS/ }).click();
    await page.locator('#lbTabs button').filter({ hasText: /^EASY$/ }).click();
    await page.waitForFunction(() => document.querySelector('#lbBoardTitle').textContent === 'EASY WINS' &&
      document.querySelectorAll('#lbList .lbRow').length === 100);
    await page.locator('#lbMenu').screenshot({ path: path.join(output, 'leaderboards-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const dimensions = await page.evaluate(() => {
      const panel = document.querySelector('.lbPanel'), content = document.querySelector('.lbContent');
      const p = panel.getBoundingClientRect();
      // clientWidth, not the rect: scrollWidth is in #uiRoot's own pixels and the
      // rect has the window fit multiplied into it, so comparing the two would
      // read as an overflow at any scale other than exactly 1. The panel edges are
      // screen coordinates on both sides, so those stay as they are.
      return { width: innerWidth, pLeft: p.left, pRight: p.right,
        contentWidth: content.clientWidth, contentScroll: content.scrollWidth };
    });
    assert.ok(dimensions.pLeft >= 0 && dimensions.pRight <= dimensions.width);
    assert.ok(dimensions.contentScroll <= dimensions.contentWidth + 1);
    assert.equal(await page.locator('#lbRefresh').isVisible(), true);
    assert.equal(await page.locator('#cloudChip').isVisible(), false);
    await page.locator('#lbMenu').screenshot({ path: path.join(output, 'leaderboards-mobile.png') });
    ok('390px mobile layout stays in viewport; ranks and Refresh remain visible');
    await page.setViewportSize({ width: 1024, height: 500 });
    assert.equal(await page.locator('#lbRefresh').isVisible(), true);
    const list = await page.locator('#lbList').boundingBox();
    assert.ok(list.height >= 100);
    ok('Compact-height layout retains a usable scrollable ranking list');
    assert.deepEqual(errors, []);
    assert.ok(requests.every(r => r.authenticated));
    ok('No browser runtime errors or unauthenticated leaderboard requests');
    await context.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log('ALL ' + passed + ' LEADERBOARD CHECKS PASSED (isolated test data only)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
