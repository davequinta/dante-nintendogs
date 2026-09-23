import { clamp, damp, rand, pick, angleDiff, angleLerp, $, V3, B, WALL, KENNEL_POS, KENNEL_DIR, BOWL_FOOD, BOWL_WATER, GATE_SPOT } from './utils.js';
import { Audio } from './audio.js';
import { stats, world, TRICKS, training, achv, addStat } from './state.js';
import { camera, controls, gate, KIARA_BED, HOUSE_DOOR, kibble, waterMesh, visitor, flies, relocateFly, ball, Particles } from './scene.js';
import { POSES, dante, kiara } from './dog.js';
import { updateTrickUI, checkMedals } from './main.js';

// ---------- BUBBLES (pensamientos)
const SAY={
  idle:['soy campeón, merezco premio','¿y mi mango? 🥭','mi pelo está perfecto hoy','¿dónde está David?','esa mosca me está viendo raro','Kiara está gruñona otra vez','¿hay croquetas?','quiero morder algo','¡a correr! ¡a correr!','dos veces campeón. dos.'],
  visit:['¿QUIÉN ES?? ¿QUIÉN ES??','¡GUAU GUAU GUAU!','¡yo cuido esta casa!','¡DAVIIID! ¡ALGUIEN!','¡no pases! ¡GUAU!'],
  calm:['ah... es amigo. ok.','...bueno, si vos decís','*resopla* ok ok'],
  eat:['ñam ñam Royal Canin','esto merece un trofeo','¡croquetas! ñam','*mastica con porte*'],
  drink:['glug glug glug','agua fresquita 💧'],
  fetch:['¡MÍA!','¡la tengo! ¿viste? ¿VISTE?','¡otra vez! ¡otra!','¡corro más rápido que Kiara!'],
  obey:['fácil. soy campeón.','¿y el premio?','¿así? sí, así.','perfecto, como en el ring'],
  disobey:['no tengo ganas','primero cariños','*se acuesta raro*','¿y si mejor no?'],
  show:['pose de campeón ✨','ACANSAL, dos veces. sí, dos.','miren este porte'],
  cry:['no quiero dormir solo... 😢','¿David? ¿DAVID?','buuuu... está oscuro','*llora bajito*','quiero mi cama con ustedes'],
  sleep:['zzz... campeón... zzz','zzz... mango... zzz'],
  brush:['ahh, qué bonito me veo','más despacio, es pelo de campeón','sí, ahí, la melena'],
  petHead:['sí... ahí...','*ojitos cerrados*','más porfa'],
  petBelly:['panza panza panza','*se tira al piso*','¡pancita!'],
  petTail:['¡oye! esa es mi cola','¿quién me tocó?','¡mi cola no!'],
  kiara:['*orejas alertas* ...hola Kiara','no me gruñas, Kiara','mejor me aparto...','Kiara manda. por ahora.'],
  fly:['¡MOSCA!','*snap*','¡te voy a agarrar!'],
  hungry:['tengo hambreeee','¿nadie me va a dar de comer?'],thirsty:['agua porfa','tengo sed 💧'],tired:['*bosteza* qué sueño','estoy cansadito'],dirty:['necesito cepillado, soy perro de show','mi pelo... 😔'],
  mango:['¡¡MANGO!! ¡¡MANGO!!','lo mejor del mundo 🥭','ñam ñam ñam'],
  nightPet:['zzz... cinco minutos más','*se estira* zzz'],
  wake:['*se estira* buenos días','¡ya amaneció! ¡a jugar!'],
  fail:['casi... 😅','eh... ¿así?','*se distrae con una mosca*','mañana lo intento','con mango sí lo hago'],
  cryOut:['¡ábranme! 🔓','¡quiero salir!','¡ya es de día!','¡DAVID! ¡la puerta!'],
  rest:['*suspira*','buenas noches...','la puerta está abierta, bien','¿y si me quedo con ustedes?'],
  scolded:['perdón Kiara 😳','ya ya, me voy','*orejas atrás*','no me gruñas...'],
  jump:['¡SALTO!','¡vuelo!'],speak:['¡GUAU!','¡GUAU GUAU!'],roll:['*rueda con estilo*','¿viste eso?'],
  thanks:['gracias 🥹','ahora sí duermo'],
};
const bubble={el:$('#bubble'),t:0,gap:0};
function say(cat,dur=2.6,force=false){ if(bubble.gap>0&&!force)return; const txt=typeof cat==='string'&&SAY[cat]?pick(SAY[cat]):cat; bubble.el.textContent=txt; bubble.el.classList.add('show'); bubble.t=dur; bubble.gap=dur+1.2; }
const toastEl=$('#toast'); let toastT=0;
function toast(msg,dur=2.4){ toastEl.textContent=msg; toastEl.classList.add('show'); toastT=dur; }
function updateToast(dt){ toastT-=dt; if(toastT<0) toastEl.classList.remove('show'); }

// ---------- DOG AI (máquina de estados)
const FREE=new Set(['stand','sit','lie','wander','scratch','yawn','fly','fetch_done','pet','bellyup','trick','kiara','groom']);
const ai={state:'stand',t:0,dur:2,target:V3(),petting:false,petZone:null,petT:0,calm:0,cryT:0,barkT:0,sayT:6,chompT:0,spun:0,trick:null,obeys:true,disobey:null,snoreT:0,wakeT:0,afterPet:0};
const visit={active:false,t:0,phase:'none'};
const kiaraAI={active:false,state:'away',t:0,next:rand(35,60),target:V3(),dur:0,scoldCd:0,stay:0};

function setState(s,data={}){ if(ai.state==='trick') controls.autoRotate=false; ai.state=s; ai.t=0; ai.wantOut=false; Object.assign(ai,data); dante.pant=false; onEnter(s); updateKennelBtn(); }
function playerSpot(){ const f=V3(); camera.getWorldDirection(f); f.y=0; f.normalize(); const p=camera.position.clone().addScaledVector(f,3.2); p.y=0; p.x=clamp(p.x,-B,B); p.z=clamp(p.z,-B,B); return p; }
function bowlApproach(b){ return V3(b.x-0.85,0,b.z); }
function faceTo(target,dt,rate=6){ const p=dante.root.position; dante.heading=angleLerp(dante.heading,Math.atan2(target.x-p.x,target.z-p.z),1-Math.exp(-rate*dt)); }
function steerDog(dog,dt,target,maxSpeed,stop=0.3,lim=B){
  const p=dog.root.position,dx=target.x-p.x,dz=target.z-p.z,dist=Math.hypot(dx,dz);
  if(dist<stop){ dog.speed=damp(dog.speed,0,10,dt); return true; }
  const desired=Math.atan2(dx,dz); dog.heading=angleLerp(dog.heading,desired,1-Math.exp(-5*dt));
  const diff=Math.abs(angleDiff(desired,dog.heading));
  const want=maxSpeed*clamp(dist/1.3,0.3,1)*(diff>1.1?0.2:1);
  dog.speed=damp(dog.speed,want,dog.speed<want?3.5:7,dt);
  p.x=clamp(p.x+Math.sin(dog.heading)*dog.speed*dt,-lim,lim); p.z=clamp(p.z+Math.cos(dog.heading)*dog.speed*dt,-lim,lim);
  if(dog.speed>2.6&&Math.random()<dt*6) Particles.spawn('dust',V3(p.x,0.08,p.z),{life:0.6,speed:0.3,size:0.35});
  return false;
}
const steer=(dt,target,maxSpeed,stop)=>steerDog(dante,dt,target,maxSpeed,stop);
function stopMoving(dt){ dante.speed=damp(dante.speed,0,8,dt); }
function chooseIdle(){
  const r=Math.random(), tired=stats.energia<35;
  if(tired&&r<0.5) return setState('lie',{dur:rand(6,12)});
  if(r<0.22) return setState('wander',{target:V3(rand(-B+1,B-1),0,rand(-B+1,B-1))});
  if(r<0.42) return setState('sit',{dur:rand(4,8)});
  if(r<0.55) return setState('lie',{dur:rand(5,9)});
  if(r<0.66) return setState('scratch',{dur:2.6});
  if(r<0.76) return setState('yawn',{dur:1.8});
  return setState('stand',{dur:rand(2,5)});
}
function onEnter(s){
  const D=dante;
  switch(s){
    case 'stand': D.setPose(POSES.stand); D.pant=stats.felicidad>60; break;
    case 'wander': D.setPose(POSES.stand); break;
    case 'sit': D.setPose(POSES.sit); D.pant=true; break;
    case 'lie': D.setPose(POSES.lie); break;
    case 'scratch': D.setPose(POSES.scratch); break;
    case 'yawn': D.setPose(POSES.sit,{mouth:1,eyes:0.1,neckPitch:-0.45}); say('tired',1.8); break;
    case 'fly': D.setPose(POSES.alert,{mouth:0.2}); say('fly'); break;
    case 'goto_eat': case 'goto_drink': case 'to_gate': case 'to_kennel': case 'to_player': case 'fetch_chase': D.setPose(POSES.stand); break;
    case 'eat': D.setPose(POSES.eat); say('eat'); break;
    case 'drink': D.setPose(POSES.eat,{mouth:0.2}); say('drink'); break;
    case 'fetch_return': D.setPose(POSES.stand,{mouth:0.4,tailLift:0.7}); say('fetch'); break;
    case 'fetch_done': D.setPose(POSES.sit); D.pant=true; say('fetch',2.6,true); addStat('felicidad',12); addStat('energia',-8); Audio.yip(); achv.fetches++; checkMedals(); break;
    case 'bark': D.setPose(POSES.bark); ai.barkT=0; ai.calm=0; break;
    case 'calm': D.setPose(POSES.sit,{tongue:1,earBack:0.3}); D.pant=true; say('calm',2.6,true); addStat('felicidad',8); break;
    case 'cry': D.setPose(POSES.cry); ai.cryT=18; say('cry',2.6,true); break;
    case 'sleep': D.setPose(POSES.sleep); ai.snoreT=1; break;
    case 'wake': D.setPose(POSES.stretch); say('wake',2,true); break;
    case 'trick': {
      const tr=ai.trick; ai.did=false;
      if(tr==='sit'){D.setPose(POSES.sit);D.pant=true;} else if(tr==='platz'){D.setPose(POSES.lie);} else if(tr==='paw'){D.setPose(POSES.paw);}
      else if(tr==='show'){D.setPose(POSES.stack); say('show',3,true); Audio.chime(); addStat('felicidad',5); controls.autoRotate=true; controls.autoRotateSpeed=3.5;}
      else if(tr==='roll'){D.setPose(POSES.lie,{bodyY:-0.36,flU:0.3,flL:1.1,frU:0.3,frL:1.1,rlU:0.3,rlL:1.0,rrU:0.3,rrL:1.0,neckPitch:0.1}); say('roll',2,true);}
      else if(tr==='jump'){D.setPose(POSES.stand,{bodyY:-0.14,flU:0.3,flL:0.4,frU:0.3,frL:0.4,rlU:-0.4,rlL:0.9,rrU:-0.4,rrL:0.9,earAlert:1}); say('jump',1.5,true);}
      else if(tr==='speak'){D.setPose(POSES.bark,{mouth:0.1}); ai.barkT=0.3; ai.barks=0;}
      if(tr!=='show'&&tr!=='roll'&&tr!=='jump'&&tr!=='speak') say('obey',2.2,true); addStat('felicidad',4); break; }
    case 'trick_fail': { const tr=ai.trick; say('fail',2.2,true);
      if(tr==='sit') D.setPose(POSES.bellyUp); else if(tr==='platz') D.setPose(POSES.sit); else if(tr==='paw') D.setPose(POSES.sit,{flU:-0.5,flL:0.4});
      else if(tr==='roll') D.setPose(POSES.lie,{bodyRoll:1.1,bodyY:-0.36}); else if(tr==='jump') D.setPose(POSES.stand,{bodyY:0.12}); else if(tr==='speak') D.setPose(POSES.stand,{mouth:0.5,headRoll:0.4,earAlert:1});
      else D.setPose(POSES.stand,{tailLift:0.7,earAlert:1}); D.pant=tr==='show'; break; }
    case 'kennel_rest': D.setPose(POSES.lie,{earAlert:0.3}); ai.restT=rand(9,14); ai.sighT=2; say('rest',2.2,true); break;
    case 'disobey': {
      const d=ai.disobey; say('disobey',2.4,true);
      if(d==='bellyup') D.setPose(POSES.bellyUp); else if(d==='bark') D.setPose(POSES.bark); else D.setPose(POSES.stand); break; }
    case 'pet': ai.petT=0; ai.spun=0; break;
    case 'bellyup': D.setPose(POSES.bellyUp); say('petBelly',2,true); break;
    case 'kiara': D.setPose(POSES.alert,{earAlert:1}); say('kiara',2.6,true); break;
    case 'groom': D.setPose(POSES.stand,{eyes:0.35,neckPitch:-0.1}); achv.brushes++; break;
    case 'eat_mango': D.setPose(POSES.sit,{neckPitch:-0.3,mouth:0.6}); say('mango',2.6,true); D.pant=false; break;
  }
}
function lookAtPoint(pt,dt,maxYaw=0.9){ // gira la cabeza hacia un punto del mundo
  const p=dante.root.position; const ang=angleDiff(Math.atan2(pt.x-p.x,pt.z-p.z),dante.heading);
  dante.lookT.yaw=clamp(ang,-maxYaw,maxYaw); const d=Math.hypot(pt.x-p.x,pt.z-p.z); dante.lookT.pitch=clamp(Math.atan2(1.15-pt.y,Math.max(d,0.5))*0.5,-0.35,0.45);
}
const cursor={world:V3(2,1,4),has:false};
function updateAI(dt){
  const D=dante, p=D.root.position; ai.t+=dt; bubble.gap=Math.max(0,bubble.gap-dt);
  const free=FREE.has(ai.state);
  // pistas sobre necesidades
  ai.sayT-=dt; if(ai.sayT<0&&free){ ai.sayT=rand(8,14); if(stats.hambre<30)say('hungry'); else if(stats.sed<30)say('thirsty'); else if(stats.limpieza<30)say('dirty'); else if(stats.energia<25)say('tired'); else say('idle'); }
  // necesidades autónomas
  if(free&&!ai.petting&&ai.state!=='trick'){ if(stats.hambre<45&&world.food>0) return setState('goto_eat'); if(stats.sed<45&&world.water>0) return setState('goto_drink'); }
  // Kiara cerca
  if(kiaraAI.active&&free&&ai.state!=='kiara'&&!ai.petting&&kiara.root.position.distanceTo(p)<3.4) setState('kiara',{scolded:false});
  // mosca cerca
  if((ai.state==='stand'||ai.state==='sit'||ai.state==='wander')&&!ai.petting&&Math.random()<dt*0.4){ const f=flies[0]; if(f.position.distanceTo(p)<2.2) setState('fly',{dur:2.6}); }
  // mirar al cursor cuando está tranquilo
  const lookStates=new Set(['stand','sit','lie','wander','fetch_done','groom','trick','calm']);
  if(lookStates.has(ai.state)&&cursor.has&&ai.state!=='wander') lookAtPoint(cursor.world,dt); else if(ai.state!=='fly'&&ai.state!=='kiara'&&ai.state!=='bark'&&ai.state!=='pet'){D.lookT.yaw=0;D.lookT.pitch=0;}

  switch(ai.state){
    case 'stand': case 'sit': case 'lie': case 'scratch': case 'yawn': stopMoving(dt);
      if(ai.state==='scratch'){ D.target.rrU=-1.3+Math.sin(ai.t*22)*0.25; D.target.headRoll=0.4+Math.sin(ai.t*22)*0.05; }
      if(ai.t>ai.dur) chooseIdle(); break;
    case 'wander': if(steer(dt,ai.target,1.25,0.35)||ai.t>9) chooseIdle(); break;
    case 'fly': { stopMoving(dt); const f=flies[0]; lookAtPoint(f.position,dt,1.2); D.target.mouth=Math.sin(ai.t*11)>0.5?0.9:0.15; D.target.bodyY=Math.max(0,Math.sin(ai.t*7))*0.07; faceTo(f.position,dt,3);
      if(ai.t>ai.dur){ relocateFly(f); say('fly',1.4); chooseIdle(); } break; }
    case 'goto_eat': if(steer(dt,bowlApproach(BOWL_FOOD),1.6,0.25)) setState('eat'); break;
    case 'goto_drink': if(steer(dt,bowlApproach(BOWL_WATER),1.6,0.25)) setState('drink'); break;
    case 'eat': case 'drink': { stopMoving(dt); const isFood=ai.state==='eat', bowlP=isFood?BOWL_FOOD:BOWL_WATER; faceTo(bowlP,dt);
      D.target.neckPitch=1.15+Math.sin(ai.t*(isFood?7:14))*0.1; D.target.mouth=isFood?(Math.sin(ai.t*7)>0?0.5:0.1):0.2;
      ai.chompT-=dt; if(ai.chompT<0){ ai.chompT=isFood?0.5:0.2; isFood?Audio.chomp():Audio.lap(); }
      const rate=dt/5; if(isFood){ addStat('hambre',48*rate); world.food=Math.max(0,world.food-rate); } else { addStat('sed',48*rate); world.water=Math.max(0,world.water-rate); }
      if(ai.t>5||(isFood?world.food:world.water)<=0){ if(isFood)world.food=0; else world.water=0; addStat('felicidad',4); setState('stand',{dur:2}); } break; }
    case 'fetch_chase': { const bp=ball.mesh.position; const tgt=V3(bp.x,0,bp.z).addScaledVector(V3(ball.vel.x,0,ball.vel.z),0.25); tgt.x=clamp(tgt.x,-B,B); tgt.z=clamp(tgt.z,-B,B);
      D.setPose(POSES.stand,{earAlert:1,mouth:0.5,tailLift:0.6}); lookAtPoint(bp,dt,1.2);
      const arrived=steer(dt,tgt,4.6,0.45);
      if((arrived||p.distanceTo(V3(bp.x,0,bp.z))<0.6)&&bp.y<0.6&&ball.vel.length()<4){ ball.held=true; ball.flying=false; Audio.yip(); setState('fetch_return'); }
      if(ai.t>12){ ball.held=false; setState('stand',{dur:2}); } break; }
    case 'fetch_return': if(steer(dt,ball.returnPt,3.8,0.9)){ ball.held=false; ball.rest=true; const m=D.mouthPos(); ball.mesh.position.set(clamp(m.x,-B,B),ball.r,clamp(m.z,-B,B)); ball.vel.set(0,0,0); setState('fetch_done',{dur:3}); } break;
    case 'fetch_done': stopMoving(dt); if(ai.t>ai.dur) chooseIdle(); break;
    case 'to_player': if(steer(dt,ai.target,2.4,0.8)) setState('eat_mango',{dur:3.2}); break;
    case 'eat_mango': stopMoving(dt); faceTo(ai.target.clone().add(V3(0,0,0)),dt); D.target.mouth=Math.sin(ai.t*8)>0?0.7:0.1; ai.chompT-=dt; if(ai.chompT<0){ai.chompT=0.45;Audio.chomp();}
      if(ai.t>ai.dur){ addStat('hambre',10); addStat('felicidad',14); Particles.spawn('heart',D.head.getWorldPosition(V3()).add(V3(0,0.4,0))); setState('sit',{dur:3}); } break;
    case 'trick': { stopMoving(dt); const tr=ai.trick;
      if(tr==='paw'){ D.target.flU=-1.15+Math.sin(ai.t*6)*0.12; }
      if(tr==='show'&&Math.random()<dt*6) Particles.spawn('spark',D.root.position.clone().add(V3(rand(-0.8,0.8),rand(0.2,1.5),rand(-0.8,0.8))),{life:0.9,speed:0.3});
      if(tr==='roll'&&!ai.did){ const k=clamp((ai.t-0.3)/1.6,0,1); D.target.bodyRoll=k*Math.PI*2; if(k>=1){ ai.did=true; D.pose.bodyRoll=0; D.target.bodyRoll=0; D.setPose(POSES.sit); D.pant=true; say('obey',2,true); } }
      if(tr==='jump'){ const t=ai.t; if(t>0.25&&t<0.85){ const k=(t-0.25)/0.6; D.target.bodyY=Math.sin(k*Math.PI)*0.85; D.target.flU=-0.7;D.target.flL=1.1;D.target.frU=-0.7;D.target.frL=1.1;D.target.rlU=0.8;D.target.rlL=0.9;D.target.rrU=0.8;D.target.rrL=0.9; D.target.bodyPitch=-0.25+k*0.5; }
        else if(t>=0.85&&!ai.did){ ai.did=true; D.setPose(POSES.stand,{tailLift:0.7}); D.pant=true; Audio.boing(0.8); for(let i=0;i<5;i++)Particles.spawn('dust',D.root.position.clone().add(V3(rand(-.4,.4),0.1,rand(-.4,.4))),{life:0.7,speed:0.5,size:0.4}); say('obey',2,true); } }
      if(tr==='speak'){ ai.barkT-=dt; if(ai.barkT<0&&ai.barks<2){ ai.barks++; ai.barkT=0.55; Audio.bark(); D.target.mouth=0.9; D.target.bodyY=0.08; say('speak',1.2,true); setTimeout(()=>{D.target.mouth=0.15;D.target.bodyY=0;},140); } }
      if(ai.t>ai.dur) chooseIdle(); break; }
    case 'trick_fail': stopMoving(dt); if(ai.trick==='roll'){ D.target.bodyRoll=1.1-Math.max(0,ai.t-1.2)*1.5; } if(ai.trick==='jump'&&ai.t>0.35) D.target.bodyY=0; if(ai.t>ai.dur) chooseIdle(); break;
    case 'disobey': if(ai.disobey==='walkaway'){ if(steer(dt,ai.target,1.5,0.4)) chooseIdle(); } else { stopMoving(dt); if(ai.disobey==='bark'){ ai.barkT-=dt; if(ai.barkT<0){ai.barkT=0.8;Audio.bark(0.95);D.target.bodyY=0.08;} else D.target.bodyY=0; } if(ai.t>ai.dur) chooseIdle(); } break;
    case 'to_gate': if(steer(dt,GATE_SPOT,4.4,0.5)) setState('bark'); if(ai.t>0.4&&Math.random()<dt*2)Audio.bark(); break;
    case 'bark': { stopMoving(dt); faceTo(visitor.position,dt); lookAtPoint(visitor.position,dt,0.6);
      ai.barkT-=dt; if(ai.barkT<0){ ai.barkT=rand(0.35,0.7); Audio.bark(rand(0.9,1.1)); D.target.bodyY=0.1; D.target.mouth=0.9; setTimeout(()=>{D.target.bodyY=0;},90); if(Math.random()<0.5) say('visit',1.6); }
      if(ai.petting){ ai.calm+=dt; if(ai.calm>1.2&&Math.random()<dt*0.7) say('...ok... ok...',1.2); } else ai.calm=Math.max(0,ai.calm-dt*0.5);
      if(ai.calm>(visit.calmNeed||3.2)||ai.t>60){ if(ai.calm>(visit.calmNeed||3.2)){achv.visits++;checkMedals();} endVisit(); setState('calm',{dur:4}); } break; }
    case 'calm': stopMoving(dt); if(ai.t>ai.dur) chooseIdle(); break;
    case 'to_kennel': { const entry=KENNEL_POS.clone().addScaledVector(KENNEL_DIR,1.7), inside=KENNEL_POS.clone().addScaledVector(KENNEL_DIR,0.05);
      if(!ai.inside){ if(steer(dt,entry,1.6,0.3)) ai.inside=true; } else { D.target.neckPitch=0.35; if(steer(dt,inside,0.9,0.15)) setState(world.kennelClosed?'cry':'kennel_rest'); } break; }
    case 'kennel_rest': { stopMoving(dt); dante.heading=angleLerp(dante.heading,Math.PI/4,1-Math.exp(-3*dt)); if(cursor.has) lookAtPoint(cursor.world,dt,0.7);
      ai.sighT-=dt; if(ai.sighT<0){ ai.sighT=rand(3,5); Audio.sigh(); if(Math.random()<0.5) say('rest',2); }
      if(world.kennelClosed&&ai.t>1.2) setState('cry'); else if(ai.t>ai.restT) setState('sleep'); break; }
    case 'cry': { stopMoving(dt); dante.heading=angleLerp(dante.heading,Math.PI/4,1-Math.exp(-3*dt));
      ai.cryT-=dt*(ai.petting?3:1); ai.barkT-=dt; if(ai.barkT<0){ ai.barkT=rand(2,3.4); if(Math.random()<0.25)Audio.howl(); else Audio.whine(); say(ai.wantOut?'cryOut':(ai.petting?'*snif*... gracias':'cry'),2.2); D.target.neckPitch=ai.wantOut?-0.4:0.0; setTimeout(()=>{D.target.neckPitch=0.3;},500); }
      if(ai.wantOut){ D.target.earAlert=1; D.target.earBack=0; D.target.bodyY=-0.36+Math.max(0,Math.sin(ai.t*6))*0.06; if(!world.kennelClosed) setState('wake'); break; }
      if(!world.kennelClosed&&ai.t>1){ say('thanks',2,true); setState('kennel_rest'); ai.restT=5; break; }
      if(Math.random()<dt*1.5) Particles.spawn('tear',D.worldPos(V3(0.1,0,0.2)).clone(),{life:0.9,speed:0.3,size:0.18,grav:2,vel:V3(rand(-.3,.3),0.2,rand(-.2,.2))});
      D.target.bodyY=-0.42+Math.sin(ai.t*14)*0.008; if(ai.cryT<=0) setState('sleep'); break; }
    case 'sleep': { stopMoving(dt); addStat('energia',dt*0.6); ai.snoreT-=dt; D.target.bodyY=-0.42+Math.sin(ai.t*2.2)*0.012;
      if(ai.snoreT<0){ ai.snoreT=3.6; Audio.snore(); Particles.spawn('z',D.head.getWorldPosition(V3()).add(V3(0,0.35,0)),{life:2,speed:0.35,size:0.3}); if(Math.random()<0.3)say('sleep',2); } break; }
    case 'wake': stopMoving(dt); if(ai.t>1.6) setState('wander',{target:V3(rand(-2,2),0,rand(-1,3))}); break;
    case 'pet': { stopMoving(dt); const z=ai.petZone; ai.petT+=dt;
      if(z==='head'){ D.setPose(POSES.stand,{eyes:0.1,headRoll:0.35,neckPitch:-0.3,tailLift:0.7}); }
      else if(z==='belly'){ D.setPose(POSES.sit,{eyes:0.3,tailLift:0.6}); if(ai.petT>0.8) setState('bellyup'); }
      else if(z==='tail'){ D.setPose(POSES.stand,{earAlert:1}); if(ai.spun<Math.PI){ const d=dt*4.5; dante.heading+=d; ai.spun+=d; } dante.lookT.yaw=1.0; }
      else { D.setPose(POSES.stand,{eyes:0.35,tailLift:0.7}); }
      if(!ai.petting&&ai.afterPet<=0) chooseIdle(); break; }
    case 'bellyup': stopMoving(dt); D.target.rlU=0.4+Math.sin(ai.t*9)*0.2; D.target.rrU=0.6+Math.cos(ai.t*9)*0.2; if(!ai.petting&&ai.afterPet<=0&&ai.t>2.5) chooseIdle(); break;
    case 'kiara': { const kp=kiara.root.position, d=kp.distanceTo(p); lookAtPoint(kp,dt,1.2);
      if(ai.scolded){ D.target.earBack=0.9; D.target.tailLift=-0.25; D.target.eyes=0.6; }
      if(d<(ai.scolded?3.2:2.4)){ const away=p.clone().sub(kp); away.y=0; away.normalize(); steer(dt,p.clone().addScaledVector(away,2.2),ai.scolded?2.6:1.8,0.3); } else { stopMoving(dt); faceTo(kp,dt,2); }
      if(!kiaraAI.active||d>4.5||(ai.scolded&&ai.t>4)) chooseIdle(); break; }
    case 'groom': stopMoving(dt); if(!ai.petting&&ai.afterPet<=0) chooseIdle(); break;
  }
  ai.afterPet=Math.max(0,ai.afterPet-dt);
  if(ai.state!=='fetch_chase'&&ai.state!=='to_gate') D.pant=D.pant||(ai.state==='fetch_done');
  const tailTop=(ai.state==='cry'||ai.state==='sleep')?0:stats.felicidad/100;
  D.animate(dt,{wag:tailTop});
  D.dirt.forEach(m=>m.visible=stats.limpieza<42);
  if(stats.energia<22&&D.target.eyes>0.6) D.target.eyes=0.55;
}

// ---------- comandos desde la UI
function busyAtNight(){ if(world.night){ toast('Dante está en su kennel 💤 (apagá la noche primero)'); return true; } return false; }
function cmdFood(){ if(busyAtNight())return; world.food=1; achv.feeds++; kibble.visible=true; kibble.scale.y=1; Audio.yip(); toast('Plato lleno de Royal Canin 🍖'); if(FREE.has(ai.state)||ai.state==='drink') setState('goto_eat'); }
function cmdWater(){ if(busyAtNight())return; world.water=1; waterMesh.visible=true; toast('Plato con agua fresca 💧'); if(FREE.has(ai.state)||ai.state==='eat') setState('goto_drink'); }
const TRICK_DUR={sit:3.2,platz:3.2,paw:3.2,show:4.8,roll:3.0,jump:1.8,speak:2.4};
function cmdTrick(tr){ if(busyAtNight())return; if(ai.state==='bark'||ai.state==='to_gate'){toast('¡Está ladrando! Acariciálo para calmarlo');return;}
  if(tr==='mango'){ ai.target=playerSpot(); setState('to_player'); Audio.yip(); achv.mangos++;
    if(ai.lastTrick&&world.time-ai.lastTrickT<10){ training[ai.lastTrick]=Math.min(100,training[ai.lastTrick]+6); toast(`🥭 Premio: ${TRICKS[ai.lastTrick]} +6`); ai.lastTrick=null; updateTrickUI(); } return; }
  const obeys=stats.felicidad>35||Math.random()<0.45;
  if(!obeys){ const d=pick(['bellyup','bark','walkaway']); setState('disobey',{disobey:d,dur:3,target:V3(rand(-B+1,B-1),0,rand(-B+1,B-1))}); return; }
  const m=training[tr], pOk=0.35+0.62*(m/100); achv.tricks++; ai.lastTrick=tr; ai.lastTrickT=world.time;
  if(Math.random()<pOk){ training[tr]=Math.min(100,m+(m<50?9:5)); setState('trick',{trick:tr,dur:TRICK_DUR[tr]}); }
  else { training[tr]=Math.min(100,m+3); setState('trick_fail',{trick:tr,dur:2.6}); }
  updateTrickUI(); checkMedals();
}
function cmdVisit(){ if(busyAtNight())return; if(visit.active){toast('Ya hay alguien en la puerta');return;} visit.active=true; visit.t=0; visit.phase='arrive'; visit.calmNeed=rand(2.4,4.6);
  const u=visitor.userData; u.shirt.material.color.setHex(pick([0xe0503e,0x3b7dd8,0x3aa35b,0xf2c14e,0x8e5bd6,0xffffff])); u.skin.forEach(m=>m.material.color.setHex(pick([0xd9a074,0xb97a4e,0x8d5a3a,0xf0c8a0]))); u.hat.visible=Math.random()<0.5; u.hat.material.color.setHex(pick([0x6a4a2a,0x222222,0xd8d8d8]));
  visitor.visible=true; visitor.position.set(0,0,10.5); Audio.bark(); setState('to_gate'); }
function endVisit(){ visit.phase='leave'; }
function setNight(on,auto=false){ if(world.night===on)return; world.night=on; $('[data-action=night]').classList.toggle('on',on);
  if(on){ toast(auto?'Anocheció en El Salvador 🌙 Dante va a su kennel':'Buenas noches 🌙 Dante va a su kennel'); achv.nights++; if(ball.held){ball.held=false;ball.rest=true;ball.mesh.position.y=ball.r;} if(visit.active) endVisit(); setState('to_kennel',{inside:false}); }
  else { toast(auto?'Amaneció en El Salvador ☀️':'¡Buenos días! ☀️');
    const inKennel=ai.state==='sleep'||ai.state==='cry'||ai.state==='to_kennel'||ai.state==='kennel_rest';
    if(inKennel){ if(world.kennelClosed){ setState('cry',{wantOut:true,cryT:9999}); } else { dante.root.position.copy(KENNEL_POS).addScaledVector(KENNEL_DIR,1.9); dante.heading=Math.PI/4; setState('wake'); addStat('felicidad',5); } } }
  updateKennelBtn(); checkMedals(); }
function cmdNight(){ if(world.autoClock){ world.autoClock=false; $('#auto').classList.remove('on'); toast('Reloj automático apagado'); } setNight(!world.night); }
function toggleKennelDoor(){ world.kennelClosed=!world.kennelClosed; Audio.snap(); updateKennelBtn();
  if(world.kennelClosed){ if(ai.state==='kennel_rest') setState('cry'); else if(ai.state==='sleep'&&Math.random()<0.35){ setState('cry'); } }
  else { if(ai.state==='cry'&&ai.wantOut) setState('wake'); } }
function updateKennelBtn(){ const inK=['kennel_rest','cry','sleep','to_kennel'].includes(ai.state); $('#kennelBtn').classList.toggle('show',inK); $('#kennelBtn').textContent=world.kennelClosed?'🔓 Abrir puerta del kennel':'🔒 Cerrar puerta del kennel'; }

// ---------- visitante, Kiara, moscas, pelota
function updateVisit(dt){ if(!visit.active)return; visit.t+=dt; const v=visitor; v.userData.arm.rotation.z=-2.4+Math.sin(visit.t*7)*0.5;
  if(visit.phase==='arrive'){ v.position.z=damp(v.position.z,8.6,2,dt); gate.rotation.y=Math.sin(visit.t*6)*0.04; v.rotation.y=Math.PI; }
  else if(visit.phase==='leave'){ v.position.z+=dt*1.8; v.rotation.y=0; gate.rotation.y=damp(gate.rotation.y,0,4,dt); if(v.position.z>11.5){ v.visible=false; visit.active=false; visit.phase='none'; } }
}
function kSet(st,data={}){ const k=kiaraAI; k.state=st; k.t=0; Object.assign(k,data); const K=kiara;
  if(st==='lie') K.setPose(POSES.lie,{neckPitch:0.25,eyes:0.7}); else if(st==='drink') K.setPose(POSES.eat,{mouth:0.2}); else if(st==='scold') K.setPose(POSES.bark,{earBack:0.8,tailLift:0.85,mouth:0.9});
  else K.setPose(POSES.stand,{neckPitch:0.18,earAlert:0.2,tailLift:-0.1}); }
function kNext(){ const k=kiaraAI; if(k.stay>95) return kSet('leave'); const r=Math.random();
  if(r<0.35) kSet('wander',{target:V3(rand(-5,5),0,rand(-4,4))}); else if(r<0.55&&world.water>0.1) kSet('toWater'); else if(r<0.88||k.stay<40) kSet('toBed'); else kSet('leave'); }
function updateKiara(dt){ const k=kiaraAI, K=kiara, p=K.root.position;
  if(!k.active){ if(world.night)return; k.next-=dt; if(k.next<0){ k.active=true; k.stay=0; p.copy(HOUSE_DOOR); K.root.visible=true; K.heading=Math.PI; K.speed=0; kSet('enter'); Audio.sigh(); } return; }
  k.t+=dt; k.stay+=dt; k.scoldCd-=dt;
  switch(k.state){
    case 'enter': if(steerDog(K,dt,V3(HOUSE_DOOR.x+0.6,0,-3.6),0.95,0.4)) kNext(); break;
    case 'wander': if(steerDog(K,dt,k.target,0.95,0.4)||k.t>14) kNext(); break;
    case 'toBed': if(steerDog(K,dt,KIARA_BED,0.9,0.35)) kSet('lie',{dur:rand(20,40)}); break;
    case 'lie': K.speed=damp(K.speed,0,8,dt); K.heading=angleLerp(K.heading,Math.PI/2,1-Math.exp(-2*dt)); if(Math.random()<dt*0.08)Audio.sigh(); if(k.t>k.dur) kNext(); break;
    case 'toWater': if(steerDog(K,dt,bowlApproach(BOWL_WATER),0.95,0.3)) kSet('drink',{dur:4}); break;
    case 'drink': K.speed=damp(K.speed,0,8,dt); K.heading=angleLerp(K.heading,Math.atan2(BOWL_WATER.x-p.x,BOWL_WATER.z-p.z),1-Math.exp(-5*dt)); K.target.neckPitch=1.15+Math.sin(k.t*14)*0.1; if(Math.random()<dt*5)Audio.lap(); world.water=Math.max(0,world.water-dt*0.05); if(k.t>k.dur||world.water<=0) kNext(); break;
    case 'scold': K.speed=damp(K.speed,0,8,dt); K.heading=angleLerp(K.heading,Math.atan2(dante.root.position.x-p.x,dante.root.position.z-p.z),1-Math.exp(-6*dt)); K.target.bodyY=k.t<0.3?0.08:0; if(k.t>2.0) kNext(); break;
    case 'leave': if(steerDog(K,dt,HOUSE_DOOR,0.95,0.4,WALL-0.4)){ k.active=false; K.root.visible=false; k.next=rand(70,130); kSet('away'); } break;
  }
  // regaña a Dante si se le acerca (o si se arrima a su cama mientras descansa)
  const dp=dante.root.position, dd=p.distanceTo(dp);
  if(k.state!=='scold'&&k.state!=='leave'&&k.state!=='enter'&&k.scoldCd<=0&&dd<1.8){ k.scoldCd=7; kSet('scold'); Audio.growl(); setTimeout(()=>Audio.snap(),350);
    if(FREE.has(ai.state)||ai.state==='kiara'){ setState('kiara',{scolded:true}); say('scolded',2.4,true); Audio.whine(); addStat('felicidad',-3); } }
  if(dd<2.8&&k.state!=='lie'){ K.lookT.yaw=clamp(angleDiff(Math.atan2(dp.x-p.x,dp.z-p.z),K.heading),-0.9,0.9); } else K.lookT.yaw=0;
  K.animate(dt,{wag:0.12});
}
function updateFlies(dt){ for(const f of flies){ const u=f.userData; u.t+=dt; f.visible=world.nightT<0.5; u.c.x+=Math.sin(u.t*0.7)*dt*0.6; u.c.z+=Math.cos(u.t*0.5)*dt*0.6; u.c.x=clamp(u.c.x,-6,6); u.c.z=clamp(u.c.z,-6,6);
  f.position.set(u.c.x+Math.sin(u.t*9)*0.5+Math.sin(u.t*2.3)*0.4,u.c.y+Math.sin(u.t*13)*0.15,u.c.z+Math.cos(u.t*7)*0.5); } }
function updateBall(dt){ const m=ball.mesh;
  if(ball.held){ m.visible=true; m.position.copy(dante.mouthPos()); return; }
  if(!ball.flying) return;
  ball.vel.y-=18*dt; m.position.addScaledVector(ball.vel,dt);
  if(m.position.y<ball.r){ m.position.y=ball.r; if(Math.abs(ball.vel.y)>1.2){ ball.vel.y*=-0.55; ball.vel.x*=0.8; ball.vel.z*=0.8; Audio.boing(Math.min(1,Math.abs(ball.vel.y)/6)); } else ball.vel.y=0;
    const fr=Math.max(0,1-2.2*dt); ball.vel.x*=fr; ball.vel.z*=fr; }
  const lim=WALL-0.45; if(Math.abs(m.position.x)>lim){ m.position.x=Math.sign(m.position.x)*lim; ball.vel.x*=-0.6; Audio.boing(0.6);} if(Math.abs(m.position.z)>lim){ m.position.z=Math.sign(m.position.z)*lim; ball.vel.z*=-0.6; Audio.boing(0.6);}
  m.rotation.x+=ball.vel.z*dt*4; m.rotation.z-=ball.vel.x*dt*4;
  if(ball.vel.length()<0.08&&m.position.y<=ball.r+0.001){ ball.flying=false; ball.rest=true; ball.vel.set(0,0,0); }
}

export { SAY, bubble, say, toastEl, toastT, toast, updateToast, FREE, ai, visit, kiaraAI, setState, playerSpot, bowlApproach, faceTo, steerDog, steer, stopMoving, chooseIdle, onEnter, lookAtPoint, cursor, updateAI, busyAtNight, cmdFood, cmdWater, TRICK_DUR, cmdTrick, cmdVisit, endVisit, setNight, cmdNight, toggleKennelDoor, updateKennelBtn, updateVisit, kSet, kNext, updateKiara, updateFlies, updateBall };
