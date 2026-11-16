"use strict";
// ============================================================
//  camera.js — camera, screen transforms, resize
// ============================================================
const cam={x:TERR_W/2,y:TERR_H/2,zoom:1,tx:TERR_W/2,ty:TERR_H/2,tz:1};
const canvas=$('game'),ctx=canvas.getContext('2d');
let dpr=1;
function camClamp(){const cw=canvas.width/dpr,ch=canvas.height/dpr,
  hw=Math.min(cw/2/cam.tz,TERR_W/2),hh=Math.min(ch/2/cam.tz,TERR_H/2);
  cam.tx=clamp(cam.tx,hw,TERR_W-hw);cam.ty=clamp(cam.ty,hh,TERR_H-hh)}
function resize(){dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;camClamp()}
addEventListener('resize',resize);resize();
function screenToMap(sx,sy){const cw=canvas.width/dpr,ch=canvas.height/dpr;
  return{x:(sx-cw/2)/cam.zoom+cam.x,y:(sy-ch/2)/cam.zoom+cam.y}}
function mapToScreen(mx,my){const cw=canvas.width/dpr,ch=canvas.height/dpr;
  return{x:(mx-cam.x)*cam.zoom+cw/2,y:(my-cam.y)*cam.zoom+ch/2}}
function recenter(){const m=worldToMap(11.5,12);cam.tx=m.x;cam.ty=m.y;camClamp()}
(function(){const m=worldToMap(13,13);cam.x=cam.tx=m.x;cam.y=cam.ty=m.y})();