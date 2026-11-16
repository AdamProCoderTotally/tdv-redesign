// Regression tests for the rewards and the endings:
//
//   * the two staff badges — Blessed (a developer gave you something) and
//     Meet n' Greet (you shared a lobby or match with one),
//   * the gift relay that carries a developer's blessing across a real match,
//   * the synthesized score and which screen it belongs to,
//   * the victory / defeat / secret result cards, including the one property
//     the ending exists to have: it never cuts.
//
// Isolated worker with in-memory KV and throwaway *_tester accounts; nothing
// here touches a production save, the deployed worker, or the releases bucket.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
// The dev shim already knows how to run the real worker against in-memory KV
// AND emulated Durable Objects, which is what a two-party relay needs.
const { makeEnv } = require('./mpshim.js');

async function main() {
  const root = path.resolve(__dirname, '..');
  const { worker, env } = await makeEnv();
  const api = async (p, body) => {
    const r = await worker.fetch(new Request('https://tdv.test' + p, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    }), env);
    return { status: r.status, j: await r.json() };
  };
  const register = async name => {
    const r = await api('/api/register', { username: name, password: 'isolated-results-check-only' });
    assert.ok(r.j.ok, 'register ' + name + ': ' + r.j.err);
    return r.j.token;
  };
  const devTok = await register('alice_tdv');          // developer under the shim
  const guestReg = await api('/api/register', {
    username: 'results_tester', password: 'isolated-results-check-only'
  });
  assert.ok(guestReg.j.ok);
  const guest = guestReg.j;

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
  const shot = (page, name) => page.screenshot({ path: path.join(root, 'outputs', 'ui', name) });

  try {
    // ---- 1. the relay, against the worker itself ----
    // A blessing is a claim the worker carries, never a write it performs: the
    // recipient's own client applies it. These four checks are the whole policy.
    const created = await api('/api/mp/create', { token: devTok, mode: 'pvp' });
    assert.ok(created.j.ok && created.j.lobby.code, 'lobby create: ' + JSON.stringify(created.j));
    const code = created.j.lobby.code;
    await api('/api/mp/join', { token: guest.token, code: code });
    const started = await api('/api/mp/start', { token: devTok });
    assert.ok(started.j.ok, 'match start: ' + JSON.stringify(started.j));

    const stranger = await api('/api/mp/cmd',
      { token: guest.token, c: 'bless', to: 'alice_tdv', what: 'gold', n: 10 });
    assert.equal(stranger.status, 403, 'only staff may bless: ' + stranger.status);
    const wrongKind = await api('/api/mp/cmd',
      { token: devTok, c: 'bless', to: 'results_tester', what: 'badge', n: 10 });
    assert.equal(wrongKind.status, 400, 'a gift is gold, exp or tower: ' + JSON.stringify(wrongKind.j));
    const absent = await api('/api/mp/cmd',
      { token: devTok, c: 'bless', to: 'who_is_this', what: 'gold', n: 10 });
    assert.equal(absent.status, 400, 'the gift must be addressed to somebody in this match');
    const huge = await api('/api/mp/cmd',
      { token: devTok, c: 'bless', to: 'results_tester', what: 'gold', n: 1e9 });
    assert.equal(huge.status, 200, 'a legal gift is accepted: ' + JSON.stringify(huge.j));
    await api('/api/mp/cmd', { token: devTok, c: 'bless', to: 'results_tester', what: 'tower', key: 'phaser' });

    const poll = await api('/api/mp/game', { token: guest.token, cursor: 0, cmdCursor: 0 });
    const gifts = (poll.j.game.cmds || []).filter(c => c.c === 'bless');
    assert.equal(gifts.length, 2, 'both gifts should arrive: ' + JSON.stringify(poll.j.game.cmds));
    assert.equal(gifts[0].n, 100000, 'a billion gold is capped at the gift limit, not honoured');
    assert.equal(gifts[0].by, 'alice_tdv', 'the gift must name who gave it — that is the badge');
    assert.equal(gifts[0].to, 'results_tester');
    assert.equal(gifts[1].key, 'phaser', 'a tower gift carries the key for the receiver to resolve');
    const devPoll = await api('/api/mp/game', { token: devTok, cursor: 0, cmdCursor: 0 });
    assert.equal((devPoll.j.game.cmds || []).length, 0,
      "the giver's own client must never receive its own gift back");
    ok('A developer gift crosses the match, capped, addressed, and never echoed to the giver');

    // ---- browser ----
    browser = await chromium.launch({
      channel: 'msedge', headless: true,
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio']
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message + ' @ ' +
      String(error.stack || '').split('\n').slice(1, 3).join(' <- ').trim()));
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
      localStorage.setItem('tdv_cloud_user', 'results_tester');
      window.close = () => {};
    }, { token: guest.token });
    await page.goto('http://127.0.0.1:' + port + '/index.html');
    await page.waitForFunction(() => Cloud.ready &&
      document.getElementById('bootScreen').classList.contains('gone'));

    // ---- 2. the score is written to spec ----
    // A pattern shorter than its loop does not repeat early, it leaves the rest
    // of the loop silent, and that is invisible until somebody listens.
    const score = await page.evaluate(() => {
      const out = { bad: [], loops: {} };
      for (const k in TRACKS) {
        const t = TRACKS[k];
        for (const v of t.voices) {
          try { parsePattern(v.pat, t.bars) }
          catch (e) { out.bad.push(k + '/' + v.v + ': ' + e.message) }
        }
        // a cue has to be long enough to be worth hearing
        out.loops[k] = +(t.bars * 16 * 60 / t.bpm / 4).toFixed(2);
      }
      out.pitch = [tokHz('A4')[0], tokHz('C5')[0], tokHz('Am').length, tokHz('Bb').length,
        // the parser is case-corrected, so a flat and a note named 'b' must not
        // be confused: Bb4 is the minor third below A4, not B4.
        tokHz('Bb4')[0], tokHz('B4')[0]].map(x => +Number(x).toFixed(2));
      return out;
    });
    assert.deepEqual(score.bad, [], 'every voice pattern must fill its loop: ' + score.bad.join('; '));
    assert.ok(score.loops.secret >= 10, 'the ending cue should outlast the ending itself: ' + score.loops.secret);
    assert.deepEqual(score.pitch, [440, 523.25, 3, 3, 466.16, 493.88],
      'A4=440, C5=523.25, triads are three notes, Bb4 sits below B4: ' + score.pitch.join(','));
    ok('The score parses: full-length patterns, a 12-second ending cue, and a sane tuning');

    // ---- 3. which screen owns which cue ----
    const routing = await page.evaluate(() => {
      const seen = {};
      const go = (label, id) => { showScreen(id); seen[label] = Music.name };
      Music.stop();
      go('mpLobby', 'mpLobby');
      go('mpMenu', 'mpMenu');
      go('mainMenu', 'mainMenu');
      go('badges', 'badgesMenu');
      // a match takes the bed away, and the cards that follow put their own cue on
      toMenu(); startGame('easy'); seen.match = Music.name;
      G.lives = G.maxLives; victory(); seen.win = Music.name;
      startGame('easy'); defeat(); seen.lose = Music.name;
      startGame('endless'); startEnding(); seen.secret = Music.name;
      // the ending cue must survive the trip onto its own result card
      showScreen('endMenu'); seen.afterUltimateCard = Music.name;
      toMenu(); seen.backHome = Music.name;
      return seen;
    });
    assert.equal(routing.mpLobby, 'lobby', 'the multiplayer lobby is where the bed belongs');
    assert.equal(routing.mpMenu, 'lobby', 'the multiplayer hub is the same waiting room');
    assert.equal(routing.mainMenu, null, 'the solo menu stays quiet');
    assert.equal(routing.badges, null, 'and so does the honours screen');
    assert.equal(routing.match, null, 'a match has its own sound');
    assert.equal(routing.win, 'win');
    assert.equal(routing.lose, 'lose');
    assert.equal(routing.secret, 'secret', 'the ending starts with the picture, not the card');
    assert.equal(routing.afterUltimateCard, 'secret',
      'the result card rises out of the cue that was already playing');
    assert.equal(routing.backHome, null, 'and it is put away on the way home');
    ok('Every screen is scored, and nothing is scored that should not be');

    const volume = await page.evaluate(() => {
      Sfx.init();
      Music.play('lobby');
      SV.vol = 100; SV.music = 0; Music.apply();
      const off = Music.bus ? Music.bus.gain.value : -1;
      SV.music = 60; Music.apply();
      const mid = Music.bus ? Music.bus.gain.value : -1;
      SV.music = 100; Music.apply();
      const full = Music.bus ? Music.bus.gain.value : -1;
      SV.music = 60; Music.apply();
      return { off: off, mid: mid, full: full, ctx: !!(Sfx.ctx && Music.bus),
        state: Sfx.ctx ? Sfx.ctx.state : 'none' };
    });
    if (volume.ctx) {
      assert.equal(volume.off, 0, 'music off means off');
      assert.ok(Math.abs(volume.mid - .3) < 1e-6, 'the default sits at 60%: ' + volume.mid);
      assert.ok(Math.abs(volume.full - .5) < 1e-6, 'the ceiling is the bus gain: ' + volume.full);
      ok('The music bus has its own level, under master and independent of effects');
    } else {
      ok('Music routing works without an audio device (volume bus unavailable)');
    }

    // ---- 4. the scheduler actually hands every melody line its pitches ----
    // The buckets are what the clock reads each bar. A pitched voice that
    // arrives without its notes is silent music, and nothing else notices.
    const compiled = await page.evaluate(() => {
      const out = {};
      for (const k in TRACKS) {
        Music.play(k);
        const cells = Music.buckets.flat();
        out[k] = {
          bars: Music.buckets.length,
          silentBars: Music.buckets.filter(b => !b.length).length,
          noPitch: cells.filter(c => ['bass', 'pad', 'arp', 'lead', 'bell'].includes(c.o.v) &&
            !(c.o.hz && c.o.hz.length)).length,
          drumPitched: cells.filter(c => ['kick', 'snare', 'hat'].includes(c.o.v) && c.o.hz).length,
          seconds: +(Music.barDur * Music.buckets.length).toFixed(2)
        };
      }
      Music.stop();
      return out;
    });
    for (const k in compiled) {
      assert.equal(compiled[k].noPitch, 0, k + ': a pitched voice reached the clock with no notes');
      assert.equal(compiled[k].drumPitched, 0, k + ': a drum should not carry a pitch');
      assert.equal(compiled[k].silentBars, 0, k + ': every bar should be playing something');
      assert.ok(compiled[k].seconds > 1, k + ': the loop should be long enough to loop: ' + compiled[k].seconds);
    }
    ok('Every cue compiles: notes on every bar, melodies with pitches, drums without');

    // ---- 5. the settings slider ----
    const slider = await page.evaluate(() => {
      toMenu(); refreshSettings(); showScreen('settingsMenu');
      const el = document.getElementById('setMusic');
      const shown = +el.value;
      el.value = '25'; el.dispatchEvent(new Event('input'));
      return { shown: shown, saved: JSON.parse(localStorage.getItem('tdv_save_v1')).music,
        now: SV.music, bus: Music.bus ? +Music.bus.gain.value.toFixed(4) : null,
        playing: Music.name };
    });
    assert.equal(slider.shown, 60, 'the slider should read the saved level, not its HTML default');
    assert.equal(slider.saved, 25, 'a new level has to reach the save');
    assert.equal(slider.now, 25);
    assert.equal(slider.playing, 'lobby',
      'dragging a volume control you cannot hear is not a volume control');
    assert.ok(slider.bus !== null && slider.bus > 0 && slider.bus < .13,
      'and it should actually change the level: ' + slider.bus);
    ok('Music volume: its own slider, its own save field, audible while you drag');

    // ---- 5. the victory card ----
    const win = await page.evaluate(async () => {
      toMenu(); SV.badges = {}; SV.gold = 0; SV.xp = 0;
      startGame('hard');
      WaveMgr.n = MODES.hard.waves; G.kills = 1234; G.lives = G.maxLives = 750;
      const before = { gold: SV.gold, xp: SV.xp };
      victory();
      // the numbers roll up, so give them the time they take
      await new Promise(r => setTimeout(r, 1500));
      const rows = [...document.querySelectorAll('#endStats div')]
        .map(d => d.querySelector('span').textContent + '=' + d.querySelector('b').textContent);
      const px = (() => {
        const c = document.getElementById('endCrest'), g = c.getContext('2d');
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) lit++;
        return lit;
      })();
      return {
        overlay: document.querySelector('#endMenu').className,
        kicker: endKicker.textContent, title: endTitle.textContent, sub: endSub.textContent,
        verdict: document.querySelector('#endVerdict').textContent,
        verdictShown: document.querySelector('#endVerdict').classList.contains('show'),
        pips: document.querySelectorAll('#endPips .pip.on').length,
        meterShown: document.querySelector('#endMeter').classList.contains('show'),
        crest: px, rows: rows,
        goldGiven: SV.gold - before.gold, xpGiven: SV.xp - before.xp,
        modeBadge: !!SV.badges.onfire, music: Music.name,
        expectGold: Math.round(BASE_WIN_GOLD * MODES.hard.rewardMul),
        expectXp: Math.round(BASE_WIN_XP * MODES.hard.rewardMul),
        saved: JSON.parse(localStorage.getItem('tdv_save_v1')).gold === SV.gold
      };
    });
    assert.match(win.overlay, /\bwin\b/, 'the card carries its outcome class');
    assert.equal(win.title, 'VICTORY');
    assert.match(win.kicker, /HARD$/, 'the card should say which mode was beaten: ' + win.kicker);
    assert.equal(win.verdictShown, true, 'a win has something to say about how it went');
    assert.match(win.verdict, /Flawless/, 'full health should read as flawless: ' + win.verdict);
    assert.equal(win.pips, 3, 'untouched base is three honours');
    assert.equal(win.meterShown, false, 'a win has no distance left to measure');
    assert.ok(win.crest > 1500, 'the crest should be drawn, not an empty box: ' + win.crest + 'px');
    assert.equal(win.goldGiven, win.expectGold,
      'the rolled number must land on the real reward: ' + win.rows.join(' / '));
    assert.equal(win.xpGiven, win.expectXp, 'and the same for experience');
    assert.ok(win.rows.join('|').includes('Enemies defeated=1,234'),
      'counting up should finish at the formatted figure, not a placeholder: ' + win.rows.join(' | '));
    assert.equal(win.modeBadge, true, 'beating HARD still earns On Fire');
    assert.equal(win.music, 'win');
    assert.equal(win.saved, true, 'a reward the card announces has to be on the account');
    await shot(page, 'result-win-desktop.png');
    ok('The victory card shows the emblem, the honours, and numbers that arrive');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => showScreen('endMenu'));
    await shot(page, 'result-win-mobile.png');
    const winFit = await page.evaluate(() => {
      const card = document.querySelector('#endMenu .endCard').getBoundingClientRect();
      return { top: card.top, bottom: card.bottom, h: window.innerHeight };
    });
    assert.ok(winFit.top >= -1 && winFit.bottom <= winFit.h + 1,
      'the result card must fit a phone screen: ' + JSON.stringify(winFit));
    ok('The victory card fits 390px');
    await page.setViewportSize({ width: 1440, height: 900 });

    // ---- 6. the defeat card tells you where you got to ----
    const loss = await page.evaluate(async () => {
      toMenu(); startGame('expert');
      placeTower('ranger', 4.5, 2.5);            // no Village, no Farm
      WaveMgr.n = 12; G.kills = 340; G.lives = 0;
      const before = { gold: SV.gold, xp: SV.xp };
      defeat();
      await new Promise(r => setTimeout(r, 2000));
      const fill = document.querySelector('#endMeter .endTrack i');
      return {
        overlay: document.querySelector('#endMenu').className,
        kicker: endKicker.textContent, title: endTitle.textContent,
        verdict: document.querySelector('#endVerdict').textContent,
        tone: document.querySelector('#endVerdict').className,
        label: document.querySelector('#endMeter .endMeterTop span').textContent,
        pct: document.querySelector('#endMeter .endMeterTop b').textContent,
        note: document.querySelector('#endMeter .endMeterNote').textContent,
        // read the width the fill was told to grow to, not its pixel width mid
        // animation
        width: fill ? getComputedStyle(fill).getPropertyValue('--w').trim() : null,
        grown: fill ? +fill.getBoundingClientRect().width > 40 : false,
        rows: [...document.querySelectorAll('#endStats div')]
          .map(d => d.querySelector('span').textContent + '=' + d.querySelector('b').textContent),
        goldGiven: SV.gold - before.gold
      };
    });
    assert.match(loss.overlay, /\blose\b/);
    assert.equal(loss.title, 'DEFEAT');
    assert.match(loss.kicker, /^TEST PLACE · EXPERT$/,
      'the kicker names where and how it ended: ' + loss.kicker);
    assert.match(loss.label, /^WAVE 12 \/ 50$/, 'and the measure holds the wave: ' + loss.label);
    assert.equal(loss.pct, '24%', '12 of 50 waves is a quarter of the run: ' + loss.pct);
    assert.match(loss.note, /38 waves were still to come/,
      'the note adds what the bar cannot show: ' + loss.note);
    assert.equal(loss.width, '24%', 'and the fill itself is sized to that fraction: ' + loss.width);
    assert.equal(loss.tone.includes('hint'), true, 'a loss speaks as advice, not as an epitaph');
    assert.match(loss.verdict, /Village|Farm|stealth|unseen|spot|opening|salvaged/i,
      'the advice has to be about this match: ' + loss.verdict);
    assert.match(loss.verdict, /stealth/i,
      'on EXPERT with no scanner standing, that is the gap: ' + loss.verdict);
    assert.ok(loss.rows.join('|').includes('Gold salvaged='), 'the salvage is still on the card');
    assert.ok(loss.goldGiven > 0, 'and it is actually paid out');
    await shot(page, 'result-lose-desktop.png');
    ok('The defeat card measures the run and says what to change');

    // ---- 7. the ending ----
    const ending = await page.evaluate(async () => {
      toMenu(); startGame('endless');
      G.lives = 40; G.maxLives = 1500; G.kills = 98765;
      startEnding();
      const cv = document.getElementById('game'), g = cv.getContext('2d');
      const E = endDur();
      // Walk the whole sequence and paint it. Two things matter: nothing may
      // ever be fully black before the settle, and no two neighbouring frames
      // may jump — a jump is a cut, however short.
      const step = .05, prof = [];
      for (let t = 0; t <= E; t += step) {
        G.endT = t;
        render();
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        let sum = 0, n = 0;
        // the letterbox belongs to the composition, so sample the picture band
        const y0 = Math.floor(cv.height * .14), y1 = Math.floor(cv.height * .86);
        for (let y = y0; y < y1; y += 6) for (let x = 0; x < cv.width; x += 6) {
          const i = (y * cv.width + x) * 4;
          sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++
        }
        prof.push(+(sum / n / 255).toFixed(4));
      }
      const last = Math.floor((E - 2.5) / step);       // where the settle begins
      const before = prof.slice(0, last);
      const min = Math.min.apply(null, before);
      let jump = 0, at = 0;
      for (let i = 1; i < before.length; i++) {
        const d = Math.abs(before[i] - before[i - 1]);
        if (d > jump) { jump = +d.toFixed(4); at = +(i * step).toFixed(2) }
      }
      // title cards must never overlap, or the two lines print on each other
      const cards = [[3.2, 6.7], [6.7, 9.9], [9.9, 13.4]];
      let overlap = 0;
      for (let t = 0; t <= E; t += step) {
        const live = cards.filter(c => endCardFade(t, c[0], c[1]) > 0).length;
        if (live > 1) overlap = Math.max(overlap, live);
      }
      G.endT = E; render(); finishEnding();
      // the biggest number on the card takes about 1.4s to roll; give it room
      await new Promise(r => setTimeout(r, 2600));
      const letters = document.querySelectorAll('#endTitle > span').length;
      return {
        E: E, min: +min.toFixed(4), jump: jump, at: at, overlap: overlap,
        bloomAtHandover: +endBloom(6.7).toFixed(3),
        // the split title holds a non-breaking space where the words meet
        title: endTitle.textContent.replace(/\u00a0/g, ' ').trim(), crestLit: (() => {
          const c = document.getElementById('endCrest'), x = c.getContext('2d');
          const d = x.getImageData(0, 0, c.width, c.height).data;
          let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) lit++;
          return lit;
        })(),
        letters: letters, overlay: document.querySelector('#endMenu').className,
        verdict: document.querySelector('#endVerdict').textContent,
        badge: !!SV.badges.itends, gold: SV.gold, embers: G.endEmbers,
        music: Music.name, rows: [...document.querySelectorAll('#endStats div')]
          .map(d => d.querySelector('span').textContent + '=' + d.querySelector('b').textContent)
      };
    });
    assert.equal(ending.overlap, 0, 'two title cards must never be on screen at once');
    assert.ok(ending.min > .008,
      'the ending never goes black before its final settle (darkest frame ' + ending.min + ')');
    assert.ok(ending.jump < .06,
      'nothing cuts: the largest step between frames is ' + ending.jump + ' at ' + ending.at + 's');
    assert.ok(ending.bloomAtHandover > .3,
      'a swell of light covers the handover: ' + ending.bloomAtHandover);
    assert.equal(ending.title, 'THE END');
    assert.ok(ending.letters >= 6, 'the last title should arrive letter by letter: ' + ending.letters);
    assert.ok(ending.crestLit > 1500, 'the eclipse crest should be drawn: ' + ending.crestLit);
    assert.match(ending.verdict, /last one/, 'and the card should say what it cost: ' + ending.verdict);
    assert.equal(ending.badge, true, 'It.. Ends? is still the reward for it');
    assert.ok(ending.gold >= 2500, '+2,500 gold for the last wave');
    assert.equal(ending.embers, true, 'the embers keep drifting behind the result card');
    assert.equal(ending.music, 'secret', 'the cue carries on under the card');
    assert.ok(ending.rows.join('|').includes('Enemies defeated=98,765'),
      'the roll-up lands on the real kill count: ' + ending.rows.join(' | '));
    await shot(page, 'result-ultimate-desktop.png');
    ok('The ending dissolves from first frame to result card, and never cuts');

    // ---- 8. Blessed ----
    const blessed = await page.evaluate(async () => {
      toMenu(); SV.badges = {}; SV.gold = 100; SV.xp = 0; SV.owned = ['ranger'];
      const toastTexts = () => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent);
      const out = {};
      // A gift addressed to somebody else is not ours to open.
      MP.inMatch = true; Cloud.user = 'results_tester';
      MP.applyCmds([{ i: 1, c: 'bless', by: 'alice_tdv', to: 'other_player', what: 'gold', n: 5000 }]);
      out.notMine = { gold: SV.gold, badge: !!SV.badges.blessed };
      MP.applyCmds([{ i: 2, c: 'bless', by: 'alice_tdv', to: 'results_tester', what: 'gold', n: 5000 }]);
      out.gold = SV.gold;
      MP.applyCmds([{ i: 3, c: 'bless', by: 'alice_tdv', to: 'results_tester', what: 'exp', n: 800 }]);
      out.xp = SV.xp;
      MP.applyCmds([{ i: 4, c: 'bless', by: 'alice_tdv', to: 'results_tester', what: 'tower', key: 'phaser' }]);
      out.owned = SV.owned.slice();
      // an unknown tower key must not corrupt the save or claim a badge twice
      MP.applyCmds([{ i: 5, c: 'bless', by: 'alice_tdv', to: 'results_tester', what: 'tower', key: 'nope' }]);
      out.badges = Object.keys(SV.badges);
      out.toasts = toastTexts();
      out.level = levelInfo(SV.xp).lvl;
      // and the giver, blessing themselves, is not being blessed
      SV.badges = {}; SV.gold = 0;
      Cloud.role = 'developer';
      startGame('easy'); ADMIN.tick();
      ADMIN.run('bless me gold 400');
      out.self = { gold: SV.gold, badge: !!SV.badges.blessed, toasts: toastTexts() };
      out.saved = JSON.parse(localStorage.getItem('tdv_save_v1'));
      Cloud.role = null;
      MP.inMatch = false;
      return out;
    });
    assert.deepEqual(blessed.notMine, { gold: 100, badge: false },
      'a gift for another account must not be opened here');
    assert.equal(blessed.gold, 5100, 'the gold gift lands');
    assert.equal(blessed.xp, 800, 'and the exp gift');
    assert.deepEqual(blessed.owned, ['ranger', 'phaser'], 'and a gifted tower is unlocked for good');
    assert.deepEqual(blessed.badges, ['blessed'],
      'one badge for the whole batch, and only for being on the receiving end');
    assert.ok(blessed.toasts.some(t => /blessed you/i.test(t)), 'the gift announces who gave it');
    assert.ok(blessed.toasts.some(t => /Blessed/.test(t)), 'and announces the badge');
    assert.equal(blessed.self.gold, 400, 'a developer blessing themselves still gets the gold');
    assert.equal(blessed.self.badge, false, 'but that is a grant, not a blessing');
    assert.equal(blessed.saved.gold, blessed.self.gold, 'every gift reaches the save');
    ok('A developer gift credits the account it was addressed to and earns Blessed');

    // ---- 9. Meet n' Greet ----
    const greet = await page.evaluate(() => {
      const out = {};
      const reset = () => { SV.badges = {}; clearToasts(); toMenu(); };
      reset();
      MP.showLobby({ code: 'ABCDEF', host: 'alice_tdv', status: 'lobby', players: [
        { user: 'alice_tdv', role: 'developer', seen: 1 },
        { user: 'results_tester', role: null, seen: 1 }] });
      out.inLobby = !!SV.badges.meetgreet;
      reset();
      MP.showLobby({ code: 'ABCDEF', host: 'bob_tdv', status: 'lobby', players: [
        { user: 'bob_tdv', role: 'tester', seen: 1 },
        { user: 'results_tester', role: null, seen: 1 }] });
      out.testerOnly = !!SV.badges.meetgreet;
      reset();
      Cloud.user = 'alice_tdv';
      MP.showLobby({ code: 'ABCDEF', host: 'alice_tdv', status: 'lobby', players: [
        { user: 'alice_tdv', role: 'developer', seen: 1 }] });
      out.myself = !!SV.badges.meetgreet;
      Cloud.user = 'results_tester';
      reset();
      // a match roster reads staff, not role
      G.state = 'playing';
      MP.game = { players: [{ user: 'results_tester', role: 'defender', staff: null },
        { user: 'alice_tdv', role: 'invader', staff: 'developer' }] };
      MP.renderRoster();
      out.inMatch = !!SV.badges.meetgreet;
      out.chip = document.querySelector('#mpRoster .stf.dev') ?
        document.querySelector('#mpRoster .stf.dev').textContent.trim() : '';
      // the same fact has to survive onto the result card, where there is no
      // roster left to read
      MP.active = true; MP.inMatch = true; MP.role = 'defender';
      MP.game.winSecs = 600;
      MP.finishMatch({ winner: 'defender', reason: 'survived', elapsed: 600, rewards: {} });
      out.card = [...document.querySelectorAll('#mpeStats div')]
        .map(d => d.querySelector('span').textContent + '=' + d.querySelector('b').textContent);
      out.badges = Object.keys(SV.badges);
      toMenu();
      return out;
    });
    assert.equal(greet.inLobby, true, 'a developer in the lobby is a meeting');
    assert.equal(greet.testerOnly, false, 'a tester is not a developer');
    assert.equal(greet.myself, false, 'and you cannot meet yourself');
    assert.equal(greet.inMatch, true, 'meeting one across a board counts too');
    assert.match(greet.chip, /DEV/, 'the same staff flag the name icon uses: ' + greet.chip);
    assert.ok(greet.card.some(r => r === 'Opponent=alice_tdv · developer'),
      'the result card says who stood the other side: ' + JSON.stringify(greet.card));
    assert.ok(!greet.card.some(r => /^Result=/.test(r)),
      'and spends the row on that instead of repeating the title');
    assert.deepEqual(greet.badges, ['meetgreet'], 'one badge, one honour');
    await shot(page, 'badges-meet-greet.png');
    ok('Meet n\u2019 Greet is awarded for a developer in a lobby or on the other side of a match');

    // ---- 10. the honours screen shows both, with art of their own ----
    const grid = await page.evaluate(() => {
      SV.badges = { blessed: true, meetgreet: true };
      buildBadges();
      const cards = [...document.querySelectorAll('#badgeGrid .shopCard')];
      const painted = i => {
        const g = i.getContext('2d'), d = g.getImageData(0, 0, i.width, i.height).data;
        let lit = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 8) lit++;
        return lit;
      };
      const cvs = [...document.querySelectorAll('#badgeGrid canvas')];
      return {
        count: cards.length, total: BADGES.length, pill: $('badgeCount').textContent,
        names: cards.map(c => c.querySelector('.t').textContent),
        earned: cards.filter(c => /EARNED/.test(c.textContent)).length,
        painted: cvs.map(painted),
        ids: BADGES.map(b => b.id),
        malformed: Object.keys(BADGE_ART).filter(k =>
          BADGE_ART[k].r.length !== 24 || BADGE_ART[k].r.some(r => r.length !== 24))
      };
    });
    assert.equal(grid.count, grid.total, 'every badge in the table gets a card');
    assert.deepEqual(grid.malformed, [], 'badge sprites must all be 24x24');
    assert.ok(grid.ids.includes('blessed') && grid.ids.includes('meetgreet'));
    assert.ok(grid.names.includes('Blessed') && grid.names.includes("Meet n' Greet"),
      'both honours are listed by name');
    assert.equal(grid.earned, 2, 'both new honours read as earned when held');
    assert.equal(grid.painted.length, grid.total, 'every card has its own sprite');
    assert.ok(grid.painted.every(n => n > 150),
      'no badge on the wall may be a blank box: ' + grid.painted.join(','));
    await shot(page, 'badges-grid.png');
    ok('The honours screen carries the two new badges, each with its own art');

    assert.deepEqual(errors, [], 'page errors: ' + errors.join('; '));
    console.log('ALL ' + passed + ' RESULTS CHECKS PASSED');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 });
