// Interaction regression tests: the shop, the tower panel and the in-match click
// paths. The other suites draw every screen and check the maths, but they buy and
// upgrade through internal calls, so a card whose BUY button stopped responding,
// a stat row left over from the previous tower, or a minimap whose click mapping
// drifted by a tile all sail through. Here every action is a real mouse click on
// the element a player would click. Isolated worker with in-memory KV; production
// untouched.
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
    async get(key) { return values.get(key) ?? null },
    async put(key, value) { values.set(key, String(value)) },
    async delete(key) { values.delete(key) }
  } };
  const registration = await worker.fetch(new Request('https://tdv.test/api/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'shop_tester', password: 'isolated-shop-check-only' })
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
  // A canvas that painted nothing is a silently broken sprite, not an error.
  const blank = cv => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
    return true;
  };
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
      localStorage.setItem('tdv_cloud_user', 'shop_tester');
      window.close = () => {};
    }, { token: account.token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready &&
      document.getElementById('bootScreen').classList.contains('gone'));

    // ---- 1. the shop grid is complete, every card is painted, nothing is BUY ----
    await page.evaluate(() => {
      SV.gold = 400000; SV.xp = 0; SV.owned = ['ranger']; SV.loadout = ['ranger'];
      Save.save();
    });
    await page.locator('#btnShop').click();
    const grid = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#shopGrid .shopCard')];
      const listed = Object.keys(TOWERS).filter(id => !TOWERS[id].prestige && !TOWERS[id].adminOnly);
      const menu = document.getElementById('shopMenu');
      return {
        cards: cards.length, listed: listed.length,
        missing: listed.filter(id => !cards.some(c => c.dataset.tower === id)),
        untagged: cards.filter(c => !c.dataset.tower).length,
        ownedRanger: (cards.find(c => c.dataset.tower === 'ranger') || {})
          .textContent,
        blank: cards.filter(c => {
          const cv = c.querySelector('canvas');
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
          return true;
        }).map(c => c.dataset.tower),
        buyable: cards.filter(c => !c.querySelector('.btn').disabled).length,
        gold: document.getElementById('shopGold').textContent,
        junk: /undefined|NaN|\[object/.test(menu.textContent)
      };
    });
    assert.equal(grid.cards, grid.listed, 'a tower is missing from the shop: ' + grid.missing.join(','));
    assert.equal(grid.untagged, 0, 'every card needs data-tower for the state repaint');
    assert.match(grid.ownedRanger || '', /OWNED/, 'the owned ranger card should read OWNED');
    assert.deepEqual(grid.blank, [], 'these shop thumbnails painted nothing');
    assert.ok(grid.buyable > 0, 'nothing in the shop can be bought');
    assert.equal(grid.gold, '400,000', 'the wallet on screen is the save gold');
    assert.equal(grid.junk, false, 'the shop prints undefined/NaN somewhere');
    ok('The shop lists every buyable tower, paints every sprite and holds no undefined');

    // ---- 2. clicking BUY really buys ----
    const buy = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#shopGrid .shopCard')]
        .find(c => !c.querySelector('.btn').disabled &&
          !['ranger', 'village', 'farm'].includes(c.dataset.tower));
      const id = card.dataset.tower;
      window.__buy = { id: id, price: TOWERS[id].price, gold: SV.gold,
        owned: SV.owned.length, loadout: SV.loadout.length,
        top: document.getElementById('shopMenu').scrollTop };
      return window.__buy;
    });
    await page.locator('#shopGrid .shopCard')
      .filter({ has: page.locator('.btn:not([disabled])') }).first().locator('.btn').click();
    const afterBuy = await page.evaluate(b => ({
      id: b.id, gold: SV.gold, owned: SV.owned.includes(b.id),
      equipped: SV.loadout.includes(b.id),
      cardText: [...document.querySelectorAll('#shopGrid .shopCard')]
        .find(c => c.dataset.tower === b.id).textContent,
      wallet: document.getElementById('shopGold').textContent,
      top: document.getElementById('shopMenu').scrollTop,
      toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')
    }), buy);
    assert.equal(afterBuy.owned, true, 'BUY did not add ' + buy.id + ' to the account');
    assert.equal(afterBuy.gold, buy.gold - buy.price,
      'charged ' + (buy.gold - afterBuy.gold) + ' for a ' + buy.price + ' tower');
    assert.equal(afterBuy.wallet, (buy.gold - buy.price).toLocaleString('en-US'),
      'the wallet on screen did not follow the spend');
    assert.match(afterBuy.cardText, /OWNED/, 'the card still offers BUY after the purchase');
    assert.equal(afterBuy.top, buy.top, 'buying scrolled the shop grid out from under the player');
    assert.ok(/unlocked/i.test(afterBuy.toast), 'no unlock toast: ' + afterBuy.toast);
    ok('BUY charges the printed price, flips the card to OWNED and keeps the scroll');

    // ---- 3. prestige cards gate on level, then on the base tower, then on gold ----
    const prestige = await page.evaluate(() => {
      const out = [];
      for (const c of document.querySelectorAll('#prestigeGrid .shopCard')) {
        const btn = c.querySelector('.btn');
        out.push({ base: c.dataset.base, id: btn.textContent.trim(),
          locked: c.classList.contains('locked'), waiting: c.classList.contains('waiting'),
          disabled: btn.disabled });
      }
      return out;
    });
    assert.ok(prestige.length >= 1, 'the prestige section is empty');
    assert.ok(prestige.every(p => p.locked || p.waiting || !p.disabled),
      'a prestige card is neither gated nor buyable');
    assert.ok(prestige.some(p => p.locked || /LVL/.test(p.id)),
      'no prestige entry shows its level gate at level 1');
    // make one buyable: own the base, be rich enough
    const preBuy = await page.evaluate(() => {
      const base = Object.keys(PRESTIGE)[0], p = PRESTIGE[base];
      if (!SV.owned.includes(base)) SV.owned.push(base);
      SV.gold = 1e7; SV.xp = 999999; Save.save(); syncShop();
      const card = [...document.querySelectorAll('#prestigeGrid .shopCard')]
        .find(c => c.dataset.base === base);
      return { base: base, id: p.id, gold: p.gold, before: SV.gold,
        text: card.querySelector('.btn').textContent.trim(),
        disabled: card.querySelector('.btn').disabled };
    });
    assert.equal(preBuy.disabled, false, preBuy.base + ' should be buyable now: ' + preBuy.text);
    await page.locator('#prestigeGrid .shopCard')
      .filter({ has: page.locator('.btn:not([disabled])') }).first().locator('.btn').click();
    const afterPre = await page.evaluate(p => ({
      owned: SV.owned.includes(p.id), gold: SV.gold,
      text: [...document.querySelectorAll('#prestigeGrid .shopCard')]
        .find(c => c.dataset.base === p.base).querySelector('.btn').textContent.trim()
    }), preBuy);
    assert.equal(afterPre.owned, true, 'the PRESTIGE button did not buy ' + preBuy.id);
    assert.equal(afterPre.gold, preBuy.before - preBuy.gold, 'wrong prestige charge');
    assert.match(afterPre.text, /PRESTIGED/, 'the prestige card still offers a buy: ' + afterPre.text);
    ok('Prestige cards gate on level and base, then charge the printed gold');

    // ---- 4. clicking a card body opens the info panel, and it says real numbers --
    await page.locator('#shopGrid .shopCard').nth(2).locator('.t').click();
    const info = await page.evaluate(() => ({
      shown: document.getElementById('twrInfo').classList.contains('show'),
      rows: [...document.querySelectorAll('#tiStats .statrow')]
        .map(r => r.textContent),
      junk: /undefined|NaN|\[object/.test(document.getElementById('twrInfo').textContent)
    }));
    assert.equal(info.shown, true, 'the card body did not open the info panel');
    assert.equal(info.rows.length >= 2, true, 'the info panel has no stats: ' + info.rows.join('/'));
    assert.equal(info.junk, false, 'the info panel prints undefined/NaN: ' + info.rows.join(' | '));
    await page.locator('#tiClose').click();
    assert.equal(await page.evaluate(() =>
      document.getElementById('twrInfo').classList.contains('show')), false,
      'the info panel did not close');
    // every listing, not just the one clicked: a shared row builder that reads a
    // field one tower type does not have prints "undefined" straight onto the card
    const infoAll = await page.evaluate(() => {
      const bad = [];
      for (const id of Object.keys(TOWERS)) {
        showTowerInfo(id);
        const t = document.getElementById('twrInfo').textContent;
        if (!document.getElementById('twrInfo').classList.contains('show'))
          bad.push(id + ': never opened');
        else if (/undefined|NaN|\[object/.test(t)) bad.push(id + ': ' + t.slice(0, 140));
        else if (document.querySelectorAll('#tiStats .statrow').length < 2) bad.push(id + ': no rows');
        $('tiClose').click();
      }
      return { count: Object.keys(TOWERS).length, bad: bad };
    });
    assert.deepEqual(infoAll.bad, [], 'these shop listings mis-report their stats:\n' +
      infoAll.bad.join('\n'));
    ok('Card body opens the info panel and all ' + infoAll.count + ' listings hold real values');

    // ---- 5. the in-match loop: hotbar click, place by clicking the map --------
    await page.locator('#shopBack').click();
    const place = await page.evaluate(() => {
      toMenu(); hideScreens(); SV.loadout = ['ranger']; startGame('easy');
      const slot = document.querySelector('.twr-slot');
      return { slots: document.querySelectorAll('.twr-slot').length,
        first: slot && slot.dataset.type, cost: TOWERS.ranger.cost, cash: G.cash };
    });
    assert.equal(place.first, 'ranger', 'the hotbar did not carry the loadout');
    assert.ok(place.slots >= 6, 'the hotbar frame should never shrink below six slots');
    await page.locator('#towerbar .twr-slot').first().click();
    assert.equal(await page.evaluate(() => G.placeType), 'ranger',
      'clicking a hotbar slot did not arm placement');
    // find a buildable tile that is on screen right now
    const spot = await page.evaluate(() => {
      const cw = canvas.width / dpr, ch = canvas.height / dpr;
      for (let ty = 4; ty < GH - 4; ty++) for (let tx = 4; tx < GW - 4; tx++) {
        const x = tx + .5, y = ty + .5;
        if (!canPlaceAt(x, y)) continue;
        const sx = (mapPx(x, y) - cam.x) * cam.zoom + cw / 2;
        const sy = (mapPy(x, y) - cam.y) * cam.zoom + ch / 2;
        if (sx < 120 || sy < 140 || sx > cw - 340 || sy > ch - 140) continue;
        return { x: x, y: y, sx: sx, sy: sy };
      }
      return null;
    });
    assert.ok(spot, 'no buildable tile inside the viewport to click');
    const before = await page.evaluate(() => G.cash);
    await page.mouse.click(Math.round(spot.sx), Math.round(spot.sy));
    const placed = await page.evaluate(() => ({
      n: towers.length, cash: G.cash, type: towers[0] && towers[0].type,
      placeType: G.placeType
    }));
    assert.equal(placed.n, 1, 'clicking the map did not place a tower');
    assert.equal(placed.cash, before - place.cost, 'charged the wrong amount to build');
    ok('A hotbar click plus a map click builds the tower and debits the purse');

    // ---- 6. upgrading by clicking the lane cell ----
    await page.evaluate(() => { G.placeType = null; updTowerbar() });
    await page.mouse.click(Math.round(spot.sx), Math.round(spot.sy));   // select it
    const open = await page.evaluate(() => ({
      shown: document.getElementById('sidepanel').classList.contains('show'),
      sel: G.sel && G.sel.type,
      cells: [...document.querySelectorAll('#spLanes .up')].length,
      next: !!document.querySelector('#spLanes .up.next'),
      dmg: G.sel && G.sel.S.dmg
    }));
    assert.equal(open.shown, true, 'clicking a placed tower did not open the panel');
    assert.ok(open.cells > 0, 'the panel shows no upgrade cells');
    assert.equal(open.next, true, 'nothing is offered as the next upgrade');
    const cell = await page.evaluate(() => {
      const el = document.querySelector('#spLanes .up.next');
      return { l: +el.dataset.l, price: +el.querySelector('.c').dataset.p,
        cash: G.cash, dmg: G.sel.S.dmg, ups: (upsOf(G.sel) || []).join(','),
        lv: document.getElementById('spLv').textContent };
    });
    await page.locator('#spLanes .up.next').first().click();
    const up = await page.evaluate(c => {
      const t = G.sel;
      return { cash: G.cash, ups: upsOf(t).join(','), dmg: t.S.dmg,
        lv: document.getElementById('spLv').textContent,
        rows: [...document.querySelectorAll('#spStats .statrow')].map(r => r.textContent),
        lanes: [...document.querySelectorAll('#spLanes .up.done')].length,
        selS: !!t.S }
    }, cell);
    assert.equal(Number(up.ups.split(',')[cell.l]), parseInt(cell.ups.split(',')[cell.l]) + 1,
      'the lane did not level up');
    assert.equal(up.cash, cell.cash - cell.price,
      'upgrade charged ' + (cell.cash - up.cash) + ' but the cell printed $' + cell.price);
    assert.notEqual(up.dmg, cell.dmg, 'the cached stats never revalidated after the buy');
    assert.match(up.lv, /Upgrades 1 \//, 'the panel header still says ' + cell.lv);
    assert.equal(up.lanes, 1, 'the bought cell did not turn to done');
    assert.ok(up.rows.some(r => /Damage/.test(r)), 'the stat rows vanished: ' + up.rows.join('/'));
    ok('Clicking an upgrade cell charges the printed price and repaints the panel');

    // ---- 7. switching towers must not leave the previous tower's rows behind --
    const swap = await page.evaluate(() => {
      const G0 = () => document.querySelectorAll('#spStats .statrow').length;
      const many = placeTower('viper', 8.5, 8.5) || placeTower('ranger', 8.5, 8.5);
      const few = placeTower('farm', 10.5, 8.5) || placeTower('village', 10.5, 8.5);
      selectTower(many);
      const wideRows = statRows(many), wideDom = G0();
      selectTower(few);
      const thinRows = statRows(few), thinDom = G0();
      const txt = [...document.querySelectorAll('#spStats .statrow')].map(r => r.textContent);
      selectTower(many);
      const backDom = G0();
      return { wideRows: wideRows.length, wideDom: wideDom, thinRows: thinRows.length,
        thinDom: thinDom, backDom: backDom, txt: txt,
        few: few.type, many: many.type };
    });
    assert.equal(swap.wideDom, swap.wideRows,
      swap.many + ' panel has ' + swap.wideDom + ' rows in the DOM but ' +
      swap.wideRows + ' in the model');
    assert.equal(swap.thinDom, swap.thinRows,
      'selecting ' + swap.few + ' after ' + swap.many + ' left ' +
      (swap.thinDom - swap.thinRows) + ' stale row(s) in the panel');
    assert.equal(swap.backDom, swap.wideRows,
      'going back to the wide tower should rebuild ' + swap.wideRows + ' rows, saw ' + swap.backDom);
    assert.ok(!swap.txt.some(t => /Clustershots|Pierce|Ignores/.test(t)),
      'the farm panel still lists combat rows: ' + swap.txt.join(' | '));
    ok('The stat panel repaints exactly the selected tower rows');

    // ---- 7b. every tower in the game, opened in the panel, says real numbers --
    const sweep = await page.evaluate(() => {
      const spots = [];
      for (let ty = 4; ty < GH - 4; ty++) for (let tx = 4; tx < GW - 4; tx++)
        if (canPlaceAt(tx + .5, ty + .5)) spots.push({ x: tx + .5, y: ty + .5 });
      const bad = [];
      G.cash = 1e7;
      for (const id of Object.keys(TOWERS)) {
        towers.length = 0;
        const s = spots[bad.length % spots.length];
        const t = placeTower(id, s.x, s.y);
        if (!t) { bad.push({ id: id, why: 'would not place' }); continue }
        selectTower(t);
        const box = document.getElementById('spStats');
        const dom = box.querySelectorAll('.statrow').length, want = statRows(t).length;
        const all = document.getElementById('sidepanel').textContent;
        const cells = document.querySelectorAll('#spLanes .up').length;
        const wantCells = TOWERS[id].ups.reduce((n, u) => n + u.length, 0);
        if (dom !== want) bad.push({ id: id, why: dom + ' rows in the DOM, ' + want + ' in the model' });
        if (/undefined|NaN|\[object/.test(all))
          bad.push({ id: id, why: 'panel text: ' + all.slice(0, 120) });
        if (cells !== wantCells)
          bad.push({ id: id, why: cells + ' upgrade cells, expected ' + wantCells });
        // and one upgrade each, which has to repaint without lying
        if (buyUp(t, 0)) {
          const lv = document.getElementById('spLv').textContent;
          if (!/Upgrades 1 \//.test(lv)) bad.push({ id: id, why: 'after an upgrade: ' + lv });
          if (box.querySelectorAll('.statrow').length !== statRows(t).length)
            bad.push({ id: id, why: 'the row count drifted after buying an upgrade' });
        } else if (TOWERS[id].lanes && TOWERS[id].ups[0].length)
          bad.push({ id: id, why: 'the first upgrade was refused with $1e7 in hand' });
      }
      selectTower(null);
      return { types: Object.keys(TOWERS).length, bad: bad };
    });
    assert.deepEqual(sweep.bad, [], 'these towers break the panel:\n' +
      sweep.bad.map(b => b.id + ': ' + b.why).join('\n'));
    ok('All ' + sweep.types + ' tower types open, upgrade and repaint cleanly');

    // ---- 8. a Toxic/Cure flip patches rows without rebuilding the panel ------
    const flip = await page.evaluate(() => {
      const t = placeTower('viper', 12.5, 8.5) || G.sel;
      selectTower(t);
      const cv = document.querySelector('#spTitle canvas');
      window.__cv = cv;
      t.toxicT = 6; t.cureT = 6; t.S = towerStats(t);
      refreshPanelAfford();
      const on = {
        same: document.querySelector('#spTitle canvas') === window.__cv,
        rows: [...document.querySelectorAll('#spStats .statrow')].map(r => r.textContent),
        want: statRows(t).length, dom: document.querySelectorAll('#spStats .statrow').length,
        lanes: document.querySelectorAll('#spLanes .up').length
      };
      t.toxicT = 0; t.cureT = 0; t.S = towerStats(t); t.toxicT = 0;
      refreshPanelAfford();
      const off = {
        same: document.querySelector('#spTitle canvas') === window.__cv,
        rows: [...document.querySelectorAll('#spStats .statrow')].map(r => r.textContent),
        want: statRows(t).length, dom: document.querySelectorAll('#spStats .statrow').length
      };
      return { on: on, off: off, type: t.type };
    });
    assert.ok(flip.on.same && flip.on.same, 'the buff flip rebuilt the sprite canvas');
    assert.ok(flip.on.rows.some(r => /Toxic/.test(r)) && flip.on.rows.some(r => /Cure/.test(r)),
      'the Toxic/Cure rows never appeared: ' + flip.on.rows.join(' | '));
    assert.equal(flip.on.dom, flip.on.want, 'too many rows while buffed');
    assert.ok(!flip.off.rows.some(r => /Toxic|Cure/.test(r)),
      'a row survived the buff expiring: ' + flip.off.rows.join(' | '));
    assert.equal(flip.off.dom, flip.off.want, 'rows were not trimmed when the buff lapsed');
    ok('Toxic and Cure patch their own rows and leave the rest of the panel alone');

    // ---- 9. the minimap click maps to the tile it shows ---------------------
    const mm = await page.evaluate(() => {
      const r = document.getElementById('minimap').getBoundingClientRect();
      return { left: r.left, top: r.top, w: r.width, h: r.height,
        ox: MM_OX, sx: MM_SX, tx: cam.tx, ty: cam.ty, blank: (() => {
          const c = document.querySelector('#minimap');
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
          return true;
        })() };
    });
    assert.equal(mm.blank, false, 'the minimap painted nothing at all');
    const fx = 0.46, fy = 0.52;
    await page.mouse.click(mm.left + mm.w * fx, mm.top + mm.h * fy);
    const jumped = await page.evaluate(f => {
      const gx = f.x * GW - MM_OX, gy = f.y * GH;
      drawMinimap();
      return { tx: cam.tx, ty: cam.ty, wantX: mapPx(gx, gy), wantY: mapPy(gx, gy) };
    }, { x: fx, y: fy });
    assert.ok(Math.abs(jumped.tx - jumped.wantX) < 3 && Math.abs(jumped.ty - jumped.wantY) < 3,
      'the minimap click landed at (' + jumped.tx.toFixed(1) + ',' + jumped.ty.toFixed(1) +
      ') instead of (' + jumped.wantX.toFixed(1) + ',' + jumped.wantY.toFixed(1) + ')');
    ok('Clicking the minimap centres the camera on the point that was clicked');

    // ---- 10. zoom stays inside its bounds and a blur releases held keys ------
    await page.locator('#game').hover();
    for (let i = 0; i < 14; i++) await page.mouse.wheel(0, -120);
    const lim = await page.evaluate(() => ({ min: ZOOM_MIN, max: ZOOM_MAX }));
    const zin = await page.evaluate(() => ({ z: cam.zoom, tz: cam.tz }));
    assert.ok(zin.z <= lim.max + 1e-9 && zin.tz <= lim.max + 1e-9,
      'zoomed past the ceiling: ' + JSON.stringify(zin) + ' vs ' + lim.max);
    for (let i = 0; i < 28; i++) await page.mouse.wheel(0, 120);
    const zin2 = await page.evaluate(() => ({ z: cam.zoom, tz: cam.tz }));
    assert.ok(zin2.tz >= lim.min - 1e-9 && zin2.z >= lim.min - 1e-9,
      'zoomed under the floor: ' + JSON.stringify(zin2) + ' vs ' + lim.min);
    await page.keyboard.down('w');
    await page.evaluate(() => { keys['w'] = true });
    const held = await page.evaluate(() => ({ w: keys['w'], ty: cam.ty }));
    assert.equal(held.w, true, 'the key never registered');
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    const cleared = await page.evaluate(() => ({ w: keys['w'], other: keys['a'] }));
    assert.equal(cleared.w, false, 'a held key survived the window blur — the camera would keep panning');
    await page.keyboard.up('w');
    ok('Wheel zoom is clamped and losing focus drops every held key');

    // ---- 11. culling the draw list must not cull the simulation --------------
    const off = await page.evaluate(() => {
      G.placeType = null; updTowerbar();
      towers.length = 0; enemies.length = 0; projs.length = 0;
      const t = placeTower('ranger', 5.5, 5.5);
      const e = spawnEnemy('walker', 5, 0);
      e.px = t.x + 1.2; e.py = t.y + 1.2;
      const m = worldToMap(e.px, e.py); e.sx = m.x; e.sy = m.y;
      // park the camera on the far corner so both are outside the visible box
      const corner = worldToMap(GW - 1.5, GH - 1.5);
      cam.x = cam.tx = corner.x; cam.y = cam.ty = corner.y; cam.zoom = cam.tz = 1;
      const hp0 = e.hp, d0 = e.d;
      for (let i = 0; i < 240; i++) {
        updTower(t, 1 / 60); updEnemy(e, 1 / 60); updProjs(1 / 60);
        if (e.dead) break;
      }
      render();
      return { hp0: hp0, hp: e.hp, d0: d0, d: e.d, shot: t.target && !t.target.dead,
        type: t.type };
    });
    assert.ok(off.hp < off.hp0, 'an off-screen tower stopped shooting — culling reached the sim');
    assert.ok(off.d > off.d0, 'an off-screen enemy stopped walking');
    ok('Off-screen towers and enemies are skipped by the draw pass only, not the sim');

    // ---- 12. selling returns the invested share and frees the panel ----------
    const sell = await page.evaluate(() => {
      cam.x = cam.tx = TERR_W / 2; cam.y = cam.ty = TERR_H / 2;
      towers.length = 0;
      const t = placeTower('ranger', 7.5, 7.5);
      buyUp(t, 0);
      selectTower(t);
      return { invested: t.invested, label: document.getElementById('sellBtn').textContent,
        want: Math.floor(t.invested * .7), cash: G.cash, n: towers.length };
    });
    assert.match(sell.label, new RegExp('Sell for \\$' + sell.want),
      'the sell button reads ' + sell.label + ' for ' + sell.invested + ' invested');
    await page.locator('#sellBtn').click();
    const gone = await page.evaluate(() => ({
      n: towers.length, cash: G.cash,
      shown: document.getElementById('sidepanel').classList.contains('show')
    }));
    assert.equal(gone.n, 0, 'the tower survived the sale');
    assert.equal(gone.cash, sell.cash + sell.want, 'the refund is wrong');
    assert.equal(gone.shown, false, 'the panel stayed open on a sold tower');
    ok('Sell refunds 70% of what was invested and closes the panel');

    // ---- 14. the in-match controls answer to clicks ----
    const ctl = await page.evaluate(() => {
      towers.length = 0; enemies.length = 0;
      G.cash = 1e7;
      const v = placeTower('viper', 9.5, 6.5);
      // the per-barrel priority only exists once Double Gunner is on the tower,
      // and that is the fourth step of the bottom path — which a lane only reaches
      // while the other path is still under three upgrades
      for (let i = 0; i < 5; i++) buyUp(v, 1);
      selectTower(v);
      return { selects: document.querySelectorAll('#spTargeting select').length,
        guns: v.S.guns, state: G.state, cells: document.querySelectorAll('#spLanes .up').length };
    });
    assert.ok(ctl.guns > 1, 'the VIPER never reached its dual-gun path: ' + ctl.guns);
    assert.equal(ctl.selects, 3, 'a dual-gun VIPER panel should carry three priority selects');
    assert.ok(ctl.cells > 0, 'the VIPER panel shows no upgrade cells');
    await page.locator('#spTargeting select[data-tgt="0"]').selectOption('weak');
    const mode = await page.evaluate(() => ({ gun: G.sel.gunMode[0],
      held: document.querySelector('#spTargeting select[data-tgt="0"]').value }));
    assert.equal(mode.gun, 'weak', 'the barrel override never reached the tower');
    assert.equal(mode.held, 'weak', 'the select lost its own value');
    const held2 = await page.evaluate(() => {
      refreshPanel();
      const s = document.querySelector('#spTargeting select[data-tgt="0"]');
      return { value: s.value, tgt: G.sel.tgtMode };
    });
    assert.equal(held2.value, 'weak', 'the barrel override did not survive a panel repaint');
    await page.locator('#spTargeting select[data-tgt="-1"]').selectOption('last');
    assert.equal(await page.evaluate(() => G.sel.tgtMode), 'last', 'the main priority never landed');
    await page.locator('#speedBtns .btn[data-spd="2"]').click();
    const spd = await page.evaluate(() => ({ speed: G.speed,
      lit: [...document.querySelectorAll('#speedBtns .btn.on')].map(b => b.dataset.spd).join('') }));
    assert.equal(spd.speed, 2, 'the 2x button did not change the match speed');
    assert.equal(spd.lit, '2', 'the speed strip lit the wrong button: ' + spd.lit);
    await page.locator('#pauseBtn').click();
    assert.equal(await page.evaluate(() => G.state), 'paused', 'the pause button did not pause');
    await page.evaluate(() => togglePause());
    assert.equal(await page.evaluate(() => G.state), 'playing', 'the match never came back');
    ok('Targeting selects, the speed strip and pause all work through their controls');

    // ---- 13. the TOWERS menu equips and unequips through its buttons ---------
    await page.evaluate(() => { toMenu(); SV.owned = ['ranger', 'village', 'farm'];
      SV.loadout = ['ranger']; Save.save(); refreshMenu(); });
    assert.ok(await page.locator('#mainMenu').isVisible(), 'returning to the menu shows no menu');
    await page.locator('#btnTowers').click();
    const inv = await page.evaluate(() => ({
      slots: document.querySelectorAll('#loadoutGrid .loSlot').length,
      filled: document.querySelectorAll('#loadoutGrid .loSlot.filled').length,
      rows: [...document.querySelectorAll('#invList .invRow')].map(r => r.textContent),
      junk: /undefined|NaN/.test(document.getElementById('invMenu').textContent)
    }));
    assert.equal(inv.slots, 6, 'the loadout grid should always show six slots');
    assert.equal(inv.filled, 1, 'only the equipped ranger should light a slot');
    assert.equal(inv.rows.length, 3, 'every owned tower should be listed');
    assert.equal(inv.junk, false, 'the TOWERS menu prints undefined/NaN');
    assert.ok(inv.rows.every(t => /EQUIP|UNEQUIP/.test(t)), 'a row has no equip button');
    await page.locator('#invList .invRow').first().locator('.btn').click();   // UNEQUIP
    const afterUn = await page.evaluate(() => ({ loadout: SV.loadout.slice(),
      filled: document.querySelectorAll('#loadoutGrid .loSlot.filled').length }));
    assert.deepEqual(afterUn.loadout, [], 'UNEQUIP left the tower in the loadout');
    assert.equal(afterUn.filled, 0, 'the loadout grid still shows it equipped');
    await page.locator('#invList .invRow').filter({ has: page.locator('.btn.gold') })
      .first().locator('.btn').click();                                        // EQUIP
    const afterEq = await page.evaluate(() => ({ loadout: SV.loadout.slice(),
      filled: document.querySelectorAll('#loadoutGrid .loSlot.filled').length }));
    assert.equal(afterEq.loadout.length, 1, 'EQUIP did not fill a slot');
    assert.equal(afterEq.filled, 1, 'the loadout grid did not light the new slot');
    await page.locator('#invBack').click();
    ok('The TOWERS menu lists six slots and equips and unequips with one click');

    await page.screenshot({ path: path.join(root, 'outputs', 'ui', 'interact-menu-desktop.png') });
    assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
    console.log('ALL ' + passed + ' INTERACTION CHECKS PASSED');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 });
