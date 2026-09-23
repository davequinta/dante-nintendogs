import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { rand, $, V3, WALL, KENNEL_POS, BOWL_FOOD, BOWL_WATER } from './utils.js';

// ---------- SCENE
const canvas=$('#c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const MOBILE=matchMedia('(pointer:coarse)').matches;
const TIME={value:0};   // uniform compartido para pelo y grama
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();
const SKY_DAY=new THREE.Color(0x9fd7ff), SKY_NIGHT=new THREE.Color(0x0c1430);
scene.fog=new THREE.Fog(SKY_DAY.clone(),26,70);
const camera=new THREE.PerspectiveCamera(50,1,0.1,120);
camera.position.set(0.5,3.4,7.2);
const controls=new OrbitControls(camera,canvas);
controls.target.set(0,0.6,0.4); controls.enableDamping=true; controls.dampingFactor=0.09; controls.enablePan=false;
controls.minDistance=3.2; controls.maxDistance=12; controls.minPolarAngle=0.3; controls.maxPolarAngle=Math.PI/2-0.1; controls.rotateSpeed=0.55;

const hemi=new THREE.HemisphereLight(0xcfe9ff,0x6f8f3c,0.95); scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff1d6,2.6); sun.position.set(7,11,5); sun.castShadow=true;
sun.shadow.mapSize.set(MOBILE?1024:2048,MOBILE?1024:2048); Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:1,far:35});
sun.shadow.bias=-0.0008; sun.shadow.normalBias=0.03; scene.add(sun); scene.add(sun.target);
const porch=new THREE.PointLight(0xffb45a,0,12,1.6); porch.position.set(-3.5,2.4,-5.5); scene.add(porch);

const M=(c,o={})=>new THREE.MeshStandardMaterial({color:c,roughness:0.88,...o});
const G={sph:new THREE.SphereGeometry(1,28,20),cylT:new THREE.CylinderGeometry(0.85,1,1,20),box:new THREE.BoxGeometry(1,1,1),cyl:new THREE.CylinderGeometry(1,1,1,20),cone:new THREE.ConeGeometry(1,1,20),lsph:new THREE.SphereGeometry(1,12,9)};
// ruido reutilizable para texturas procedurales (relieve de estuco, tierra, grama)
function noiseCanvas(w,h,oct=4){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#808080';g.fillRect(0,0,w,h);
  for(let o=0;o<oct;o++){const n=8<<o,cell=w/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=(Math.random()-0.5)*90/(o+1);g.fillStyle=`rgba(${v>0?255:0},${v>0?255:0},${v>0?255:0},${Math.abs(v)/255})`;g.fillRect(x*cell,y*cell,cell,cell);}}
  return c;}
function bumpTex(w,h,oct,rep){const t=new THREE.CanvasTexture(noiseCanvas(w,h,oct));t.wrapS=t.wrapT=THREE.RepeatWrapping;if(rep)t.repeat.set(rep[0],rep[1]);return t;}
// cielo: domo con degradado + sol, y el mismo domo genera el mapa de entorno (reflejos y luz ambiente realistas)
const skyUniforms={uTop:{value:new THREE.Color(0x3f8fe0)},uHorizon:{value:new THREE.Color(0xcfe6f5)},uGround:{value:new THREE.Color(0x6d8a4a)},uSun:{value:V3(0.5,0.6,-0.6).normalize()},uNight:{value:0}};
const skyMat=new THREE.ShaderMaterial({uniforms:skyUniforms,side:THREE.BackSide,depthWrite:false,fog:false,
  vertexShader:`varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader:`uniform vec3 uTop,uHorizon,uGround,uSun; uniform float uNight; varying vec3 vDir;
    float hash(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453); }
    void main(){ vec3 d=normalize(vDir); float h=d.y;
      vec3 day=h>0.0? mix(uHorizon,uTop,pow(h,0.55)) : mix(uHorizon,uGround,clamp(-h*4.0,0.0,1.0));
      float sd=max(dot(d,uSun),0.0); day+=vec3(1.0,0.85,0.6)*pow(sd,180.0)*2.5+vec3(1.0,0.75,0.45)*pow(sd,6.0)*0.25;
      vec3 night=h>0.0? mix(vec3(0.10,0.12,0.22),vec3(0.01,0.015,0.05),pow(h,0.5)) : vec3(0.05,0.06,0.08);
      float st=step(0.9975,hash(floor(d*220.0)))*smoothstep(0.0,0.2,h); night+=vec3(st)*0.9;
      float md=max(dot(d,-uSun),0.0); night+=vec3(0.7,0.75,0.9)*pow(md,400.0)*1.5;
      gl_FragColor=vec4(mix(day,night,uNight),1.0); }`});
const skyDome=new THREE.Mesh(new THREE.SphereGeometry(100,32,16),skyMat); scene.add(skyDome);
const pmrem=new THREE.PMREMGenerator(renderer);
function rebuildEnv(){ const es=new THREE.Scene(); es.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16),skyMat)); if(scene.environment)scene.environment.dispose(); scene.environment=pmrem.fromScene(es,0.02).texture; }
rebuildEnv();
function mesh(geo,mat,pos,scl,rot,shadow=true){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);if(scl)m.scale.set(...scl);if(rot)m.rotation.set(...rot);m.castShadow=shadow;m.receiveShadow=shadow;return m;}
function canvasTex(w,h,draw,rep){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep[0],rep[1]);}return t;}

// piso: grama con una terraza de baldosas
const grassTex=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#4f7a2e';g.fillRect(0,0,w,h);for(let i=0;i<9000;i++){const k=Math.random();g.fillStyle=k<.3?'#3f6a25':k<.6?'#5b8a34':k<.85?'#6f9c3e':'#7f6a3a';g.fillRect(Math.random()*w,Math.random()*h,rand(2,5),rand(2,5));}
  for(let i=0;i<2500;i++){g.strokeStyle=Math.random()<.5?'#6ea43f':'#88bb4e';g.lineWidth=1.5;const x=Math.random()*w,y=Math.random()*h;g.beginPath();g.moveTo(x,y);g.lineTo(x+rand(-3,3),y-rand(4,10));g.stroke();}},[6,6]);
const grassBump=bumpTex(256,256,5,[6,6]);
const tileDraw=(g,w,h,bump)=>{g.fillStyle=bump?'#8a8a8a':'#c9b48f';g.fillRect(0,0,w,h);
  for(let i=0;i<1800;i++){const v=Math.random();g.fillStyle=bump?`rgba(${v>.5?255:0},${v>.5?255:0},${v>.5?255:0},${Math.abs(v-.5)*.35})`:`rgba(${v>.5?255:90},${v>.5?240:60},${v>.5?200:30},${Math.abs(v-.5)*.22})`;g.fillRect(Math.random()*w,Math.random()*h,rand(3,14),rand(3,14));}
  g.strokeStyle=bump?'#202020':'#a8956f';g.lineWidth=bump?7:5;for(let i=0;i<=2;i++){g.beginPath();g.moveTo(i*128,0);g.lineTo(i*128,h);g.stroke();g.beginPath();g.moveTo(0,i*128);g.lineTo(w,i*128);g.stroke();}
  if(!bump){g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1.5;for(let i=0;i<=2;i++){g.beginPath();g.moveTo(i*128+4,0);g.lineTo(i*128+4,h);g.stroke();g.beginPath();g.moveTo(0,i*128+4);g.lineTo(w,i*128+4);g.stroke();}}};
const tileTex=canvasTex(256,256,(g,w,h)=>tileDraw(g,w,h,false),[8,3]);
const tileBump=(()=>{const c=document.createElement('canvas');c.width=c.height=256;tileDraw(c.getContext('2d'),256,256,true);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(8,3);return t;})();
const tileMat=new THREE.MeshStandardMaterial({map:tileTex,bumpMap:tileBump,bumpScale:0.02,roughness:0.7,metalness:0.02});
const ground=mesh(new THREE.PlaneGeometry(WALL*2,WALL*2),new THREE.MeshStandardMaterial({map:grassTex,bumpMap:grassBump,bumpScale:0.03,roughness:1}),[0,0,0],null,[-Math.PI/2,0,0]); ground.castShadow=false; scene.add(ground);
const terrace=mesh(new THREE.PlaneGeometry(WALL*2,4.2),tileMat,[0,0.012,-WALL+2.1],null,[-Math.PI/2,0,0]); terrace.castShadow=false; scene.add(terrace);
const walkway=mesh(new THREE.PlaneGeometry(2.4,WALL*2-4.2),tileMat,[0,0.011,2.1],null,[-Math.PI/2,0,0]); walkway.castShadow=false; scene.add(walkway);
// grama 3D: miles de hojas instanciadas que se mecen con el viento (vertex shader)
const grassBlades=(()=>{ const N=MOBILE?5000:16000; const geo=new THREE.ConeGeometry(0.016,0.24,3,1); geo.translate(0,0.12,0);
  const mat=new THREE.MeshStandardMaterial({color:0x6da33f,roughness:0.9,side:THREE.DoubleSide});
  mat.onBeforeCompile=sh=>{ sh.uniforms.uTime=TIME; sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float ph=float(gl_InstanceID)*0.371; float k=max(position.y,0.0)*1.2; transformed.x+=sin(uTime*1.6+ph)*0.08*k; transformed.z+=cos(uTime*1.3+ph*1.7)*0.06*k;`); };
  const im=new THREE.InstancedMesh(geo,mat,N); im.receiveShadow=true; im.castShadow=false; const o=new THREE.Object3D(); const col=new THREE.Color(); let n=0;
  const onTiles=(x,z)=>(z<-WALL+4.3)||(Math.abs(x)<1.25)||(Math.hypot(x-KENNEL_POS.x,z-KENNEL_POS.z)<1.5)||(Math.hypot(x+5.7,z-4)<1.0);
  for(let i=0;i<N*3&&n<N;i++){ const x=rand(-WALL+0.35,WALL-0.35), z=rand(-WALL+0.35,WALL-0.35); if(onTiles(x,z))continue; o.position.set(x,0,z); o.rotation.set(rand(-0.25,0.25),rand(0,Math.PI),rand(-0.25,0.25)); const sc=rand(0.6,1.4); o.scale.set(1,sc,1); o.updateMatrix(); im.setMatrixAt(n,o.matrix); col.setHSL(rand(0.21,0.27),rand(0.45,0.65),rand(0.22,0.36)); im.setColorAt(n,col); n++; }
  im.count=n; im.instanceMatrix.needsUpdate=true; if(im.instanceColor)im.instanceColor.needsUpdate=true; scene.add(im); return im; })();

// paredes de colores + base de ladrillo
const stuccoBump=bumpTex(256,256,5,[8,2]);
const brickTex=canvasTex(256,128,(g,w,h)=>{g.fillStyle='#8a4a3a';g.fillRect(0,0,w,h);for(let r=0;r<4;r++){for(let c=0;c<4;c++){const off=(r%2)*32;g.fillStyle=`hsl(${rand(8,18)},${rand(45,60)}%,${rand(34,44)}%)`;g.fillRect(c*64+off+2,r*32+2,60,28);}}},[10,1]);
const wallMat=new THREE.MeshStandardMaterial({color:0xe3a15f,bumpMap:stuccoBump,bumpScale:0.035,roughness:0.95}), wallMat2=new THREE.MeshStandardMaterial({color:0xdad3c2,bumpMap:stuccoBump,bumpScale:0.035,roughness:0.95}), brickMat=new THREE.MeshStandardMaterial({map:brickTex,bumpMap:brickTex,bumpScale:0.04,roughness:0.9});
const walls=new THREE.Group(); scene.add(walls);
[[0,-WALL,0,WALL*2+0.4,wallMat],[-WALL,0,Math.PI/2,WALL*2+0.4,wallMat2],[WALL,0,Math.PI/2,WALL*2+0.4,wallMat2]].forEach(([x,z,ry,len,mat])=>{
  const w=mesh(G.box,mat,[x,1.25,z],[len,2.5,0.4],[0,ry,0]); walls.add(w);
  walls.add(mesh(G.box,brickMat,[x,0.3,z],[len,0.6,0.46],[0,ry,0]));
  walls.add(mesh(G.box,M(0xb98a5a),[x,2.55,z],[len,0.14,0.6],[0,ry,0]));
});
// pared frontal baja con portón de barrotes
[[-4.9,7.4],[4.9,7.4]].forEach(([x,len])=>{ walls.add(mesh(G.box,brickMat,[x,0.55,WALL],[len,1.1,0.4])); walls.add(mesh(G.box,M(0xb98a5a),[x,1.15,WALL],[len,0.1,0.5])); });
const gate=new THREE.Group(); gate.position.set(-1.2,0,WALL); scene.add(gate);
const barMat=M(0x2b3440,{roughness:0.5,metalness:0.5});
for(let i=0;i<=8;i++) gate.add(mesh(G.box,barMat,[i*0.3,0.8,0],[0.05,1.6,0.05]));
gate.add(mesh(G.box,barMat,[1.2,1.55,0],[2.5,0.06,0.06])); gate.add(mesh(G.box,barMat,[1.2,0.1,0],[2.5,0.06,0.06]));
walls.add(mesh(G.box,M(0x9a7a5a),[-1.35,0.9,WALL],[0.25,1.8,0.45])); walls.add(mesh(G.box,M(0x9a7a5a),[1.35,0.9,WALL],[0.25,1.8,0.45]));

// kennel (casita) en una esquina
const kennel=new THREE.Group(); kennel.position.copy(KENNEL_POS); kennel.rotation.y=Math.PI/4; scene.add(kennel);
{ const wood=M(0x8d5a34), roof=M(0xc2453a);
  kennel.add(mesh(G.box,wood,[0,0.05,0],[1.7,0.1,2.1]));
  kennel.add(mesh(G.box,wood,[-0.8,0.65,0],[0.1,1.2,2.1])); kennel.add(mesh(G.box,wood,[0.8,0.65,0],[0.1,1.2,2.1]));
  kennel.add(mesh(G.box,wood,[0,0.65,-1.0],[1.7,1.2,0.1]));
  kennel.add(mesh(G.box,wood,[0,1.55,0.95],[1.7,0.55,0.1])); // dintel
  kennel.add(mesh(G.box,roof,[-0.5,1.5,0],[1.15,0.1,2.4],[0,0,0.55])); kennel.add(mesh(G.box,roof,[0.5,1.5,0],[1.15,0.1,2.4],[0,0,-0.55]));
  kennel.add(mesh(G.box,M(0x4f7bd6),[0,0.13,-0.1],[1.3,0.08,1.5])); // cobija
  const plate=canvasTex(256,96,(g,w,h)=>{g.fillStyle='#f6d98a';g.fillRect(0,0,w,h);g.fillStyle='#4a2f1b';g.font='bold 60px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('DANTE',w/2,h/2+4);});
  kennel.add(mesh(new THREE.PlaneGeometry(0.8,0.3),new THREE.MeshStandardMaterial({map:plate}),[0,1.55,1.01],null,null,false));
}
// puerta de barrotes del kennel (pivote en el lado izquierdo; abierta por defecto)
const kennelDoor=new THREE.Group(); kennelDoor.position.set(-0.75,0,1.05); kennelDoor.rotation.y=-1.9; kennel.add(kennelDoor);
const kennelDoorMeshes=[];
{ const bm=M(0x2b3440,{roughness:0.5,metalness:0.5});
  for(let i=0;i<=5;i++){const b=mesh(G.box,bm,[i*0.3,0.68,0],[0.04,1.2,0.04]);kennelDoor.add(b);kennelDoorMeshes.push(b);}
  [0.12,1.25].forEach(y=>{const b=mesh(G.box,bm,[0.75,y,0],[1.55,0.05,0.05]);kennelDoor.add(b);kennelDoorMeshes.push(b);});
  const hit=mesh(G.box,new THREE.MeshBasicMaterial({visible:false}),[0.75,0.68,0],[1.5,1.2,0.12]);hit.castShadow=false;kennelDoor.add(hit);kennelDoorMeshes.push(hit);
}
// cama de Kiara y puerta de la casa por donde entra
const KIARA_BED=V3(-5.7,0,4.0), HOUSE_DOOR=V3(-2.4,0,WALL-0.3);
{ const bed=new THREE.Group(); bed.position.copy(KIARA_BED); scene.add(bed);
  bed.add(mesh(G.box,M(0xd98aa8),[0,0.08,0],[1.5,0.16,1.2])); bed.add(mesh(G.box,M(0xe8b3c6),[0,0.16,0],[1.2,0.06,0.9]));
  const tag=canvasTex(256,96,(g,w,h)=>{g.fillStyle='#e8b3c6';g.fillRect(0,0,w,h);g.fillStyle='#4a2f1b';g.font='bold 58px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('KIARA',w/2,h/2+4);});
  bed.add(mesh(new THREE.PlaneGeometry(0.7,0.26),new THREE.MeshStandardMaterial({map:tag}),[0,0.1,0.61],null,null,false));
  const door=mesh(G.box,M(0x6b3f22),[HOUSE_DOOR.x,1.1,-WALL+0.22],[1.2,2.2,0.08]); scene.add(door);
  scene.add(mesh(G.box,M(0xf2d6a2),[HOUSE_DOOR.x,1.15,-WALL+0.2],[1.45,2.35,0.05]));
  scene.add(mesh(G.lsph,M(0xd9b24a,{metalness:0.6,roughness:0.4}),[HOUSE_DOOR.x+0.42,1.05,-WALL+0.3],[0.06,0.06,0.06]));
}
HOUSE_DOOR.set(-2.4,0,-WALL+0.9);
const FUR_TEX=(()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,256,256);
  g.lineCap='round'; for(let i=0;i<7000;i++){const v=Math.floor(20+Math.random()*235);g.strokeStyle=`rgb(${v},${v},${v})`;g.lineWidth=rand(0.7,1.6);const x=Math.random()*256,y=Math.random()*256,a=rand(-0.45,0.45),l=rand(6,16);g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.sin(a)*l,y+Math.cos(a)*l);g.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(7,7);t.anisotropy=4;return t;})();
const FUR_LAYERS=MOBILE?5:10;
// hebras sueltas para las "fins" de la silueta: tiras verticales con alpha, sobre fondo transparente
const FIN_TEX=(()=>{const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');g.lineCap='round';
  for(let i=0;i<420;i++){const v=Math.floor(140+Math.random()*115);g.strokeStyle=`rgba(${v},${v},${v},${rand(0.7,1)})`;g.lineWidth=rand(0.6,1.5);const x=rand(0,512),top=rand(0,55),bend=rand(-14,14);g.beginPath();g.moveTo(x,128);g.quadraticCurveTo(x+bend*0.5,64+top*0.5,x+bend,top);g.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;t.anisotropy=4;return t;})();
// piel bajo el pelo: moteado suave para que el color no sea plano donde el pelo es corto
const SKIN_TEX=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#e8e8e8';g.fillRect(0,0,w,h);for(let i=0;i<2600;i++){const v=Math.floor(200+Math.random()*55);g.fillStyle=`rgba(${v},${v},${v},0.5)`;g.beginPath();g.arc(Math.random()*w,Math.random()*h,rand(2,9),0,Math.PI*2);g.fill();}},[4,4]);
const finMatCache={};
function finMaterial(id){ if(finMatCache[id])return finMatCache[id];
  const m=new THREE.MeshStandardMaterial({map:FIN_TEX,alphaTest:0.3,side:THREE.DoubleSide,vertexColors:true,roughness:0.9});
  m.onBeforeCompile=sh=>{ sh.uniforms.uTime=TIME; sh.uniforms.uDrag={value:0}; m.userData.uDrag=sh.uniforms.uDrag;
    sh.vertexShader='uniform float uTime,uDrag; attribute float finLen; varying float vEdge;\n'+sh.vertexShader
      .replace('#include <skinning_vertex>',`#include <skinning_vertex>
        transformed+=(vec3(sin(uTime*2.3+position.x*9.0),0.0,cos(uTime*1.9+position.z*7.0))*0.22+vec3(0.0,-0.15,-0.35*uDrag))*uv.y*finLen;`)
      .replace('#include <project_vertex>',`#include <project_vertex>
        vEdge=1.0-abs(dot(normalize(transformedNormal),normalize(-mvPosition.xyz)));`);
    sh.fragmentShader='varying float vEdge;\n'+sh.fragmentShader.replace('#include <alphatest_fragment>',`diffuseColor.a*=smoothstep(0.5,0.85,vEdge); diffuseColor.rgb*=mix(0.75,1.2,vMapUv.y);
        #include <alphatest_fragment>`); };
  finMatCache[id]=m; return m; }
const furMatCache={};
// material de una capa de pelo: desplaza la malla a lo largo de la normal, cae con "gravedad", se mece, y oscurece la raíz (oclusión)
function furMaterial(color,len,layer,layers,opts={}){ const vertex=!!opts.vertex; const key=color+'_'+len+'_'+layer+'_'+(vertex?'v':'s')+'_'+(opts.id||''); if(furMatCache[key])return furMatCache[key];
  const u=layer/layers; const c=new THREE.Color(color).lerp(new THREE.Color(0xf3c98a),0.07*u);
  const m=new THREE.MeshStandardMaterial({color:c,roughness:0.92,alphaMap:FUR_TEX,alphaTest:0.5,side:THREE.DoubleSide,vertexColors:vertex});
  // el desplazamiento va DESPUÉS del skinning: así la capa sigue al hueso y objectNormal ya está deformada.
  // Cada capa: sale por la normal, cae por gravedad, fluye hacia atrás (dirección de crecimiento), se arrastra con la velocidad y se mece.
  m.onBeforeCompile=sh=>{ sh.uniforms.uLayer={value:u}; sh.uniforms.uLen={value:len}; sh.uniforms.uTime=TIME; sh.uniforms.uDrag={value:0}; m.userData.uDrag=sh.uniforms.uDrag;
    sh.vertexShader='uniform float uLayer,uLen,uTime,uDrag;\n'+(vertex?'attribute float furLen; varying float vLen;\n':'')+sh.vertexShader.replace('#include <skinning_vertex>',`#include <skinning_vertex>
      vec3 nrm=normalize(objectNormal); float d=uLayer*uLen${vertex?'*furLen':''}; ${vertex?'vLen=furLen;':''} vec3 down=normalize((vec4(0.0,-1.0,0.0,0.0)*modelMatrix).xyz);
      vec3 flow=normalize(vec3(0.0,-0.35,-1.0)); float q=uLayer*uLayer;
      transformed+=nrm*d + down*d*q*0.5 + flow*d*q*0.6 + vec3(0.0,0.0,-1.0)*d*q*uDrag*0.18 + vec3(sin(uTime*2.1+position.y*7.0),0.0,cos(uTime*1.7+position.x*6.0))*d*q*0.10;`);
    sh.fragmentShader='uniform float uLayer;\n'+(vertex?'varying float vLen;\n':'')+sh.fragmentShader
      .replace('#include <alphamap_fragment>',`#ifdef USE_ALPHAMAP
        ${vertex?'if(vLen<0.006) discard;':''}
        float hair=texture2D(alphaMap,vAlphaMapUv).g; diffuseColor.a*=step(0.05+pow(uLayer,0.8)*0.92,hair);
      #endif`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        diffuseColor.rgb*=mix(0.5,1.08,pow(uLayer,0.6));`)
      .replace('#include <opaque_fragment>',`#include <opaque_fragment>
        float rim=pow(1.0-max(dot(normalize(vNormal),normalize(vViewPosition)),0.0),3.0); gl_FragColor.rgb+=diffuseColor.rgb*rim*0.3*uLayer;`); };
  furMatCache[key]=m; return m; }
// platos
const bowls=new THREE.Group(); scene.add(bowls);
const kibbleMat=M(0x7a4a25), waterMat=new THREE.MeshStandardMaterial({color:0x62b8ee,roughness:0.2,transparent:true,opacity:0.85});
function bowl(pos,color){const g=new THREE.Group();g.position.copy(pos);g.add(mesh(new THREE.CylinderGeometry(0.36,0.28,0.16,12),M(color),[0,0.08,0]));g.add(mesh(new THREE.CylinderGeometry(0.3,0.3,0.03,12),M(0x3a2a22),[0,0.16,0]));bowls.add(g);return g;}
const foodBowl=bowl(BOWL_FOOD,0xd8433c), waterBowl=bowl(BOWL_WATER,0x3d7bd8);
const kibble=mesh(new THREE.CylinderGeometry(0.28,0.28,0.12,12),kibbleMat,[0,0.17,0]); foodBowl.add(kibble);
for(let i=0;i<10;i++) kibble.add(mesh(G.lsph,M(0x8f5a2e),[rand(-0.2,0.2),0.06,rand(-0.2,0.2)],[0.05,0.035,0.05]));
const waterMesh=mesh(new THREE.CylinderGeometry(0.28,0.28,0.1,12),waterMat,[0,0.17,0]); waterBowl.add(waterMesh);

// macetas, árbol de mango, sol, nubes, estrellas
const leafBump=bumpTex(128,128,4,[3,3]);
const potMat=new THREE.MeshStandardMaterial({color:0xc46a3d,bumpMap:stuccoBump,bumpScale:0.02,roughness:0.9}), leafMat=new THREE.MeshStandardMaterial({color:0x3b7d2a,bumpMap:leafBump,bumpScale:0.06,roughness:0.85}), leafMat2=new THREE.MeshStandardMaterial({color:0x5a9c3a,bumpMap:leafBump,bumpScale:0.06,roughness:0.85});
function foliage(parent,cx,cy,cz,r,n){ for(let i=0;i<n;i++){ const a=rand(0,Math.PI*2),b=rand(-0.5,1),d=rand(0.2,0.8)*r; const s=rand(0.45,0.75)*r; parent.add(mesh(G.sph,Math.random()<.55?leafMat:leafMat2,[cx+Math.cos(a)*d,cy+b*d*0.6,cz+Math.sin(a)*d],[s,s*0.85,s],[rand(0,3),rand(0,3),0])); } }
function pot(x,z,s=1){const g=new THREE.Group();g.position.set(x,0,z);g.add(mesh(new THREE.CylinderGeometry(0.32*s,0.24*s,0.42*s,9),potMat,[0,0.21*s,0]));foliage(g,0,0.66*s,0,0.42*s,7);scene.add(g);return g;}
pot(-6.8,-2.2); pot(-6.8,0.2,1.2); pot(-6.8,2.6,0.9); pot(6.7,3.5,1.1); pot(3.2,-7.0,0.9); pot(-3.5,-7.0);
{ const t=new THREE.Group(); t.position.set(6.0,0,6.0); scene.add(t);
  t.add(mesh(new THREE.CylinderGeometry(0.16,0.24,2.2,7),M(0x7a4b2a),[0,1.1,0]));
  foliage(t,0,2.6,0,1.5,14);
  for(let i=0;i<6;i++) t.add(mesh(G.lsph,M(0xf2a531),[rand(-0.9,0.9),rand(1.6,2.3),rand(-0.9,0.9)],[0.13,0.18,0.13]));
}
const sunBall={material:{color:new THREE.Color()},scale:{setScalar(){}}};
const clouds=[]; for(let i=0;i<5;i++){const c=new THREE.Group();c.position.set(rand(-30,30),rand(12,18),rand(-38,-20));for(let j=0;j<4;j++)c.add(mesh(G.sph,new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:0.35,roughness:1}),[j*1.6-2.4,rand(-.3,.3),0],[rand(1.2,2),rand(.9,1.3),1.2],null,false));c.userData.v=rand(0.15,0.4);clouds.push(c);scene.add(c);}
const stars={material:{opacity:0}}; (()=>{const n=0,p=new Float32Array(n*3);for(let i=0;i<n;i++){const th=Math.random()*Math.PI*2,ph=rand(0.15,1.3),r=90;p[i*3]=r*Math.sin(ph)*Math.cos(th);p[i*3+1]=r*Math.cos(ph);p[i*3+2]=r*Math.sin(ph)*Math.sin(th);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));const m=new THREE.PointsMaterial({color:0xffffff,size:0.5,transparent:true,opacity:0,fog:false});const s=new THREE.Points(g,m);scene.add(s);return s;})();
// árboles detrás de las paredes (fondo)
for(let i=0;i<9;i++){const a=i/9*Math.PI*2,r=rand(11,15),x=Math.cos(a)*r,z=Math.sin(a)*r;if(z>8&&Math.abs(x)<3)continue;const g=new THREE.Group();g.position.set(x,0,z);g.add(mesh(new THREE.CylinderGeometry(0.2,0.3,2.5,6),M(0x6d4630),[0,1.25,0]));foliage(g,0,3.4,0,2.0,10);scene.add(g);}

// visitante (aparece detrás del portón)
const visitor=(()=>{const g=new THREE.Group();g.visible=false;g.position.set(0,0,9.4);
  g.add(mesh(G.cyl,M(0x3b5aa5),[-0.12,0.45,0],[0.11,0.9,0.11]));g.add(mesh(G.cyl,M(0x3b5aa5),[0.12,0.45,0],[0.11,0.9,0.11]));
  const shirt=mesh(G.cyl,M(0xe0503e),[0,1.2,0],[0.28,0.65,0.2]);g.add(shirt);const head=mesh(G.sph,M(0xd9a074),[0,1.75,0],[0.19,0.21,0.19]);g.add(head);
  const hat=mesh(new THREE.CylinderGeometry(0.22,0.22,0.06,8),M(0x6a4a2a),[0,1.94,0]);g.add(hat);
  const arm=new THREE.Group();arm.position.set(0.32,1.45,0);const a1=mesh(G.cyl,M(0xd9a074),[0,-0.28,0],[0.07,0.55,0.07]);arm.add(a1);g.add(arm);g.userData.arm=arm;
  const a2=mesh(G.cyl,M(0xd9a074),[-0.32,1.17,0],[0.07,0.55,0.07]);g.add(a2); g.userData.shirt=shirt; g.userData.hat=hat; g.userData.skin=[head,a1,a2];
  scene.add(g);return g;})();

// moscas
const flies=[];for(let i=0;i<2;i++){const f=mesh(G.lsph,M(0x1a1a1a),[rand(-3,3),1.2,rand(-3,3)],[0.035,0.03,0.045]);f.castShadow=false;f.userData={c:V3(rand(-4,4),1.1,rand(-4,4)),t:rand(0,10),v:V3()};scene.add(f);flies.push(f);}
function relocateFly(f){f.userData.c.set(rand(-5,5),rand(0.7,1.6),rand(-5,5));}

// pelota y vista previa del lanzamiento
const ballTex=canvasTex(256,128,(g,w,h)=>{g.fillStyle='#cfe94a';g.fillRect(0,0,w,h);for(let i=0;i<3000;i++){g.fillStyle=Math.random()<.5?'#bcd83a':'#dff36a';g.fillRect(Math.random()*w,Math.random()*h,2,2);}g.strokeStyle='#f4f0e0';g.lineWidth=9;g.beginPath();g.moveTo(0,20);g.bezierCurveTo(60,20,70,108,128,108);g.bezierCurveTo(186,108,196,20,256,20);g.stroke();});
const ball={mesh:mesh(G.sph,new THREE.MeshStandardMaterial({map:ballTex,roughness:0.95}),[0,-5,0],[0.16,0.16,0.16]),vel:V3(),flying:false,held:false,rest:false,r:0.16,returnPt:V3(0,0,3)};
ball.mesh.visible=false; scene.add(ball.mesh); for(let i=1;i<=3;i++){const f=new THREE.Mesh(G.sph,furMaterial(0xd6ee55,0.08,i,3));f.castShadow=false;ball.mesh.add(f);}
const previewDots=[];{const m=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.65});for(let i=0;i<16;i++){const d=new THREE.Mesh(G.lsph,m);d.scale.setScalar(0.06);d.visible=false;scene.add(d);previewDots.push(d);}}

// partículas (sprites con texturas dibujadas en canvas)
const Particles=(()=>{
  const tex={
    heart:canvasTex(64,64,(g)=>{g.fillStyle='#ff5f8f';g.beginPath();g.moveTo(32,56);g.bezierCurveTo(0,34,4,6,32,20);g.bezierCurveTo(60,6,64,34,32,56);g.fill();}),
    hair:canvasTex(64,64,(g)=>{g.strokeStyle='#c4783a';g.lineWidth=5;g.lineCap='round';g.beginPath();g.moveTo(12,50);g.quadraticCurveTo(30,10,54,18);g.stroke();}),
    z:canvasTex(64,64,(g)=>{g.fillStyle='#6fa7ff';g.font='bold 54px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('z',32,34);}),
    tear:canvasTex(64,64,(g)=>{g.fillStyle='#8fd0ff';g.beginPath();g.moveTo(32,6);g.bezierCurveTo(50,30,52,52,32,58);g.bezierCurveTo(12,52,14,30,32,6);g.fill();}),
    spark:canvasTex(64,64,(g)=>{g.fillStyle='#ffe66b';g.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?10:30;g.lineTo(32+Math.cos(a)*r,32+Math.sin(a)*r);}g.closePath();g.fill();}),
    dust:canvasTex(64,64,(g)=>{const r=g.createRadialGradient(32,32,4,32,32,30);r.addColorStop(0,'rgba(200,180,140,.7)');r.addColorStop(1,'rgba(200,180,140,0)');g.fillStyle=r;g.fillRect(0,0,64,64);}),
    note:canvasTex(64,64,(g)=>{g.fillStyle='#ff9f3f';g.font='bold 50px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('♪',32,34);}),
  };
  const pool=[];for(let i=0;i<70;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex.heart,transparent:true,depthWrite:false}));s.visible=false;s.userData={life:0,vel:V3()};scene.add(s);pool.push(s);}
  function spawn(type,pos,opt={}){const s=pool.find(p=>!p.visible);if(!s)return;s.material.map=tex[type];s.position.copy(pos);s.visible=true;const u=s.userData;u.life=u.max=opt.life||1.2;u.vel.set(rand(-.5,.5),rand(.6,1.4),rand(-.5,.5)).multiplyScalar(opt.speed||1);if(opt.vel)u.vel.copy(opt.vel);u.size=opt.size||0.28;u.grav=opt.grav||0;s.scale.setScalar(u.size);}
  function update(dt){for(const s of pool){if(!s.visible)continue;const u=s.userData;u.life-=dt;if(u.life<=0){s.visible=false;continue;}u.vel.y-=u.grav*dt;s.position.addScaledVector(u.vel,dt);const k=u.life/u.max;s.material.opacity=Math.min(1,k*2);s.scale.setScalar(u.size*(0.6+0.4*k));}}
  return {spawn,update};
})();

export { FIN_TEX, SKIN_TEX, finMaterial, canvas, renderer, MOBILE, TIME, scene, SKY_DAY, SKY_NIGHT, camera, controls, hemi, sun, porch, M, G, noiseCanvas, bumpTex, skyUniforms, skyMat, skyDome, pmrem, rebuildEnv, mesh, canvasTex, grassTex, grassBump, tileDraw, tileTex, tileBump, tileMat, ground, terrace, walkway, grassBlades, stuccoBump, brickTex, wallMat, wallMat2, brickMat, walls, gate, barMat, kennel, kennelDoor, kennelDoorMeshes, KIARA_BED, HOUSE_DOOR, FUR_TEX, FUR_LAYERS, furMatCache, furMaterial, bowls, kibbleMat, waterMat, bowl, foodBowl, waterBowl, kibble, waterMesh, leafBump, potMat, leafMat, leafMat2, foliage, pot, sunBall, clouds, stars, visitor, flies, relocateFly, ballTex, ball, previewDots, Particles };
