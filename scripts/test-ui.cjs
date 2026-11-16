// Screenshots + layout checks for every UI surface, at desktop and phone sizes.
// Drives the real handlers where one exists and the screen's own render function
// where the state behind it is multiplayer- or match-owned. Isolated worker with
// in-memory KV and a throwaway account; production is never touched.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

// Each screen is [name, opener] where opener runs in the page.
const SCREENS = [
  ['boot', () => {
    const b = document.getElementById('bootScreen');
    b.classList.remove('gone'); b.style.opacity = 1;
    document.getElementById('bootPrompt').style.display = 'flex';
  }],
  ['cloud-gate', () => document.getElementById('cloudGate').classList.add('show')],
  ['main-menu', () => toMenu()],
  ['map-select', () => document.getElementById('btnPlay').click()],
  ['mode-select', () => { document.getElementById('btnPlay').click(); document.querySelector('.mapCard').click(); }],
  ['shop', () => { toMenu(); document.getElementById('btnShop').click(); }],
  ['tower-info', () => { toMenu(); document.getElementById('btnShop').click(); showTowerInfo('sniper'); }],
  ['tower-info-viper', () => { toMenu(); document.getElementById('btnShop').click(); showTowerInfo('viper'); }],
  ['towers', () => { toMenu(); document.getElementById('btnTowers').click(); }],
  ['badges', () => { toMenu(); document.getElementById('btnBadges').click(); }],
  ['leaderboards', () => { toMenu(); document.getElementById('btnLb').click(); }],
  ['leaderboard-endless', () => {
    toMenu(); document.getElementById('btnLb').click();
    [...document.querySelectorAll('#lbGroups button')].find(b => /ENDLESS/.test(b.textContent)).click();
  }],
  ['settings', () => { toMenu(); document.getElementById('btnSettings').click(); }],
  ['confirm', () => { toMenu(); confirmDlg('SELL TOWER', 'Refund $120 and remove the Ranger?', () => {}); }],
  ['hud', () => {
    toMenu(); startGame('endless');
    // placeTower debits without a gate (tryPlaceAt is the gate), so fund the
    // four reference towers or the baseline screenshot shows a negative purse
    G.cash = 2400; lastCash = null;
    placeTower('ranger', 4.5, 2.5); placeTower('grenadier', 5.5, 3.5);
    placeTower('sniper', 6.5, 2.5); placeTower('farm', 3.5, 4.5);
    WaveMgr.start(9); toast('Nightmare column incoming', 'bad'); toast('Farm income  +$300');
  }],
  ['tower-panel', () => {
    toMenu(); startGame('endless');
    const t = placeTower('ranger', 4.5, 2.5); t.ups = [3, 2]; t.S = towerStats(t);
    selectTower(t);
    spawnBig('tank'); spawnEnemy('blood_soldier', 4); spawnEnemy('necromancer', 6);
    updateHUD();
  }],
  ['tower-panel-village', () => {
    toMenu(); startGame('endless'); G.cash = 99999;
    const v = placeTower('village', 3.5, 2.5);
    v.ups = [0, 3]; v.S = towerStats(v);            // three buys down the Discounts path
    const t = placeTower('ranger', 4.5, 2.5);
    selectTower(t); updateHUD();
  }],
  ['boss-bar', () => {
    toMenu(); startGame('hard'); WaveMgr.start(40); spawnBig('oking'); updateHUD();
  }],
  ['pause', () => { toMenu(); startGame('endless'); togglePause(); }],
  ['challenge', () => { toMenu(); startGame('endless'); WaveMgr.n = 500; WaveMgr.finish(); }],
  ['end-victory', () => { toMenu(); startGame('easy'); G.state = 'playing'; victory(); }],
  ['end-defeat', () => { toMenu(); startGame('expert'); WaveMgr.n = 43; G.state = 'playing'; defeat(); }],
  ['end-ultimate', () => { toMenu(); startGame('endless'); G.state = 'playing'; finishEnding(); }],
  ['mp-menu', () => { toMenu(); document.getElementById('btnMulti').click(); }],
  ['mp-create', () => { toMenu(); document.getElementById('btnMulti').click(); document.getElementById('mpCreate').click(); }],
  ['mp-password', () => {
    toMenu(); MP.lob = null;
    document.getElementById('pwRoom').textContent = 'EMBER STRONGHOLD  ·  AB4QZ';
    document.getElementById('pwPrompt').classList.add('show');
  }],
  ['mp-mode', () => { toMenu(); hideScreens(); showScreen('mpModeMenu'); }],
  ['mp-lobby', () => {
    toMenu();
    MP.showLobby({ code: 'AB4QZ', host: 'ui_tester', status: 'lobby',
      players: [{ user: 'ui_tester', role: 'developer', seen: 2 },
        { user: 'ember_fox', role: 'tester', seen: 44 }] });
  }],
  ['mp-vote', () => {
    toMenu(); startGame('pvp');
    MP.active = true; MP.inMatch = true; MP.role = 'defender';
    // A match view 100 seconds in, so the defender HUD has real numbers to show:
    // the survive clock, the incoming count, and the income drip they now share
    // with the invader.
    MP.game = { role: 'defender', startedAt: 1000, elapsed: 100, winSecs: 600,
      income: 200, nextIncomeIn: 4, pendingCount: 0,
      players: [{ user: 'ui_tester', role: 'defender' }, { user: 'ember_fox', role: 'invader' }] };
    MP.offset = 1100 - Date.now() / 1000;
    G.mp = MP;                             // updateHUD routes the PVP HUD through MP
    document.getElementById('mpBar').style.display = 'flex';
    document.getElementById('mpRoster').style.display = 'flex';
    MP.renderRoster(); MP.hud(); MP.renderVote({ ends: 9e12, value: 2, yes: 1, no: 0 });
  }],
  ['mp-result', () => {
    toMenu(); startGame('pvp');
    MP.active = true; MP.inMatch = true; MP.role = 'invader';
    MP.game = { winSecs: 600, players: [{ user: 'ui_tester', role: 'invader' },
      { user: 'ember_fox', role: 'defender' }] };
    MP.finishMatch({ winner: 'invader', reason: 'base_destroyed', elapsed: 421, rewards: { invader: 180 } });
  }],
  // last, because they rewrite SV: the level and gold the prestige shop needs
  ['shop-prestige', () => {
    toMenu(); SV.xp = 7000; SV.gold = 5000; SV.owned = ['ranger', 'grenadier', 'sniper'];
    document.getElementById('btnShop').click();
    document.querySelector('#shopMenu .menu').scrollTop = 9999;
  }],
  ['gold-ranger', () => {
    toMenu(); startGame('endless'); G.cash = 99999;
    const g = placeTower('goldranger', 5.5, 2.5);
    g.ups = [2, 1]; g.S = towerStats(g);
    const v = placeTower('village', 4.5, 2.5);
    v.ups = [0, 3]; v.S = towerStats(v);   // a village on top of the 3x prices
    selectTower(g); spawnBig('tank'); updateHUD();
  }],
  ['void-traitor', () => {
    toMenu(); startGame('endless'); G.cash = 99999;
    const t = placeTower('voidtraitor', 5.5, 2.5);
    t.ups = [5]; t.S = towerStats(t); t.flashT = .12;
    selectTower(t); updateHUD();
  }],
  ['viper', () => {
    toMenu(); startGame('endless'); G.cash = 99999;
    const t = placeTower('viper', 5.5, 2.5);
    t.ups = [4, 0]; t.S = towerStats(t);          // through Clustershots
    const c = worldToMap(t.x, t.y);
    cam.tx = cam.x = c.x; cam.ty = cam.y = c.y; cam.tz = cam.zoom = 2; camClamp();
    const e = spawnEnemy('brute', 6); e.hp = e.maxHp = 900;
    applyPoison(e, t.id, t.S.poisonPct, t.S.poisonDur);
    applySlow(e, .5, 1, 6, false);
    selectTower(t); updateHUD();
  }],
  ['viper-twin', () => {
    toMenu(); startGame('endless'); G.cash = 99999;
    const t = placeTower('viper', 5.5, 2.5);
    t.ups = [0, 5]; t.S = towerStats(t);          // Double Gunner and Twin Gunner
    t.gunMode = ['weak', 'strong']; t.gunAim = [-0.5, -1.1]; t.gunFlash = [0.08, 0];
    const ally = placeTower('ranger', 4.5, 2.5);
    ally.toxicT = 6; ally.S = towerStats(ally);   // green-ish from a Toxic gift
    const cured = placeTower('sniper', 6.5, 3.5);
    cured.cureT = 6; cured.S = towerStats(cured); // and yellow-ish from a Cure
    firePatches.push({ kind: 'poison', x: 5.9, y: 3.1, r: .9, t: 3, tick: 0,
      pct: .0025, dur: 15, srcId: t.id });
    const c = worldToMap(t.x, t.y);
    cam.tx = cam.x = c.x; cam.ty = cam.y = c.y; cam.tz = cam.zoom = 2; camClamp();
    selectTower(t); updateHUD();
  }],
  ['command-bar', () => { toMenu(); Cloud.role = 'developer'; ADMIN.open() }],
  ['command-search', () => {
    toMenu(); Cloud.role = 'developer'; ADMIN.open();
    document.getElementById('cmdInput').value = 'sp';
    ADMIN.cursor = 0; ADMIN.suggest();
  }],
  ['command-args', () => {
    toMenu(); Cloud.role = 'developer'; ADMIN.open();
    document.getElementById('cmdInput').value = 'spawn wal';
    ADMIN.suggest();
  }],
  ['command-none', () => {
    toMenu(); Cloud.role = 'developer'; ADMIN.open();
    document.getElementById('cmdInput').value = 'spawn voi';
    ADMIN.suggest();
  }]
];
// Every surface at the two layout regimes, plus the biggest panels again at the
// in-between windows the fit exists for. An audit at a fitted size can only
// re-find what desktop already found — the layer's own box never drops below the
// design box it was authored at — so the extra screens would cost runtime for no
// new information, while a wide or tall panel is where a hide would show up.
const FIT_CASES = ['main-menu', 'map-select', 'shop', 'badges', 'leaderboards',
  'settings', 'mp-lobby', 'hud', 'end-defeat', 'command-bar'];
const SIZES = [
  { w: 1440, h: 900, tag: 'desktop' },
  { w: 1024, h: 640, tag: 'laptop', only: FIT_CASES },
  { w: 800, h: 480, tag: 'cramped', only: FIT_CASES },
  { w: 390, h: 844, tag: 'mobile' }
];

async function main() {
  const root = path.resolve(__dirname, '..');
  const shotDir = path.join(root, 'outputs', 'ui');
  await fs.mkdir(shotDir, { recursive: true });
  const { default: worker } = await import(pathToFileURL(path.join(root, 'cloud/worker.js')).href);
  const values = new Map();
  const env = { KV: {
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { values.set(key, String(value)); },
    async delete(key) { values.delete(key); }
  } };
  const registration = await worker.fetch(new Request('https://tdv.test/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'ui_tester', password: 'isolated-ui-check-only' })
  }), env);
  const account = await registration.json();
  assert.ok(account.ok);
  // a populated hall makes the leaderboard screens render their real rows
  const names = ['emberwarden', 'flamekeeper', 'towerforge', 'nightwatch', 'ashranger'];
  const rows = names.map((u, i) => ({ u, v: 90 - i * 7 }));
  for (const board of ['win:easy', 'win:intermediate', 'win:hard', 'win:expert',
    'win:nightmare', 'win:pvp', 'gold', 'level', 'endless'])
    values.set('lb:' + board, JSON.stringify(board === 'endless'
      ? [{ u: 'ui_tester', v: 268 }, ...rows] : [{ u: 'ui_tester', v: 41 }, ...rows]));
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
  const AUDIT = `(() => {
    const HUD = ['#hudTop','#towerbar','#bossbar','#mpBar','#mpRoster','#mmWrap','#sidepanel','#toasts'];
    const shown = [...document.querySelectorAll('.overlay.show, #bootScreen:not(.gone), #cmdBar.show')];
    const info = document.getElementById('twrInfo');
    const scope = shown.length ? shown
      : (info.classList.contains('show') ? [info] : HUD.map(h => document.querySelector(h)));
    const buried = el => { for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/hidden|auto|scroll/.test(s.overflowX + ' ' + s.overflowY)) return true; }
      return false };
    const hasOwnText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const clipped = [], outside = [];
    for (const root of scope) {
      if (!root || !root.getBoundingClientRect().width) continue;
      for (const el of root.querySelectorAll('button,h1,h2,h3,h4,p,small,strong,span,div,label,input')) {
        const r = el.getBoundingClientRect(), s = getComputedStyle(el);
        if (!r.width || !r.height || s.visibility === 'hidden' || s.opacity === '0') continue;
        // Only text-bearing boxes count: a container can also grow its scroll
        // width from a decorative ::before that is meant to bleed past its edge.
        if (hasOwnText(el) && el.scrollWidth > el.clientWidth + 1 && s.overflow !== 'hidden' &&
            s.textOverflow !== 'ellipsis' && !el.className.includes('lbTabs'))
          clipped.push((el.id || el.className || el.tagName) + ' ' + el.scrollWidth + '>' + el.clientWidth +
            ' widest-child:' + (() => {
              let w = null, r = -1;
              for (const c of el.children) { const x = c.getBoundingClientRect().right; if (x > r) { r = x; w = c; } }
              return w ? (w.id || w.className || w.tagName) + ' @' + Math.round(r) : '-';
            })());
        if (hasOwnText(el) && !buried(el) &&
            (r.right > innerWidth + 2 || r.left < -2 || r.bottom > innerHeight + 2 || r.top < -2))
          outside.push((el.id || el.className || el.tagName) + ' ' + JSON.stringify(
            { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }));
      }
    }
    const chip = document.getElementById('cloudChip');
    return { clipped: [...new Set(clipped)].slice(0, 6), outside: [...new Set(outside)].slice(0, 6),
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      // The chip floats in the bottom-right corner. A full-screen menu owns that
      // corner and scrolls beneath it, so the chip has to be gone while one is
      // up — except the main menu, where it is docked into the profile bar, and
      // the command bar, which sits at the top.
      chipStrays: !!(chip && chip.getBoundingClientRect().width)
        && !!document.querySelector('.overlay.show:not(#mainMenu), #bootScreen:not(.gone)'),
      // A command row that runs past its own box is clipped by the panel rather
      // than by a text box, so the audit above cannot see it.
      rowOverflow: [...document.querySelectorAll('.cmdItem')]
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => el.textContent.trim().slice(0, 40)).slice(0, 4),
      // Every screen arrives with the shared rise, and every padlock is the same
      // masked shape rather than a box that collapsed. Both are properties of the
      // system, so a screen that skips them is a regression, not a one-off.
      still: shown.map(s => { const sh = s.querySelector('.menu');
          return sh && getComputedStyle(sh).animationName === 'none' ? s.id : null; })
        .filter(Boolean),
      locks: [...document.querySelectorAll('.icLock')]
        .filter(el => el.getClientRects().length)
        .filter(el => { const s = getComputedStyle(el);
          // offset sizes, not the rect: the rect carries the window fit, so a
          // padlock would look "collapsed" below the size it was drawn for even
          // though it is only scaled. The mask check is the part that matters.
          return el.offsetWidth < 4 || el.offsetHeight < 5 ||
            !(s.maskImage + ' ' + s.webkitMaskImage).includes('url('); })
        .map(el => el.closest('.overlay, .panel, .btn, .chipTag')
          ? (el.closest('[id]') || {}).id || 'loose' : 'loose').slice(0, 4) };
  })()`;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    // Playwright resolves setViewportSize before the page has dispatched resize,
    // so anything that measures the window fit has to let the listener run first:
    // resize is delivered before the next frame, and one more frame lets #uiRoot
    // reflow at its new size.
    const setWindow = async (width, height) => {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise(r =>
        requestAnimationFrame(() => requestAnimationFrame(r))));
    };
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      const cors = { 'Access-Control-Allow-Origin': '*' };
      // Multiplayer state lives in Durable Objects, which the in-memory test env
      // has no binding for — answer the MP ops locally so the screens under test
      // get their real client path instead of a poll that rejects.
      if (url.pathname.startsWith('/api/mp/')) {
        const rooms = [{ code: 'AB4QZ', name: 'EMBER STRONGHOLD', host: 'ember_fox', players: 1,
            mode: 'pvp', hasPassword: true },
          { code: 'K9TZX', name: 'Open Skirmish', host: 'towerforge', players: 1,
            mode: 'pvp', hasPassword: false }];
        const body = req.postDataJSON() || {};
        const reply = url.pathname === '/api/mp/list' ? { ok: true, rooms }
          : url.pathname === '/api/mp/create' ? { ok: true, lobby: { code: 'AB4QZ',
              name: 'EMBER STRONGHOLD', host: 'ui_tester', mode: 'pvp', status: 'lobby',
              players: [{ user: 'ui_tester', role: 'developer', seen: 1 }] } }
          : { ok: true, gone: body.op === 'leave' };
        return route.fulfill({ status: 200, contentType: 'application/json', headers: cors,
          body: JSON.stringify(reply) });
      }
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
      localStorage.setItem('tdv_cloud_user', 'ui_tester');
      window.close = () => {};
    }, { token: account.token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready && document.getElementById('bootScreen').classList.contains('gone'));
    await page.evaluate(() => document.fonts.ready);

    let shots = 0;
    for (const { w: width, h: height, tag, only } of SIZES) {
      await setWindow(width, height);
      let audited = 0;
      for (const [name, open] of SCREENS) {
        if (only && !only.includes(name)) continue;
        audited++; shots++;
        await page.evaluate(() => { hideScreens(); MP.active = false; MP.inMatch = false; MP.lob = null;
          G.mp = null;                             // updateHUD stops routing to MP.hud
          if (window.ADMIN) ADMIN.close();
          Cloud.role = null;
          document.getElementById('pwPrompt').classList.remove('show');
          document.getElementById('mpBar').style.display = 'none';
          document.getElementById('mpRoster').style.display = 'none';
          const b = document.getElementById('bootScreen'); b.classList.add('gone'); b.style.opacity = '';
          document.getElementById('bootPrompt').style.display = 'none';
          document.getElementById('cloudGate').classList.remove('show');
          document.getElementById('twrInfo').classList.remove('show');
          // the chip only appears for a few seconds after a sync, so hold it up
          // for the whole pass — otherwise the stray-corner check below is vacuous
          Cloud.chip('idle', 'SYNCED');
          clearToasts(); });
        await page.evaluate(open);
        // entrance animations are transient overflow (the end title alone starts at
        // scale 1.4 with +16px tracking), so settle them before measuring or shooting
        await page.evaluate(() => {
          for (const a of document.getAnimations()) {
            try {
              if (a.effect && a.effect.getComputedTiming().iterations === Infinity) continue;
              a.finish();
            } catch (e) {}
          }
        });
        // A result card is still counting when the shot would otherwise be
        // taken, and auditing "+0" hides a clip that only appears once the
        // real figure lands — so give those cards time to finish.
        const rolling = await page.evaluate(() =>
          document.querySelectorAll('[data-to]').length);
        await page.waitForTimeout(rolling ? 1900 : 120);
        const report = await page.evaluate(AUDIT);
        assert.deepEqual(report.clipped, [], name + ' @' + tag + ' clips text: ' + JSON.stringify(report));
        assert.deepEqual(report.outside, [], name + ' @' + tag + ' escapes the viewport: ' + JSON.stringify(report));
        assert.equal(report.pageOverflow, false, name + ' @' + tag + ' overflows the page horizontally');
        assert.equal(report.chipStrays, false, name + ' @' + tag + ' shows the cloud chip over the menu');
        assert.deepEqual(report.rowOverflow, [],
          name + ' @' + tag + ' command rows run past the panel: ' + JSON.stringify(report.rowOverflow));
        assert.deepEqual(report.still, [],
          name + ' @' + tag + ' shell has no arrival animation: ' + JSON.stringify(report.still));
        assert.deepEqual(report.locks, [],
          name + ' @' + tag + ' padlock is not the shared mask: ' + JSON.stringify(report.locks));
        await page.screenshot({ path: path.join(shotDir, name + '-' + tag + '.png') });
      }
      ok(tag + ': ' + audited + ' screens render inside the viewport with no clipped text');
    }
    // The audits above would also pass if the interface hid or dropped content to
    // squeeze in, so check the mechanism itself: one factor, tracked to the
    // window, with the layer still covering the viewport exactly.
    const PROBE = () => ({ z: +(+UI_Z).toFixed(4), fit: +uiFit().toFixed(4),
      root: Math.round(document.getElementById('uiRoot').getBoundingClientRect().width),
      vw: innerWidth });
    const fits = [];
    for (const [w, h] of [[1440, 900], [1200, 750], [1024, 640], [800, 480], [640, 360]]) {
      await setWindow(w, h);
      fits.push(await page.evaluate(PROBE));
    }
    assert.equal(fits[0].fit, 1,
      'the box the layout was authored for must not be scaled at its own size: ' + JSON.stringify(fits[0]));
    for (let i = 1; i < fits.length; i++)
      assert.ok(fits[i].z < fits[i - 1].z,
        'the UI does not shrink as the window does: ' + JSON.stringify(fits));
    for (const f of fits)
      assert.equal(f.root, f.vw,
        'the scaled layer no longer covers the viewport: ' + JSON.stringify(f));
    // Settings -> UI scale is a bias on that fit rather than the size itself
    await setWindow(1440, 900);
    const biased = await page.evaluate(() => {
      SV.uiScale = 1.3; uiScaleApply();
      // read both before the bias goes back — uiScaleApply overwrites UI_Z, and
      // measuring after the reset would report the neutral scale whatever it did
      const z = +(+UI_Z).toFixed(2);
      const root = Math.round(document.getElementById('uiRoot').getBoundingClientRect().width);
      SV.uiScale = 1; uiScaleApply();
      return { z, root, vw: innerWidth };
    });
    assert.equal(biased.z, 1.3, 'the UI scale setting does not bias the window fit');
    assert.equal(biased.root, biased.vw, 'a bias above 1 pushes the layer past the viewport');
    assert.equal(await page.evaluate(() => document.getElementById('setScaleV').textContent),
      '1.00×', 'the settings row does not report the scale that actually lands');
    ok('Window size drives one scale factor, and the setting biases it');

    // Two layers are positioned from a pointer event rather than by the
    // stylesheet, so they are the only surfaces the fit can put in the wrong
    // place without a layout audit noticing: the lobby right-click menu and the
    // upgrade hover tip. Both have to land on the cursor at a fitted size, where
    // the offset is scale*z rather than the raw number the code adds.
    for (const [w, h, label] of [[1440, 900, 'desktop'], [800, 480, 'fitted']]) {
      await setWindow(w, h);
      const placed = await page.evaluate(() => {
        const out = {};
        hideScreens();
        MP.showLobby({ code: 'AB4QZ', host: 'ember_fox', status: 'lobby', players: [
          { user: 'ui_tester', role: 'tester', seen: 2 },
          { user: 'ember_fox', role: 'developer', seen: 4 }] });
        // only the host's row carries the menu, and only when it is someone else
        const row = document.querySelector('#mpPlayers .mpPlayer.isHost');
        const rr = row.getBoundingClientRect();
        out.rowW = Math.round(rr.width);
        out.at = { x: Math.round(rr.left + 24), y: Math.round(rr.top + 8) };
        row.dispatchEvent(new MouseEvent('contextmenu',
          { bubbles: true, cancelable: true, clientX: out.at.x, clientY: out.at.y }));
        const cr = $('mpCtx').getBoundingClientRect();
        out.ctx = { l: Math.round(cr.left), t: Math.round(cr.top) };
        MP.closeCtx();

        // the tip on a cell the game itself built, in a real match, rather than a
        // node the test invented: a row with no layout measures 0 tall and proves
        // nothing about where the tip lands
        toMenu(); startGame('endless'); G.cash = 9999;
        const t = placeTower('ranger', 5.5, 2.5); t.ups = [1, 0]; t.S = towerStats(t);
        selectTower(t); updateHUD();
        const cell = document.querySelector('#spLanes .up[data-fx]');
        const fr = cell.getBoundingClientRect();
        out.cellW = Math.round(fr.width);
        out.tip = { x: Math.round(fr.left + 20), y: Math.round(fr.top + 6) };
        cell.dispatchEvent(new MouseEvent('pointerover',
          { bubbles: true, clientX: out.tip.x, clientY: out.tip.y }));
        const tr = uptip.getBoundingClientRect();
        out.tipRect = { l: tr.left, t: tr.top, r: tr.right, b: tr.bottom,
          shown: getComputedStyle(uptip).display };
        uptip.style.display = 'none';
        out.z = +UI_Z.toFixed(3);
        toMenu();
        return out;
      });
      const z = placed.z, near = (a, b) => Math.abs(a - b) <= 2;
      // both targets have to be real boxes first, or the checks below would pass
      // on a zero-sized element parked at the origin
      assert.ok(placed.rowW > 60 && placed.cellW > 40,
        label + ': nothing real to click or hover: ' + JSON.stringify(placed));
      assert.ok(near(placed.ctx.l, placed.at.x) && near(placed.ctx.t, placed.at.y),
        label + ': the lobby menu is not under the cursor: ' + JSON.stringify(placed));
      assert.equal(placed.tipRect.shown, 'block', label + ': the upgrade tip never appeared');
      assert.ok(placed.tipRect.r - placed.tipRect.l > 40,
        label + ': the upgrade tip rendered empty: ' + JSON.stringify(placed));
      // The tip flips to the other side of the cursor when it would run past an
      // edge, so either placement is correct — what must never happen is the gap
      // scaling with the window instead of staying 16 screen px wide.
      assert.ok(near(placed.tipRect.l, placed.tip.x + 16 * z) ||
        near(placed.tipRect.r, placed.tip.x - 16 * z),
        label + ': the upgrade tip is not anchored to the cursor: ' + JSON.stringify(placed));
      assert.ok(near(placed.tipRect.b, placed.tip.y - 12 * z) ||
        near(placed.tipRect.t, placed.tip.y + 18 * z),
        label + ': the upgrade tip floats off the cursor vertically: ' + JSON.stringify(placed));
      ok(label + ': the pointer-positioned layers land on the cursor at scale ' + z);
    }
    assert.deepEqual(errors, []);
    ok('No browser runtime errors across any screen');
    await context.close();
    console.log('ALL ' + passed + ' UI CHECKS PASSED (' + shots + ' screenshots in outputs/ui)');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
