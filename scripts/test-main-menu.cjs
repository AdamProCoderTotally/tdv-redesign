// Main-menu regression checks against the actual frontend and an isolated worker.
// Uses a temporary loopback server and in-memory account data; never production.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'outputs');
  const workerPath = path.join(root, 'cloud/worker.js');
  const workerBefore = await fs.readFile(workerPath);
  const { default: worker } = await import(pathToFileURL(workerPath).href);
  const values = new Map();
  const env = { KV: {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { values.set(key, String(value)); },
    async delete(key) { values.delete(key); }
  } };
  const registration = await worker.fetch(new Request('https://tdv.test/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'menu_tester', password: 'isolated-menu-check-only' })
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      const cors = { 'Access-Control-Allow-Origin': '*' };
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/mp/list') {
          return route.fulfill({ status: 200, contentType: 'application/json',
            headers: cors, body: JSON.stringify({ ok: true, rooms: [] }) });
        }
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
      localStorage.setItem('tdv_cloud_user', 'menu_tester');
      window.close = () => { window.__menuQuitRequested = true; };
    }, { token: account.token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready && document.getElementById('bootScreen').classList.contains('gone'));
    await page.evaluate(() => clearToasts());
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('#mmUser').textContent(), 'menu_tester');
    assert.equal(await page.locator('#mmTitle').getAttribute('aria-label'), 'Tower Defence V');
    const build = await page.evaluate(() => ({ baked: TDV_VERSION,
      line: document.querySelector('.mmBuild').textContent.replace(/\s+/g, ' ').trim() }));
    assert.match(build.baked, /^\d+\.\d+\.\d+$/, 'channel.js should bake a version');
    assert.equal(build.line, build.baked + ' / BALANCE UPDATE');
    ok('Commander name, accessible title and the baked build version all render');
    const ids = await page.evaluate(() => [...document.querySelectorAll('[id]')].map(e => e.id));
    assert.equal(ids.length, new Set(ids).size);
    const expected = ['btnPlay', 'btnMulti', 'btnShop', 'btnTowers', 'btnBadges', 'btnLb', 'btnSettings', 'btnQuit'];
    assert.deepEqual(await page.locator('#mmButtons button').evaluateAll(buttons => buttons.map(b => b.id)), expected);
    ok('Element IDs stay unique and the original button order is preserved');

    const chipHome = () => page.evaluate(() => {
      const p = document.getElementById('cloudChip').parentElement;
      return p.id || p.tagName;
    });
    for (const [button, screen, back] of [
      ['btnPlay', 'mapMenu', 'mapBack'], ['btnMulti', 'mpMenu', 'mpBack'],
      ['btnShop', 'shopMenu', 'shopBack'], ['btnTowers', 'invMenu', 'invBack'],
      ['btnBadges', 'badgesMenu', 'badgesBack'], ['btnLb', 'lbMenu', 'lbBack'],
      ['btnSettings', 'settingsMenu', 'setBack']
    ]) {
      await page.locator('#' + button).click();
      assert.ok(await page.locator('#' + screen).isVisible(), button + ' destination');
      // undocked means back to #uiRoot, not to body: that is the layer the window
      // is scaled on, so the chip has to live in it to size with the interface
      assert.equal(await chipHome(), 'uiRoot', button + ' releases the cloud chip');
      await page.locator('#' + back).click();
      assert.ok(await page.locator('#mainMenu').isVisible(), button + ' return');
      assert.equal(await chipHome(), 'mmSyncSlot', button + ' redocks the cloud chip');
    }
    ok('All seven navigation destinations and Back buttons work through real handlers');

    // The size picker has to leave exactly one choice lit. Its click handler used
    // to compare the buttons against a `this` that a nested function loses, so
    // picking a size switched all four off until Settings was opened again.
    const sizeBefore = await page.evaluate(() => SV.uiScale);
    await page.locator('#btnSettings').click();
    await page.locator('#setScale .tgl').last().click();
    const lit = await page.evaluate(() =>
      [...document.querySelectorAll('#setScale .tgl.on')].map(e => e.dataset.s));
    assert.equal(lit.length, 1, 'one size button should stay lit, found ' + lit.length);
    assert.equal(Number(lit[0]), await page.evaluate(() => SV.uiScale),
      'the lit button should be the size picked');
    await page.evaluate(s => { document.querySelector('#setScale .tgl[data-s="' + s + '"]').click() },
      String(sizeBefore));
    await page.locator('#setBack').click();
    ok('The UI scale picker keeps the chosen size lit');
    await page.locator('#btnQuit').click();
    assert.equal(await page.evaluate(() => window.__menuQuitRequested), true);
    await page.evaluate(() => clearToasts());
    ok('Quit invokes the existing close action without closing the test browser');

    const stats = await page.evaluate(() => {
      const old = { gold: SV.gold, xp: SV.xp };
      SV.gold = 12480; SV.xp = 3400; refreshMenu();
      const li = levelInfo(SV.xp);
      const result = { gold: document.getElementById('mmGold').textContent,
        level: document.getElementById('mmLvl').textContent, expectedLevel: 'LVL ' + li.lvl,
        progress: Number(document.querySelector('#mainMenu [role=progressbar]').getAttribute('aria-valuenow')) };
      SV.gold = old.gold; SV.xp = old.xp; refreshMenu();
      return result;
    });
    assert.equal(stats.gold, '12,480');
    assert.equal(stats.level, stats.expectedLevel);
    assert.ok(stats.progress >= 0 && stats.progress <= 100);
    ok('Gold and level footer reflect actual save values with bounded accessible XP progress');

    async function checkLayout(label, size, scale = 1) {
      await page.setViewportSize(size);
      await page.evaluate(scale => {
        document.getElementById('uiRoot').style.zoom = scale;
        document.getElementById('mainMenu').scrollTop = 0;
        clearToasts();
      }, scale);
      const data = await page.evaluate(() => {
        const menu = document.getElementById('mainMenu');
        const rect = menu.getBoundingClientRect();
        const title = document.querySelector('.gameTitle').getBoundingClientRect();
        const buttons = document.getElementById('mmButtons').getBoundingClientRect();
        const all = [...document.querySelectorAll('#mmButtons button, .mmTopline, .mmProfile, .gt-top, .gt-mid')];
        const chip = document.getElementById('cloudChip');
        // A hidden chip has a zero rect, which would make every test below pass
        // without ever looking at the layout — so put it up before measuring.
        Cloud.chip('idle', 'SYNCED');
        dockSyncChip();
        const cr = chip.getBoundingClientRect();
        const neighbours = [...document.querySelectorAll(
          '#mmButtons button, .mmTopline, .mmGold, .lvlBar, .mmCommander')];
        return { iconsSquare: [...document.querySelectorAll('#mmButtons .pixelIcon')].every(el => { const r = el.getBoundingClientRect(); return Math.abs(r.width-r.height)<.1 && getComputedStyle(el).flexShrink==='0'; }),
          horizontal: menu.scrollWidth <= menu.clientWidth + 1,
          bounded: all.every(el => { const r = el.getBoundingClientRect(); return r.left >= rect.left - 1 && r.right <= rect.right + 1; }),
          titleClear: title.right <= buttons.left || title.bottom <= buttons.top,
          scrollNeeded: menu.scrollHeight > menu.clientHeight + 1,
          mainHeight: menu.clientHeight, contentHeight: menu.scrollHeight,
          textFits: [...document.querySelectorAll('#mmButtons .mmButtonTitle')].every(e => e.scrollWidth <= e.clientWidth + 1),
          docked: chip.parentElement.id === 'mmSyncSlot',
          chipShown: cr.width > 0 && cr.height > 0,
          chipClear: !neighbours.some(el => { const b = el.getBoundingClientRect();
            return cr.left < b.right - 1 && b.left + 1 < cr.right && cr.top < b.bottom - 1 && b.top + 1 < cr.bottom; }) };
      });
      assert.ok(data.iconsSquare, label + ' pixel icon squashed');
      assert.ok(data.horizontal, label + ' horizontal overflow: ' + JSON.stringify(data));
      assert.ok(data.bounded, label + ' element bounds: ' + JSON.stringify(data));
      assert.ok(data.titleClear, label + ' title/nav collision: ' + JSON.stringify(data));
      assert.ok(data.textFits, label + ' button text clipping: ' + JSON.stringify(data));
      assert.ok(data.docked, label + ' cloud chip left the profile bar: ' + JSON.stringify(data));
      assert.ok(data.chipShown, label + ' cloud chip is not on screen to lay out: ' + JSON.stringify(data));
      assert.ok(data.chipClear, label + ' cloud chip overlaps menu content: ' + JSON.stringify(data));
      await page.locator('#btnSettings').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('#btnSettings').isVisible());
      await page.evaluate(() => document.getElementById('mainMenu').scrollTop = 0);
      console.log('LAYOUT ' + label + ' ' + JSON.stringify(data));
      ok(label + ' has no clipping or title overlap; the cloud chip stays docked and clear');
      return data;
    }
    const desktop = await checkLayout('Desktop 1440x900', { width: 1440, height: 900 });
    assert.equal(desktop.scrollNeeded, false);
    await page.screenshot({ path: path.join(output, 'main-menu-desktop.png') });
    const compact = await checkLayout('Compact 1024x500', { width: 1024, height: 500 });
    assert.equal(compact.scrollNeeded, false);
    await page.screenshot({ path: path.join(output, 'main-menu-compact.png') });
    await checkLayout('Mobile 390x844', { width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'main-menu-mobile.png') });
    await checkLayout('Small phone 320x640', { width: 320, height: 640 });
    await checkLayout('Landscape 844x390', { width: 844, height: 390 });
    await checkLayout('Desktop with 130% UI', { width: 1280, height: 720 }, 1.3);
    await checkLayout('Mobile with 130% UI', { width: 390, height: 844 }, 1.3);
    await checkLayout('Desktop with 80% UI', { width: 1280, height: 720 }, 0.8);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => { document.getElementById('uiRoot').style.zoom = 1; });
    // :focus-visible only follows keyboard modality, so reach Play by tabbing
    // there — element.focus() after all the mouse clicks shows no ring.
    const active = () => page.evaluate(() => document.activeElement.id);
    for (let i = 0; i < 30 && await active() !== 'btnPlay'; i++) await page.keyboard.press('Tab');
    assert.equal(await active(), 'btnPlay', 'Tab should reach Play');
    assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('#mapMenu').isVisible());
    await page.locator('#mapBack').click();
    ok('Tab reaches Play with a visible focus ring and Enter activates navigation');
    assert.deepEqual(errors, []);
    assert.deepEqual(await fs.readFile(workerPath), workerBefore);
    ok('No browser runtime errors; cloud/worker.js remains unchanged');
    await context.close();
    console.log('ALL ' + passed + ' MAIN-MENU CHECKS PASSED (isolated test account only)');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
