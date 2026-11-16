"use strict";
// ============================================================
//  utils.js — helper functions used everywhere
// ============================================================
const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
const rnd=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const dist2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy};
const hyp=(a,b)=>Math.sqrt(a*a+b*b);
const fmt=n=>Math.floor(n).toLocaleString('en-US');
const pick=a=>a[Math.floor(Math.random()*a.length)];
// Blend two #rrggbb stops. Used to tint whole enemy palettes for status effects
// without hand-authoring a variant per creature.
function mixHex(a,b,f){
  const A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16);
  const r=Math.round((A>>16&255)*(1-f)+(B>>16&255)*f),
    g=Math.round((A>>8&255)*(1-f)+(B>>8&255)*f),
    l=Math.round((A&255)*(1-f)+(B&255)*f);
  return '#'+((1<<24)+(r<<16)+(g<<8)+l).toString(16).slice(1)}
function hash2(x,y){let h=(x*374761393+y*668265263)|0;h=(h^(h>>13))*1274126177|0;return((h^(h>>16))>>>0)/4294967295}
const $=id=>document.getElementById(id);

// ---- trait icons (pixel-style SVG) — AIR (plane) & STEALTH detection (eye) ----
const ICON_AIR='<svg class="ti" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">'+
 '<path fill="currentColor" d="M7 2h2v3H7zM6 5h4v6H6zM1 7h14v2H1zM4 11h8v2H4zM7 11h2v3H7z"/></svg>';
const ICON_STEALTH='<svg class="ti" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">'+
 '<path fill="currentColor" fill-rule="evenodd" d="M6 4h4v1H6zM4 5h8v1H4zM3 6h10v1H3zM2 7h12v3H2z'+
 'M3 10h10v1H3zM4 11h8v1H4zM6 12h4v1H6zM6 7h4v3H6z"/></svg>';
// s = {air:bool, stealthDetect:bool}  →  chips for the capabilities a tower has
function traitChips(s){
  if(!s)return '';
  let h='';
  if(s.air)h+='<span class="trait air">'+ICON_AIR+'<span>AIR</span></span>';
  if(s.stealthDetect)h+='<span class="trait stl">'+ICON_STEALTH+'<span>STEALTH</span></span>';
  return h}

window.addEventListener('error',function(ev){
  try{var d=document.getElementById('errbox');
    if(!d){d=document.createElement('div');d.id='errbox';
      d.style.cssText='position:fixed;left:8px;bottom:8px;z-index:99999;background:#2a1218;color:#ff9aa4;padding:8px 12px;font:12px monospace;border:2px solid #7a2a34;max-width:90vw';
      document.body.appendChild(d)}
    d.textContent='Error: '+ev.message+' (line '+ev.lineno+')'}catch(_){}});