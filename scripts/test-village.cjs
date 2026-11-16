// Regression tests for Village -> upgrade-price discounts.
// Two bugs lived here at once: the side panel printed the undiscounted list
// price while checkout charged the discounted one, and villageAura ranked its
// helpers by a mixed sum so a third neighbouring village could cancel a
// discount outright. Isolated worker with in-memory KV; production untouched.
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
    body: JSON.stringify({ username: 'village_tester', password: 'isolated-village-check-only' })
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
      localStorage.setItem('tdv_cloud_user', 'village_tester');
      window.close = () => {};
    }, { token: account.token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready &&
      document.getElementById('bootScreen').classList.contains('gone'));

    const r = await page.evaluate(() => {
      toMenu(); hideScreens(); startGame('easy');
      const out = {};
      const board = () => { towers.length = 0; G.cash = 1e6 };
      const vAt = (x, y) => placeTower('village', x, y);
      const buy = (v, lane, times) => { for (let i = 0; i < times; i++) buyUp(v, lane) };
      const ranger = () => placeTower('ranger', 4.5, 2.5);
      // 1. a fresh village lifts range/firate but costs the same
      board();
      const fresh = vAt(3.5, 2.5);
      const t = ranger();
      out.fresh = { discount: villageAura(t.x, t.y, t).discount, price: upCost(t, 0, 0),
        list: TOWERS.ranger.ups[0][0].cost };
      // 2. the Discounts path lowers the price, and never on a lane's last step
      board();
      const d1 = vAt(3.5, 2.5);
      buy(d1, 1, 3);
      const t2 = ranger();
      const lane = TOWERS.ranger.ups[0];
      out.lane = d1.S.vDiscount.toFixed(2) + '/' + lane.map((u, i) =>
        u.cost + '>' + upCost(t2, 0, i)).join(' ') + '/' + TOWERS.ranger.ups[1][4].cost +
        '>' + upCost(t2, 1, 4);
      // 3. fully invested discounts village: .05+.10+.15 = 30% off
      board();
      const d2 = vAt(3.5, 2.5);
      buy(d2, 1, 5);
      const t3 = ranger();
      out.max = { own: d2.S.vDiscount.toFixed(2), aura: villageAura(t3.x, t3.y, t3).discount.toFixed(2),
        price: upCost(t3, 0, 0) };
      // 4. same path across two villages takes the max, not the sum
      board();
      const a = vAt(3.5, 2.5), b = vAt(2.5, 3.5);
      buy(a, 1, 3); buy(b, 1, 3);
      const t4 = ranger();
      out.samePath = villageAura(t4.x, t4.y, t4).discount.toFixed(2);
      // 5. different paths stack, and a third village must not cancel the discount
      board();
      const dv = vAt(3.5, 2.5), bv1 = vAt(4.5, 4.0), bv2 = vAt(2.5, 4.0);
      buy(dv, 1, 3); buy(bv1, 0, 3); buy(bv2, 0, 3);
      const t5 = ranger();
      out.stacked = villageAura(t5.x, t5.y, t5);
      out.withThird = { price: upCost(t5, 0, 0), list: TOWERS.ranger.ups[0][0].cost };
      buy(bv2, 0, 2);                                       // a fourth buy, still 3 helpers
      out.fourthHelper = villageAura(t5.x, t5.y, t5).discount.toFixed(2);
      // 6. outside every village radius nothing is discounted
      board();
      const v6 = vAt(3.5, 2.5);
      buy(v6, 1, 3);
      let far = null;
      const reach = villageRadius(v6) + 0.6;          // the vRadius buy widens the aura
      for (let ring = reach; ring <= reach + 10 && !far; ring += 0.5)
        for (let i = 0; i < 32 && !far; i++) {
          const ang = i / 32 * Math.PI * 2;
          const x = Math.round((v6.x + Math.cos(ang) * ring) * 10) / 10;
          const y = Math.round((v6.y + Math.sin(ang) * ring) * 10) / 10;
          if (canPlaceAt(x, y)) far = { x: x, y: y };
        }
      const t6 = placeTower('ranger', far.x, far.y);
      out.outOfRange = { gap: Math.hypot(far.x - v6.x, far.y - v6.y).toFixed(2),
        radius: villageRadius(v6).toFixed(2),
        price: upCost(t6, 0, 0), list: TOWERS.ranger.ups[0][0].cost };
      // 7. what the panel shows, and what the till actually charges
      board();
      const v7 = vAt(3.5, 2.5);
      buy(v7, 1, 3);
      const t7 = ranger();
      selectTower(t7);
      const cell = document.querySelector('#spLanes .up[data-l="0"][data-i="0"] .c');
      const statRow = [...document.querySelectorAll('#spStats .statrow')]
        .find(row => /Village discount/.test(row.textContent));
      out.panel = { shown: cell.dataset.p, struck: (cell.querySelector('s') || {}).textContent,
        charged: (cell.querySelector('em') || {}).textContent,
        stat: statRow ? statRow.textContent : 'none' };
      const before = G.cash;
      buyUp(t7, 0);
      out.charged = before - G.cash;
      // 8. selling the village puts the list price back
      sellTower(v7);
      out.afterSale = upCost(t7, 0, 1);
      out.afterSaleList = TOWERS.ranger.ups[0][1].cost;
      // 9. the Fallen Obsidian King stuns every tower on the board, mills and
      // villages included. Those two used to leave updTower before the stun timer
      // ran down, so their STUNNED mark stayed for the rest of the match.
      board();
      const mill = placeTower('farm', 6.5, 3.5);
      const vil9 = vAt(3.5, 2.5), rg9 = ranger();
      for (const t of towers) t.stunT = 3;
      for (let s = 0; s < 200; s++) for (const t of towers) updTower(t, 1 / 60);
      out.stun = { mill: mill.stunT, village: vil9.stunT, ranger: rg9.stunT };
      return out;
    });

    assert.equal(r.fresh.discount, 0, 'a fresh village should not discount anything');
    assert.equal(r.fresh.price, r.fresh.list, 'a fresh village should leave the list price alone');
    ok('A fresh village grants range/firate but no discount');

    assert.match(r.lane, /^0\.05\/100>95 175>166 500>475 650>618 1200>1200\/1450>1450$/,
      'every non-final upgrade should take 5% off, the last one in each lane none: ' + r.lane);
    ok('Discount applies to every upgrade except a lane’s final step');

    assert.equal(r.max.own, '0.30', 'the Discounts path should total 30%');
    assert.equal(r.max.aura, '0.30', 'one village should supply the full 30%');
    assert.equal(r.max.price, 70, '30% off a $100 upgrade is $70');
    ok('A fully invested Discounts village cuts 30% off');

    assert.equal(r.samePath, '0.05', 'two Discounts villages must not add up');
    ok('Two villages on the same path take the max, not the sum');

    assert.equal(Math.round(r.stacked.discount * 100) / 100, 0.05,
      'a third neighbouring village cancelled the discount');
    assert.equal(r.withThird.price, 95, 'the price must reflect the discount while clustered');
    assert.ok(r.stacked.dmg > 0 && r.stacked.range > 0.05,
      'Buffs and Discounts paths should stack on one tower');
    assert.equal(r.fourthHelper, '0.05', 'any number of villages must still respect the discount');
    ok('Neighbouring villages never cancel a discount');

    assert.ok(+r.outOfRange.gap > +r.outOfRange.radius, 'probe tower should sit outside the aura');
    assert.equal(r.outOfRange.price, r.outOfRange.list, 'no aura, no discount');
    ok('A tower outside the village radius pays full price');

    assert.equal(r.panel.shown, '95', 'the panel should print the discounted price');
    assert.equal(r.panel.struck, '$100', 'the list price should stay visible, struck through');
    assert.equal(r.panel.charged, '$95');
    assert.match(r.panel.stat, /Village discount\s*5% off upgrades/);
    assert.equal(r.charged, 95, 'what the panel shows is what the till charges');
    ok('Panel price, stat row and checkout all agree');

    assert.equal(r.afterSale, r.afterSaleList, 'selling the village should restore list prices');
    ok('Selling the village invalidates the cached discount');

    assert.ok(r.stun.mill <= 0, 'a stunned mill should recover, stunT stayed ' + r.stun.mill);
    assert.ok(r.stun.village <= 0, 'a stunned village should recover, stunT stayed ' + r.stun.village);
    assert.ok(r.stun.ranger <= 0, 'a combat tower should recover too');
    ok("The King's stun wears off on mills and villages, not only on guns");

    await page.screenshot({ path: path.join(root, 'outputs', 'ui', 'village-discount-desktop.png') });
    assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
    console.log('ALL ' + passed + ' VILLAGE CHECKS PASSED');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 });
