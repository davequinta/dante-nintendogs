import * as THREE from 'three';
import { clamp, lerp, damp, $, V3, B, KENNEL_POS, KENNEL_DIR } from './utils.js';
import { Audio } from './audio.js';
import { Save, stats, DECAY, world, TRICKS, training, achv, addStat } from './state.js';
import { canvas, renderer, TIME, scene, SKY_DAY, SKY_NIGHT, camera, controls, hemi, sun, porch, skyUniforms, rebuildEnv, kennelDoor, kennelDoorMeshes, kibble, waterMesh, clouds, ball, previewDots, Particles } from './scene.js';
import { POSES, dante, kiara } from './dog.js';
import { bubble, say, toast, updateToast, FREE, ai, visit, kiaraAI, setState, cursor, updateAI, cmdFood, cmdWater, cmdTrick, cmdVisit, setNight, cmdNight, toggleKennelDoor, updateKennelBtn, updateVisit, kSet, updateKiara, updateFlies, updateBall } from './ai.js';

// ---------- INTERACTIONS (raycaster, herramientas, lanzamiento)
const ray=new THREE.Raycaster(); const ndc=new THREE.Vector2(); const groundPlane=new THREE.Plane(V3(0,1,0),0); const lookPlane=new THREE.Plane(V3(0,1,0),-0.9);
let tool='hand'; const drag={active:false,mode:null,sx:0,sy:0,lx:0,ly:0,acc:0,id:null};
function setNDC(e){ const r=canvas.getBoundingClientRect(); ndc.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1); ray.setFromCamera(ndc,camera); }
function hitDog(e){ setNDC(e); const h=ray.intersectObjects(dante.meshes,false); return h.length?h[0]:null; }
function throwVector(dx,dy){ const f=V3(); camera.getWorldDirection(f); f.y=0; f.normalize();
  const o=camera.position.clone().addScaledVector(f,1.7); o.y=clamp(camera.position.y-1.3,0.6,3);
  const force=clamp(-dy/(Math.min(innerWidth,innerHeight)*0.42),0.12,1); const yaw=-dx/innerWidth*1.5;
  const dir=f.clone().applyAxisAngle(V3(0,1,0),yaw); const sp=3.2+9.5*force;
  return {o,v:V3(dir.x*sp*0.85,sp*0.55,dir.z*sp*0.85),f};
}
function showPreview(dx,dy){ const {o,v}=throwVector(dx,dy); const p=o.clone(),vel=v.clone(); for(const d of previewDots){ for(let i=0;i<3;i++){ vel.y-=18*0.05; p.addScaledVector(vel,0.05); } d.position.copy(p); d.visible=p.y>0; } }
function hidePreview(){ previewDots.forEach(d=>d.visible=false); }
function doThrow(dx,dy){ hidePreview(); if(Math.hypot(dx,dy)<18) return; const {o,v,f}=throwVector(dx,dy);
  if(ball.held) return; ball.mesh.visible=true; ball.mesh.position.copy(o); ball.vel.copy(v); ball.flying=true; ball.rest=false;
  ball.returnPt.copy(o).addScaledVector(f,1.2); ball.returnPt.y=0; ball.returnPt.x=clamp(ball.returnPt.x,-B+0.5,B-0.5); ball.returnPt.z=clamp(ball.returnPt.z,-B+0.5,B-0.5);
  Audio.swish(); if(!world.night&&ai.state!=='bark'&&ai.state!=='to_gate'&&ai.state!=='eat'&&ai.state!=='drink') setState('fetch_chase'); }
function petTick(hit){ const zone=dante.zoneAt(hit);
  if(tool==='brush'){ addStat('limpieza',0.9); addStat('felicidad',0.15); for(let i=0;i<2;i++) Particles.spawn('hair',hit.point,{life:1.1,speed:0.8,size:0.16,grav:1.5}); if(Math.random()<0.25)Audio.swish(); if(Math.random()<0.05)say('brush',2); if(FREE.has(ai.state)&&ai.state!=='groom'&&ai.state!=='bellyup') setState('groom'); ai.petting=true; ai.afterPet=0.8; return; }
  addStat('felicidad',0.5); if(Math.random()<0.5) Particles.spawn('heart',hit.point.clone().add(V3(0,0.1,0)),{life:1.1,speed:0.7,size:0.22});
  if(Math.random()<0.06){ if(zone==='head')say('petHead',1.8); else if(zone==='tail')say('petTail',1.8); }
  ai.petting=true; ai.afterPet=0.9;
  if(ai.state==='sleep'){ if(Math.random()<0.04)say('nightPet',1.6); return; }
  if(ai.state==='cry'||ai.state==='bark') return;
  if(ai.state==='bellyup') return;
  if(FREE.has(ai.state)&&ai.state!=='pet'){ setState('pet',{petZone:zone}); } else if(ai.state==='pet'&&ai.petZone!==zone&&zone!=='body'){ ai.petZone=zone; ai.petT=0; ai.spun=0; }
}
canvas.addEventListener('pointerdown',e=>{ Audio.ensure(); if(drag.active)return;
  drag.sx=drag.lx=e.clientX; drag.sy=drag.ly=e.clientY; drag.acc=0; drag.id=e.pointerId;
  if(tool==='ball'){ if(world.night){toast('Es de noche, Dante duerme 💤');return;} drag.active=true; drag.mode='throw'; controls.enabled=false; canvas.setPointerCapture(e.pointerId); return; }
  setNDC(e); if(ray.intersectObjects(kennelDoorMeshes,false).length){ toggleKennelDoor(); return; }
  const h=hitDog(e); if(h){ drag.active=true; drag.mode='pet'; controls.enabled=false; canvas.setPointerCapture(e.pointerId); petTick(h); }
},{capture:true});
canvas.addEventListener('pointermove',e=>{ setNDC(e); const pt=V3(); if(ray.ray.intersectPlane(lookPlane,pt)){ cursor.world.copy(pt); cursor.has=true; }
  if(!drag.active||e.pointerId!==drag.id)return;
  const dx=e.clientX-drag.sx, dy=e.clientY-drag.sy;
  if(drag.mode==='throw'){ showPreview(dx,dy); return; }
  drag.acc+=Math.hypot(e.clientX-drag.lx,e.clientY-drag.ly); drag.lx=e.clientX; drag.ly=e.clientY;
  if(drag.acc>34){ drag.acc=0; const h=hitDog(e); if(h) petTick(h); }
});
function endDrag(e){ if(!drag.active||e.pointerId!==drag.id)return; drag.active=false; controls.enabled=true;
  if(drag.mode==='throw') doThrow(e.clientX-drag.sx,e.clientY-drag.sy); ai.petting=false; drag.mode=null; }
canvas.addEventListener('pointerup',endDrag); canvas.addEventListener('pointercancel',endDrag);
canvas.addEventListener('pointerleave',()=>{cursor.has=false;});

// ---------- UI
const HINTS={hand:'Arrastrá sobre Dante para acariciarlo',brush:'Pasá el cepillo sobre su pelo',ball:'Arrastrá hacia arriba para apuntar y lanzar 🎾'};
function selectTool(t){ tool=t; document.querySelectorAll('.tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t)); $('#hint').textContent=HINTS[t]; $('#tricks').classList.remove('show'); }
document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>{ Audio.ensure();
  if(b.dataset.tool) return selectTool(b.dataset.tool);
  const a=b.dataset.action; $('#tricks').classList.toggle('show',a==='tricks'&&!$('#tricks').classList.contains('show'));
  if(a==='food')cmdFood(); else if(a==='water')cmdWater(); else if(a==='visit')cmdVisit(); else if(a==='night')cmdNight(); }));
document.querySelectorAll('#tricks button').forEach(b=>b.addEventListener('click',()=>{ $('#tricks').classList.remove('show'); cmdTrick(b.dataset.trick); }));
$('#mute').addEventListener('click',()=>{ Audio.ensure(); $('#mute').textContent=Audio.toggle()?'🔇':'🔊'; });
$('#kennelBtn').addEventListener('click',()=>{ Audio.ensure(); toggleKennelDoor(); });
$('#auto').addEventListener('click',()=>{ world.autoClock=!world.autoClock; $('#auto').classList.toggle('on',world.autoClock); toast(world.autoClock?'Reloj de El Salvador activado 🕒':'Reloj automático apagado'); clockT=0; });
$('#furbtn').addEventListener('click',()=>{ world.fur=!world.fur; $('#furbtn').classList.toggle('on',world.fur); dante.setFur(world.fur); kiara.setFur(world.fur); ball.mesh.children.forEach(c=>c.visible=world.fur); toast(world.fur?'Pelo detallado activado 🧶':'Pelo simple (más rápido)'); });
$('#title').addEventListener('click',()=>{ renderAchv(); $('#achv').classList.add('show'); });
$('#achvClose').addEventListener('click',()=>$('#achv').classList.remove('show'));
$('#achv').addEventListener('click',e=>{ if(e.target.id==='achv') $('#achv').classList.remove('show'); });
function updateTrickUI(){ document.querySelectorAll('#tricks .trick').forEach(b=>{ const i=b.querySelector('.prog i'); if(i) i.style.width=(training[b.dataset.trick]||0)+'%'; });
  const avg=Object.values(training).reduce((a,b)=>a+b,0)/Object.keys(training).length; $('#lvl').textContent=avg<25?'novato':avg<50?'aprendiz':avg<80?'campeón':'leyenda'; }
const MEDALS=[
  {id:'first',ic:'🏅',name:'Primer día',desc:'Cuidaste a Dante',test:()=>achv.days.length>=1},
  {id:'fetch10',ic:'🎾',name:'Traé la pelota',desc:'10 pelotas traídas',test:()=>achv.fetches>=10},
  {id:'fetch50',ic:'🏃',name:'Atleta',desc:'50 pelotas traídas',test:()=>achv.fetches>=50},
  {id:'tricks',ic:'🎓',name:'Bien entrenado',desc:'Todos los trucos al 60%',test:()=>Object.values(training).every(v=>v>=60)},
  {id:'brush',ic:'🪮',name:'Pelo de show',desc:'20 cepilladas',test:()=>achv.brushes>=20},
  {id:'feed',ic:'🍖',name:'Buen provecho',desc:'15 comidas servidas',test:()=>achv.feeds>=15},
  {id:'nights',ic:'🌙',name:'Buenas noches',desc:'7 noches en el kennel',test:()=>achv.nights>=7},
  {id:'streak3',ic:'🔥',name:'Racha de 3',desc:'3 días seguidos',test:()=>achv.streak>=3},
  {id:'streak7',ic:'💫',name:'Racha de 7',desc:'7 días seguidos',test:()=>achv.streak>=7},
  {id:'mango',ic:'🥭',name:'Manguero',desc:'10 mangos',test:()=>achv.mangos>=10},
  {id:'guard',ic:'🛡️',name:'Guardián',desc:'5 visitas calmadas',test:()=>achv.visits>=5},
  {id:'champ',ic:'🏆',name:'Campeón ACANSAL',desc:'Pose de show al 100%',test:()=>training.show>=100},
];
function checkMedals(){ for(const m of MEDALS){ if(!achv.unlocked.includes(m.id)&&m.test()){ achv.unlocked.push(m.id); toast(`🏅 Logro: ${m.name}`,3.5); Audio.chime(); } } }
function renderAchv(){ $('#achvSub').textContent=`Racha: ${achv.streak} día${achv.streak===1?'':'s'} 🔥 · Días cuidándolo: ${achv.days.length} · Pelotas: ${achv.fetches} · Trucos: ${achv.tricks}`;
  $('#medals').innerHTML=MEDALS.map(m=>{const ok=achv.unlocked.includes(m.id);return `<div class="m ${ok?'':'locked'}"><span class="ic">${m.ic}</span><span>${m.name}<small>${m.desc}</small></span></div>`;}).join('');
  $('#training').innerHTML=Object.keys(TRICKS).map(k=>`<span>${TRICKS[k]}</span><div class="bar"><div class="fill" style="width:${training[k]}%;background:var(--gold)"></div></div><span>${Math.round(training[k])}%</span>`).join(''); }
// ---------- reloj real de El Salvador
function svParts(d=new Date()){ try{ const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/El_Salvador',hour:'2-digit',minute:'2-digit',hour12:false}); const ps=f.formatToParts(d); return {h:+ps.find(p=>p.type==='hour').value%24,m:+ps.find(p=>p.type==='minute').value}; }catch(e){ return {h:d.getHours(),m:d.getMinutes()}; } }
function svDateKey(d=new Date()){ try{ return new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(d); }catch(e){ return d.toISOString().slice(0,10); } }
let clockT=0;
function updateClock(dt){ clockT-=dt; if(clockT>0)return; clockT=15; const {h,m}=svParts(); world.svHour=h+m/60;
  $('#clock').textContent=`🕒 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} El Salvador${world.autoClock?'':' · manual'}`;
  if(world.autoClock){ const isNight=world.svHour<5.75||world.svHour>=18.25; if(isNight!==world.night) setNight(isNight,true); } }
function registerDay(){ const k=svDateKey(); if(achv.days.includes(k))return; const last=achv.days[achv.days.length-1]; const y=svDateKey(new Date(Date.now()-864e5));
  achv.streak=(last===y)?achv.streak+1:1; achv.days.push(k); if(achv.days.length>90)achv.days.shift(); }
$('#reset').addEventListener('click',()=>{ if(confirm('¿Reiniciar el estado de Dante?')){ Save.clear(); location.reload(); } });
selectTool('hand');
const fills={}; for(const k in stats) fills[k]=$('#f-'+k);
function updateHUD(){ for(const k in stats){ const v=stats[k]; fills[k].style.width=v+'%'; fills[k].classList.toggle('low',v<25); } }
const headWorld=V3();
function updateBubble(dt){ bubble.t-=dt; if(bubble.t<=0){ bubble.el.classList.remove('show'); return; }
  dante.head.getWorldPosition(headWorld); headWorld.y+=0.38; headWorld.project(camera);
  if(headWorld.z>1){ bubble.el.style.opacity=0; return; } bubble.el.style.opacity='';
  bubble.el.style.left=((headWorld.x*0.5+0.5)*innerWidth)+'px'; bubble.el.style.top=((-headWorld.y*0.5+0.5)*innerHeight-14)+'px'; }

// ---------- DÍA / NOCHE
const fogDay=SKY_DAY.clone(), tmpC=new THREE.Color();
function updateDayNight(dt){ world.nightT=damp(world.nightT,world.night?1:0,1.6,dt); const n=world.nightT;
  scene.fog.color.copy(tmpC.copy(SKY_DAY).lerp(SKY_NIGHT,n)); scene.fog.color.multiplyScalar(lerp(1,0.35,n));
  sun.intensity=lerp(2.3,0.25,n); sun.color.copy(tmpC.set(0xfff1d6)).lerp(new THREE.Color(0x9fb6ff),n);
  hemi.intensity=lerp(0.95,0.22,n); hemi.color.copy(tmpC.set(0xcfe9ff)).lerp(new THREE.Color(0x3a4a8a),n);
  if(world.autoClock){ const a=clamp((world.svHour-5.5)/13,0,1)*Math.PI; const el=Math.max(0.12,Math.sin(a)); sun.position.set(Math.cos(a)*11,el*11+1.5,4.5); const warm=1-clamp((el-0.12)/0.4,0,1); sun.color.lerp(new THREE.Color(0xffa060),warm*0.6*(1-n)); }
  else sun.position.set(7,11,5);
  porch.intensity=lerp(0,2.2,n); skyUniforms.uNight.value=n; skyUniforms.uSun.value.copy(sun.position).normalize();
  renderer.toneMappingExposure=lerp(1.0,0.7,n);
  if(Math.abs(n-lastEnvN)>0.05){ lastEnvN=n; rebuildEnv(); } }
let lastEnvN=-1;

// ---------- SAVE / LOAD
function snapshot(){ return {stats:{...stats},night:world.night,food:world.food,water:world.water,training:{...training},achv:{...achv},autoClock:world.autoClock,fur:world.fur,kennelClosed:world.kennelClosed}; }
function applySave(s){ if(!s)return; Object.assign(stats,s.stats||{}); world.food=s.food||0; world.water=s.water||0;
  if(s.training) for(const k in training) training[k]=clamp(s.training[k]||0,0,100); if(s.achv) Object.assign(achv,s.achv);
  if(s.autoClock===false){ world.autoClock=false; $('#auto').classList.remove('on'); }
  if(s.fur===false){ world.fur=false; $('#furbtn').classList.remove('on'); dante.setFur(false); kiara.setFur(false); ball.mesh.children.forEach(c=>c.visible=false); }
  world.kennelClosed=!!s.kennelClosed;
  const mins=clamp((Date.now()-(s.savedAt||Date.now()))/60000,0,12*60);
  if(mins>0.5){ for(const k in DECAY){ if(k==='energia'&&s.night) addStat(k,mins*0.5); else addStat(k,-DECAY[k]*mins*(s.night?0.5:1)); }
    const h=Math.floor(mins/60),m=Math.round(mins%60); toast(`Pasaron ${h?h+' h ':''}${m} min. Dante te extrañó 🐕`,4); }
  if(s.night&&!(world.autoClock&&!(world.svHour<5.75||world.svHour>=18.25))){ world.night=true; world.nightT=1; $('[data-action=night]').classList.add('on'); dante.root.position.copy(KENNEL_POS).addScaledVector(KENNEL_DIR,0.05); dante.heading=Math.PI/4; setState('sleep'); }
}
applySave(Save.load()); kibble.visible=world.food>0; waterMesh.visible=world.water>0; registerDay(); updateTrickUI(); updateKennelBtn(); checkMedals();
if(world.autoClock&&!world.night){ const {h,m}=svParts(); world.svHour=h+m/60; if(world.svHour<5.75||world.svHour>=18.25){ world.night=true; world.nightT=1; $('[data-action=night]').classList.add('on'); dante.root.position.copy(KENNEL_POS).addScaledVector(KENNEL_DIR,0.05); dante.heading=Math.PI/4; setState('sleep'); } }
let saveT=5; function persist(){ Save.write(snapshot()); }
document.addEventListener('visibilitychange',()=>{ if(document.hidden) persist(); }); addEventListener('pagehide',persist);

// ---------- LOOP
function resize(){ const w=innerWidth,h=innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
addEventListener('resize',resize); resize();
const clock=new THREE.Clock(); let hudT=0, medalT=6; const camDelta=V3(), camGoal=V3();
function frame(){ requestAnimationFrame(frame); const dt=Math.min(clock.getDelta(),0.05); world.time+=dt; TIME.value=world.time;
  for(const k in DECAY){ if(k==='energia'&&ai.state==='sleep')continue; addStat(k,-DECAY[k]*dt/60); }
  updateAI(dt); dante.root.updateMatrixWorld(true);
  updateBall(dt); updateVisit(dt); updateKiara(dt); updateFlies(dt); Particles.update(dt); updateDayNight(dt); updateClock(dt);
  kennelDoor.rotation.y=damp(kennelDoor.rotation.y,world.kennelClosed?0:-1.9,5,dt);
  medalT-=dt; if(medalT<0){ medalT=4; checkMedals(); }
  kibble.scale.y=Math.max(0.05,world.food); kibble.visible=world.food>0.02; waterMesh.scale.y=Math.max(0.05,world.water); waterMesh.visible=world.water>0.02;
  for(const c of clouds){ c.position.x+=c.userData.v*dt; if(c.position.x>34)c.position.x=-34; }
  // la cámara sigue suavemente a Dante sin quitar el control de órbita
  const dp=dante.root.position; camGoal.set(dp.x*0.55,0.6,dp.z*0.55); camDelta.copy(camGoal).sub(controls.target).multiplyScalar(1-Math.exp(-1.8*dt));
  controls.target.add(camDelta); camera.position.add(camDelta); controls.update();
  hudT-=dt; if(hudT<0){ hudT=0.2; updateHUD(); } updateBubble(dt);
  updateToast(dt);
  saveT-=dt; if(saveT<0){ saveT=6; persist(); }
  renderer.render(scene,camera);
}
updateHUD(); frame(); $('#loading').classList.add('hide');
window.__dante={dante,kiara,ai,setState,POSES,stats,world,camera,controls,cmdNight,setNight,cmdVisit,cmdFood,cmdWater,cmdTrick,ball,kiaraAI,kSet,doThrow,visit,training,achv,toggleKennelDoor,checkMedals};

export { ray, ndc, groundPlane, lookPlane, tool, drag, setNDC, hitDog, throwVector, showPreview, hidePreview, doThrow, petTick, endDrag, HINTS, selectTool, updateTrickUI, MEDALS, checkMedals, renderAchv, svParts, svDateKey, clockT, updateClock, registerDay, fills, updateHUD, headWorld, updateBubble, fogDay, tmpC, updateDayNight, lastEnvN, snapshot, applySave, saveT, persist, resize, clock, hudT, medalT, camDelta, camGoal, frame };
