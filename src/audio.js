import { rand } from './utils.js';

// ---------- AUDIO (sintetizado con Web Audio)
const Audio=(()=>{
  let ctx=null,master=null,noise=null,muted=false;
  function ensure(){
    if(!ctx){
      const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
      ctx=new AC(); master=ctx.createGain(); master.gain.value=0.45; master.connect(ctx.destination);
      const len=ctx.sampleRate; noise=ctx.createBuffer(1,len,ctx.sampleRate);
      const d=noise.getChannelData(0); for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    }
    if(ctx.state==='suspended') ctx.resume();
  }
  const ok=()=>ctx&&!muted&&ctx.state==='running';
  function env(g,t,a,d,peak){g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+a+d);}
  function tone(type,f0,f1,dur,peak,filt){
    const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;
    o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);
    env(g,t,0.01,dur,peak);let n=o;
    if(filt){const f=ctx.createBiquadFilter();f.type=filt.type;f.frequency.value=filt.f;f.Q.value=filt.q||1;o.connect(f);n=f;}
    n.connect(g).connect(master);o.start(t);o.stop(t+dur+0.05);
  }
  function burst(dur,peak,f,type='bandpass',q=1){
    const t=ctx.currentTime,n=ctx.createBufferSource();n.buffer=noise;const bf=ctx.createBiquadFilter();bf.type=type;bf.frequency.value=f;bf.Q.value=q;
    const g=ctx.createGain();env(g,t,0.005,dur,peak);n.connect(bf).connect(g).connect(master);n.start(t);n.stop(t+dur+0.05);
  }
  return {
    ensure, get muted(){return muted;}, toggle(){muted=!muted;return muted;},
    bark(p=1){ if(!ok())return; const t=ctx.currentTime,pv=p*rand(0.94,1.06);
      // "guau": sube rápido y cae, con dos formantes (garganta + hocico)
      const o=ctx.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(180*pv,t);o.frequency.exponentialRampToValueAtTime(340*pv,t+0.05);o.frequency.exponentialRampToValueAtTime(120*pv,t+0.24);
      const f1=ctx.createBiquadFilter();f1.type='bandpass';f1.frequency.value=520*pv;f1.Q.value=2.2; const f2=ctx.createBiquadFilter();f2.type='bandpass';f2.frequency.value=1250*pv;f2.Q.value=3;
      const g1=ctx.createGain(),g2=ctx.createGain();env(g1,t,0.012,0.22,0.9);env(g2,t,0.012,0.16,0.5);
      o.connect(f1).connect(g1).connect(master);o.connect(f2).connect(g2).connect(master);o.start(t);o.stop(t+0.3);
      burst(0.07,0.3,1600,'bandpass',0.8); },
    howl(){ if(!ok())return; const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';
      o.frequency.setValueAtTime(320,t);o.frequency.exponentialRampToValueAtTime(620,t+0.5);o.frequency.setValueAtTime(620,t+1.2);o.frequency.exponentialRampToValueAtTime(380,t+2.1);
      const l=ctx.createOscillator();l.frequency.value=5.5;const lg=ctx.createGain();lg.gain.value=18;l.connect(lg).connect(o.frequency);l.start(t);l.stop(t+2.2);
      const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=1500;env(g,t,0.25,1.9,0.22);o.connect(f).connect(g).connect(master);o.start(t);o.stop(t+2.3); },
    yip(){ if(!ok())return; tone('square',650,950,0.12,0.25,{type:'lowpass',f:1800}); },
    whine(){ if(!ok())return; const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';
      o.frequency.setValueAtTime(600,t);o.frequency.linearRampToValueAtTime(1150,t+0.35);o.frequency.linearRampToValueAtTime(700,t+0.9);
      const l=ctx.createOscillator();l.frequency.value=9;const lg=ctx.createGain();lg.gain.value=40;l.connect(lg).connect(o.frequency);l.start(t);l.stop(t+1);
      env(g,t,0.08,0.85,0.22);o.connect(g).connect(master);o.start(t);o.stop(t+1); },
    chomp(){ if(!ok())return; burst(0.07,0.5,900,'lowpass'); tone('triangle',180,90,0.06,0.3); },
    lap(){ if(!ok())return; burst(0.05,0.3,2500,'bandpass',2); },
    boing(v=1){ if(!ok())return; tone('sine',320,120,0.09,0.25*v); },
    swish(){ if(!ok())return; burst(0.12,0.12,3000,'highpass'); },
    snore(){ if(!ok())return; const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(70,t);o.frequency.linearRampToValueAtTime(95,t+0.5);o.frequency.linearRampToValueAtTime(65,t+1.1);
      const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=320;const l=ctx.createOscillator();l.type='square';l.frequency.value=24;const lg=ctx.createGain();lg.gain.value=0.5;l.connect(lg).connect(g.gain);l.start(t);l.stop(t+1.2);
      env(g,t,0.2,0.9,0.16);o.connect(f).connect(g).connect(master);o.start(t);o.stop(t+1.25); burst(0.5,0.05,260,'lowpass'); },
    sigh(){ if(!ok())return; burst(0.6,0.07,700,'bandpass',0.6); },
    snap(){ if(!ok())return; burst(0.03,0.4,2400,'bandpass',1.5); tone('square',220,90,0.05,0.2); },
    growl(){ if(!ok())return; tone('sawtooth',110,80,0.6,0.25,{type:'lowpass',f:420}); },
    chime(){ if(!ok())return; [880,1175,1568].forEach((f,i)=>setTimeout(()=>tone('sine',f,f,0.35,0.18),i*90)); },
    pant(){ if(!ok())return; burst(0.08,0.06,1200,'bandpass'); },
  };
})();

export { Audio };
