// Regression tests for the VIPER tower and the Poisoned status.
//
// VIPER is the first tower whose shots travel rather than home, the first with
// two independently-ordered barrels, and the first that hands timed buffs to
// other towers. Each of those touches a different part of the engine, so this
// file walks them in that order: the shop, the numbers, the venom, the volley,
// the barrels, the gifts. Isolated worker with in-memory KV; production
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
    body: JSON.stringify({ username: 'viper_tester', password: 'isolated-viper-check-only' })
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
      localStorage.setItem('tdv_cloud_user', 'viper_tester');
      window.close = () => {};
    }, { token: account.token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready &&
      document.getElementById('bootScreen').classList.contains('gone'));

    // Shared rig. Enemies are parked ON the road at the point nearest the tower
    // and frozen, because updEnemy recomputes every position from the path each
    // frame — writing px/py by hand would be undone by the next tick.
    await page.evaluate(() => {
      window.RIG = {
        board() { towers.length = 0; enemies.length = 0; projs.length = 0;
          firePatches.length = 0; G.cash = 1e6; G.speed = 1 },
        post() { const s = samplePath(PATH, PATH.total * .35); return { x: s.x + .9, y: s.y + .9 } },
        viper() { const p = RIG.post(); return placeTower('viper', p.x, p.y) },
        near(t) {
          let best = .5, bd = 1e9;
          for (let d = .3; d < PATH.total - .3; d += .05) {
            const s = samplePath(PATH, d);
            const dd = Math.hypot(s.x - t.x, s.y - t.y);
            if (dd < bd) { bd = dd; best = d } }
          return best
        },
        at(t, hp, shield, type) {
          const e = spawnEnemy(type || 'walker', RIG.near(t), 0);
          e.maxHp = e.hp = hp;
          if (shield !== undefined && shield !== null) { e.shield = shield; e.shieldMax = shield }
          e.spd = 0;
          setEnemyPos(e);
          return e
        },
        big(t, hp) {
          const e = spawnBig('tank');
          e.d = RIG.near(t); e.maxHp = e.hp = hp; e.spd = 0;
          setEnemyPos(e);
          return e
        },
        // Two bodies on the same spot, for asking what a round passes through
        // rather than where the road happens to run.
        pin(t, hp) {
          const e = spawnEnemy('walker', .5, 0);
          e.px = t.x + .8; e.py = t.y + .8; e.maxHp = e.hp = hp; e.spd = 0;
          const m = worldToMap(e.px, e.py); e.sx = m.x; e.sy = m.y;
          return e
        },
        random(v, fn) { const old = Math.random; Math.random = () => v;
          try { return fn() } finally { Math.random = old } },
        // One trigger pull: how many rounds left the barrel.
        fire(t, gi) {
          t.gunCd[gi || 0] = 0; projs.length = 0;
          updTower(t, 1 / 60);
          return projs.length },
        // One pull, then the whole flight. `muzzle` is what left the barrel and
        // `peak` is the most that were ever in the air at once — a fan and a
        // split look identical at the muzzle and nothing else.
        volley(t, frames) {
          const muzzle = RIG.fire(t);
          let peak = muzzle;
          for (let i = 0; i < (frames || 150) && projs.length; i++) {
            updProjs(1 / 60); peak = Math.max(peak, projs.length) }
          return { muzzle: muzzle, peak: peak } },
        fly(frames) { for (let i = 0; i < (frames || 150); i++) updProjs(1 / 60) },
        tick(e, seconds) { for (let i = 0; i < seconds * 60; i++) updEnemy(e, 1 / 60) }
      };
    });

    // ---- 1. the shop sells it, and only the shop's gold price gates it ----
    const shop = await page.evaluate(() => {
      SV.owned = ['ranger']; SV.loadout = ['ranger']; SV.gold = 3000;
      toMenu(); showScreen('shopMenu'); buildShop();
      const find = () => [...document.querySelectorAll('#shopGrid .shopCard')]
        .find(c => c.querySelector('.t').textContent === 'VIPER');
      const card = find();
      const before = SV.gold;
      card.querySelector('button').click();
      showTowerInfo('viper');
      const info = [...document.querySelectorAll('#tiStats .statrow')]
        .map(r => r.querySelector('span').textContent + '=' + r.querySelector('b').textContent);
      return { listed: !!card, price: TOWERS.viper.price, cost: TOWERS.viper.cost,
        spent: before - SV.gold, owned: SV.owned.includes('viper'),
        equipped: SV.loadout.includes('viper'), nowOwned: find().querySelector('button').textContent.trim(),
        desc: card.querySelector('.d').textContent, info: info };
    });
    assert.equal(shop.listed, true, 'VIPER belongs in the shop');
    assert.equal(shop.price, 3000, 'the unlock costs 3000 gold');
    assert.equal(shop.cost, 1250, 'placement costs 1250');
    assert.equal(shop.spent, 3000, 'buying spends exactly the listed price');
    assert.equal(shop.owned, true, 'a purchase is recorded');
    assert.equal(shop.equipped, true, 'and it lands in the loadout');
    assert.equal(shop.nowOwned, 'OWNED', 'the card flips to OWNED, not a repeatable buy');
    assert.ok(!/Venom|Clustershots|Twin Gunner/.test(shop.desc),
      'the card blurb stays a blurb: ' + shop.desc);
    assert.ok(shop.info.some(r => r.startsWith('Poison=0.25% of max HP/s for 15s')),
      'the shop card quotes the venom: ' + shop.info.join(', '));
    assert.ok(shop.info.includes('Damage=40'), 'and the base damage: ' + shop.info.join(', '));
    ok('VIPER is sold once for 3000 gold and equips itself');

    // ---- 2. the numbers the spec opens with ----
    const base = await page.evaluate(() => {
      RIG.board();
      const t = RIG.viper();
      return { dmg: t.S.dmg, cd: 1 / t.S.rate, range: t.S.range, hp: t.maxHp,
        dtype: t.S.dtype, poison: [t.S.poisonPct, t.S.poisonDur, t.S.poisonChance],
        lanes: TOWERS.viper.lanes,
        top: TOWERS.viper.ups[0].map(u => u.name + ':' + u.cost),
        bottom: TOWERS.viper.ups[1].map(u => u.name + ':' + u.cost) };
    });
    assert.equal(base.dmg, 40, '40 damage');
    assert.ok(Math.abs(base.cd - 0.5) < 1e-9, 'a 0.5 second cooldown');
    assert.equal(base.range, 3, '3 range');
    assert.equal(base.hp, 1250, '1250 base HP');
    assert.deepEqual(base.poison, [0.0025, 15, 0.1],
      'poison is 0.25% of HP per second for 15s on a 10% roll');
    assert.deepEqual(base.top, ['Venom Inflix:500', 'Scope:950', 'Spreadshots:2250',
      'Clustershots:3500', 'Chemical Mixture:5500']);
    assert.deepEqual(base.bottom, ['Dissolution:550', 'Snake Eyes:750', 'Poison Puddles:2550',
      'Double Gunner:13750', 'Twin Gunner:36500']);
    ok('Base stats and both paths match the spec sheet');

    // ---- 3. the venom: share of health, past the shield, on a one second beat ----
    const venom = await page.evaluate(() => {
      RIG.board();
      const t = RIG.viper();
      const e = RIG.at(t, 4000, 1000);
      RIG.random(0, () => { RIG.fire(t); RIG.fly() });
      const shieldLost = 1000 - e.shield;
      const hpAfterShot = e.hp;
      RIG.tick(e, 3);
      const out = { doses: e.poisons.length, shieldLost: shieldLost,
        hpUntouchedByShot: hpAfterShot === 4000, poisonDamage: hpAfterShot - e.hp,
        perSecond: (hpAfterShot - e.hp) / 3, left: e.poisons[0] ? e.poisons[0].t : 0 };
      // and it runs out: 15s in total, no more after that
      RIG.tick(e, 13);
      out.afterFifteen = e.poisons.length;
      const settled = e.hp;
      RIG.tick(e, 3);
      out.stopped = e.hp === settled;
      return out;
    });
    assert.equal(venom.doses, 1, 'one landed shot is one dose');
    assert.equal(venom.shieldLost, 40, 'the shot itself is spent on the shield');
    assert.equal(venom.hpUntouchedByShot, true, 'a shot that the shield eats takes no health');
    assert.equal(venom.perSecond, 10, '0.25% of 4000 HP is 10 damage a second');
    assert.equal(venom.poisonDamage, 30, 'three seconds of venom is thirty damage');
    assert.equal(venom.afterFifteen, 0, 'the dose is gone once its fifteen seconds are up');
    assert.equal(venom.stopped, true, 'and nothing keeps biting afterwards');
    ok('Poisoned bites 0.25% of max HP per second and ignores shields');

    // ---- 4. one dose per tower, refreshed rather than stacked ----
    const stacking = await page.evaluate(() => {
      RIG.board();
      const a = RIG.viper();
      const b = placeTower('viper', a.x + .6, a.y + .6);
      const e = RIG.at(a, 40000);
      const bite = t => RIG.random(0, () => { RIG.fire(t); RIG.fly() });
      bite(a);
      const first = { doses: e.poisons.length, t: e.poisons[0].t };
      RIG.tick(e, 5);
      const running = e.poisons[0].t;
      bite(a);
      const again = { doses: e.poisons.length, t: e.poisons[0].t };
      bite(b);
      const two = { doses: e.poisons.length, srcs: e.poisons.map(p => p.src) };
      // percentage follows the strongest venom that bit last, per dose
      const out = { first: first, running: running, again: again, two: two,
        distinct: two.srcs[0] !== two.srcs[1] };
      RIG.tick(e, 40);
      out.expired = e.poisons.length;
      return out;
    });
    assert.equal(stacking.first.doses, 1);
    assert.ok(Math.abs(stacking.running - 10) < .05, 'the first dose was ticking down normally');
    assert.equal(stacking.again.doses, 1, 'the same tower cannot stack a second dose');
    assert.ok(stacking.again.t > 14,
      'a fresh bite from the same tower refreshes the clock: ' + stacking.again.t);
    assert.equal(stacking.two.doses, 2, 'two vipers are two sources');
    assert.equal(stacking.distinct, true, 'and each dose remembers who applied it');
    assert.equal(stacking.expired, 0, 'both wear off');
    ok('A dose belongs to the tower that applied it and refreshes in place');

    // ---- 5. the 10% roll is a real 10% per shot ----
    const roll = await page.evaluate(() => {
      RIG.board();
      const t = RIG.viper();
      const hit = () => {
        const e = RIG.at(t, 40000);
        RIG.fire(t); RIG.fly();
        const poisoned = e.poisons.length > 0;
        enemies.length = 0;
        return poisoned };
      const never = RIG.random(0.99, () => { let n = 0; for (let i = 0; i < 20; i++) n += hit() ? 1 : 0; return n });
      const always = RIG.random(0.0, () => { let n = 0; for (let i = 0; i < 20; i++) n += hit() ? 1 : 0; return n });
      let sum = 0; const shots = 400;
      for (let i = 0; i < shots; i++) sum += hit() ? 1 : 0;
      return { never: never, always: always, rate: sum / shots };
    });
    assert.equal(roll.never, 0, 'a roll above 10% must not infect');
    assert.equal(roll.always, 20, 'a roll below 10% always infects');
    assert.ok(roll.rate > 0.05 && roll.rate < 0.16,
      'the observed infection rate should sit near 10%: ' + roll.rate);
    ok('The infection roll is 10% per shot, not per second');

    // ---- 6. the top path: stronger venom, then the shape of the volley ----
    const top = await page.evaluate(() => {
      RIG.board();
      const t = RIG.viper();
      const out = {};
      buyUp(t, 0);
      out.venom = { pct: t.S.poisonPct, dur: t.S.poisonDur, dmg: t.S.dmg };
      buyUp(t, 0);
      out.scope = t.S.range;
      buyUp(t, 0);
      RIG.at(t, 40000);
      out.spread = [RIG.fire(t), RIG.fire(t), RIG.fire(t), RIG.fire(t)];
      buyUp(t, 0);
      t.shotN = 0;
      // Clustershots is not a wider barrel — it breaks the round apart on the body
      // it hits — so the volley counts stay exactly what Spreadshots made them.
      out.cluster = [RIG.fire(t), RIG.fire(t), RIG.fire(t), RIG.fire(t)];
      out.clusterSplit = t.S.cluster;
      out.pierce = t.S.pierce;
      out.kinds = projs.every(p => p.kind === 'slug');
      buyUp(t, 0);
      out.chemical = { pct: t.S.poisonPct, dur: t.S.poisonDur, dmg: t.S.dmg };
      return out;
    });
    assert.deepEqual(top.venom, { pct: 0.003, dur: 20, dmg: 40 }, 'Venom Inflix: 0.3% for 20s');
    assert.equal(top.scope, 5, 'Scope adds 2 range');
    assert.deepEqual(top.spread, [1, 1, 3, 1],
      'Spreadshots adds its diagonals on every third shot: ' + top.spread);
    assert.deepEqual(top.cluster, [1, 1, 3, 1],
      'Clustershots changes nothing at the muzzle: ' + top.cluster);
    assert.equal(top.clusterSplit, true, 'and arms the impact split instead');
    assert.equal(top.pierce, 1, 'Clustershots pierces one extra enemy');
    assert.equal(top.kinds, true, 'and every round in the volley is a travelling slug');
    assert.deepEqual(top.chemical, { pct: 0.004, dur: 18, dmg: 60 },
      'Chemical Mixture: +20 damage, 0.4% for 18s');
    ok('Venom Inflix, Scope, Spreadshots, Clustershots and Chemical Mixture all land');

    // ---- 7. a round multiplies on the body it hits, not in the barrel ----
    const volley = await page.evaluate(() => {
      const run = cluster => {
        RIG.board();
        const t = RIG.viper();
        // Clustershots is the fourth buy on the top path; three would only be
        // Venom Inflix, Scope and Spreadshots, which split nothing.
        if (cluster) for (let i = 0; i < 4; i++) buyUp(t, 0);
        // Three bodies stacked on the same spot, so the only question is how far
        // one round gets through them.
        const row = [RIG.pin(t, 40000), RIG.pin(t, 40000), RIG.pin(t, 40000)];
        const before = row.map(e => e.hp);
        const v = RIG.volley(t, 150);
        v.hit = row.filter((e, i) => e.hp < before[i]).length;
        return v };
      return { solid: run(false), cluster: run(true) };
    });
    assert.deepEqual([volley.solid.muzzle, volley.solid.peak], [1, 1],
      'a plain round leaves one and stays one');
    assert.equal(volley.solid.hit, 1, 'a solid round stops at the first body it touches');
    assert.equal(volley.cluster.muzzle, 1, 'Clustershots still fires a single round');
    assert.equal(volley.cluster.peak, 3,
      'and it is the impact that puts three in the air: ' + volley.cluster.peak);
    assert.ok(volley.cluster.hit >= 2,
      'so the fragments reach bodies the parent could not: ' + volley.cluster.hit);
    ok('Clustershots splits into 3 on impact');

    // ---- 8. the bottom path: rate, range, puddles, barrels ----
    const bottom = await page.evaluate(() => {
      RIG.board();
      const t = RIG.viper();
      const out = {};
      buyUp(t, 1);
      out.dissolution = Math.round(1 / t.S.rate * 1000) / 1000;
      buyUp(t, 1);
      out.snakeEyes = t.S.range;
      buyUp(t, 1);
      out.puddle = t.S.puddle;
      const e = RIG.at(t, 40000);
      RIG.random(0.99, () => { RIG.fire(t); RIG.fly() });
      out.patches = firePatches.length;
      out.patchKind = firePatches[0] && firePatches[0].kind;
      out.shotInfected = e.poisons.length;
      // a puddle infects without rolling, for as long as it is stood in
      const victim = RIG.at(t, 40000);
      for (let i = 0; i < 60; i++) { updFirePatches(1 / 60); RIG.tick(victim, 1 / 60) }
      out.puddleDoses = victim.poisons.length;
      out.puddlePct = victim.poisons[0] && victim.poisons[0].pct;
      out.puddleKept = victim.poisons[0] && victim.poisons[0].t > 13;
      buyUp(t, 1);
      out.guns = { n: t.S.guns, dmg: Math.round(t.S.dmg * 100) / 100 };
      return out;
    });
    assert.equal(bottom.dissolution, 0.4, 'Dissolution takes the cooldown to 0.4s');
    assert.equal(bottom.snakeEyes, 4, 'Snake Eyes adds 1 range');
    assert.equal(bottom.puddle, true, 'Poison Puddles is on');
    assert.equal(bottom.patches, 1, 'a landed shot leaves exactly one puddle');
    assert.equal(bottom.patchKind, 'poison', 'and it is a poison patch, not a fire patch');
    assert.equal(bottom.shotInfected, 0, 'the roll was pinned high, so the shot itself is clean');
    assert.equal(bottom.puddleDoses, 1, 'standing in venom infects with no roll');
    assert.equal(bottom.puddlePct, 0.0025, 'the puddle carries the tower current venom');
    assert.equal(bottom.puddleKept, true, 'and it keeps refreshing while the puddle lasts');
    assert.equal(bottom.guns.n, 2, 'Double Gunner gives two barrels');
    assert.equal(bottom.guns.dmg, 26, 'each barrel loses 35% of the shot');
    ok('Dissolution, Snake Eyes, Poison Puddles and Double Gunner all work');

    // ---- 9. two barrels, two sets of orders ----
    const barrels = await page.evaluate(() => {
      RIG.board();
      const t = RIG.viper();
      for (let i = 0; i < 4; i++) buyUp(t, 1);
      const weak = RIG.at(t, 50);
      const strong = RIG.at(t, 9000);
      t.gunMode = ['weak', 'strong'];
      const fired = RIG.fire(t);
      const targets = t.gunTgt.map(e => e && e.hp);
      // an unset barrel follows the tower
      t.gunMode = [null, null]; t.tgtMode = 'strong';
      t.gunTgt = [null, null]; RIG.fire(t);
      const bothFollow = t.gunTgt.every(e => e && e.hp === 9000);
      // and the two barrels run on their own clocks
      t.gunCd = [0, 0]; updTower(t, 1 / 60);
      const both = projs.length;
      t.gunCd[1] = 0; t.gunCd[0] = 1; projs.length = 0;
      updTower(t, 1 / 60);
      const oneOnly = projs.length;
      return { fired: fired, targets: targets, bothFollow: bothFollow, both: both,
        oneOnly: oneOnly };
    });
    assert.deepEqual(barrels.targets, [50, 9000],
      'each barrel hunts by its own priority: ' + JSON.stringify(barrels.targets));
    assert.equal(barrels.fired, 2, 'both barrels fire in the same pull');
    assert.equal(barrels.bothFollow, true, 'an unassigned barrel obeys the VIPER itself');
    assert.equal(barrels.oneOnly, 1, 'a barrel on cooldown holds back while the other shoots');
    ok('Double Gunner runs two barrels that can be pointed independently');

    // ---- 10. Twin Gunner: the gifts, the numbers, the colours, the clock ----
    const twin = await page.evaluate(() => {
      RIG.board();
      const t = RIG.viper();
      const p = RIG.post();
      const ally = placeTower('ranger', p.x + 2, p.y + 2);
      const farm = placeTower('farm', p.x - 2, p.y - 2);
      for (let i = 0; i < 5; i++) buyUp(t, 1);
      const out = { twin: t.S.twin, leftRate: t.S.gunRate[0], rightRate: t.S.gunRate[1] };
      const gifted = () => towers.find(o => o.toxicT > 0 || o.cureT > 0);
      // Which tower receives a gift is the random part, so the numbers are
      // compared against what that tower had a moment ago rather than against
      // its config — a VIPER can gift itself, and its own barrels already cut
      // the per-shot damage.
      const was = {};
      for (const o of towers) was[o.id] = { dmg: o.S.dmg, rate: o.S.rate };
      // Left barrel: Toxic. A pinned-low roll makes the 50% chance certain;
      // which tower receives it is the random part, so the test reads the answer
      // back off the board rather than predicting the draw.
      t.toxicCd = 0; t.cureCd = 99;
      RIG.random(0, () => updTower(t, 1 / 60));
      const g = gifted();
      out.toxic = { got: !!g, onFarm: farm.toxicT > 0, t: g ? g.toxicT : 0,
        flagged: g ? !!g.S.toxic : false,
        dmgUnchanged: g ? g.S.dmg === was[g.id].dmg : false };
      const walker = RIG.at(g, 40000);
      RIG.random(0.99, () => { g.gunCd[0] = 0; projs.length = 0; updTower(g, 1 / 60); RIG.fly() });
      out.slowed = walker.slowT > 0 ? walker.slowMul : null;
      out.slowFor = walker.slowT;
      const boss = RIG.big(g, 40000);
      RIG.random(0.99, () => { g.gunCd[0] = 0; projs.length = 0; updTower(g, 1 / 60); RIG.fly() });
      out.bossSlow = boss.slowT > 0 ? boss.slowBossMul : null;
      // Right barrel: Cure
      for (const o of towers) { o.toxicT = 0; o.S = towerStats(o) }
      t.toxicCd = 99; t.cureCd = 0;
      RIG.random(0.9, () => updTower(t, 1 / 60));
      const c = gifted();
      out.cure = { got: !!c, onFarm: farm.cureT > 0, t: c ? c.cureT : 0,
        flagged: c ? !!c.S.cure : false,
        dmg: c ? c.S.dmg / was[c.id].dmg : 0,
        rate: c ? c.S.rate / was[c.id].rate : 0 };
      // both run out and the numbers fall back
      for (let i = 0; i < 11 * 60; i++) updTower(c, 1 / 60);
      out.after = { toxic: c.toxicT, cure: c.cureT, flagged: !!c.S.toxic || !!c.S.cure,
        dmg: c.S.dmg / was[c.id].dmg };
      // the palette follows the buff, and only while it is on
      c.toxicT = 5;
      const green = towerTint(c);
      c.toxicT = 0; c.cureT = 5;
      const yellow = towerTint(c);
      c.cureT = 0;
      return Object.assign(out, { green: green && green.mix, yellow: yellow && yellow.mix,
        none: towerTint(c), tinted: tintCol('#8a9aa8', { mix: '#3ad02a', f: 0.42 }),
        raw: '#8a9aa8' });
    });
    assert.equal(twin.twin, true, 'Twin Gunner is on');
    assert.equal(twin.leftRate, 1.3, 'the left barrel fires 30% faster');
    assert.equal(twin.rightRate, 1, 'the right one is unchanged');
    assert.equal(twin.toxic.got, true, 'the left barrel gave someone Toxic');
    assert.equal(twin.toxic.onFarm, false, 'a farm is never picked: it has no shots');
    assert.equal(twin.toxic.t, 10, 'Toxic lasts 10 seconds');
    assert.equal(twin.toxic.flagged, true, 'and marks the tower it chose');
    assert.equal(twin.toxic.dmgUnchanged, true, 'Toxic changes no numbers of its own');
    assert.equal(twin.slowed, 0.5, "a Toxic tower's shots halve what they hit");
    assert.ok(twin.slowFor > 0 && twin.slowFor <= 2, 'and the drip wears off in two seconds');
    assert.equal(twin.bossSlow, null, 'bosses and minibosses ignore Toxic');
    assert.equal(twin.cure.got, true, 'the right barrel gave someone Cure');
    assert.equal(twin.cure.onFarm, false, 'and never the farm either');
    assert.equal(twin.cure.t, 10, 'Cure lasts 10 seconds');
    assert.ok(Math.abs(twin.cure.dmg - 1.25) < 1e-9,
      'Cure is 25% more damage: ' + twin.cure.dmg);
    assert.ok(Math.abs(twin.cure.rate - 1.25) < 1e-9,
      'and 25% more firerate: ' + twin.cure.rate);
    assert.equal(twin.after.toxic, 0);
    assert.equal(twin.after.cure, 0);
    assert.equal(twin.after.flagged, false, 'an expired gift stops being a stat');
    assert.ok(Math.abs(twin.after.dmg - 1) < 1e-9, 'and the numbers fall back');
    assert.ok(twin.green && twin.yellow && twin.green !== twin.yellow,
      'Toxic and Cure tint their tower differently');
    assert.equal(twin.none, null, 'and an ordinary tower keeps its own palette');
    assert.notEqual(twin.tinted, twin.raw, 'a tint actually changes the colour');
    ok('Twin Gunner hands out Toxic and Cure, and both wear off clean');

    // ---- 10b. and it goes on handing them out ----
    // The 20-second clocks have to run down as well as be set. When they were
    // only ever set, the first pair of gifts was also the last and a Twin Gunner
    // quietly stopped being one after twenty seconds.
    const cadence = await page.evaluate(() => {
      RIG.board();
      const p = RIG.post();
      const ally = placeTower('ranger', p.x + 2, p.y + 2);
      const t = RIG.viper();
      for (let i = 0; i < 5; i++) buyUp(t, 1);
      const lit = k => towers.some(o => o[k] > 0);
      const holders = { toxic: {}, cure: {} };
      let toxic = 0, cure = 0, wasT = false, wasC = false;
      // Pinned low so the 50% Toxic flip always lands; who receives it is still a
      // draw off the pool, and a count of separate gifts does not care which.
      RIG.random(0, () => {
        for (let i = 0; i < 60 * 60; i++) {
          // Every tower ticks, as it does in a live frame — a gift only wears off
          // on the tower that received it, so ticking the giver alone would leave
          // the first one lit forever and hide every gift after it.
          for (const o of towers.slice()) updTower(o, 1 / 60);
          const nt = lit('toxicT'), nc = lit('cureT');
          if (nt && !wasT) toxic++;
          if (nc && !wasC) cure++;
          wasT = nt; wasC = nc;
          for (const o of towers) {
            if (o.toxicT > 0) holders.toxic[o.type] = 1;
            if (o.cureT > 0) holders.cure[o.type] = 1 }
        }
      });
      return { toxic: toxic, cure: cure, left: t.toxicCd, right: t.cureCd,
        ally: !!ally, toxicTypes: Object.keys(holders.toxic),
        cureTypes: Object.keys(holders.cure) };
    });
    assert.equal(cadence.ally, true, 'the VIPER has an ally on the board to gift');
    assert.ok(cadence.toxic >= 3,
      'Toxic keeps coming: ' + cadence.toxic + ' separate gifts in a minute');
    assert.ok(cadence.cure >= 3,
      'Cure keeps coming: ' + cadence.cure + ' separate gifts in a minute');
    assert.ok(cadence.toxicTypes.includes('ranger'),
      'and the gifts reach other towers, not only the VIPER: ' + cadence.toxicTypes);
    assert.ok(cadence.cureTypes.includes('ranger'),
      'on both clocks: ' + cadence.cureTypes);
    assert.ok(cadence.left <= 20 && cadence.right <= 20,
      'neither clock sticks at its cooldown: ' + cadence.left + ' / ' + cadence.right);
    ok('Twin Gunner gifts on a 20-second cadence, not once per match');

    // ---- 11. the panel says what the tower does ----
    const panel = await page.evaluate(() => {
      RIG.board(); startGame('easy'); G.cash = 1e6;
      const read = t => {
        selectTower(t);
        return { rows: [...document.querySelectorAll('#spStats .statrow')]
            .map(r => r.querySelector('span').textContent),
          stats: [...document.querySelectorAll('#spStats .statrow')]
            .map(r => r.querySelector('span').textContent + '=' +
              r.querySelector('b').textContent),
          guns: [...document.querySelectorAll('#spTargeting select')].map(s => s.dataset.tgt),
          fx: [...document.querySelectorAll('#spLanes .up')].map(u => u.dataset.fx).join(' | ') } };
      // The lane rule caps a path at two once the other has three, so the two
      // halves of the roster have to be shown on two different VIPERs.
      const venom = RIG.viper();
      for (let i = 0; i < 4; i++) buyUp(venom, 0);
      const out = { top: read(venom) };
      const guns = placeTower('viper', venom.x + 1, venom.y + 1);
      for (let i = 0; i < 5; i++) buyUp(guns, 1);
      out.bottom = read(guns);
      const pick = (tgt, value) => {
        const el = document.querySelector('#spTargeting select[data-tgt="' + tgt + '"]');
        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true })) };
      pick('1', 'strong');
      out.barrel = guns.gunMode[1];
      pick('-1', 'weak');
      out.base = guns.tgtMode;
      const r = placeTower('ranger', 4.5, 1.5);
      out.single = read(r);
      return out;
    });
    for (const want of ['Poison', 'Spreadshots', 'Clustershots', 'Pierce'])
      assert.ok(panel.top.rows.includes(want),
        'the panel should row out ' + want + ': ' + panel.top.rows);
    for (const want of ['Poison puddles', 'Barrels', 'Twin Gunner'])
      assert.ok(panel.bottom.rows.includes(want),
        'the panel should row out ' + want + ': ' + panel.bottom.rows);
    assert.ok(!panel.single.rows.includes('Barrels'),
      'a Ranger panel must not grow VIPER rows: ' + panel.single.rows);
    assert.ok(panel.top.stats.includes('Clustershots=splits into 3 on impact'),
      'the panel describes the split as something that happens to a hit body: ' + panel.top.stats);
    assert.ok(panel.top.stats.includes('Pierce=1 extra enemy per fragment'),
      'and says whose pierce the cluster round carries: ' + panel.top.stats);
    assert.ok(!panel.bottom.stats.some(r => /fragment/.test(r)),
      'a VIPER without Clustershots never mentions fragments: ' + panel.bottom.stats);
    assert.deepEqual(panel.bottom.guns, ['-1', '0', '1'],
      'one priority for the tower and one per barrel');
    assert.deepEqual(panel.single.guns, ['-1'], 'a single barrel tower keeps one control');
    assert.equal(panel.barrel, 'strong', 'a barrel keeps the order it was given');
    assert.equal(panel.base, 'weak', 'and the tower priority is its own control');
    const fx = panel.top.fx + ' | ' + panel.bottom.fx;
    for (const want of ['pierces 1 more', 'splits into 3 on impact',
      'every 3rd shot adds 2 diagonal shots', 'poison: 0.3% of max HP per second',
      '2 independent guns', 'left gun +30% firerate'])
      assert.ok(fx.includes(want), 'the upgrade tooltip should say ' + want);
    ok('The panel and the per-barrel priority controls read correctly');

    // ---- 12. it survives a real match ----
    const match = await page.evaluate(() => {
      SV.owned = ['viper']; SV.loadout = ['viper'];
      toMenu(); startGame('intermediate');       // easy walkers die to one VIPER
      G.cash = 1e6;                              // shot, so nothing survives to be infected
      const t = RIG.viper();
      for (let i = 0; i < 5; i++) buyUp(t, 1);           // a full Twin Gunner
      const p = RIG.post();
      const u = placeTower('viper', p.x + 1.4, p.y - 1.4);
      for (let i = 0; i < 4; i++) buyUp(u, 0);           // and a cluster thrower
      WaveMgr.start();
      let infected = 0, slugs = 0, peak = 0, doses = 0;
      const scan = () => {
        if (projs.some(p => p.kind === 'slug')) slugs++;
        if (enemies.length > peak) peak = enemies.length;
        for (const e of enemies)
          if (e.poisons && e.poisons.length) { infected++; doses = Math.max(doses, e.poisons.length) }
      };
      let now = performance.now();
      for (let f = 0; f < 60 * 25; f++) { now += 16.7; step(now, true); scan() }
      const kills = G.kills;
      // The infection is a 10% roll, so a live run cannot be asserted on
      // chance alone. Pin the roll low for the last few seconds: if shots are
      // landing, something has to be infected.
      const realRandom = Math.random;
      Math.random = () => 0;
      for (let f = 0; f < 60 * 8; f++) { now += 16.7; step(now, true); scan() }
      Math.random = realRandom;
      return { infected: infected, doses: doses, state: G.state, lives: G.lives,
        slugs: slugs, peak: peak, kills: kills,
        towers: towers.length, patches: firePatches.length,
        toxic: towers.some(o => o.toxicT > 0), cured: towers.some(o => o.cureT > 0) };
    });
    assert.equal(match.state, 'playing', 'the match is still running after 33 seconds');
    assert.ok(match.slugs > 0, 'the VIPERs are shooting');
    assert.ok(match.kills > 0, 'and killing');
    assert.ok(match.infected > 0, 'a shot that lands can infect, in a live match');
    assert.ok(match.doses >= 1, 'and the dose is held');
    ok('A full match with a Twin Gunner VIPER runs clean');

    assert.deepEqual(errors, [], 'browser runtime errors: ' + JSON.stringify(errors));
    ok('No browser runtime errors at any point');
    console.log('ALL ' + passed + ' VIPER CHECKS PASSED');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
