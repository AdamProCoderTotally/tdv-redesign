"use strict";
// ============================================================
//  update.js — startup update check, YES/NO prompt, feature locks
//
//  The same flow runs on web and desktop:
//
//   1. black boot screen: "CHECKING FOR UPDATE..."
//   2. newer version published on the current channel?
//        "An update: vX.X.X is available. Proceed?"      [YES] [NO]
//        (Without updating your game, you will lose features including:
//         Multiplayer, Data-saving, and access to the latest content.)
//        YES -> download + install (desktop) / reload (web), then sign in
//        NO  -> play normally, but Multiplayer, cloud saving and the
//               newest content stay locked until you update
//   3. sign in
//   4. developer/tester on stable -> asked whether to switch to the latest
//      pre-release. Settings can always switch back to latest stable.
//   5. a pre-release build refuses to run for anyone without a staff role
//
//  Channel + version live in js/channel.js (baked by scripts/release.js).
//  The manifest is updates/latest.json (stable) or updates/prerelease.json.
// ============================================================
window.TDVUpdate = (function(){

  var RELEASES = 'https://github.com/AdamProCoderTotally/tower-defence-v/releases';
  // desktop reads these from Rust (no CORS / CSP limits); web uses same-origin
  var URLS = {
    stable:     RELEASES + '/latest/download/latest.json',
    prerelease: RELEASES + '/download/prerelease/prerelease.json'
  };

  // exactly the features the YES/NO note promises to lose
  var LOCKS = { mp:1, cloud:1, latest:1 };

  var state = {
    boot:true,            // boot screen still covering the game
    checking:true,
    promptShown:false,    // YES/NO shown (answered or not)
    declined:false,       // NO pressed -> locks on
    mode:null,            // 'update' | 'downgrade' — which prompt is up
    version:null,         // version offered by the manifest
    role:null,
    askedPrerelease:false,
    blocked:false         // pre-release build, no staff role
  };

  function $(id){ return document.getElementById(id) }
  function channel(){
    return (typeof tdvChannel === 'function') ? tdvChannel() : 'stable' }
  function isStaff(){
    var r = state.role || (window.Cloud && Cloud.role) || null;
    return r === 'developer' || r === 'tester' }
  function isDesktop(){ return !!(window.__TAURI__ && window.__TAURI__.core) }

  function invoke(cmd, args){
    try{
      var t = window.__TAURI__;
      if (t && t.core && t.core.invoke) return t.core.invoke(cmd, args);
    }catch(e){}
    return Promise.reject(new Error('no tauri invoke')) }

  function manifestFile(ch){ return ch === 'prerelease' ? 'prerelease.json' : 'latest.json' }

  // ---------------------------------------------------------
  //  reading the manifest
  // ---------------------------------------------------------
  // returns {version:string, notes:string} or null
  function fetchManifest(ch){
    if (isDesktop()){
      return invoke('tdv_check_update', { endpoint: URLS[ch] })
        .then(function(u){ return (u && u.version) ? u : null })
        .catch(function(){
          // older build without the command -> fall back to the plugin's own
          // check, which uses the endpoint baked into tauri.conf.json
          var t = window.__TAURI__;
          if (!t || !t.updater || !t.updater.check) return null;
          return t.updater.check().then(function(up){
            return (up && up.available) ? { version: up.version, notes: up.body } : null
          }).catch(function(){ return null }) });
    }
    return fetch('updates/' + manifestFile(ch), { cache:'no-store' })
      .then(function(r){ return r.ok ? r.json() : null })
      .then(function(j){ return (j && j.version) ? { version:j.version, notes:j.notes } : null })
      .catch(function(){ return null });
  }

  function acked(){
    try{ return localStorage.getItem('tdv_update_ack') }catch(e){ return null } }
  function ack(v){
    try{ localStorage.setItem('tdv_update_ack', v) }catch(e){} }

  // remember "NO" per pre-release version, so staff are only re-offered when
  // something newer is published (Settings can switch channel any time)
  function prereleaseDeclined(v){
    try{ return localStorage.getItem('tdv_prerelease_no') === v }catch(e){ return false } }
  function notePrereleaseDecline(v){
    try{ localStorage.setItem('tdv_prerelease_no', v) }catch(e){} }

  // A "your build is ahead of what's published" step-back is only worth
  // offering when it can actually happen:
  //   - desktop only. A web page carries its version in the deployed files,
  //     so there is nothing to install and YES would do nothing but reload.
  //   - and only while still on the channel this build shipped with. A tester
  //     who deliberately switched to stable knows what they are doing and
  //     should not be re-asked every boot.
  function canDowngrade(){
    return isDesktop() && channel() === TDV_CHANNEL;
  }

  // "my build is newer than anything published" is a separate decision, so it
  // remembers its own answer. Keyed on the version being offered so a later
  // roll-forward to something else re-prompts.
  function downgradeDeclined(v){
    try{ return localStorage.getItem('tdv_down_no') === v }catch(e){ return false } }
  function noteDowngradeDecline(v){
    try{ localStorage.setItem('tdv_down_no', v) }catch(e){} }
  function clearDowngradeDecline(){
    try{ localStorage.removeItem('tdv_down_no') }catch(e){} }

  // ---------------------------------------------------------
  //  feature locks
  // ---------------------------------------------------------
  function locked(k){ return !!(state.declined && LOCKS[k]) }

  function applyLocks(){
    var btn = $('btnMulti');
    if (btn){
      var on = locked('mp');
      btn.classList.toggle('updLock', on);
      var tag = btn.querySelector('.needUpd');
      if (on && !tag){
        tag = document.createElement('span');
        tag.className = 'needUpd';
        tag.textContent = 'UPDATE REQUIRED';
        btn.appendChild(tag);
      } else if (!on && tag) tag.remove();
    }
    if (locked('cloud') && window.Cloud && Cloud.ready){
      if (Cloud.chip) Cloud.chip('bad','UPDATE REQUIRED');
      if (typeof cloudStatus === 'function')
        cloudStatus('Cloud saving is off — update to re-enable', true);
    }
  }

  // ---------------------------------------------------------
  //  boot screen
  // ---------------------------------------------------------
  function bootText(t){ var el = $('bootMsg'); if (el) el.textContent = t }

  // Reveal the boot screen again. Used when the player switches channel from
  // Settings mid-session — the install progress has to go somewhere visible.
  function showBoot(){
    state.boot = true;
    var b = $('bootScreen');
    if (b){
      b.style.display = '';
      b.classList.remove('gone');
    }
  }

  function hideBoot(){
    if (!state.boot) return;
    state.boot = false;
    state.checking = false;
    var b = $('bootScreen');
    if (b){
      b.classList.add('gone');
      setTimeout(function(){ b.style.display = 'none' }, 320);
    }
    if (state.declined){
      setTimeout(function(){
        toast('Update required — Multiplayer, cloud saving and new content are locked')
      }, 420);
    }
    applyLocks();
    maybePromptPrerelease();
  }

  function showPrompt(version){
    state.promptShown = true;
    state.checking = false;
    state.mode = 'update';
    state.version = version;
    if (!state.boot) return;                 // boot was force-dismissed: too late
    $('bpTitle').textContent = 'An update: v' + version + ' is available. Proceed?';
    // restore the canonical note in case a downgrade prompt rewrote it
    var note = $('bpNote');
    if (note) note.textContent = '(Without updating your game, you will lose ' +
      'features including: Multiplayer, Data-saving, and access to the latest content.)';
    var p = $('bootPrompt');
    if (p) p.style.display = 'flex';
    var el = $('bootMsg'); if (el) el.style.display = 'none';
  }

  // The running build is NEWER than anything the channel still publishes —
  // normally because a release went out, people installed it, and it was then
  // pulled. Nothing is broken locally, so this is a prompt and not a gate:
  // declining just remembers the answer and carries on.
  function showDowngradePrompt(version){
    state.promptShown = true;
    state.checking = false;
    state.mode = 'downgrade';
    state.version = version;
    if (!state.boot) return;
    $('bpTitle').textContent =
      'Your build (v' + TDV_VERSION + ') is newer than the latest release (v' +
      version + '). Switch to the latest stable version?';
    var note = $('bpNote');
    if (note) note.textContent = '(The newer build has been pulled. Staying on it ' +
      'may leave you on fixes or content the game no longer serves.)';
    var p = $('bootPrompt');
    if (p) p.style.display = 'flex';
    var el = $('bootMsg'); if (el) el.style.display = 'none';
  }

  function decline(){
    // refusing a step-back is advisory: remember it and keep playing, with no
    // feature locks (those belong to refusing an *update*)
    if (state.mode === 'downgrade'){
      noteDowngradeDecline(state.version);
      state.mode = null;
      hideBoot();
      return;
    }
    state.declined = true;
    hideBoot();
  }

  function accept(){
    state.promptShown = true;
    try{ Sfx.click() }catch(e){}
    if (state.mode === 'downgrade'){ acceptDowngrade(); return; }
    if (isDesktop()){
      bootText('DOWNLOADING UPDATE...');
      installChannel(channel())
        .then(function(){ bootText('UPDATE DONE — RESTARTING...') })
        .catch(function(e){
          console.error('[update] install failed', e);
          bootText('UPDATE FAILED — STARTING GAME...');
          setTimeout(hideBoot, 2400);
        });
    } else {
      ack(state.version);
      location.reload();
    }
  }

  // Switch to the pre-release channel and install it (developers + testers).
  // Pre-release is always the newer build, so a normal install works.
  function acceptUpgrade(){
    tdvSetChannel('prerelease');
    clearDowngradeDecline();
    if (isDesktop()){
      bootText('DOWNLOADING PRE-RELEASE...');
      installChannel('prerelease')
        .then(function(){ bootText('UPDATE DONE — RESTARTING...') })
        .catch(function(e){
          console.error('[update] switch to pre-release failed', e);
          bootText('FAILED — STARTING GAME...');
          setTimeout(hideBoot, 2400);
        });
    } else {
      location.reload();
    }
  }

  // Step back off a build that has been pulled. `force: true` is what lets the
  // updater install an OLDER version — otherwise Tauri rejects it outright.
  function acceptDowngrade(){
    tdvSetChannel('stable');
    clearDowngradeDecline();
    if (isDesktop()){
      // force:true regardless of direction — switching to latest stable has to
      // land on whatever stable currently publishes, newer OR older than the
      // build we're sitting on. Without it Tauri rejects a downgrade outright.
      bootText('SWITCHING TO LATEST STABLE...');
      invoke('tdv_install_update', { endpoint: URLS.stable, force: true })
        .then(function(){ bootText('UPDATE DONE — RESTARTING...') })
        .catch(function(e){
          console.error('[update] switch to stable failed', e);
          bootText('FAILED — STARTING GAME...');
          setTimeout(hideBoot, 2400);
        });
    } else {
      // On web the version lives in the deployed files, so a reload is the
      // whole operation. Remember the answer so a deploy that has not been
      // rolled back yet does not ask again on every boot.
      noteDowngradeDecline(state.version);
      location.reload();
    }
  }

  function installChannel(ch){
    return invoke('tdv_install_update', { endpoint: URLS[ch] })
      .catch(function(){
        var t = window.__TAURI__;
        if (!t || !t.updater) return Promise.reject(new Error('no updater'));
        return t.updater.check().then(function(up){
          if (!up || !up.available) throw new Error('no update');
          return up.downloadAndInstall(onProgress);
        });
      });
  }

  var gotBytes = 0;
  function onProgress(ev){
    if (!ev) return;
    if (ev.event === 'Started' && ev.data && ev.data.contentLength){
      gotBytes = 0;
      bootText('DOWNLOADING ' + mb(ev.data.contentLength) + '...');
    } else if (ev.event === 'progress'){
      gotBytes += ev.data.length;
      bootText('DOWNLOADING ' + mb(gotBytes) + '...');
    } else if (ev.event === 'Finished') bootText('INSTALLING...');
  }
  function mb(n){ return (Math.round(n/1048576*10)/10) + ' MB' }

  function handleProg(p){
    if (!p || typeof p !== 'object') return;
    if (p.event === 'progress'){
      gotBytes = typeof p.done === 'number' ? p.done : gotBytes + (p.chunk || 0);
      bootText(p.total ? 'DOWNLOADING ' + (Math.round(gotBytes/1048576*10)/10) + ' / ' +
        (Math.round(p.total/1048576*10)/10) + ' MB...' : 'DOWNLOADING...');
    } else if (p.event === 'installing') bootText('INSTALLING...');
    else if (p.event === 'done') bootText('UPDATE DONE — RESTARTING...');
  }

  // progress comes from Rust via the Tauri event bus (plain window events
  // never carry Tauri emits), with a DOM-event fallback for safety.
  if (isDesktop() && window.__TAURI__.event && window.__TAURI__.event.listen){
    window.__TAURI__.event.listen('tdv-update-progress', function(e){
      handleProg(e && e.payload);
    }).catch(function(){});
  } else {
    addEventListener('tdv-update-progress', function(e){
      handleProg(e && e.payload);
    });
  }

  // ---------------------------------------------------------
  //  startup check
  // ---------------------------------------------------------
  function runCheck(){
    var ch = channel();
    return fetchManifest(ch).then(function(m){
      state.checking = false;
      if (!state.boot) return;              // boot force-dismissed: too late to ask
      if (!m || !m.version){ hideBoot(); return; }

      // Both platforms decide here. The desktop command hands back the
      // channel's manifest verbatim rather than filtering it, so the same
      // rules run on web and desktop.
      var newer = tdvNewer(m.version, TDV_VERSION);  // they published something ahead of us
      var ahead = tdvNewer(TDV_VERSION, m.version);  // we're on a build that has been pulled

      if (acked() === m.version) newer = false;   // we already accepted this one

      if (newer){ showPrompt(m.version); return; }
      if (ahead && canDowngrade() && !downgradeDeclined(m.version)){
        showDowngradePrompt(m.version); return;
      }
      hideBoot();
    }).catch(function(){
      state.checking = false;
      hideBoot();
    });
  }

  // ---------------------------------------------------------
  //  pre-release switching (developers + testers only)
  // ---------------------------------------------------------
  function maybePromptPrerelease(){
    if (state.askedPrerelease || state.blocked) return;
    // wait for the boot screen; don't offer updates to someone who just said NO
    if (state.boot || state.declined) return;
    if (channel() !== 'stable') return;
    if (!isStaff()) return;
    if (!(window.Cloud && Cloud.ready)) return;

    state.askedPrerelease = true;
    fetchManifest('prerelease').then(function(m){
      if (!m || !m.version) return;
      if (!tdvNewer(m.version, TDV_VERSION)) return;
      if (prereleaseDeclined(m.version)) return;
      showPrereleasePrompt(m.version);
    }).catch(function(){ state.askedPrerelease = false });
  }

  function overlay(inner){
    var d = document.createElement('div');
    d.className = 'overlay show';
    d.style.cssText = 'z-index:210;background:rgba(7,10,15,.97)';
    d.innerHTML = inner;
    document.body.appendChild(d);
    return d;
  }

  function showPrereleasePrompt(version){
    var d = overlay(
      '<div class="menu panel" style="max-width:470px">' +
        '<h2>Pre-release Available</h2>' +
        '<div class="sub">A NEWER PRE-RELEASE IS OUT &mdash; v' + version + '</div>' +
        '<div class="center" style="color:#b6c4d2;font-size:13.5px;line-height:1.7">' +
          'Pre-release builds include content and fixes before they hit the ' +
          'stable channel. You can switch back to the latest stable from Settings.' +
        '</div>' +
        '<div class="mrow" style="margin-top:18px">' +
          '<button class="btn gold" id="rpYes">YES</button>' +
          '<button class="btn" id="rpNo">NO</button>' +
        '</div>' +
      '</div>');
    $('rpYes').onclick = function(){
      try{ Sfx.click() }catch(e){}
      tdvSetChannel('prerelease');
      toast('Switching to pre-release…');
      setTimeout(function(){ location.reload() }, 420);
    };
    $('rpNo').onclick = function(){
      try{ Sfx.click() }catch(e){}
      notePrereleaseDecline(version);
      d.remove();
    };
  }

  // Pre-release builds are developer / tester only.
  function enforceChannel(){
    if (state.blocked) return true;
    if (channel() !== 'prerelease') return false;
    if (!(window.Cloud && Cloud.ready)) return false;
    if (isStaff()) return false;
    showChannelBlock();
    return true;
  }

  function showChannelBlock(){
    state.blocked = true;
    var who = (window.Cloud && Cloud.user) ? Cloud.user : 'this account';
    var d = overlay(
      '<div class="menu panel" style="max-width:470px">' +
        '<h2>Pre-release Build</h2>' +
        '<div class="sub">DEVELOPER OR TESTER ACCESS REQUIRED</div>' +
        '<div class="center" style="color:#b6c4d2;font-size:13.5px;line-height:1.7">' +
          'You are signed in as <b style="color:var(--gold2)">' + who.replace(/</g,'&lt;') + '</b>, ' +
          'which has no pre-release access. Switch back to the latest stable build to keep playing.' +
        '</div>' +
        '<div class="mrow" style="margin-top:18px">' +
          '<button class="btn gold" id="blkStable">SWITCH TO LATEST STABLE</button>' +
        '</div>' +
      '</div>');
    $('blkStable').onclick = function(){
      try{ Sfx.click() }catch(e){}
      tdvSetChannel('stable');
      location.reload();
    };
  }

  // ---------------------------------------------------------
  //  settings: channel row + version row
  // ---------------------------------------------------------
  function syncChannelRow(){
    var row = $('setChanRow');
    if (row){
      var staff = isStaff();
      // The whole row is visible to everyone: "LATEST STABLE" is how any player
      // gets onto the current stable build (and off a pulled one). Only the
      // pre-release button is staff-only, since that installs a build whose
      // content hasn't shipped yet.
      row.style.display = '';
      var btns = document.querySelectorAll('#setChan .tgl');
      for (var i = 0; i < btns.length; i++){
        var b = btns[i];
        b.style.display = (b.dataset.ch === 'prerelease' && !staff) ? 'none' : '';
        b.classList.toggle('on', b.dataset.ch === channel());
      }
    }
    var vr = document.querySelector('#settingsMenu .verRow');
    if (vr) vr.textContent = TDV_VERSION + ' \u00b7 ' + channel().toUpperCase();
  }

  // ---------------------------------------------------------
  //  entry points called from save.js
  // ---------------------------------------------------------
  function onRole(r){
    state.role = r;
    syncChannelRow();
    if (r) enforceChannel();
  }

  function onSignedIn(){
    state.role = window.Cloud ? Cloud.role : null;
    if (enforceChannel()) return;
    applyLocks();
    maybePromptPrerelease();
  }

  // Called by the Settings channel toggle. Unlike the boot-time prompt, this
  // actually downloads and installs the target build on desktop — "switch to
  // latest stable" has to pull the latest stable, not just reload the same one.
  function switchChannel(ch){
    if (ch === channel()) return;
    if (isDesktop()){
      bootText(ch === 'prerelease' ? 'DOWNLOADING PRE-RELEASE...'
                                   : 'SWITCHING TO LATEST STABLE...');
      showBoot();
      if (ch === 'prerelease') acceptUpgrade();
      else                    acceptDowngrade();
    } else {
      tdvSetChannel(ch);
      toast(ch === 'prerelease' ? 'Switching to pre-release…'
                                : 'Switching to latest stable…');
      setTimeout(function(){ location.reload() }, 420);
    }
  }

  // ---------------------------------------------------------
  //  init
  // ---------------------------------------------------------
  function init(){
    syncChannelRow();

    var yes = $('bpYes'), no = $('bpNo');
    if (yes) yes.onclick = function(){ try{ Sfx.click() }catch(e){}; accept() };
    if (no)  no.onclick  = function(){ try{ Sfx.click() }catch(e){}; decline() };

    var chan = document.querySelectorAll('#setChan .tgl');
    for (var i = 0; i < chan.length; i++){
      (function(b){
        b.onclick = function(){
          var ch = b.dataset.ch;
          try{ Sfx.click() }catch(e){}
          if (ch === channel()) return;
          switchChannel(ch);   // downloads the target build, not just a reload
        };
      })(chan[i]);
    }

    // refreshSettings() lives in screens.js — wrap it so the channel row and
    // version label stay correct whenever Settings is opened.
    if (typeof window.refreshSettings === 'function'){
      var orig = window.refreshSettings;
      window.refreshSettings = function(){ try{ orig() }catch(e){}; syncChannelRow() };
    }

    // desktop reports its own compiled version — wait for it, so the update
    // comparison (and the downgrade prompt's wording) uses the real number
    // rather than the one baked into channel.js
    var ready = Promise.resolve();
    if (isDesktop() && window.__TAURI__.app && window.__TAURI__.app.getVersion){
      ready = window.__TAURI__.app.getVersion().then(function(v){
        if (v){ window.TDV_VERSION = v; syncChannelRow() }
      }).catch(function(){});
    }

    // never let the game hang behind the boot screen while the check is still
    // running (once YES/NO is on screen the choice is the player's to make)
    setTimeout(function(){ if (state.boot && state.checking) hideBoot() }, 15000);

    ready.then(function(){ runCheck() });
  }

  init();

  return {
    locked: locked,
    onRole: onRole,
    onSignedIn: onSignedIn,
    state: state
  };
})();
