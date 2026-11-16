"use strict";
// ============================================================
//  uiscale.js — the whole interface is sized from the window
// ============================================================
//
// #uiRoot is the one zoomed layer: the HUD, every overlay panel, the command bar
// and the cloud gate all live inside it, so a single transform sizes the entire
// interface and nothing inside has to learn that the window is small.
//
// `zoom` and not `transform: scale`, on purpose. Chromium reflows under zoom, so
// a panel's layout box becomes viewport/zoom while its pixels shrink — which is
// what keeps hit-testing, focus rings and pointer coordinates aligned. A
// transform composites without reflowing, and everything positioned from a
// pointer event would then sit off from the cursor by exactly the scale factor.
//
// Strictly proportional and deliberately unbounded: the UI is fully on screen at
// any window size, and keeps growing with a big one. The box it was authored for
// is not hard-coded here — style.css restates --fit-w/--fit-h wherever it also
// changes the layout, so the factor always tracks the layout actually in effect.
let UI_Z=1;
function uiFit(){
  const cs=getComputedStyle(document.documentElement);
  return Math.min(innerWidth/(parseFloat(cs.getPropertyValue('--fit-w'))||1440),
    innerHeight/(parseFloat(cs.getPropertyValue('--fit-h'))||900))}
function uiScaleApply(){
  UI_Z=uiFit()*((SV&&SV.uiScale)||1);
  $('uiRoot').style.zoom=UI_Z;
  // The scale buttons are only a bias on the fit now, so the row has to show the
  // number that actually lands on screen — "L" means nothing on its own.
  $('setScaleV').textContent=UI_Z.toFixed(2)+'×'}
// Screen pixels to #uiRoot layout pixels, for the two layers placed from a
// pointer event (upgrade tooltip, lobby right-click menu).
function uiLocal(px){return px/UI_Z}
addEventListener('resize',uiScaleApply);
uiScaleApply();
