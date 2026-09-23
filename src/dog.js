import * as THREE from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { clamp, lerp, damp, rand, V3 } from './utils.js';
import { scene, MOBILE, FUR_LAYERS, furMaterial } from './scene.js';

// ---------- DOG MODEL
// El perro es UNA malla orgánica generada en código: el esqueleto (huesos de three) lleva "primitivas" de
// distancia (elipsoides y cápsulas) que se funden con una unión suave; marching cubes extrae la superficie,
// y cada vértice recibe pesos de skinning, color y largo de pelo según qué primitivas lo formaron.
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

const ZONES=['body','head','belly','tail'];
const SMOOTH_K=0.035;        // radio de fusión entre primitivas
const CELL=MOBILE?0.03:0.021;   // tamaño de celda del campo de distancia
const BOUNDS={min:[-0.62,-0.08,-1.05],max:[0.62,1.85,1.35]};

// ---- funciones de distancia con signo (en el espacio local de cada primitiva)
function sdfEllipsoid(x,y,z,s){ const qx=x/s[0],qy=y/s[1],qz=z/s[2]; const k0=Math.sqrt(qx*qx+qy*qy+qz*qz); if(k0<1e-6) return -Math.min(s[0],s[1],s[2]);
  const k1=Math.sqrt(qx*qx/(s[0]*s[0])+qy*qy/(s[1]*s[1])+qz*qz/(s[2]*s[2])); return k0*(k0-1)/k1; }
function sdfCapsule(x,y,z,r,h,rr){ const qx=Math.hypot(x,z)-r+rr, qy=Math.abs(y)-h+rr; const mx=Math.max(qx,0),my=Math.max(qy,0); return Math.min(Math.max(qx,qy),0)+Math.hypot(mx,my)-rr; }
function sdfBox(x,y,z,e){ const qx=Math.abs(x)-e[0],qy=Math.abs(y)-e[1],qz=Math.abs(z)-e[2]; const mx=Math.max(qx,0),my=Math.max(qy,0),mz=Math.max(qz,0); return Math.hypot(mx,my,mz)+Math.min(Math.max(qx,qy,qz),0); }
function primDist(P,x,y,z){ // x,y,z ya en espacio local de la primitiva
  if(P.type==='sph') return sdfEllipsoid(x,y,z,P.scl);
  if(P.type==='cut') return sdfBox(x,y,z,P.ext);
  if(P.type==='cutsph') return sdfEllipsoid(x,y,z,P.scl);
  return sdfCapsule(x,y,z,P.r,P.h,P.rr);
}

class Dog{
  constructor(colors,opt={}){
    this.longHair=opt.longHair!==false; this.colors=colors;
    const C={B:colors.base,L:colors.light,S:colors.saddle,K:colors.mask,F:colors.fur};
    this.root=new THREE.Group();
    // ---- esqueleto: mismos nombres y pivotes que usaba la versión de primitivas, así animate() no cambia
    const bone=(name,parent,pos)=>{const b=new THREE.Bone();b.name=name;b.position.set(...pos);parent.add(b);this.bones.push(b);return b;};
    this.bones=[]; this.prims=[];
    this.mesh=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.9})); this.root.add(this.mesh);
    this.body=bone('body',this.mesh,[0,0.78,0]);
    this.neck=bone('neck',this.body,[0,0.12,0.42]); this.head=bone('head',this.neck,[0,0.36,0.30]); this.jaw=bone('jaw',this.head,[0,-0.1,0.13]);
    this.ears=[1,-1].map(s=>{const e=bone('ear'+s,this.head,[0.17*s,0.15,-0.05]);e.userData.side=s;return e;});
    const leg=(n,x,z)=>{const up=bone(n+'Up',this.body,[x,0,z]);const knee=bone(n+'Knee',up,[0,-0.4,0]);return {up,knee};};
    this.legs={fl:leg('fl',0.2,0.4),fr:leg('fr',-0.2,0.4),rl:leg('rl',0.2,-0.52),rr:leg('rr',-0.2,-0.52)};
    this.tail=[]; let par=this.body; for(let i=0;i<5;i++){ par=bone('tail'+i,par,i===0?[0,0.08,-0.72]:[0,-0.17,0]); this.tail.push(par); }
    // ---- primitivas de forma: (tipo, hueso, pos, escala, color, largo de pelo, zona, rotación)
    const P=(type,b,pos,scl,col,len,zone='body',rot=null)=>this.prims.push({type,bone:b,pos,scl,rot,color:new THREE.Color(col),len,zone:ZONES.indexOf(zone)});
    const lh=this.longHair;
    P('sph',this.body,[0,0.0,-0.05],[0.27,0.30,0.62],C.B,0.055); P('sph',this.body,[0,-0.05,0.42],[0.29,0.34,0.36],C.B,0.055); P('sph',this.body,[0,-0.07,-0.52],[0.24,0.26,0.36],C.B,0.055);
    P('sph',this.body,[0,0.12,-0.1],[0.28,0.25,0.64],C.S,0.065); P('sph',this.body,[0,0.06,-0.5],[0.23,0.2,0.34],C.S,0.065);
    P('sph',this.body,[0,-0.17,-0.05],[0.23,0.16,0.5],C.L,0.10,'belly'); P('sph',this.body,[0,-0.16,0.4],[0.26,0.22,0.3],C.L,0.10,'belly');
    if(lh){ P('sph',this.body,[0,-0.18,0.5],[0.22,0.2,0.14],C.F,0.13); P('sph',this.body,[0.17,-0.02,0.47],[0.11,0.16,0.1],C.B,0.13); P('sph',this.body,[-0.17,-0.02,0.47],[0.11,0.16,0.1],C.B,0.13); }
    P('cyl',this.neck,[0,0.17,0.13],[0.16,0.52,0.17],C.B,0.055,'body',[0.62,0,0]); if(lh) P('cyl',this.neck,[0,0.2,0.08],[0.13,0.4,0.12],C.S,0.065,'body',[0.62,0,0]);
    P('sph',this.head,[0,0,0],[0.23,0.21,0.25],C.B,0.022,'head'); P('sph',this.head,[0,0.08,-0.03],[0.2,0.15,0.2],C.S,0.02,'head');
    P('sph',this.head,[0,0.0,0.24],[0.15,0.10,0.26],C.K,0.012,'head'); P('sph',this.head,[0,0.0,0.4],[0.1,0.085,0.1],C.K,0.008,'head');
    P('sph',this.head,[0.16,-0.05,0.1],[0.1,0.09,0.11],C.L,0.03,'head'); P('sph',this.head,[-0.16,-0.05,0.1],[0.1,0.09,0.11],C.L,0.03,'head');
    P('sph',this.head,[0.085,0.1,0.18],[0.035,0.025,0.03],C.L,0.012,'head'); P('sph',this.head,[-0.085,0.1,0.18],[0.035,0.025,0.03],C.L,0.012,'head');
    P('cut',this.head,[0,-0.1,0.33],[0.34,0.05,0.36],0,0,'head');          // ranura de la boca
    P('cutsph',this.head,[0.1,0.05,0.215],[0.064,0.056,0.066],0,0,'head'); P('cutsph',this.head,[-0.1,0.05,0.215],[0.064,0.056,0.066],0,0,'head'); // cuencas
    P('sph',this.jaw,[0,-0.045,0.14],[0.12,0.06,0.25],C.K,0.008,'head');
    for(const e of this.ears){ P('sph',e,[0,0.2,0],[0.095,0.23,0.04],C.S,0.025,'head'); P('sph',e,[0,0.19,0.02],[0.07,0.18,0.03],C.L,0.012,'head'); }
    for(const n of ['fl','fr','rl','rr']){ const L=this.legs[n], rear=n[0]==='r';
      if(rear){ P('cyl',L.up,[0,-0.2,0],[0.105,0.4,0.115],C.B,0.03); P('sph',L.up,[0,0,-0.03],[0.115,0.19,0.145],C.S,0.065); if(lh) P('sph',L.up,[0,-0.2,-0.08],[0.1,0.17,0.1],C.B,0.13); }
      else { P('cyl',L.up,[0,-0.2,0],[0.08,0.4,0.08],C.B,0.03); P('sph',L.up,[0,0,0],[0.1,0.12,0.1],C.B,0.055); }
      P('sph',L.knee,[0,0,0],[0.065,0.065,0.065],C.B,0.03); P('cyl',L.knee,[0,-0.18,0],[0.062,0.36,0.062],C.B,0.03); P('sph',L.knee,[0,-0.36,0.03],[0.09,0.065,0.11],C.L,0.008); }
    this.tail.forEach((s,i)=>{ const r=0.05-0.006*i; P('cyl',s,[0,-0.09,0],[r,0.18,r],i<3?C.S:C.B,0.07,'tail'); if(lh) P('sph',s,[0,-0.09,0.02],[r+0.01,0.1,r+0.02],i<3?C.S:C.F,0.08,'tail'); });
    // ---- piezas que no forman parte de la piel: ojos, nariz, lengua, interior de la boca
    const mkMesh=(geo,mat,parent,pos,scl)=>{const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scl);m.castShadow=true;m.userData.zone='head';parent.add(m);return m;};
    const sphG=new THREE.SphereGeometry(1,20,14);
    const mEyeW=new THREE.MeshPhysicalMaterial({color:0xe9e2d6,roughness:0.15,clearcoat:1,clearcoatRoughness:0.05}),mPupil=new THREE.MeshPhysicalMaterial({color:0x2a1608,roughness:0.08,clearcoat:1,clearcoatRoughness:0.03});
    const mN=new THREE.MeshPhysicalMaterial({color:colors.nose,roughness:0.28,clearcoat:0.8,clearcoatRoughness:0.25}),mTongue=new THREE.MeshPhysicalMaterial({color:0xe0708a,roughness:0.35,clearcoat:0.7}),mMouth=new THREE.MeshStandardMaterial({color:0x2a0e0c,roughness:1});
    this.meshes=[this.mesh];
    this.eyes=[0.1,-0.1].map(x=>{const e=new THREE.Group();e.position.set(x,0.05,0.215);this.head.add(e);const w=mkMesh(sphG,mEyeW,e,[0,0,0],[0.052,0.044,0.044]);const p=mkMesh(sphG,mPupil,e,[0,0,0.016],[0.046,0.039,0.034]);w.castShadow=p.castShadow=false;this.meshes.push(w,p);return e;});
    this.meshes.push(mkMesh(sphG,mN,this.head,[0,0.03,0.46],[0.062,0.05,0.062]));
    mkMesh(sphG,mMouth,this.head,[0,-0.09,0.27],[0.11,0.045,0.2]).castShadow=false;
    this.tongue=mkMesh(new THREE.BoxGeometry(1,1,1),mTongue,this.jaw,[0,0.0,0.2],[0.08,0.02,0.17]);
    // ---- construir la piel
    const t0=performance.now(); this.buildSkin(); this.buildFur(); this.genMs=Math.round(performance.now()-t0);
    this.pose=basePose(); this.target=basePose();
    this.speed=0; this.heading=0; this.gait=0; this.look={yaw:0,pitch:0}; this.lookT={yaw:0,pitch:0};
    this.blink=rand(2,5); this.blinkT=0; this.breath=rand(0,6); this.wagT=0; this.twitch=[0,0]; this.twitchT=rand(1,4);
    this.pant=false; this.tmp=V3();
  }
  // Campo de distancia -> marching cubes -> atributos por vértice -> SkinnedMesh
  buildSkin(){
    this.root.updateMatrixWorld(true);       // pose de bind: todas las rotaciones en 0
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
    for(let v=0;v<nv;v++){ const x=pos[v*3],y=pos[v*3+1],z=pos[v*3+2]; bw.fill(0); let cr=0,cg=0,cb=0,cl=0,ws=0,best=-1,bz=0;
      for(const P of this.prims){ if(P.isCut)continue; if(x<P.bb.min.x||x>P.bb.max.x||y<P.bb.min.y||y>P.bb.max.y||z<P.bb.min.z||z>P.bb.max.z)continue; const ie=P.ie;
        const lx=ie[0]*x+ie[4]*y+ie[8]*z+ie[12], ly=ie[1]*x+ie[5]*y+ie[9]*z+ie[13], lz=ie[2]*x+ie[6]*y+ie[10]*z+ie[14];
        const d=Math.abs(primDist(P,lx,ly,lz)); const w=Math.exp(-d/0.02); if(w<1e-4)continue;
        bw[boneIndex.get(P.bone)]+=w; cr+=P.color.r*w; cg+=P.color.g*w; cb+=P.color.b*w; cl+=P.len*w; ws+=w; if(w>best){best=w;bz=P.zone;} }
      if(ws<=0){ ws=1; cr=cg=cb=0.5; }
      col[v*3]=cr/ws; col[v*3+1]=cg/ws; col[v*3+2]=cb/ws; fur[v]=cl/ws*lenMul; zone[v]=bz;
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
    for(let i=1;i<=L;i++){ const sh=new THREE.SkinnedMesh(this.mesh.geometry,furMaterial(0xffffff,1,i,L,{vertex:true})); sh.bind(this.skeleton,this.mesh.bindMatrix); sh.castShadow=false; sh.receiveShadow=false; sh.frustumCulled=false; sh.raycast=()=>{}; this.root.add(sh); this.shells.push(sh); } }
  setFur(on){ for(const sh of this.shells) sh.visible=on; }
  setDirty(on){ if(this.dirty===on)return; this.dirty=on; const a=this.mesh.geometry.attributes.color; a.array.set(on?this.dirtyColor:this.cleanColor); a.needsUpdate=true; }
  zoneAt(hit){ if(hit.object.userData.zone) return hit.object.userData.zone; if(hit.object===this.mesh&&hit.face) return ZONES[this.zoneAttr[hit.face.a]]; return 'body'; }
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
console.info(`[dante] malla ${dante.stats.verts} vértices, ${dante.stats.tris} triángulos, grilla ${dante.stats.grid.join('x')}, ${dante.genMs} ms · kiara ${kiara.genMs} ms`);

export { basePose, POSES, DANTE_COLORS, KIARA_COLORS, Dog, dante, kiara };
