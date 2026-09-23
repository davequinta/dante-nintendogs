import * as THREE from 'three';

// ---------- UTILS
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const damp=(a,b,l,dt)=>lerp(a,b,1-Math.exp(-l*dt));
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
const angleDiff=(a,b)=>{let d=(a-b)%(Math.PI*2);if(d>Math.PI)d-=Math.PI*2;if(d<-Math.PI)d+=Math.PI*2;return d;};
const angleLerp=(a,b,t)=>a+angleDiff(b,a)*t;
const $=s=>document.querySelector(s);
const V3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

const B=6.4;                          // límite de movimiento en el patio
const WALL=7.8;
const KENNEL_POS=V3(-5.2,0,-5.2);
const KENNEL_DIR=V3(1,0,1).normalize();
const BOWL_FOOD=V3(5.6,0,-4.4);
const BOWL_WATER=V3(5.6,0,-2.9);
const GATE_SPOT=V3(0,0,6.1);

export { clamp, lerp, damp, rand, pick, angleDiff, angleLerp, $, V3, B, WALL, KENNEL_POS, KENNEL_DIR, BOWL_FOOD, BOWL_WATER, GATE_SPOT };
