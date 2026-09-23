import * as THREE from 'three';
import { clamp, lerp, damp, rand, V3 } from './utils.js';
import { scene, M, G, mesh, FUR_LAYERS, furMaterial } from './scene.js';

// ---------- DOG MODEL (primitivas agrupadas, animables por código)
const basePose=()=>({bodyY:0,bodyPitch:0,bodyRoll:0,neckPitch:0,headYaw:0,headPitch:0,headRoll:0,earAlert:0,earBack:0,eyes:1,mouth:0,tongue:0,tailLift:0.15,spread:0,
  flU:0,flL:0,frU:0,frL:0,rlU:0,rlL:0,rrU:0,rrL:0});
const POSES={
  stand:{},
  alert:{earAlert:1,neckPitch:-0.2,tailLift:0.6},
  sit:{bodyY:-0.2,bodyPitch:-0.55,flU:0.55,frU:0.55,rlU:-0.8,rlL:2.4,rrU:-0.8,rrL:2.4,neckPitch:-0.1,tailLift:-0.1},
  lie:{bodyY:-0.42,flU:-0.72,flL:-0.78,frU:-0.72,frL:-0.78,rlU:-0.72,rlL:2.2,rrU:-0.72,rrL:2.2,neckPitch:0.15,tailLift:-0.1},
  bellyUp:{bodyY:-0.36,bodyRoll:Math.PI,flU:0.5,flL:0.9,frU:0.6,frL:0.8,rlU:0.4,rlL:0.9,rrU:0.6,rrL:0.7,headRoll:0.5,neckPitch:-0.4,tongue:1,mouth:0.35,tailLift:0.3},
  stack:{bodyY:-0.05,rrU:0.7,rrL:-0.5,rlU:-0.12,rlL:0.12,neckPitch:-0.4,headPitch:-0.1,earAlert:1,tailLift:-0.2,mouth:0.15},
  eat:{bodyPitch:0.22,bodyY:-0.06,neckPitch:1.15,headPitch:0.25,flU:-0.1,frU:-0.1,spread:0.22,mouth:0.3,rlU:0.15,rrU:0.15},
  bark:{neckPitch:-0.35,headPitch:-0.2,mouth:0.85,earAlert:1,tailLift:0.7,spread:0.2},
  stretch:{bodyPitch:0.38,bodyY:-0.12,flU:-1.25,flL:-0.1,frU:-1.25,frL:-0.1,rlU:0.3,rrU:0.3,neckPitch:0.45,mouth:0.5,eyes:0.2},
};
POSES.sleep={...POSES.lie,neckPitch:0.55,headRoll:0.55,headYaw:0.45,eyes:0,earBack:0.5,tailLift:-0.2};
POSES.cry={...POSES.lie,neckPitch:0.3,eyes:0.45,earBack:1,mouth:0.25};
POSES.paw={...POSES.sit,flU:-1.15,flL:0.95,headRoll:0.15};
POSES.scratch={...POSES.sit,rrU:-1.3,rrL:1.2,neckPitch:0.5,headYaw:0.6,headRoll:0.4,eyes:0.4};

const DANTE_COLORS={base:0xb35e26,light:0xcf8340,saddle:0x1d1a1a,mask:0x1a1717,fur:0xd8964e,nose:0x121010};
const KIARA_COLORS={base:0xc9a266,light:0xdcb87c,saddle:0x8a6a3c,mask:0x3a2c22,fur:0xe6d2a2,nose:0x121010};

class Dog{
  constructor(colors,opt={}){
    this.longHair=opt.longHair!==false;
    const mB=M(colors.base),mL=M(colors.light),mS=M(colors.saddle),mK=M(colors.mask),mF=M(colors.fur),mN=new THREE.MeshPhysicalMaterial({color:colors.nose,roughness:0.28,clearcoat:0.8,clearcoatRoughness:0.25}),
          mEyeW=new THREE.MeshPhysicalMaterial({color:0xe9e2d6,roughness:0.15,clearcoat:1,clearcoatRoughness:0.05}),mPupil=new THREE.MeshPhysicalMaterial({color:0x2a1608,roughness:0.08,clearcoat:1,clearcoatRoughness:0.03}),mTongue=new THREE.MeshPhysicalMaterial({color:0xe0708a,roughness:0.35,clearcoat:0.7});
    this.mats={mB,mL,mS,mK,mF};
    const mk=(geo,mat,pos,scl,rot,zone='body',parent,fur)=>{const m=mesh(geo,mat,pos,scl,rot);m.receiveShadow=false;m.userData.zone=zone;(parent||this.body).add(m);this.meshes.push(m);if(fur)this.furBase.push([m,fur]);return m;};
    this.meshes=[]; this.furBase=[]; this.shells=[];
    this.root=new THREE.Group(); this.body=new THREE.Group(); this.body.position.y=0.78; this.root.add(this.body);
    const b=this.body;
    // torso: tres esferas + montura negra + panza clara
    const FB={c:colors.base,len:0.055},FS={c:colors.saddle,len:0.065},FL={c:colors.light,len:0.10},FH={c:colors.base,len:0.022},FHS={c:colors.saddle,len:0.02},FE={c:colors.saddle,len:0.03},FT={c:colors.saddle,len:0.10},FTF={c:colors.fur,len:0.12},FLEG={c:colors.base,len:0.035},FCH={c:colors.fur,len:0.13};
    mk(G.sph,mB,[0,0.0,-0.05],[0.27,0.30,0.62],null,'body',null,FB); mk(G.sph,mB,[0,-0.05,0.42],[0.29,0.34,0.36],null,'body',null,FB); mk(G.sph,mB,[0,-0.07,-0.52],[0.24,0.26,0.36],null,'body',null,FB);
    mk(G.sph,mS,[0,0.12,-0.1],[0.28,0.25,0.64],null,'body',null,FS); mk(G.sph,mS,[0,0.06,-0.5],[0.23,0.2,0.34],null,'body',null,FS);
    mk(G.sph,mL,[0,-0.17,-0.05],[0.23,0.16,0.5],null,'belly',null,FL); mk(G.sph,mL,[0,-0.16,0.4],[0.26,0.22,0.3],null,'belly',null,FL);
    if(this.longHair){ // pelo largo: pechera y melena (esferas con pelo largo), "calzones" en los muslos
      mk(G.sph,mF,[0,-0.18,0.5],[0.22,0.2,0.14],null,'body',null,FCH);
      mk(G.sph,mB,[0.17,-0.02,0.47],[0.11,0.16,0.1],null,'body',null,FCH); mk(G.sph,mB,[-0.17,-0.02,0.47],[0.11,0.16,0.1],null,'body',null,FCH);
    }
    // manchas de suciedad (visibles cuando la limpieza es baja)
    this.dirt=[[0.29,0.05,0.05],[-0.26,-0.02,-0.3],[0.2,-0.15,0.3],[-0.24,0.18,-0.05]].map(p=>{const m=mk(G.lsph,M(0x5a3a22),p,[0.07,0.05,0.08]);m.visible=false;return m;});
    // cuello y cabeza
    this.neck=new THREE.Group(); this.neck.position.set(0,0.12,0.42); b.add(this.neck);
    mk(G.cyl,mB,[0,0.17,0.13],[0.16,0.52,0.17],[0.62,0,0],'body',this.neck,FB);
    if(this.longHair) mk(G.cyl,mS,[0,0.2,0.08],[0.13,0.4,0.12],[0.62,0,0],'body',this.neck);
    this.head=new THREE.Group(); this.head.position.set(0,0.36,0.30); this.neck.add(this.head);
    const h=this.head;
    mk(G.sph,mB,[0,0,0],[0.23,0.21,0.25],null,'head',h,FH); mk(G.sph,mS,[0,0.08,-0.03],[0.2,0.15,0.2],null,'head',h,FHS);
    mk(G.sph,mK,[0,-0.03,0.24],[0.15,0.13,0.26],null,'head',h,FHS); mk(G.sph,mK,[0,-0.01,0.4],[0.1,0.09,0.1],null,'head',h); mk(G.sph,mN,[0,0.03,0.46],[0.062,0.05,0.062],null,'head',h);
    mk(G.sph,mL,[0.16,-0.05,0.1],[0.1,0.09,0.11],null,'head',h,FL); mk(G.sph,mL,[-0.16,-0.05,0.1],[0.1,0.09,0.11],null,'head',h,FL);
    mk(G.sph,mL,[0.09,0.1,0.17],[0.045,0.03,0.04],null,'head',h); mk(G.sph,mL,[-0.09,0.1,0.17],[0.045,0.03,0.04],null,'head',h);
    this.jaw=new THREE.Group(); this.jaw.position.set(0,-0.1,0.13); h.add(this.jaw);
    mk(G.sph,mK,[0,-0.03,0.13],[0.12,0.05,0.24],null,'head',this.jaw);
    this.tongue=mk(G.box,mTongue,[0,0.0,0.2],[0.08,0.02,0.17],null,'head',this.jaw);
    this.eyes=[0.095,-0.095].map(x=>{const e=new THREE.Group();e.position.set(x,0.045,0.19);h.add(e);const w=mesh(G.sph,mEyeW,[0,0,0],[0.046,0.038,0.038]);w.castShadow=false;e.add(w);const p=mesh(G.sph,mPupil,[0,0,0.014],[0.04,0.033,0.03]);p.castShadow=false;e.add(p);w.userData.zone=p.userData.zone='head';this.meshes.push(w,p);return e;});
    this.ears=[1,-1].map(s=>{const e=new THREE.Group();e.position.set(0.15*s,0.14,-0.05);h.add(e);
      mk(G.sph,mS,[0,0.19,0],[0.12,0.22,0.05],null,'head',e,FE); mk(G.sph,mL,[0,0.18,0.02],[0.085,0.17,0.035],null,'head',e);
      if(this.longHair) mk(G.sph,mF,[0,0.03,0.02],[0.085,0.06,0.07],null,'head',e);
      e.userData.side=s; return e;});
    // patas: pivote hombro/cadera -> muslo -> rodilla -> canilla + pata
    const leg=(x,z,rear)=>{const g=new THREE.Group();g.position.set(x,0,z);b.add(g);
      if(rear){mk(G.cylT,mB,[0,-0.2,0],[0.12,0.4,0.13],null,'body',g,FB);mk(G.sph,mS,[0,0.0,-0.03],[0.12,0.19,0.15],null,'body',g,FS);
        if(this.longHair)mk(G.sph,mB,[0,-0.2,-0.08],[0.1,0.17,0.1],null,'body',g,FCH);}
      else{mk(G.cylT,mB,[0,-0.2,0],[0.09,0.4,0.09],null,'body',g,FLEG);mk(G.sph,mB,[0,0,0],[0.11,0.12,0.11],null,'body',g,FB);}
      const k=new THREE.Group();k.position.set(0,-0.4,0);g.add(k); mk(G.sph,mB,[0,0,0],[0.075,0.075,0.075],null,'body',k);
      mk(G.cylT,mB,[0,-0.18,0],[0.07,0.36,0.07],null,'body',k,FLEG); mk(G.sph,mL,[0,-0.36,0.03],[0.09,0.065,0.11],null,'body',k);
      return {up:g,knee:k};};
    this.legs={fl:leg(0.2,0.4,false),fr:leg(-0.2,0.4,false),rl:leg(0.2,-0.52,true),rr:leg(-0.2,-0.52,true)};
    // cola de 5 segmentos
    this.tail=[];let parent=new THREE.Group();parent.position.set(0,0.08,-0.72);b.add(parent);
    for(let i=0;i<5;i++){const s=new THREE.Group();if(i>0)s.position.set(0,-0.17,0);parent.add(s);const r=0.055-0.007*i;
      mk(G.cyl,i<3?mS:mB,[0,-0.09,0],[r,0.18,r],null,'tail',s); if(this.longHair)mk(G.sph,i<2?mS:mF,[0,-0.09,0.03],[r+0.02,0.11,r+0.035],null,'tail',s,i<2?FT:FTF);
      this.tail.push(s);parent=s;}
    this.buildFur(); this.pose=basePose(); this.target=basePose();
    this.speed=0; this.heading=0; this.gait=0; this.look={yaw:0,pitch:0}; this.lookT={yaw:0,pitch:0};
    this.blink=rand(2,5); this.blinkT=0; this.breath=rand(0,6); this.wagT=0; this.twitch=[0,0]; this.twitchT=rand(1,4);
    this.pant=false; this.tmp=V3();
  }
  // pelo tipo "shells": copias concéntricas con alpha de ruido; las capas externas son más ralas y más claras
  buildFur(){ const L=this.longHair?FUR_LAYERS:Math.max(3,FUR_LAYERS>>1);
    for(const [m,f] of this.furBase){ const col=typeof f==='object'?f.c:f, len=(typeof f==='object'?f.len:0.09)*(this.longHair?1:0.35);
      for(let i=1;i<=L;i++){ const sh=new THREE.Mesh(m.geometry,furMaterial(col,len,i,L)); sh.position.copy(m.position); sh.rotation.copy(m.rotation); sh.scale.copy(m.scale); sh.castShadow=false; sh.receiveShadow=false;
        sh.userData.zone=m.userData.zone; m.parent.add(sh); this.meshes.push(sh); this.shells.push(sh); } } }
  setFur(on){ for(const sh of this.shells) sh.visible=on; }
  setPose(p,extra){Object.assign(this.target,basePose(),p,extra||{});}
  worldPos(local,obj){return (obj||this.head).localToWorld(this.tmp.copy(local));}
  mouthPos(){return this.worldPos(V3(0,-0.12,0.42));}
  animate(dt,o){ // o: {wag, mood}
    const p=this.pose,t=this.target,k=1-Math.exp(-9*dt);
    for(const key in p) p[key]=lerp(p[key],t[key],k);
    this.look.yaw=damp(this.look.yaw,this.lookT.yaw,6,dt); this.look.pitch=damp(this.look.pitch,this.lookT.pitch,6,dt);
    // marcha: caminar/trotar/galopar según velocidad
    const s=this.speed, walk=clamp(s/1.2,0,1), gal=clamp((s-2.3)/2.2,0,1);
    this.gait+=dt*(3.5+s*3.4); const ph=this.gait, amp=walk*(0.5+0.35*gal);
    const offs={fl:0,fr:lerp(Math.PI,0.5,gal),rl:lerp(Math.PI,Math.PI+0.5,gal),rr:lerp(0,Math.PI,gal)};
    const bounce=gal*0.07*Math.abs(Math.sin(ph)), gpitch=gal*0.13*Math.sin(ph);
    this.breath+=dt; const br=Math.sin(this.breath*(this.pant?9:1.6))*0.012;
    this.body.position.y=0.78+p.bodyY+bounce; this.body.rotation.set(p.bodyPitch+gpitch,0,p.bodyRoll); this.body.scale.set(1,1+br,1+br*0.6);
    for(const n of ['fl','fr','rl','rr']){const L=this.legs[n],u=p[n+'U'],l=p[n+'L'],sw=Math.sin(ph+offs[n])*amp,bend=Math.max(0,Math.sin(ph+offs[n]+1.1))*amp*1.4;
      L.up.rotation.x=u-sw; L.up.rotation.z=(n==='fl'?1:n==='fr'?-1:0)*p.spread; L.knee.rotation.x=l+bend;}
    this.neck.rotation.x=p.neckPitch;
    this.head.rotation.set(p.headPitch+this.look.pitch,p.headYaw+this.look.yaw,p.headRoll);
    // parpadeo y orejas
    this.blink-=dt; if(this.blink<0){this.blinkT=0.13;this.blink=rand(2,6);} this.blinkT-=dt;
    const eyeS=this.blinkT>0?0.08:Math.max(0.08,p.eyes); for(const e of this.eyes){e.scale.y=damp(e.scale.y,eyeS,25,dt);}
    this.twitchT-=dt; if(this.twitchT<0){this.twitchT=rand(1.5,5);this.twitch[Math.random()<.5?0:1]=0.35;}
    this.ears.forEach((e,i)=>{this.twitch[i]=Math.max(0,this.twitch[i]-dt*1.5);const sd=e.userData.side;
      e.rotation.x=-0.1-0.25*p.earAlert+1.3*p.earBack+this.twitch[i]; e.rotation.z=sd*(0.42-0.2*p.earAlert+0.6*p.earBack)+this.twitch[i]*sd*0.5;});
    this.jaw.rotation.x=p.mouth*0.55; this.tongue.visible=p.tongue>0.5||(this.pant&&p.mouth<0.5&&p.eyes>0.2);
    if(this.pant&&this.tongue.visible){this.jaw.rotation.x=0.25+Math.sin(this.breath*9)*0.08;}
    // cola: más rápida mientras más feliz
    const wag=o?o.wag:0.5; this.wagT+=dt*(2+wag*13); const wa=0.15+wag*0.45;
    this.tail.forEach((sg,i)=>{sg.rotation.x=i===0?0.6+p.tailLift*1.2:0.16; sg.rotation.z=Math.sin(this.wagT-i*0.7)*wa*(i===0?1:0.55);});
    this.root.rotation.y=this.heading;
  }
}
const dante=new Dog(DANTE_COLORS); scene.add(dante.root); dante.root.position.set(0,0,1.5);
const kiara=new Dog(KIARA_COLORS,{longHair:false}); kiara.root.scale.setScalar(0.94); kiara.root.visible=false; scene.add(kiara.root);

export { basePose, POSES, DANTE_COLORS, KIARA_COLORS, Dog, dante, kiara };
