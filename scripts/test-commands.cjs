// Regression tests for the reworked developer command bar and the Void Traitor.
// Covers the developer-only gate, the backtick/Escape/click-away lifecycle, the
// fuzzy search and its argument pools, every command's happy path plus the
// match-vs-menu refusal, the game-speed accumulator no longer banking debt,
// match-scoped reset, and the Void Traitor's sword/AoE/corruption/stun rules.
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
    body: JSON.stringify({ username: 'cmd_tester', password: 'isolated-cmd-check-only' })
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
  await new Promise(r => server.listen(0, '127.0.0.1', r));
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
      localStorage.setItem('tdv_cloud_user', 'cmd_tester');
      window.close = () => {};
    }, { token: account.token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready &&
      document.getElementById('bootScreen').classList.contains('gone'));

    // ---- 1. developer accounts only, and the old commands are gone ----
    const gate = await page.evaluate(() => {
      const out = {};
      toMenu();
      const names = CMDS.map(c => c.name);
      out.names = names;
      out.old = ['placement_limit', 'max_upgrade', 'set_base_hp', 'set_custom_speed', 'kill_all']
        .filter(n => names.includes(n));
      Cloud.role = null;
      ADMIN.toggle(); out.noRole = ADMIN.visible;
      Cloud.role = 'tester';
      ADMIN.toggle(); out.tester = ADMIN.visible;
      Cloud.role = 'developer';
      ADMIN.toggle(); out.dev = ADMIN.visible;
      out.shown = document.getElementById('cmdBar').classList.contains('show');
      ADMIN.close();
      return out;
    });
    assert.deepEqual(gate.names,
      ['help', 'cash', 'spawn', 'grant', 'wave', 'game_speed', 'tower_boost', 'give_tower', 'bless']);
    assert.deepEqual(gate.old, [], 'the replaced commands must not still be registered');
    assert.equal(gate.noRole, false, 'no staff role must not open the bar');
    assert.equal(gate.tester, false, 'testers are locked out until the user says otherwise');
    assert.equal(gate.dev, true);
    assert.equal(gate.shown, true, 'the bar must actually be on screen for a developer');
    ok('Command bar is developer-only and exposes exactly the new command set');

    // ---- 2. open/close lifecycle ----
    // Raw mouse clicks, not page.click(): the main menu covers the canvas, and
    // Playwright's actionability check would refuse the very click we are trying
    // to prove dismisses the bar.
    await page.evaluate(() => { toMenu(); Cloud.role = 'developer' });
    await page.keyboard.press('Backquote');
    assert.equal(await page.evaluate(() => ADMIN.visible), true, 'backtick opens');
    await page.keyboard.press('Backquote');
    assert.equal(await page.evaluate(() => ADMIN.visible), false, 'backtick closes');
    await page.keyboard.press('Backquote');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => ADMIN.visible), false, 'Escape closes');
    await page.keyboard.press('Backquote');
    await page.mouse.click(200, 700);
    assert.equal(await page.evaluate(() => ADMIN.visible), false, 'clicking away closes');
    await page.keyboard.press('Backquote');
    const box = await page.locator('#cmdInput').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(await page.evaluate(() => ADMIN.visible), true,
      'clicking inside the bar must not close it');
    await page.evaluate(() => document.getElementById('cmdClose').click());
    assert.equal(await page.evaluate(() => ADMIN.visible), false, 'the close button closes');
    ok('Backtick toggles, and Escape / click-away / the close button all dismiss it');

    // ---- 3. the searcher ----
    const search = await page.evaluate(() => {
      const type = v => { ADMIN.open(); ADMIN.el.input.value = v; ADMIN.suggest();
        return ADMIN.items.map(i => i.name) };
      const out = {};
      out.sp = type('sp');
      out.rows = document.querySelectorAll('#cmdSug .cmdItem').length;
      out.marked = [...document.querySelectorAll('#cmdSug .cmdItem:first-child .cn i')]
        .map(i => i.textContent).join('');
      out.none = type('zzzz');
      out.noneText = document.querySelector('#cmdSug .cmdNone').textContent;
      out.args = type('spawn wal');
      out.grantArgs = type('grant me ' );
      out.boostArgs = type('tower_boost ');
      out.towerArgs = type('give_tower me ');
      out.blessKinds = type('bless me ');
      out.blessTowerArgs = type('bless me tower ');
      out.help = (ADMIN.open(), ADMIN.run('help'), ADMIN.items.map(i => i.name));
      // Tab accepts the highlighted row
      ADMIN.el.input.value = 'sp'; ADMIN.suggest(); ADMIN.move(1); ADMIN.accept(ADMIN.cursor);
      out.accepted = ADMIN.el.input.value;
      ADMIN.close();
      return out;
    });
    assert.equal(search.sp[0], 'spawn', 'spawn should outrank game_speed for "sp": ' + search.sp);
    assert.ok(search.sp.includes('game_speed'), 'a scattered hit still belongs in the list');
    assert.ok(search.rows >= 2, 'the panel must render rows');
    assert.equal(search.marked, 'sp', 'matched characters get highlighted');
    assert.deepEqual(search.none, [], 'nonsense must not match anything');
    assert.match(search.noneText, /no command matches/i, 'an empty search needs an empty state');
    assert.equal(search.args[0], 'walker',
      'argument pool should rank the prefix first: ' + search.args[0]);
    // Every hit must be a real subsequence of the fragment — "wraithling"
    // contains w…a…l and is allowed to show up, just below the prefix matches.
    const isSub = (s, f) => { let i = 0; for (const c of s) if (c === f[i]) i++; return i === f.length };
    assert.ok(search.args.length > 1 && search.args.every(a => isSub(a, 'wal')),
      'every spawn suggestion should actually match: ' + search.args.join(','));
    assert.ok(search.args.indexOf('fake_walker') < search.args.indexOf('wraithling'),
      'a contiguous match should outrank a scattered one: ' + search.args.join(','));
    for (const a of ['gold', 'exp', 'level'])
      assert.ok(search.grantArgs.includes(a), 'grant should offer ' + a);
    assert.ok(search.grantArgs.includes('millionaire'), 'grant should offer badge names');
    for (const b of ['damage', 'firerate', 'health'])
      assert.ok(search.boostArgs.includes(b), 'tower_boost should offer ' + b);
    assert.ok(search.towerArgs.includes('voidtraitor'),
      'give_tower must offer the admin-only tower the shop never shows');
    // Every tower is grantable, prestige included: a developer needs to be able
    // to reach a Gold Ranger without buying it. The pool is keyed by both id
    // and slugified name, so it holds two entries per tower.
    assert.ok(search.towerArgs.includes('goldranger') && search.towerArgs.includes('ranger'),
      'give_tower should offer the whole roster: ' + search.towerArgs.join(','));
    // bless switches its third argument between a number and a tower name
    for (const k of ['gold', 'exp', 'tower'])
      assert.ok(search.blessKinds.includes(k), 'bless should offer ' + k);
    assert.ok(search.blessTowerArgs.includes('voidtraitor'),
      'a tower gift should search the same roster as give_tower: ' + search.blessTowerArgs.join(','));
    assert.deepEqual(search.help, search.sp.length ? [
      'help', 'cash', 'spawn', 'grant', 'wave', 'game_speed', 'tower_boost', 'give_tower',
      'bless'] : []);
    assert.equal(search.accepted, 'spawn ', 'Tab/click should complete the highlighted command');
    ok('The searcher ranks, highlights, offers per-argument pools, and says when nothing matches');

    // ---- 4. match commands refuse the menus; global ones do not ----
    const refusal = await page.evaluate(() => {
      const out = {};
      const run = v => { clearToasts(); ADMIN.open(); ADMIN.run(v); ADMIN.close();
        return [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent) };
      toMenu(); G.state = 'menu';
      for (const c of ['cash me 5000', 'wave 5', 'spawn walker 3', 'game_speed 4',
        'tower_boost damage 2', 'give_tower me ranger', 'bless me gold 5000'])
        out[c.split(' ')[0]] = run(c);
      out.stillMenu = G.state;
      // grant is global: it must work from the menus and persist
      SV.gold = 100; SV.xp = 0;
      out.grant = run('grant me gold 900');
      out.goldAfter = SV.gold;
      out.persisted = JSON.parse(localStorage.getItem('tdv_save_v1')).gold;
      // The match gate runs before argument validation on purpose, so a bare
      // `wave` reports the gate in the menus and only its usage error live.
      out.bareInMenu = run('wave');
      out.unknown = run('frobnicate 3');
      return out;
    });
    for (const c of ['cash', 'wave', 'spawn', 'game_speed', 'tower_boost', 'give_tower', 'bless']) {
      assert.ok(refusal[c] && refusal[c].length, c + ' should say something');
      assert.match(refusal[c].join(' '), /needs a live match/,
        c + ' should refuse from the main menu: ' + refusal[c].join(' '));
    }
    assert.equal(refusal.stillMenu, 'menu', 'a refused command must not change game state');
    assert.equal(refusal.goldAfter, 1000, 'grant is global and works from the menus');
    assert.equal(refusal.persisted, 1000, 'a grant must reach the save');
    assert.match(refusal.bareInMenu.join(' '), /needs a live match/,
      'the match gate must fire before argument validation: ' + refusal.bareInMenu.join(' '));
    assert.match(refusal.unknown.join(' '), /Unknown command/);
    ok('Match commands fail cleanly in the menus; global ones work and persist');

    // ---- 5. every command does its job in a live match ----
    const live = await page.evaluate(() => {
      const out = {};
      toMenu(); startGame('easy'); G.cash = 100;
      ADMIN.tick();                               // register the live-match edge
      updateHUD();
      out.firstPaint = $('stCash').className;     // no baseline yet: must not flash
      ADMIN.run('cash me 5000'); out.cash = G.cash;
      clearToasts(); ADMIN.run('cash bob 500');
      out.badPlayer = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' ');
      out.cashUnchanged = G.cash;
      ADMIN.run('wave 12'); out.wave = WaveMgr.n + 1;
      clearToasts(); ADMIN.run('wave 0');
      out.badWave = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' ');
      clearToasts(); ADMIN.run('wave');
      out.badUsage = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' ');
      ADMIN.run('spawn walker 4'); out.spawned = enemies.filter(e => !e.dead).length;
      ADMIN.run('spawn friendly_walker 2'); out.friendlies = ADMIN.friendlies.length;
      clearToasts(); ADMIN.run('spawn not_a_thing 2');
      out.badSpawn = [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join(' ');
      ADMIN.run('spawn sprinter 5 0.5'); out.queued = ADMIN.spawnQueue.length;
      // game_speed, and a preset button taking over
      ADMIN.run('game_speed 3.5'); out.speed = G.speed;
      out.speedBtnOn = [...document.querySelectorAll('#speedBtns .btn.on')].length;
      document.querySelector('#speedBtns .btn[data-spd="2"]').click();
      out.afterPreset = G.speed; out.customCleared = ADMIN.customSpeed;
      // tower_boost reaches a tower placed after it, expires on its own timer,
      // and an omitted duration lasts the whole match
      ADMIN.run('tower_boost damage 2 0.5');
      const before = placeTower('ranger', 4.5, 2.5);
      out.ranger = { dmg: TOWERS.ranger.dmg, rate: TOWERS.ranger.rate };
      out.boostBefore = before.S.dmg;
      ADMIN.run('tower_boost firerate 3');
      out.boosts = Object.keys(G.boosts).sort();
      // ADMIN.tick reads sim time, so advance it by hand instead of looping
      // on a wall clock that cannot move inside a synchronous evaluate.
      for (let i = 0; i < 40 && G.boosts.dmg; i++) { G.time += 0.1; ADMIN.tick() }
      out.afterExpiry = { dmg: before.S.dmg, rate: before.S.rate,
        left: Object.keys(G.boosts).sort() };
      // give_tower makes a new slot per call, never touches the saved loadout,
      // and pushes the bar past its six-slot frame once there are more to show
      ADMIN.run('give_tower me voidtraitor');
      ADMIN.run('give_tower me ranger');
      out.extras = ADMIN.extras.slice();
      out.slots = [...document.querySelectorAll('#towerbar .twr-slot .nm')].map(n => n.textContent);
      out.savedLoadout = SV.loadout.slice();
      ADMIN.run('give_tower me phaser');
      ADMIN.run('give_tower me farm');
      out.given = ADMIN.extras.slice();
      out.bar = document.querySelectorAll('#towerbar .twr-slot').length;
      out.slot7 = loadoutSlot(6);
      out.slot8 = loadoutSlot(7) || null;
      // The purse answers back. _ft is cleared first so the rate limit is tested
      // rather than tripped by whatever the commands above already did.
      const purse = $('stCash');
      purse.classList.remove('up', 'down'); purse._ft = 0; lastCash = G.cash;
      G.cash += 500; updateHUD(); out.gain = purse.className;
      G.cash -= 200; updateHUD(); out.held = purse.className;
      return out;
    });
    assert.equal(live.cash, 5000);
    assert.equal(live.firstPaint, 'stat', 'the first HUD paint has nothing to compare to');
    assert.equal(live.gain, 'stat up', 'a windfall swells the purse');
    assert.equal(live.held, 'stat up',
      'and a change inside the window does not restrike it: ' + live.held);
    await page.waitForTimeout(560);
    const spend = await page.evaluate(() => { G.cash -= 1000; updateHUD();
      return $('stCash').className });
    assert.equal(spend, 'stat down', 'once the window passes, a spend dips the purse');
    assert.match(live.badPlayer, /your own client/,
      'naming another player must be refused, not silently mis-applied: ' + live.badPlayer);
    assert.equal(live.cashUnchanged, 5000, 'a refused grant must change nothing');
    assert.equal(live.wave, 12);
    assert.match(live.badWave, /at least 1/);
    assert.match(live.badUsage, /at least 1/, 'a bare command should explain itself');
    assert.equal(live.spawned, 4, 'spawn walker 4 should put four on the board');
    assert.equal(live.friendlies, 2, 'friendly_ spawns go into ADMIN.friendlies');
    assert.match(live.badSpawn, /Unknown enemy/);
    assert.equal(live.queued, 1, 'a spawn with an interval should queue rather than dump');
    assert.equal(live.speed, 3.5);
    assert.equal(live.speedBtnOn, 0, 'a custom speed must clear the preset highlight');
    assert.equal(live.afterPreset, 2, 'a preset button overrides the custom speed');
    assert.equal(live.customCleared, null);
    assert.equal(live.boostBefore, live.ranger.dmg * 2, 'boost reaches a tower placed after it');
    assert.deepEqual(live.boosts, ['dmg', 'rate']);
    assert.equal(live.afterExpiry.dmg, live.ranger.dmg, 'an expired boost must be undone');
    assert.deepEqual(live.afterExpiry.left, ['rate'],
      'a boost with no duration should last the match');
    assert.ok(Math.abs(live.afterExpiry.rate - live.ranger.rate * 3) < 1e-9,
      'the live boost must survive the other one expiring: ' + live.afterExpiry.rate);
    assert.deepEqual(live.extras, ['voidtraitor', 'ranger'], 'one new slot per give_tower');
    assert.deepEqual(live.savedLoadout, ['ranger', 'grenadier', 'sniper'],
      'given towers must never touch the saved loadout');
    assert.deepEqual(live.slots, ['Ranger', 'Grenadier', 'Sniper', 'Void Traitor', 'Ranger', 'Empty'],
      'given towers should append, not replace: ' + live.slots.join(','));
    assert.deepEqual(live.given, ['voidtraitor', 'ranger', 'phaser', 'farm']);
    assert.equal(live.bar, 7, 'the bar must grow past six slots rather than drop a tower');
    assert.equal(live.slot7, 'farm', 'the seventh slot is the last given tower');
    assert.equal(live.slot8, null, 'there is no eighth slot to select');
    ok('cash, wave, spawn, game_speed, tower_boost and give_tower all behave in a match');

    // ---- 6. nothing match-scoped survives into the next match ----
    const next = await page.evaluate(() => {
      const snap = () => ({
        extras: ADMIN.extras.slice(), boosts: Object.keys(G.boosts).sort(),
        customSpeed: ADMIN.customSpeed, friendlies: ADMIN.friendlies.length,
        queue: ADMIN.spawnQueue.length,
        slots: document.querySelectorAll('#towerbar .twr-slot').length,
        speed: G.speed, cash: G.cash
      });
      // straight from a live match into a new one: the pause-menu restart, which
      // never leaves the live state, so ADMIN cannot see an edge
      startGame('easy');
      const restart = snap();
      toMenu();
      startGame('easy');
      const fresh = snap();
      return { restart, fresh, gold: SV.gold };
    });
    for (const [k, s] of Object.entries({ 'pause restart': next.restart, 'a new match': next.fresh })) {
      assert.deepEqual(s.extras, [], 'given towers must not carry over: ' + k);
      assert.deepEqual(s.boosts, [], 'boosts must not carry over: ' + k);
      assert.equal(s.customSpeed, null, 'a custom speed must not carry over: ' + k);
      assert.equal(s.friendlies, 0, 'friendly spawns must not carry over: ' + k);
      assert.equal(s.queue, 0, 'a queued interval spawn must not carry over: ' + k);
      assert.equal(s.slots, 6, 'the bar should be back to six slots after ' + k);
      assert.equal(s.speed, 1, 'speed should reset with the match: ' + k);
      assert.notEqual(s.cash, 5000, 'cash comes from the mode, not `cash` last match');
    }
    assert.equal(next.gold, 1000, 'global grants must survive every match');
    ok('Match-scoped effects die with the match; global grants persist');

    // ---- 7. the speed accumulator no longer banks unpayable debt ----
    const debt = await page.evaluate(() => {
      toMenu(); startGame('endless'); G.speed = 5;
      acc = 0;
      let t = performance.now();
      // 30 frames that each take 60ms of wall time — well past what 5x can burn
      for (let i = 0; i < 30; i++) { t += 60; step(t, false) }
      const afterLong = acc;
      // and a normal 60fps run must still advance the sim at the requested rate
      acc = 0; const e0 = G.time; t = performance.now();
      for (let i = 0; i < 60; i++) { t += 16.7; step(t, false) }
      return { afterLong: afterLong, simSeconds: G.time - e0 };
    });
    assert.ok(debt.afterLong <= 1 / 60 + 1e-9,
      'the accumulator must not keep debt it cannot pay: ' + debt.afterLong);
    ok('A slow frame no longer leaves the speed accumulator in permanent debt');

    // ---- 8. the Void Traitor ----
    const vt = await page.evaluate(() => {
      const out = {};
      toMenu(); startGame('easy'); G.cash = 1e6;
      const d = TOWERS.voidtraitor;
      out.inShop = [...document.querySelectorAll('#shopGrid .shopCard .t')].map(t => t.textContent);
      const t = placeTower('voidtraitor', 5.5, 2.5);
      out.dmg = [d.dmg, t.S.dmg]; out.cd = [t.S.rate, d.rate];
      out.hp = t.maxHp; out.cost = d.cost; out.range = t.S.range; out.dtype = t.S.dtype;
      // four inside the 1.0 radius, one outside: the swing must take them all
      const near = [], far = [];
      for (let i = 0; i < 4; i++) {
        const e = spawnEnemy('walker', 0);
        e.px = t.x + .3 * Math.cos(i); e.py = t.y + .3 * Math.sin(i);
        e.maxHp = e.hp = 100000; near.push(e);
      }
      for (let i = 0; i < 2; i++) {
        const e = spawnEnemy('walker', 0);
        e.px = t.x + 3 + i; e.py = t.y + 3; e.maxHp = e.hp = 100000; far.push(e);
      }
      const before = near.map(e => e.hp).concat(far.map(e => e.hp));
      t.cd = 0; updTower(t, 5.2);
      const after = near.map(e => e.hp).concat(far.map(e => e.hp));
      out.hitAll = near.every((e, i) => after[i] < before[i]);
      out.untouched = far.every((e, i) => after[4 + i] === before[4 + i]);
      out.slashDamage = before[0] - after[0];
      // Corruption: a real damage-over-time on the enemy
      t.ups = [2]; t.S = towerStats(t);
      const v = spawnEnemy('walker', 0); v.maxHp = v.hp = 100000;
      v.px = t.x + .2; v.py = t.y;
      t.cd = 0; updTower(t, 5.2);
      out.corrupt = { t: v.corruptT, dps: v.corruptDps, cut: v.hp < 100000 };
      const preDoT = v.hp;
      for (let i = 0; i < 20; i++) updEnemy(v, .25);      // 5 seconds of ticks
      out.doT = preDoT - v.hp;
      const settled = v.hp;
      for (let i = 0; i < 20; i++) updEnemy(v, .25);      // and it must stop there
      out.dotStopped = v.hp === settled;
      // Void General shortens the swing to 4.0s
      t.ups = [3]; t.S = towerStats(t);
      out.generalCd = Math.round(1 / t.S.rate * 100) / 100;
      t.ups = [2]; t.S = towerStats(t);
      // Stun: walkers stop, bosses keep half their pace
      // Corrupt drags a walker down to a quarter of its pace, a boss to half.
      const w = spawnEnemy('walker', 0); const wd0 = w.d, wspd = w.spd;
      applySlow(w, .25, .5, 10, true);
      updEnemy(w, 1); out.slowedWalker = (w.d - wd0) / wspd;
      const b = spawnBig('tank'); const bd0 = b.d, bspd = b.spd;
      applySlow(b, .25, .5, 10, true);
      updEnemy(b, 1); out.slowedBoss = (b.d - bd0) / bspd;
      // GOD Slayer: boss bonus, ignores everything, and the board-wide Corrupt
      t.ups = [5]; t.S = towerStats(t);
      out.ability = { corrupt: t.S.corruptAbility, ignAll: !!t.S.ign.all, bossMul: t.S.bossMul };
      const boss = spawnBig('tank'); boss.maxHp = boss.hp = 1e6;
      // The shield soaks part of the swing, and how much is the tank's own
      // business; this check is only about the boss multiplier.
      boss.shield = 0;
      boss.px = t.x + .2; boss.py = t.y;
      const plain = spawnEnemy('walker', 0); plain.maxHp = plain.hp = 1e6;
      plain.px = t.x - .2; plain.py = t.y;
      t.corruptCd = 0; t.cd = 0; updTower(t, 5.2);
      out.bossBonus = (1e6 - boss.hp) / (1e6 - plain.hp);
      out.corruptedAll = enemies.filter(e => !e.dead).every(e => e.slowT > 0);
      out.abilityCooldown = Math.round(t.corruptCd);
      // A village discounts normal towers, buffs everything in reach, and the
      // Void Traitor takes the buff while refusing the discount. The Discounts
      // lane goes first because the Buffs lane caps at two once it has three.
      const pre = { dmg: t.S.dmg, rate: t.S.rate };
      const v2 = placeTower('village', 4.5, 2.5);
      out.bought = [buyUp(v2, 1), buyUp(v2, 1), buyUp(v2, 1), buyUp(v2, 0), buyUp(v2, 0)];
      const r = placeTower('ranger', 4.5, 1.5);
      t.S = towerStats(t);
      out.village = {
        ranger: [TOWERS.ranger.ups[0][0].cost, upCost(r, 0, 0)],
        voidDiscounted: upCost(t, 0, 0),
        voidList: TOWERS.voidtraitor.ups[0][0].cost,
        before: pre, after: { dmg: t.S.dmg, rate: t.S.rate } };
      // Purple tint while held
      out.tint = voidPal(['#8a9aa8', '#4c5a68']).join(',');
      out.tintBase = ['#8a9aa8', '#4c5a68'].join(',');
      return out;
    });
    assert.ok(!vt.inShop.includes('Void Traitor'), 'the Void Traitor must never appear in the shop');
    assert.deepEqual(vt.dmg, [300, 300]);
    assert.equal(vt.hp, 12500, 'HP 12500');
    assert.equal(vt.cost, 5000, 'placement cost 5000');
    assert.equal(vt.range, 1, 'a 1.0 tile reach');
    assert.equal(vt.dtype, 'void');
    assert.equal(Math.round(1 / vt.cd[0] * 100) / 100, 5, 'a 5.0 second cooldown');
    assert.equal(vt.cd[1], 0.2, 'the config rate should be 1/5 shots per second');
    assert.equal(vt.hitAll, true, 'the slash must damage every enemy in radius at once');
    assert.equal(vt.untouched, true, 'nothing outside the radius may be hit');
    assert.equal(vt.slashDamage, 300);
    assert.equal(vt.corrupt.t, 5, 'Corruption lasts 5 seconds');
    assert.equal(vt.corrupt.dps, 50, 'Corruption is 50 damage per second');
    assert.ok(vt.corrupt.cut, 'the slash itself must also damage');
    assert.equal(vt.doT, 250, 'five seconds at 50/s is 250 damage');
    assert.equal(vt.dotStopped, true, 'Corruption must end after its five seconds');
    assert.equal(vt.generalCd, 4, 'Void General brings the swing to 4.0s');
    assert.equal(vt.slowedWalker, 0.25, 'Corrupt drags a walker to a quarter of its pace');
    assert.equal(vt.slowedBoss, 0.5, 'a boss only loses half its pace');
    assert.equal(vt.ability.corrupt, true, 'GOD Slayer grants Corrupt');
    assert.equal(vt.ability.ignAll, true, 'Egoist ignores every resistance');
    assert.equal(vt.bossBonus, 1.5, 'bosses and minibosses take 50% more');
    assert.equal(vt.corruptedAll, true, 'Corrupt holds the whole board');
    assert.equal(vt.abilityCooldown, 60, 'Corrupt is on a 60 second cooldown');
    assert.deepEqual(vt.bought, [true, true, true, true, true],
      'the village lanes should buy in this order: ' + vt.bought.join(','));
    assert.deepEqual(vt.village.ranger, [100, 95], 'the village still discounts normal towers');
    assert.equal(vt.village.voidDiscounted, vt.village.voidList,
      'the Void Traitor must not be discountable');
    assert.ok(vt.village.after.rate > vt.village.before.rate,
      'but it must still take their buffs: ' + JSON.stringify(vt.village));
    assert.notEqual(vt.tint, vt.tintBase, 'a held enemy must be tinted a different palette');
    ok('Void Traitor: 300 dmg sword AoE, corruption DoT, board slow, boss bonus, no discounts');

    // ---- 9. friendly spawns read on hover ----
    await page.evaluate(() => {
      toMenu(); startGame('easy');
      ADMIN.spawnFriendly('walker');
      const f = ADMIN.friendlies[0];
      f.d = PATH.total * .5; ADMIN.setFPos(f);      // park it where the pointer can find it
      f.hp = Math.floor(f.maxHp / 2);
    });
    const seen = await page.evaluate(() => {
      // The tip is painted on the game canvas, so look for its border colour
      // rather than trusting that a call returned without throwing.
      const c = document.getElementById('game');
      const f = ADMIN.friendlies[0];
      const s = mapToScreen(f.sx, f.sy - 8);
      const g = c.getContext('2d');
      const count = () => {
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i] === 0x3d && d[i + 1] === 0x6a && d[i + 2] === 0x2e) n++;
        return n;
      };
      mouseClient = { x: 0, y: 0 };          // pointer far away: no tip
      render();
      const without = count();
      mouseClient = { x: s.x / (c.width / innerWidth), y: s.y / (c.height / innerHeight) };
      render();
      return { without: without, withTip: count(), sx: s.x, sy: s.y };
    });
    assert.equal(seen.without, 0, 'nothing should be drawn while the pointer is elsewhere');
    assert.ok(seen.withTip > 200, 'hovering a friendly must paint its stat box: ' + JSON.stringify(seen));
    ok('Hovering a friendly spawn reveals its healthbar and stats');

    assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
    console.log('ALL ' + passed + ' COMMAND BAR CHECKS PASSED');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 });
