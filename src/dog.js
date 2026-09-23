import * as THREE from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { clamp, lerp, damp, rand, V3 } from './utils.js';
import { scene, MOBILE, LITE, FUR_LAYERS, furMaterial, finMaterial, canvasTex, SKIN_TEX, FUR_TEX } from './scene.js';

// ---------- DOG MODEL
// El perro es UNA malla orgánica generada en código: el esqueleto (huesos de three) lleva "primitivas" de
// distancia (elipsoides y cápsulas) que se funden con una unión suave; marching cubes extrae la superficie,
// y cada vértice recibe pesos de skinning, color y largo de pelo según qué primitivas lo formaron.
const basePose=()=>({bodyY:0,bodyPitch:0,bodyRoll:0,neckPitch:0,headYaw:0,headPitch:0,headRoll:0,earAlert:0,earBack:0,eyes:1,mouth:0,tongue:0,tailLift:0.15,spread:0,
  flU:0,flL:0,frU:0,frL:0,rlU:0,rlL:0,rrU:0,rrL:0});
const POSES={
  stand:{},
  alert:{earAlert:1,neckPitch:-0.2,tailLift:0.6},
  sit:{bodyY:-0.2,bodyPitch:-0.55,flU:0.55,frU:0.55,rlU:-0.6,rlL:1.9,rrU:-0.6,rrL:1.9,neckPitch:-0.1,tailLift:-0.1},
  lie:{bodyY:-0.42,flU:-0.72,flL:-0.78,frU:-0.72,frL:-0.78,rlU:-0.5,rlL:1.7,rrU:-0.5,rrL:1.7,neckPitch:0.15,tailLift:-0.1},
  bellyUp:{bodyY:-0.36,bodyRoll:Math.PI,flU:0.5,flL:0.9,frU:0.6,frL:0.8,rlU:0.4,rlL:0.6,rrU:0.6,rrL:0.5,headRoll:0.5,neckPitch:-0.4,tongue:1,mouth:0.35,tailLift:0.3},
  stack:{bodyY:-0.05,rrU:0.6,rrL:-0.4,rlU:-0.1,rlL:0.1,neckPitch:-0.4,headPitch:-0.1,earAlert:1,tailLift:-0.2,mouth:0.15},
  eat:{bodyPitch:0.22,bodyY:-0.06,neckPitch:1.15,headPitch:0.25,flU:-0.1,frU:-0.1,spread:0.22,mouth:0.3,rlU:0.15,rrU:0.15},
  bark:{neckPitch:-0.35,headPitch:-0.2,mouth:0.85,earAlert:1,tailLift:0.7,spread:0.2},
  stretch:{bodyPitch:0.38,bodyY:-0.12,flU:-1.25,flL:-0.1,frU:-1.25,frL:-0.1,rlU:0.3,rrU:0.3,neckPitch:0.45,mouth:0.5,eyes:0.2},
};
POSES.sleep={...POSES.lie,neckPitch:0.55,headRoll:0.55,headYaw:0.45,eyes:0,earBack:0.5,tailLift:-0.2};
POSES.cry={...POSES.lie,neckPitch:0.3,eyes:0.45,earBack:1,mouth:0.25};
POSES.paw={...POSES.sit,flU:-1.15,flL:0.95,headRoll:0.15};
POSES.scratch={...POSES.sit,rrU:-1.1,rrL:0.9,neckPitch:0.5,headYaw:0.6,headRoll:0.4,eyes:0.4};

const DANTE_COLORS={base:0xa24d1c,light:0xc4763a,saddle:0x161210,mask:0x0c0a09,fur:0xc98844,nose:0x121010};
const KIARA_COLORS={base:0xc9a266,light:0xdcb87c,saddle:0x8a6a3c,mask:0x3a2c22,fur:0xe6d2a2,nose:0x121010};

const ZONES=['body','head','belly','tail'];
const SMOOTH_K=0.035;            // radio de fusión entre primitivas
const CELL=LITE?0.028:0.017;    // tamaño de celda del campo de distancia
const BOUNDS={min:[-0.62,-0.08,-1.1],max:[0.62,1.85,1.4]};
// postura de reposo de las patas (radianes): traseras anguladas como un pastor alemán, con el pie plano compensando
const REST={fl:[0.05,-0.08],fr:[0.05,-0.08],rl:[-0.32,0.78],rr:[-0.32,0.78]};

// ---- funciones de distancia con signo (en el espacio local de cada primitiva)
function sdfEllipsoid(x,y,z,s){ const qx=x/s[0],qy=y/s[1],qz=z/s[2]; const k0=Math.sqrt(qx*qx+qy*qy+qz*qz); if(k0<1e-6) return -Math.min(s[0],s[1],s[2]);
  const k1=Math.sqrt(qx*qx/(s[0]*s[0])+qy*qy/(s[1]*s[1])+qz*qz/(s[2]*s[2])); return k0*(k0-1)/k1; }
function sdfCapsule(x,y,z,r,h,rr){ const qx=Math.hypot(x,z)-r+rr, qy=Math.abs(y)-h+rr; const mx=Math.max(qx,0),my=Math.max(qy,0); return Math.min(Math.max(qx,qy),0)+Math.hypot(mx,my)-rr; }
function sdfBox(x,y,z,e){ const qx=Math.abs(x)-e[0],qy=Math.abs(y)-e[1],qz=Math.abs(z)-e[2]; const mx=Math.max(qx,0),my=Math.max(qy,0),mz=Math.max(qz,0); return Math.hypot(mx,my,mz)+Math.min(Math.max(qx,qy,qz),0); }
function primDist(P,x,y,z){ // x,y,z ya en espacio local de la primitiva
  if(P.type==='sph'||P.type==='cutsph') return sdfEllipsoid(x,y,z,P.scl);
  if(P.type==='cut') return sdfBox(x,y,z,P.ext);
  return sdfCapsule(x,y,z,P.r,P.h,P.rr);
}
const shadowTex=canvasTex(128,128,(g,w,h)=>{const r=g.createRadialGradient(64,64,6,64,64,62);r.addColorStop(0,'rgba(0,0,0,.55)');r.addColorStop(0.6,'rgba(0,0,0,.22)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,w,h);});

class Dog{
  constructor(colors,opt={}){
    this.longHair=opt.longHair!==false; this.colors=colors; this.id=opt.id||'dog';
    const C={B:colors.base,L:colors.light,S:colors.saddle,K:colors.mask,F:colors.fur};
    this.root=new THREE.Group();
    // ---- esqueleto: mismos nombres y pivotes que la versión anterior, más un hueso de pie por pata
    const bone=(name,parent,pos,rx=0)=>{const b=new THREE.Bone();b.name=name;b.position.set(...pos);b.rotation.x=rx;parent.add(b);this.bones.push(b);return b;};
    this.bones=[]; this.prims=[];
    const skinMat=new THREE.MeshStandardMaterial({vertexColors:true,map:SKIN_TEX,bumpMap:FUR_TEX,bumpScale:0.004,roughness:0.9});
    skinMat.onBeforeCompile=sh=>{ sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      vec4 sampledDiffuseColor=texture2D(map,vMapUv); float lum=dot(vColor.rgb,vec3(0.33)); sampledDiffuseColor.rgb=mix(vec3(1.0),sampledDiffuseColor.rgb,smoothstep(0.05,0.3,lum)); diffuseColor*=sampledDiffuseColor;
      #endif`); };
    this.mesh=new THREE.SkinnedMesh(new THREE.BufferGeometry(),skinMat); this.root.add(this.mesh);
    this.body=bone('body',this.mesh,[0,0.78,0]);
    this.neck=bone('neck',this.body,[0,0.14,0.44]); this.head=bone('head',this.neck,[0,0.38,0.30]); this.jaw=bone('jaw',this.head,[0,-0.1,0.13]);
    this.ears=[1,-1].map(s=>{const e=bone('ear'+s,this.head,[0.16*s,0.17,-0.06]);e.userData.side=s;return e;});
    const leg=(n,x,z,rear)=>{const r=REST[n];const up=bone(n+'Up',this.body,[x,0,z],r[0]);const knee=bone(n+'Knee',up,[0,rear?-0.39:-0.36,0],r[1]);const paw=bone(n+'Paw',knee,[0,rear?-0.35:-0.32,0],-(r[0]+r[1]));return {up,knee,paw,rear};};
    this.legs={fl:leg('fl',0.2,0.42,false),fr:leg('fr',-0.2,0.42,false),rl:leg('rl',0.19,-0.52,true),rr:leg('rr',-0.19,-0.52,true)};
    this.tail=[]; let par=this.body; for(let i=0;i<5;i++){ par=bone('tail'+i,par,i===0?[0,0.02,-0.74]:[0,-0.17,0]); this.tail.push(par); }
    // ---- primitivas de forma: (tipo, hueso, pos, escala, color, largo de pelo, zona, rotación)
    const P=(type,b,pos,scl,col,len,zone='body',rot=null)=>this.prims.push({type,bone:b,pos,scl,rot,color:new THREE.Color(col),len,zone:ZONES.indexOf(zone)});
    const lh=this.longHair;
    // tronco: cruz alta, lomo que baja hacia la grupa, pecho profundo y vientre recogido
    P('sph',this.body,[0,0.06,0.1],[0.27,0.30,0.5],C.B,0.07);             // caja torácica
    P('sph',this.body,[0,-0.1,0.45],[0.25,0.32,0.3],C.B,0.07);             // pecho profundo
    P('sph',this.body,[0,0.02,-0.32],[0.22,0.25,0.3],C.B,0.07);            // lomo (más angosto: tuck-up)
    P('sph',this.body,[0,-0.06,-0.55],[0.23,0.24,0.32],C.B,0.07);          // grupa
    P('sph',this.body,[0,0.17,0.32],[0.27,0.22,0.28],C.S,0.08);            // cruz
    P('sph',this.body,[0,0.1,-0.12],[0.29,0.24,0.52],C.S,0.08);            // manto (baja por los flancos)
    P('sph',this.body,[0,0.03,-0.56],[0.23,0.18,0.3],C.S,0.08);            // manto sobre la grupa (más bajo)
    P('sph',this.body,[0,-0.2,0.15],[0.22,0.14,0.42],C.L,0.10,'belly');    // vientre
    P('sph',this.body,[0,-0.1,-0.3],[0.17,0.11,0.24],C.L,0.10,'belly');    // vientre recogido
    P('sph',this.body,[0,-0.1,0.62],[0.16,0.19,0.13],C.F,0.15);            // antepecho
    if(lh){ P('sph',this.body,[0,-0.18,0.52],[0.25,0.24,0.16],C.F,0.17); P('sph',this.body,[0.19,0.0,0.46],[0.12,0.17,0.11],C.L,0.15); P('sph',this.body,[-0.19,0.0,0.46],[0.12,0.17,0.11],C.L,0.15); }
    P('cyl',this.neck,[0,0.17,0.13],[0.15,0.56,0.16],C.B,0.07,'body',[0.62,0,0]); if(lh){ P('cyl',this.neck,[0,0.22,0.06],[0.13,0.44,0.11],C.S,0.08,'body',[0.62,0,0]); P('sph',this.neck,[0.15,0.16,0.14],[0.11,0.24,0.14],C.L,0.18,'body'); P('sph',this.neck,[-0.15,0.16,0.14],[0.11,0.24,0.14],C.L,0.18,'body'); P('sph',this.neck,[0,0.02,0.2],[0.13,0.16,0.12],C.F,0.18,'body'); }
    // cabeza en cuña: cráneo, frente con "stop", hocico más largo y angosto, cachetes, cejas
    P('sph',this.head,[0,0,-0.02],[0.2,0.2,0.24],C.B,0.025,'head'); P('sph',this.head,[0,0.08,-0.01],[0.185,0.15,0.24],C.S,0.028,'head');
    P('sph',this.head,[0,0.06,0.09],[0.15,0.115,0.17],C.S,0.02,'head');     // frente (negra), en cuña
    P('sph',this.head,[0,0.09,0.19],[0.075,0.055,0.1],C.S,0.014,'head');   // caballete sobre el stop
    P('sph',this.head,[0,0.02,0.16],[0.165,0.085,0.12],C.K,0.012,'head');   // máscara alrededor de los ojos
    P('sph',this.head,[0,-0.02,0.29],[0.11,0.09,0.31],C.K,0.012,'head');    // hocico más largo y angosto
    P('sph',this.head,[0,-0.045,0.33],[0.115,0.06,0.24],C.K,0.01,'head');   // belfos (labio superior que cuelga)
    P('sph',this.head,[0.135,-0.01,0.14],[0.06,0.05,0.07],C.B,0.03,'head'); P('sph',this.head,[-0.135,-0.01,0.14],[0.06,0.05,0.07],C.B,0.03,'head');   // pómulos
    P('sph',this.head,[0.09,0.115,0.16],[0.06,0.03,0.05],C.S,0.02,'head'); P('sph',this.head,[-0.09,0.115,0.16],[0.06,0.03,0.05],C.S,0.02,'head');   // arcos de las cejas
    P('sph',this.head,[0,-0.005,0.52],[0.08,0.072,0.08],C.K,0.008,'head');  // punta del hocico
    P('sph',this.head,[0.15,-0.07,0.02],[0.1,0.12,0.14],C.B,0.09,'head'); P('sph',this.head,[-0.15,-0.07,0.02],[0.1,0.12,0.14],C.B,0.09,'head');   // cachetes peludos, atrás
    P('sph',this.head,[0.085,0.11,0.19],[0.042,0.026,0.036],C.L,0.012,'head'); P('sph',this.head,[-0.085,0.11,0.19],[0.042,0.026,0.036],C.L,0.012,'head');   // cejas fuego
    P('cut',this.head,[0,-0.105,0.4],[0.22,0.05,0.44],0,0,'head');         // ranura de la boca
    P('cutsph',this.head,[0.105,0.055,0.275],[0.066,0.058,0.085],0,0,'head'); P('cutsph',this.head,[-0.105,0.055,0.275],[0.066,0.058,0.085],0,0,'head'); // cuencas (alargadas hacia afuera para abrir la superficie)
    P('sph',this.jaw,[0,-0.04,0.16],[0.078,0.046,0.25],C.K,0.008,'head');
    for(const e of this.ears){ P('sph',e,[0,0.21,-0.005],[0.115,0.27,0.045],C.S,0.03,'head'); P('sph',e,[0,0.18,0.025],[0.085,0.2,0.03],C.L,0.045,'head'); P('sph',e,[0,0.02,0.02],[0.09,0.07,0.07],C.L,0.08,'head'); }
    // patas: brazo/muslo, articulación, antebrazo/pierna, y pie con dedos
    for(const n of ['fl','fr','rl','rr']){ const L=this.legs[n], rear=L.rear;
      if(rear){ P('cyl',L.up,[0,-0.19,0],[0.1,0.38,0.11],C.B,0.03); P('sph',L.up,[0,-0.02,-0.03],[0.12,0.2,0.15],C.S,0.065); if(lh) P('sph',L.up,[0,-0.19,-0.09],[0.11,0.2,0.11],C.L,0.15);
        P('sph',L.knee,[0,0,0],[0.065,0.07,0.07],C.B,0.03); P('cyl',L.knee,[0,-0.17,0],[0.058,0.34,0.06],C.B,0.03); P('sph',L.knee,[0,-0.34,-0.01],[0.05,0.06,0.05],C.B,0.02); }
      else { P('cyl',L.up,[0,-0.18,0],[0.078,0.36,0.082],C.B,0.035); P('sph',L.up,[0,0.02,0],[0.1,0.13,0.1],C.B,0.06); if(lh) P('sph',L.up,[0,-0.16,-0.06],[0.055,0.17,0.05],C.L,0.11); P('sph',L.knee,[0,0,-0.01],[0.06,0.07,0.06],C.B,0.03); P('cyl',L.knee,[0,-0.16,0],[0.055,0.32,0.055],C.B,0.03); }
      P('sph',L.paw,[0,-0.045,0.03],[0.075,0.055,0.1],C.L,0.008); P('sph',L.paw,[0,-0.07,0.11],[0.07,0.035,0.045],C.L,0.006);
      for(const tx of [-0.042,0,0.042]) P('sph',L.paw,[tx,-0.075,0.12+(tx?0:0.015)],[0.026,0.024,0.036],C.L,0.004); }
    this.tail.forEach((s,i)=>{ const r=0.05-0.006*i; P('cyl',s,[0,-0.09,0],[r,0.18,r],i<4?C.S:C.B,0.06,'tail'); if(lh){ P('sph',s,[0,-0.09,-0.02],[r+0.01,0.1,r+0.02],C.S,0.06,'tail'); P('sph',s,[0,-0.1,0.035],[r+0.005,0.09,r+0.015],C.F,0.075,'tail'); } });
    // ---- piezas que no forman parte de la piel: ojos con iris y párpados, nariz con fosas, colmillos, lengua
    const mkMesh=(geo,mat,parent,pos,scl,rot)=>{const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scl);if(rot)m.rotation.set(...rot);m.castShadow=true;m.userData.zone='head';parent.add(m);return m;};
    const sphG=new THREE.SphereGeometry(1,20,14), lidG=new THREE.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI*0.55);
    const mSclera=new THREE.MeshPhysicalMaterial({color:0x3a2416,roughness:0.2,clearcoat:1,clearcoatRoughness:0.05}),mIris=new THREE.MeshPhysicalMaterial({color:0x7a4416,roughness:0.15,clearcoat:1,clearcoatRoughness:0.03}),mPupil=new THREE.MeshPhysicalMaterial({color:0x050302,roughness:0.1,clearcoat:1});
    const mLid=new THREE.MeshStandardMaterial({color:colors.mask,roughness:0.95}), mN=new THREE.MeshPhysicalMaterial({color:colors.nose,roughness:0.45,clearcoat:0.5,clearcoatRoughness:0.35,bumpMap:FUR_TEX,bumpScale:0.002}),mNostril=new THREE.MeshStandardMaterial({color:0x000000,roughness:1});
    const mTongue=new THREE.MeshPhysicalMaterial({color:0xd8607a,roughness:0.35,clearcoat:0.7}),mMouth=new THREE.MeshStandardMaterial({color:0x2a0e0c,roughness:1}),mTooth=new THREE.MeshPhysicalMaterial({color:0xf2ecdc,roughness:0.3,clearcoat:0.5});
    this.meshes=[this.mesh]; this.lids=[];
    this.eyes=[0.105,-0.105].map(x=>{const e=new THREE.Group();e.position.set(x,0.055,0.262);e.rotation.z=-0.18*Math.sign(x);e.rotation.y=0.12*Math.sign(x);this.head.add(e);
      const w=mkMesh(sphG,mSclera,e,[0,0,0],[0.046,0.038,0.04]); const ir=mkMesh(sphG,mIris,e,[0,0,0.006],[0.046,0.038,0.038]); const p=mkMesh(sphG,mPupil,e,[0,0,0.034],[0.022,0.022,0.012]); const gl=mkMesh(sphG,new THREE.MeshBasicMaterial({color:0xffffff}),e,[-0.011*Math.sign(x),0.011,0.041],[0.006,0.006,0.003]); gl.castShadow=false;   // brillo del ojo
      w.castShadow=ir.castShadow=p.castShadow=false; this.meshes.push(w,ir);
      const lid=mkMesh(lidG,mLid,e,[0,0,0],[0.052,0.044,0.046]); lid.castShadow=false; lid.rotation.x=-1.15; this.lids.push(lid);   // párpado superior: rota para cerrar
      const lidB=mkMesh(lidG,mLid,e,[0,0,0],[0.052,0.044,0.046]); lidB.castShadow=false; lidB.rotation.x=Math.PI+0.95;   // párpado inferior fijo
      return e;});
    this.meshes.push(mkMesh(sphG,mN,this.head,[0,0.03,0.595],[0.05,0.042,0.046]));
    [0.02,-0.02].forEach(x=>mkMesh(sphG,mNostril,this.head,[x,0.025,0.645],[0.012,0.014,0.008]).castShadow=false);
    mkMesh(sphG,mMouth,this.head,[0,-0.09,0.34],[0.095,0.045,0.27]).castShadow=false;
    const toothG=new THREE.ConeGeometry(1,1,8);
    [0.055,-0.055].forEach(x=>{ mkMesh(toothG,mTooth,this.head,[x,-0.09,0.48],[0.012,0.035,0.012],[Math.PI,0,0]).castShadow=false; mkMesh(toothG,mTooth,this.jaw,[x*0.85,0.0,0.37],[0.01,0.03,0.01]).castShadow=false; });
    this.tongue=mkMesh(new THREE.CapsuleGeometry(0.5,1,4,10),mTongue,this.jaw,[0,0.0,0.24],[0.075,0.02,0.09],[Math.PI/2,0,0]);
    // sombra de contacto suave bajo el cuerpo
    this.blob=new THREE.Mesh(new THREE.PlaneGeometry(1.7,1.1),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false})); this.blob.rotation.x=-Math.PI/2; this.blob.position.y=0.006; this.blob.renderOrder=-1; this.blob.userData.noAO=true; this.root.add(this.blob);
    // ---- construir la piel
    const t0=performance.now(); this.buildSkin(); this.buildFur(); this.buildFins(); this.genMs=Math.round(performance.now()-t0);
    this.pose=basePose(); this.target=basePose();
    this.speed=0; this.heading=0; this.gait=0; this.look={yaw:0,pitch:0}; this.lookT={yaw:0,pitch:0};
    this.blink=rand(2,5); this.blinkT=0; this.breath=rand(0,6); this.wagT=0; this.twitch=[0,0]; this.twitchT=rand(1,4);
    this.pant=false; this.tmp=V3(); this.prevHeading=0; this.earSwing=0; this.touch={pos:V3(0,-9,0),dir:V3(0,0,1),w:0};
  }
  // Campo de distancia -> marching cubes -> atributos por vértice -> SkinnedMesh
  buildSkin(){
    this.root.updateMatrixWorld(true);       // pose de bind: rotaciones de reposo (patas anguladas)
    const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), one=V3(1,1,1);
    for(const P of this.prims){ // matriz inversa de cada primitiva (mundo -> local) y caja envolvente en mundo
      e.set(...(P.rot||[0,0,0])); q.setFromEuler(e); m4.compose(V3(...P.pos),q,one); P.world=P.bone.matrixWorld.clone().multiply(m4); P.inv=P.world.clone().invert(); P.ie=P.inv.elements;
      if(P.type==='cyl'){ P.r=(P.scl[0]+P.scl[2])/2; P.h=P.scl[1]/2; P.rr=P.r*0.5; P.ext=[P.r,P.h,P.r]; } else if(P.type==='cut'){ P.ext=[P.scl[0]/2,P.scl[1]/2,P.scl[2]/2]; } else P.ext=P.scl;
      P.isCut=P.type==='cut'||P.type==='cutsph';
      const bb=new THREE.Box3(); const c=V3(); for(let i=0;i<8;i++){ c.set((i&1?1:-1)*P.ext[0],(i&2?1:-1)*P.ext[1],(i&4?1:-1)*P.ext[2]).applyMatrix4(P.world); bb.expandByPoint(c); }
      bb.expandByScalar(P.isCut?0.02:0.22); P.bb=bb; }
    const h=CELL, mn=BOUNDS.min, nx=Math.ceil((BOUNDS.max[0]-mn[0])/h)+1, ny=Math.ceil((BOUNDS.max[1]-mn[1])/h)+1, nz=Math.ceil((BOUNDS.max[2]-mn[2])/h)+1;
    const N=nx*ny*nz, F=new Float32Array(N), D=new Float32Array(N);
    const idx=(i,j,k)=>i+nx*(j+ny*k);
    const range=(bb)=>[Math.max(0,Math.floor((bb.min.x-mn[0])/h)),Math.min(nx-1,Math.ceil((bb.max.x-mn[0])/h)),Math.max(0,Math.floor((bb.min.y-mn[1])/h)),Math.min(ny-1,Math.ceil((bb.max.y-mn[1])/h)),Math.max(0,Math.floor((bb.min.z-mn[2])/h)),Math.min(nz-1,Math.ceil((bb.max.z-mn[2])/h))];
    // unión suave exponencial: F = Σ exp(-d/k)  ->  d = -k·ln F  (independiente del orden)
    for(const P of this.prims){ if(P.isCut)continue; const [i0,i1,j0,j1,k0,k1]=range(P.bb), ie=P.ie;
      for(let k=k0;k<=k1;k++){ const z=mn[2]+k*h; for(let j=j0;j<=j1;j++){ const y=mn[1]+j*h; for(let i=i0;i<=i1;i++){ const x=mn[0]+i*h;
        const lx=ie[0]*x+ie[4]*y+ie[8]*z+ie[12], ly=ie[1]*x+ie[5]*y+ie[9]*z+ie[13], lz=ie[2]*x+ie[6]*y+ie[10]*z+ie[14];
        const d=primDist(P,lx,ly,lz); if(d<0.25) F[idx(i,j,k)]+=Math.exp(-d/SMOOTH_K); } } } }
    for(let n=0;n<N;n++) D[n]=F[n]>0?-SMOOTH_K*Math.log(F[n]):1.0;
    // ubicar los ojos sobre la superficie REAL: se marcha desde el centro de la cabeza hacia afuera hasta salir del volumen,
    // y ahí se colocan el ojo y la cuenca (antes quedaban enterrados dentro de la máscara y la frente)
    { const hp=V3().setFromMatrixPosition(this.head.matrixWorld); this.eyeLocal=[];
      const sample=(x,y,z)=>{ const i=Math.round((x-mn[0])/h),j=Math.round((y-mn[1])/h),k=Math.round((z-mn[2])/h); if(i<0||j<0||k<0||i>=nx||j>=ny||k>=nz) return 1; return D[idx(i,j,k)]; };
      [V3(0.1,0.06,0.25),V3(-0.1,0.06,0.25)].forEach((ed,i)=>{ const d=ed.clone().normalize(); let ts=0.3; for(let t=0.08;t<0.6;t+=h*0.5){ if(sample(hp.x+d.x*t,hp.y+d.y*t,hp.z+d.z*t)>0){ ts=t; break; } }
        const eyeP=d.clone().multiplyScalar(ts-0.035); this.eyeLocal.push(eyeP); this.eyes[i].position.copy(eyeP);
        const cut=this.prims.find(P=>P.type==='cutsph'&&Math.sign(P.pos[0])===Math.sign(ed.x)); const cp=d.clone().multiplyScalar(ts+0.005); cut.pos=[cp.x,cp.y,cp.z]; cut.scl=[0.058,0.05,0.07]; cut.ext=cut.scl;
        e.set(0,0,0); q.setFromEuler(e); m4.compose(V3(...cut.pos),q,one); cut.world=cut.bone.matrixWorld.clone().multiply(m4); cut.inv=cut.world.clone().invert(); cut.ie=cut.inv.elements;
        const bb=new THREE.Box3(); const c=V3(); for(let k=0;k<8;k++){ c.set((k&1?1:-1)*cut.ext[0],(k&2?1:-1)*cut.ext[1],(k&4?1:-1)*cut.ext[2]).applyMatrix4(cut.world); bb.expandByPoint(c); } bb.expandByScalar(0.02); cut.bb=bb; }); }
    for(const P of this.prims){ if(!P.isCut)continue; const [i0,i1,j0,j1,k0,k1]=range(P.bb), ie=P.ie;   // tallar (resta)
      for(let k=k0;k<=k1;k++){ const z=mn[2]+k*h; for(let j=j0;j<=j1;j++){ const y=mn[1]+j*h; for(let i=i0;i<=i1;i++){ const x=mn[0]+i*h;
        const lx=ie[0]*x+ie[4]*y+ie[8]*z+ie[12], ly=ie[1]*x+ie[5]*y+ie[9]*z+ie[13], lz=ie[2]*x+ie[6]*y+ie[10]*z+ie[14];
        const n=idx(i,j,k); D[n]=Math.max(D[n],-primDist(P,lx,ly,lz)); } } } }
    // ---- marching cubes con vértices compartidos por arista (3 cachés: aristas en x, y, z)
    const ex=new Int32Array(N).fill(-1), ey=new Int32Array(N).fill(-1), ez=new Int32Array(N).fill(-1);
    const pos=[], nrm=[], tris=[];
    const grad=(i,j,k,out)=>{ const cx=D[idx(Math.min(i+1,nx-1),j,k)]-D[idx(Math.max(i-1,0),j,k)], cy=D[idx(i,Math.min(j+1,ny-1),k)]-D[idx(i,Math.max(j-1,0),k)], cz=D[idx(i,j,Math.min(k+1,nz-1))]-D[idx(i,j,Math.max(k-1,0))]; out[0]=cx;out[1]=cy;out[2]=cz; };
    const ga=[0,0,0], gb=[0,0,0];
    const vert=(cache,i,j,k,axis)=>{ const n=idx(i,j,k); if(cache[n]>=0) return cache[n];
      const i2=i+(axis===0?1:0), j2=j+(axis===1?1:0), k2=k+(axis===2?1:0); const va=-D[n], vb=-D[idx(i2,j2,k2)]; const t=clamp(va/(va-vb),0,1);
      const x=mn[0]+(i+(axis===0?t:0))*h, y=mn[1]+(j+(axis===1?t:0))*h, z=mn[2]+(k+(axis===2?t:0))*h;
      grad(i,j,k,ga); grad(i2,j2,k2,gb); let gx=lerp(ga[0],gb[0],t),gy=lerp(ga[1],gb[1],t),gz=lerp(ga[2],gb[2],t); const gl=Math.hypot(gx,gy,gz)||1;
      const id=pos.length/3; pos.push(x,y,z); nrm.push(gx/gl,gy/gl,gz/gl); cache[n]=id; return id; };
    const edgeVert=(ed,i,j,k)=>{ switch(ed){ case 0:return vert(ex,i,j,k,0); case 1:return vert(ey,i+1,j,k,1); case 2:return vert(ex,i,j+1,k,0); case 3:return vert(ey,i,j,k,1);
      case 4:return vert(ex,i,j,k+1,0); case 5:return vert(ey,i+1,j,k+1,1); case 6:return vert(ex,i,j+1,k+1,0); case 7:return vert(ey,i,j,k+1,1);
      case 8:return vert(ez,i,j,k,2); case 9:return vert(ez,i+1,j,k,2); case 10:return vert(ez,i+1,j+1,k,2); default:return vert(ez,i,j+1,k,2); } };
    for(let k=0;k<nz-1;k++) for(let j=0;j<ny-1;j++) for(let i=0;i<nx-1;i++){
      let ci=0; if(D[idx(i,j,k)]>0)ci|=1; if(D[idx(i+1,j,k)]>0)ci|=2; if(D[idx(i+1,j+1,k)]>0)ci|=4; if(D[idx(i,j+1,k)]>0)ci|=8;
      if(D[idx(i,j,k+1)]>0)ci|=16; if(D[idx(i+1,j,k+1)]>0)ci|=32; if(D[idx(i+1,j+1,k+1)]>0)ci|=64; if(D[idx(i,j+1,k+1)]>0)ci|=128;
      if(edgeTable[ci]===0) continue; const base=ci*16;
      for(let t=0;triTable[base+t]!==-1;t+=3) tris.push(edgeVert(triTable[base+t],i,j,k),edgeVert(triTable[base+t+1],i,j,k),edgeVert(triTable[base+t+2],i,j,k)); }
    // ---- atributos por vértice: pesos de huesos, color, largo de pelo, zona, uv triplanar
    const nv=pos.length/3, col=new Float32Array(nv*3), fur=new Float32Array(nv), zone=new Uint8Array(nv), sIdx=new Uint16Array(nv*4), sW=new Float32Array(nv*4), uv=new Float32Array(nv*2);
    const boneIndex=new Map(this.bones.map((b,i)=>[b,i])); const bw=new Float32Array(this.bones.length); const lenMul=this.longHair?1:0.35;
    const inv={}; for(const b of this.bones) inv[b.name]=b.matrixWorld.clone().invert(); const lp=V3(), ln=V3();
    const Cc=this.colors, cB=new THREE.Color(Cc.base), cL=new THREE.Color(Cc.light), cS=new THREE.Color(Cc.saddle), cK=new THREE.Color(Cc.mask), cF=new THREE.Color(Cc.fur), cTmp=new THREE.Color();
    const sm=(t,w)=>clamp(t/w*0.5+0.5,0,1); const mixc=(a,b,t)=>cTmp.copy(a).lerp(b,t);
    // devuelve el color del manto para un vértice: manto negro por altura en el lomo, máscara y casquete en la cabeza,
    // orejas negras por detrás y fuego por delante, pechera dorada, vientre claro, cola negra arriba y dorada abajo
    const coat=(x,y,z,nx,ny,nz,dom,out)=>{ const nz1=Math.sin(x*29.1+y*17.3)*Math.sin(z*31.7-y*13.1)*0.02; const name=dom.name;
      lp.set(x,y,z).applyMatrix4(inv[name]); ln.set(nx,ny,nz).transformDirection(inv[name]);
      if(name==='body'){ const by=lp.y,bz=lp.z; const thr=bz>0.2?lerp(-0.05,0.02,clamp((bz-0.2)/0.3,0,1)):bz<-0.4?lerp(-0.05,-0.01,clamp((-0.4-bz)/0.2,0,1)):-0.05;
        const black=sm(by-thr+nz1,0.09), belly=sm(-0.14-by+nz1,0.08), gold=0.85*sm(bz-0.44,0.12)*sm(0.04-by,0.1)*clamp(ln.z*1.5,0,1);
        out.copy(mixc(cB,cL,belly)); out.lerp(cF,gold); out.lerp(cS,black*(1-gold)); return; }
      if(name==='neck'){ const top=sm(ny-0.3+nz1,0.25), front=sm(nz-0.45,0.25)*(1-top); out.copy(mixc(cB,cF,front)); out.lerp(cS,top); return; }
      if(name==='head'){ const hx=lp.x,hy=lp.y,hz=lp.z;
        const muzzle=sm(hz-0.15+nz1,0.06)*sm(0.1-hy,0.05); const eyes=sm(hz-0.09,0.05)*sm(0.13-hy,0.05)*sm(0.16-Math.abs(hx),0.05); const bridge=sm(hz-0.12,0.05)*sm(0.06-Math.abs(hx),0.04)*sm(hy+0.02,0.05); // franja negra que sube por el caballete
        const cap=sm(hy-0.045+nz1,0.05)*sm(0.22-hz,0.06); const cheek=sm(Math.abs(hx)-0.11,0.05)*sm(0.05-hy,0.05);
        const brow=Math.max(sm(0.042-Math.hypot(hx-0.085,hy-0.11,hz-0.19),0.02),sm(0.042-Math.hypot(hx+0.085,hy-0.11,hz-0.19),0.02));
        out.copy(cB); out.lerp(cS,cap); out.lerp(cK,Math.max(muzzle,eyes,bridge)*(1-cheek*0.7)); out.lerp(cL,brow); return; }
      if(name==='jaw'){ out.copy(cK); out.lerp(cB,sm(-0.05-lp.y,0.03)); return; }
      if(name.startsWith('ear')){ const front=sm(lp.z-0.0+nz1,0.03), base=sm(0.06-lp.y,0.04); out.copy(mixc(cS,cL,front)); out.lerp(cB,base); return; }
      if(name.startsWith('tail')){ const top=sm(-ln.z-0.1+nz1,0.35); out.copy(mixc(cF,cS,top)); return; }
      if(name.endsWith('Paw')){ out.copy(cL); return; }
      if(name==='rlUp'||name==='rrUp'){ const th=sm(lp.y+0.1+nz1,0.08)*sm(ln.y+0.1,0.4)*sm(0.02-lp.z,0.08); out.copy(cB); out.lerp(cS,th); return; }
      out.copy(cB); };
    const cOut=new THREE.Color();
    for(let v=0;v<nv;v++){ const x=pos[v*3],y=pos[v*3+1],z=pos[v*3+2]; bw.fill(0); let cr=0,cg=0,cb=0,cl=0,ws=0,best=-1,bz=0;
      for(const P of this.prims){ if(P.isCut)continue; if(x<P.bb.min.x||x>P.bb.max.x||y<P.bb.min.y||y>P.bb.max.y||z<P.bb.min.z||z>P.bb.max.z)continue; const ie=P.ie;
        const lx=ie[0]*x+ie[4]*y+ie[8]*z+ie[12], ly=ie[1]*x+ie[5]*y+ie[9]*z+ie[13], lz=ie[2]*x+ie[6]*y+ie[10]*z+ie[14];
        const d=Math.abs(primDist(P,lx,ly,lz)); const w=Math.exp(-d/0.02); if(w<1e-4)continue;
        bw[boneIndex.get(P.bone)]+=w; cr+=P.color.r*w; cg+=P.color.g*w; cb+=P.color.b*w; cl+=P.len*w; ws+=w; if(w>best){best=w;bz=P.zone;} }
      if(ws<=0){ ws=1; cr=cg=cb=0.5; }
      let domB=0; for(let b=1;b<bw.length;b++) if(bw[b]>bw[domB]) domB=b;
      coat(x,y,z,nrm[v*3],nrm[v*3+1],nrm[v*3+2],this.bones[domB],cOut);
      const vn=1+0.07*Math.sin(x*41.3+y*23.7)*Math.sin(z*37.1+y*19.3); col[v*3]=cOut.r*vn; col[v*3+1]=cOut.g*vn; col[v*3+2]=cOut.b*vn; fur[v]=cl/ws*lenMul; zone[v]=bz;
      lp.set(x,y,z).applyMatrix4(inv.head); const E=this.eyeLocal; const de=Math.min(lp.distanceTo(E[0]),lp.distanceTo(E[1])); if(de<0.12) fur[v]*=clamp((de-0.075)/0.045,0,1);   // sin pelo sobre los ojos
      const order=[...bw.keys()].sort((a,b)=>bw[b]-bw[a]).slice(0,4); let tw=0; for(const b of order) tw+=bw[b]; if(tw<=0){ order[0]=0; tw=1; bw[0]=1; }
      for(let s=0;s<4;s++){ sIdx[v*4+s]=order[s]??0; sW[v*4+s]=order[s]===undefined?0:bw[order[s]]/tw; }
      const ax=Math.abs(nrm[v*3]),ay=Math.abs(nrm[v*3+1]),az=Math.abs(nrm[v*3+2]); const S=0.6; // proyección triplanar simple para el ruido del pelo
      if(ax>=ay&&ax>=az){ uv[v*2]=z*S; uv[v*2+1]=y*S; } else if(ay>=az){ uv[v*2]=x*S; uv[v*2+1]=z*S; } else { uv[v*2]=x*S; uv[v*2+1]=y*S; } }
    const g=this.mesh.geometry; g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
    g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.setAttribute('furLen',new THREE.BufferAttribute(fur,1)); g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(sIdx,4)); g.setAttribute('skinWeight',new THREE.BufferAttribute(sW,4)); g.setIndex(tris);
    g.computeBoundingSphere(); g.boundingSphere.radius*=1.35; g.boundingBox=null;
    this.cleanColor=col; this.dirtyColor=new Float32Array(col); // manchas de suciedad: oscurecer parches con ruido de baja frecuencia
    for(let v=0;v<nv;v++){ const x=pos[v*3],y=pos[v*3+1],z=pos[v*3+2]; const n=Math.sin(x*9.1)*Math.sin(y*7.3+1.7)*Math.sin(z*8.2+0.4); const k=n>0.25?0.55:1; this.dirtyColor[v*3]*=k; this.dirtyColor[v*3+1]*=k; this.dirtyColor[v*3+2]*=k; }
    this.zoneAttr=zone; this.mesh.castShadow=true; this.mesh.receiveShadow=false; this.mesh.frustumCulled=false;
    this.skeleton=new THREE.Skeleton(this.bones); this.mesh.bind(this.skeleton); this.stats={verts:nv,tris:tris.length/3,grid:[nx,ny,nz]};
  }
  buildFur(){ this.shells=[]; const L=this.longHair?FUR_LAYERS:Math.max(3,FUR_LAYERS>>1);
    for(let i=1;i<=L;i++){ const sh=new THREE.SkinnedMesh(this.mesh.geometry,furMaterial(0xffffff,1,i,L,{vertex:true,id:this.id})); sh.bind(this.skeleton,this.mesh.bindMatrix); sh.castShadow=false; sh.receiveShadow=false; sh.frustumCulled=false; sh.raycast=()=>{}; this.root.add(sh); this.shells.push(sh); } }
  // "fins": una tira de hebras por cada tantos vértices, perpendicular a la piel; el shader la muestra solo de canto (silueta)
  buildFins(){ const g=this.mesh.geometry, P=g.attributes.position.array, N=g.attributes.normal.array, Cc=g.attributes.color.array, F=g.attributes.furLen.array, SI=g.attributes.skinIndex.array, SW=g.attributes.skinWeight.array;
    const nv=P.length/3, step=LITE?8:4, flow=V3(0,-0.35,-1).normalize(), t=V3(), n=V3(), p=V3(); const pos=[],nrm=[],col=[],uv=[],si=[],sw=[],fl=[],idx=[]; const Z=this.zoneAttr;
    for(let v=0;v<nv;v+=step){ const len=F[v]; if(len<0.035||Math.random()<0.45) continue; if(N[v*3+1]<-0.55&&Math.random()<0.6) continue;   // menos flecos bajo la panza
      n.set(N[v*3],N[v*3+1],N[v*3+2]); const py=P[v*3+1], pz=P[v*3+2];
      // zonas con mechones largos: orejas (alto en la cabeza), pechera (adelante y bajo), cola
      const ear=Z[v]===1&&py>1.35, chest=Z[v]!==1&&pz>0.35&&py<0.85, tailZ=Z[v]===3, ruff=Z[v]!==1&&pz>0.3&&py>0.85&&py<1.3;   // melena alrededor del cuello
      const zoneMul=ear?1.9:tailZ?1.7:ruff?2.1:chest?1.35:1, cap=ear?0.13:ruff?0.16:(tailZ||chest)?0.10:0.07;
      const clump=(ear||tailZ||chest||ruff)?3:2; if(Z[v]===1&&!ear) continue;   // sin fins en la cara
      for(let c=0;c<clump;c++){ p.set(P[v*3]+rand(-0.012,0.012),py+rand(-0.012,0.012),pz+rand(-0.012,0.012));
        t.crossVectors(n,flow); if(t.lengthSq()<1e-4) t.set(1,0,0); t.normalize().applyAxisAngle(n,rand(-0.9,0.9));
        const w=rand(0.012,0.026)*clamp(len/0.06+0.4,0.5,1.2), L=Math.min(cap,len*zoneMul*rand(0.6,1.15)), tx=n.x*L+flow.x*L*0.4, ty=n.y*L+flow.y*L*0.4, tz=n.z*L+flow.z*L*0.4, u0=Math.random();
        const base=pos.length/3;
        pos.push(p.x-t.x*w,p.y-t.y*w,p.z-t.z*w, p.x+t.x*w,p.y+t.y*w,p.z+t.z*w, p.x-t.x*w+tx,p.y-t.y*w+ty,p.z-t.z*w+tz, p.x+t.x*w+tx,p.y+t.y*w+ty,p.z+t.z*w+tz);
        for(let k=0;k<4;k++){ nrm.push(n.x,n.y,n.z); col.push(Cc[v*3],Cc[v*3+1],Cc[v*3+2]); for(let j=0;j<4;j++){ si.push(SI[v*4+j]); sw.push(SW[v*4+j]); } fl.push(L); }
        uv.push(u0,0, u0+0.18,0, u0,1, u0+0.18,1); idx.push(base,base+1,base+2, base+1,base+3,base+2); } }
    const fg=new THREE.BufferGeometry(); fg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); fg.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3)); fg.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    fg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); fg.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4)); fg.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4)); fg.setAttribute('finLen',new THREE.Float32BufferAttribute(fl,1)); fg.setIndex(idx);
    this.fins=new THREE.SkinnedMesh(fg,finMaterial(this.id)); this.fins.bind(this.skeleton,this.mesh.bindMatrix); this.fins.castShadow=false; this.fins.frustumCulled=false; this.fins.raycast=()=>{}; this.root.add(this.fins); this.stats.fins=idx.length/6; }
  setFur(on){ for(const sh of this.shells) sh.visible=on; if(this.fins) this.fins.visible=on; }
  // la mano pasó por `point` moviéndose en `dir` (mundo): el pelo se aplasta y se peina ahí un momento
  touchAt(point,dir){ this.touch.pos.copy(point); if(dir&&dir.lengthSq()>1e-6) this.touch.dir.copy(dir).normalize(); this.touch.w=1; }
  setDirty(on){ if(this.dirty===on)return; this.dirty=on; const a=this.mesh.geometry.attributes.color; a.array.set(on?this.dirtyColor:this.cleanColor); a.needsUpdate=true; }
  zoneAt(hit){ if(hit.object.userData.zone) return hit.object.userData.zone; if(hit.object===this.mesh&&hit.face) return ZONES[this.zoneAttr[hit.face.a]]; return 'body'; }
  setPose(p,extra){Object.assign(this.target,basePose(),p,extra||{});}
  worldPos(local,obj){return (obj||this.head).localToWorld(this.tmp.copy(local));}
  mouthPos(){return this.worldPos(V3(0,-0.12,0.5));}
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
    const upright=Math.cos(p.bodyRoll)>0?1:-1;
    for(const n of ['fl','fr','rl','rr']){const L=this.legs[n],R=REST[n],u=p[n+'U'],l=p[n+'L'],sw=Math.sin(ph+offs[n])*amp,bend=Math.max(0,Math.sin(ph+offs[n]+1.1))*amp*1.4;
      const upR=R[0]+u-sw, knR=R[1]+l+bend; L.up.rotation.x=upR; L.up.rotation.z=(n==='fl'?1:n==='fr'?-1:0)*p.spread; L.knee.rotation.x=knR;
      // el pie compensa para quedar plano contra el piso; al balancear la pata en el aire, cuelga un poco
      const flat=-(upR+knR)-p.bodyPitch*upright; L.paw.rotation.x=damp(L.paw.rotation.x,clamp(flat,-1.7,0.9)+Math.max(0,sw)*0.35,18,dt);}
    this.neck.rotation.x=p.neckPitch;
    this.head.rotation.set(p.headPitch+this.look.pitch,p.headYaw+this.look.yaw,p.headRoll);
    // parpadeo con párpados, mirada de los ojos, orejas (con inercia al girar)
    this.blink-=dt; if(this.blink<0){this.blinkT=0.13;this.blink=rand(2,6);} this.blinkT-=dt;
    const open=this.blinkT>0?0.05:clamp(p.eyes,0.05,1); const lidRot=lerp(-0.15,-1.0,open);
    this.lids.forEach(l=>{l.rotation.x=damp(l.rotation.x,lidRot,30,dt);}); this.eyes.forEach(e=>{e.rotation.y=this.look.yaw*0.5;e.rotation.x=this.look.pitch*0.5;});
    const turn=((this.heading-this.prevHeading+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI; this.prevHeading=this.heading; this.earSwing=damp(this.earSwing,-turn*6,6,dt);
    this.twitchT-=dt; if(this.twitchT<0){this.twitchT=rand(1.5,5);this.twitch[Math.random()<.5?0:1]=0.35;}
    this.ears.forEach((e,i)=>{this.twitch[i]=Math.max(0,this.twitch[i]-dt*1.5);const sd=e.userData.side;
      e.rotation.x=-0.1-0.25*p.earAlert+1.3*p.earBack+this.twitch[i]+bounce*3; e.rotation.z=sd*(0.42-0.2*p.earAlert+0.6*p.earBack)+this.twitch[i]*sd*0.5+clamp(this.earSwing,-0.3,0.3);});
    this.jaw.rotation.x=p.mouth*0.55; this.tongue.visible=p.tongue>0.5||(this.pant&&p.mouth<0.5&&p.eyes>0.2);
    if(this.pant&&this.tongue.visible){this.jaw.rotation.x=0.25+Math.sin(this.breath*9)*0.08;}
    // cola: más rápida mientras más feliz
    const wag=o?o.wag:0.5; this.wagT+=dt*(2+wag*13); const wa=0.15+wag*0.45;
    this.tail.forEach((sg,i)=>{sg.rotation.x=i===0?0.6+p.tailLift*1.2:0.16; sg.rotation.z=Math.sin(this.wagT-i*0.7)*wa*(i===0?1:0.55);});
    this.root.rotation.y=this.heading;
    // pelo con inercia: las capas se arrastran hacia atrás según la velocidad
    this.touch.w=Math.max(0,this.touch.w-dt*1.6);
    for(const sh of this.shells){ const ud=sh.material.userData; if(ud.uDrag) ud.uDrag.value=damp(ud.uDrag.value,this.speed,4,dt); if(ud.uTouch){ ud.uTouch.value.set(this.touch.pos.x,this.touch.pos.y,this.touch.pos.z,this.touch.w); ud.uTouchDir.value.copy(this.touch.dir); } }
    { const u=this.fins.material.userData.uDrag; if(u) u.value=damp(u.value,this.speed,4,dt); }
    // sombra de contacto: se achica y aclara cuando salta
    const lift=clamp(p.bodyY,0,1); this.blob.scale.setScalar(1-lift*0.4); this.blob.material.opacity=1-lift*0.8;
  }
}
// los perros se construyen desde la pantalla de carga (main.js) para poder mostrar progreso y capturar errores
let dante=null, kiara=null;
function buildDante(){ dante=new Dog(DANTE_COLORS,{id:'dante'}); scene.add(dante.root); dante.root.position.set(0,0,1.5);
  console.info(`[dante] malla ${dante.stats.verts} vértices, ${dante.stats.tris} triángulos, grilla ${dante.stats.grid.join('x')}, ${dante.genMs} ms`); return dante; }
function buildKiara(){ kiara=new Dog(KIARA_COLORS,{longHair:false,id:'kiara'}); kiara.root.scale.setScalar(0.94); kiara.root.visible=false; scene.add(kiara.root); return kiara; }

export { basePose, POSES, DANTE_COLORS, KIARA_COLORS, Dog, dante, kiara, buildDante, buildKiara };
