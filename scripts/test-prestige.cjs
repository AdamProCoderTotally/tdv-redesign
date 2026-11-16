// Regression tests for the tower PRESTIGE system (Gold Ranger, Gold Grenadier).
// The definitions are GENERATED from their base towers, so the checks are driven
// off the PRESTIGE registry rather than hardcoded per tower: a new prestige
// entry is covered the moment it is added. Pins the clone integrity (a field
// copied by hand once dropped the Grenadier's splash radius), the 3x-cost /
// 2.5x-damage ratios, the shop gates and the golden reskins.
// Isolated worker with in-memory KV; production untouched.
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
    body: JSON.stringify({ username: 'prestige_tester', password: 'isolated-prestige-check-only' })
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
  const shotDir = path.join(root, 'outputs', 'ui');
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
      localStorage.setItem('tdv_cloud_user', 'prestige_tester');
      window.close = () => {};
    }, { token: account.token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready &&
      document.getElementById('bootScreen').classList.contains('gone'));

    // ---- 1. every prestige entry is a faithful, correctly scaled clone ----
    const defs = await page.evaluate(() => {
      const NUM = ['cost', 'range', 'dmg', 'rate', 'splash', 'splashDmg', 'splashR', 'income',
        'fragCount', 'fragDmg', 'burnDps', 'burnDur', 'burnRadius', 'charge', 'chain', 'cd',
        'burst', 'burstGap', 'vRange', 'vRate', 'vDmg', 'vRadius', 'vDiscount'];
      const shape = d => {
        const out = {};
        for (const k of NUM) if (typeof d[k] === 'number') out[k] = d[k];
        for (const k of ['dtype', 'air', 'behavior', 'legs', 'name']) out[k] = d[k];
        out.lanes = d.lanes; out.limit = d.limit;
        return out;
      };
      return Object.keys(PRESTIGE).map(base => {
        const p = PRESTIGE[base], b = TOWERS[base], g = TOWERS[p.id];
        return {
          base: base, id: p.id, name: p.name, gold: p.gold, lvl: p.lvl,
          dmgMul: p.dmgMul, costMul: p.costMul, desc: g.desc,
          shape: shape(g), baseShape: shape(b),
          hp: [TOWER_HP[base].join(','), TOWER_HP[p.id].join(',')],
          price: g.price, prestige: g.prestige,
          laneNames: g.laneNames.join('|'),
          ups: b.ups.map((lane, li) => lane.map((u, i) => ({
            name: u.name, goldName: g.ups[li][i].name,
            goldKeys: Object.keys(g.ups[li][i].fx).length,
            cost: [u.cost, g.ups[li][i].cost],
            fx: Object.fromEntries(Object.keys(u.fx).map(k =>
              [k, [u.fx[k], g.ups[li][i].fx[k]]]))
          })))
        };
      });
    });
    assert.equal(defs.length, 2, 'expected the Ranger and Grenadier prestige entries');
    assert.deepEqual(defs.map(d => d.name), ['Gold Ranger', 'Gold Grenadier']);
    assert.deepEqual(defs.map(d => d.gold), [3000, 4250]);

    for (const d of defs) {
      assert.equal(d.prestige, d.base, d.name + ' must point back at its base tower');
      assert.equal(d.lvl, 5, d.name + ': the prestige feature unlocks at level 5');
      assert.equal(d.price, 0, d.name + ': prestige is paid from the prestige section, not the grid');
      assert.ok(d.desc.length < 70, d.name + ': the shop blurb should stay short — ' + d.desc);
      assert.ok(!/\d+\s*(times|x)\b|\bdamage\b|\bupgrade cost/i.test(d.desc),
        d.name + ': the blurb must not recite stats — ' + d.desc);
      // the clone must carry every numeric stat the base has, scaled only where
      // the prestige rule says so
      for (const k of Object.keys(d.baseShape)) {
        const want = d.baseShape[k], got = d.shape[k];
        if (k === 'name') continue;
        if (k === 'dmg') { assert.equal(got, want * d.dmgMul, d.name + ' dmg'); continue }
        assert.deepEqual(got, want, d.name + ' lost or changed the base stat "' + k + '": ' +
          want + ' -> ' + got);
      }
      assert.equal(d.hp[0], d.hp[1], d.name + ' must be as durable as its base tower');

      for (const lane of d.ups) for (const u of lane) {
        assert.equal(u.goldName, u.name, d.name + ' keeps the base upgrade names');
        assert.equal(u.cost[1], u.cost[0] * d.costMul,
          d.name + ' ' + u.name + ' should cost ' + d.costMul + 'x: ' + u.cost.join('>'));
        assert.ok(Number.isInteger(u.cost[1]),
          d.name + ' ' + u.name + ' priced in fractions: ' + u.cost[1]);
        for (const k of Object.keys(u.fx)) {
          if (typeof u.fx[k][0] !== 'number') continue;  // dtype/bulletCol/flags carry over as-is
          const mul = ['dmg', 'splashDmg', 'fragDmg', 'burnDps'].includes(k) ? d.dmgMul : 1;
          assert.equal(u.fx[k][1], u.fx[k][0] * mul,
            d.name + ' ' + u.name + ' fx.' + k + ': ' + u.fx[k].join('>'));
        }
        assert.equal(u.goldKeys, Object.keys(u.fx).length,
          d.name + ' ' + u.name + ' gained or lost an fx key');
      }
    }
    ok('Both prestige towers clone their base faithfully: ' +
      defs.map(d => d.name + ' (dmg ' + d.shape.dmg + ', splash ' + d.shape.splash + ')').join(', '));
    ok('Every upgrade costs 3x in whole gold and every damage figure is 2.5x, utility intact');

    // ---- 2. the shop gates each one: level, then ownership, then gold ----
    const gates = await page.evaluate(() => {
      const cards = () => [...document.querySelectorAll('#prestigeGrid .shopCard')].map(c => {
        const b = c.querySelector('.btn');
        return { title: c.querySelector('.t').textContent, text: b.textContent.trim(),
          disabled: b.disabled, locked: c.classList.contains('locked'),
          waiting: c.classList.contains('waiting'), poor: b.classList.contains('poor') };
      });
      const out = {};
      toMenu(); SV.xp = 0; SV.gold = 999999; SV.owned = ['ranger', 'grenadier', 'sniper'];
      document.getElementById('btnShop').click();
      out.belowLevel = cards();
      SV.xp = 1300; SV.owned = ['sniper']; buildShop();
      out.noBaseTower = cards();
      SV.owned = ['ranger', 'grenadier', 'sniper']; SV.gold = 100; buildShop();
      out.broke = cards();
      SV.gold = 999999; buildShop();
      out.ready = cards();
      document.querySelector('#prestigeGrid .shopCard .shopArt').dispatchEvent(
        new MouseEvent('click', { bubbles: true }));
      out.info = { shown: document.getElementById('twrInfo').classList.contains('show'),
        name: document.querySelector('#twrInfo .nm').textContent,
        price: document.querySelector('#twrInfo .pr').textContent };
      out.gridTitles = [...document.querySelectorAll('#shopGrid .shopCard .t')].map(t => t.textContent);
      return out;
    });
    assert.deepEqual(gates.belowLevel.map(c => c.text), ['LVL 5 REQUIRED', 'LVL 5 REQUIRED']);
    assert.ok(gates.belowLevel.every(c => c.locked && c.disabled),
      'a locked prestige card must read and behave as locked');
    assert.deepEqual(gates.noBaseTower.map(c => c.text),
      ['OWN RANGER FIRST', 'OWN GRENADIER FIRST']);
    assert.ok(gates.noBaseTower.every(c => c.waiting), 'the ownership gate needs its own state');
    assert.deepEqual(gates.broke.map(c => c.poor), [true, true],
      'unaffordable prestige should dim both buttons');
    assert.deepEqual(gates.ready.map(c => c.text), ['PRESTIGE 3000', 'PRESTIGE 4250']);
    assert.ok(gates.ready.every(c => !c.disabled), 'both should be buyable at level 5 with gold');
    assert.deepEqual(gates.gridTitles,
      ['Ranger', 'Grenadier', 'Phaser', 'Farm', 'Village', 'Sniper', 'VIPER'],
      'prestige towers belong in their own section, not the tower grid');
    assert.equal(gates.info.shown, true, 'clicking a prestige card should open its info panel');
    assert.equal(gates.info.name, 'Gold Ranger');
    assert.equal(gates.info.price, 'Prestige: 3000 Gold — Place: $150');
    ok('Shop gates prestige behind level 5, then owning the base tower, then its gold price');

    // ---- 3. buying both adds separate loadout entries ----
    const bought = await page.evaluate(() => {
      for (const b of document.querySelectorAll('#prestigeGrid .shopCard .btn')) b.click();
      toMenu(); document.getElementById('btnTowers').click();   // the real TOWERS screen
      return {
        gold: SV.gold, owned: SV.owned.slice(), loadout: SV.loadout.slice(),
        names: [...document.querySelectorAll('#invList .invRow .t')].map(r => r.textContent),
        equipped: [...document.querySelectorAll('#loadoutGrid .loSlot .nm')].map(n => n.textContent),
        saved: JSON.parse(localStorage.getItem('tdv_save_v1')).owned,
        cards: [...document.querySelectorAll('#prestigeGrid .shopCard .btn')].map(b => b.textContent.trim())
      };
    });
    assert.equal(bought.gold, 999999 - 3000 - 4250, 'both gold prices must be spent');
    assert.ok(bought.owned.includes('goldranger') && bought.owned.includes('goldgrenadier'));
    for (const base of ['ranger', 'grenadier'])
      assert.ok(bought.owned.includes(base), 'the base ' + base + ' must survive the prestige');
    assert.deepEqual(bought.names, ['Ranger', 'Grenadier', 'Sniper', 'Gold Ranger', 'Gold Grenadier'],
      'the inventory must list each gold tower separately from its base');
    assert.deepEqual(bought.equipped.slice(0, 5),
      ['Ranger', 'Grenadier', 'Sniper', 'Gold Ranger', 'Gold Grenadier']);
    assert.deepEqual(bought.saved, bought.owned, 'ownership has to survive a reload');
    assert.deepEqual(bought.cards, ['PRESTIGED', 'PRESTIGED']);
    ok('Buying both spends their gold and adds each one separately to TOWERS');

    // ---- 4. in a real match: correct ratios, own towerbar slot, 3x prices ----
    const match = await page.evaluate(() => {
      const out = {};
      // A body under the muzzle, so the tower has something to shoot at and the
      // projectile it makes tells us which attack path it was routed down.
      const pin = t => { const e = spawnEnemy('walker', .5, 0);
        e.px = t.x + .3; e.py = t.y + .3; e.spd = 0; e.hp = e.maxHp = 1e6;
        const m = worldToMap(e.px, e.py); e.sx = m.x; e.sy = m.y; return e };
      for (const base of Object.keys(PRESTIGE)) {
        const p = PRESTIGE[base];
        toMenu(); startGame('easy'); G.cash = 1e6;
        buildTowerbar();
        const g = placeTower(p.id, 5.5, 2.5);
        const r = placeTower(base, 6.5, 2.5);
        out[p.id] = { slot: [...document.querySelectorAll('#towerbar .twr-slot')]
            .map(s => s.querySelector('.nm').textContent + ':' + s.querySelector('.cost').textContent),
          baseDmg: [r.S.dmg, g.S.dmg], hp: [r.maxHp, g.maxHp], splash: [r.S.splash, g.S.splash] };
        pin(g);
        g.cd = 0; projs.length = 0; updTower(g, 1 / 60);
        out[p.id].shot = { kind: projs[0] && projs[0].kind, beh: towerBehavior(g.type),
          baseBeh: towerBehavior(r.type) };
        selectTower(g);
        out[p.id].prices = [...document.querySelectorAll('#spLanes .up.next .c')].map(c => c.textContent);
        const shown = upCost(g, 0, 0), before = G.cash;
        buyUp(g, 0);
        out[p.id].charged = { paid: before - G.cash, shown: shown, list: TOWERS[base].ups[0][0].cost };
        const ramp = t => { const steps = [];
          for (let li = 0; li < TOWERS[base].lanes; li++) {
            t.ups[li] = 5; t.S = towerStats(t); steps.push(t.S.dmg) }
          return steps };
        const gs = ramp(g), rs = ramp(r);
        out[p.id].ratio = gs.map((v, i) => Math.round(v / rs[i] * 1000) / 1000);
      }
      return out;
    });
    for (const d of defs) {
      const m = match[d.id];
      assert.ok(m.slot.some(s => s.startsWith(d.name + ':')),
        d.name + ' should have its own towerbar slot: ' + m.slot.join(', '));
      assert.equal(m.baseDmg[1], m.baseDmg[0] * d.dmgMul, d.name + ' base damage');
      assert.deepEqual(m.hp, [m.hp[0], m.hp[0]], d.name + ' must share its base HP');
      assert.equal(m.charged.paid, m.charged.list * d.costMul, d.name + ' charged price');
      assert.equal(m.charged.shown, m.charged.paid, d.name + ': shown price must equal charged');
      assert.deepEqual(m.ratio, m.ratio.map(() => d.dmgMul),
        d.name + ' damage must hold the ratio at every tier: ' + m.ratio.join('/'));
      assert.equal(m.shot.beh, m.shot.baseBeh,
        d.name + ' must attack the way its base does: ' + m.shot.beh + ' vs ' + m.shot.baseBeh);
    }
    assert.equal(match.goldranger.shot.kind, 'bullet',
      'the Gold Ranger fires the Ranger\'s rifle');
    assert.equal(match.goldgrenadier.shot.kind, 'grenade',
      'the Gold Grenadier lobs — a bullet here means it is shooting like a Ranger');
    assert.deepEqual(match.goldranger.prices, ['$300', '$225']);
    assert.deepEqual(match.goldgrenadier.prices, ['$450', '$150']);
    assert.deepEqual(match.goldgrenadier.splash, [1.25, 1.25],
      'the Gold Grenadier must still splash — the clone once dropped this');
    ok('In matches: own towerbar slot, 2.5x damage at every tier, 3x prices shown and charged');

    // ---- 5. the golden reskins actually render, and read as gold ----
    const art = await page.evaluate(() => {
      const shoot = type => {
        const cv = document.createElement('canvas');
        cv.width = 72; cv.height = 72;
        drawTowerThumb(cv, type);
        const d = cv.getContext('2d').getImageData(0, 0, 72, 72).data;
        const seen = {};
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 8) continue;
          const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
          seen[k] = (seen[k] || 0) + 1;
        }
        const gold = Object.entries(seen).filter(([c, n]) => {
          const [r, g, b] = c.split(',').map(Number);
          return r > 150 && g > 100 && b < r * 0.75 && n > 12;
        }).reduce((s, e) => s + e[1], 0);
        return { colors: Object.keys(seen).length, gold: gold };
      };
      const out = {};
      for (const base of Object.keys(PRESTIGE))
        out[base] = { base: shoot(base), gold: shoot(PRESTIGE[base].id) };
      return out;
    });
    for (const d of defs) {
      const a = art[d.base];
      assert.ok(a.gold.colors > 8, d.name + ' rendered with almost no colours');
      assert.notEqual(a.gold.colors, a.base.colors,
        d.name + ' is not a recolour — it has the same palette as its base');
      assert.ok(a.gold.gold > a.base.gold * 3,
        d.name + ' must read as gold: ' + JSON.stringify(a));
    }
    ok('Both golden reskins render and read as gold');

    await page.evaluate(() => {
      toMenu(); SV.xp = 1300; SV.gold = 999999; SV.owned = ['ranger', 'grenadier', 'sniper'];
      document.getElementById('btnShop').click();
      document.querySelector('#shopMenu .menu').scrollTop = 9999;
      const box = document.createElement('div');
      box.id = 'skinCompare';
      box.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;' +
        'background:#171310;padding:10px';
      for (const base of Object.keys(PRESTIGE)) for (const t of [base, PRESTIGE[base].id]) {
        const cv = document.createElement('canvas');
        cv.width = 400; cv.height = 400;
        cv.style.cssText = 'image-rendering:pixelated;width:200px;height:200px';
        const g = cv.getContext('2d');
        g.imageSmoothingEnabled = false; g.scale(5, 5); g.translate(45, 45);
        drawTowerBody(g, t, 0, 0, { ups: [5, 5], flashT: 0, aim: -Math.PI / 4, hp: 1, maxHp: 1,
          S: towerStats({ type: t, ups: [5, 5], x: 0, y: 0 }) }, 0);
        box.appendChild(cv);
      }
      document.body.appendChild(box);
    });
    await page.locator('#skinCompare').screenshot({
      path: path.join(root, 'outputs', 'prestige-skin-compare.png') });
    await page.evaluate(() => {
      document.getElementById('skinCompare').remove();
      document.getElementById('btnShop').click();
    });
    await page.locator('#prestigeGrid').screenshot({
      path: path.join(shotDir, 'shop-prestige-desktop.png') });

    assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
    console.log('ALL ' + passed + ' PRESTIGE CHECKS PASSED');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 });
