import { clamp } from './utils.js';

// ---------- SAVE (localStorage + tiempo offline)
const Save={
  KEY:'dante-nintendogs-v1',
  load(){ try{ const s=localStorage.getItem(this.KEY); return s?JSON.parse(s):null; }catch(e){ return null; } },
  write(data){ try{ localStorage.setItem(this.KEY,JSON.stringify({...data,savedAt:Date.now()})); }catch(e){} },
  clear(){ try{ localStorage.removeItem(this.KEY); }catch(e){} }
};
const stats={hambre:82,sed:82,energia:85,felicidad:75,limpieza:70};
const DECAY={hambre:1.4,sed:1.8,energia:0.45,felicidad:0.9,limpieza:0.5};   // puntos por minuto
const world={night:false,nightT:0,nightGoal:0,food:0,water:0,time:0,autoClock:true,kennelClosed:false,fur:true,svHour:12};
const TRICKS={sit:'Sit',platz:'Platz',paw:'Pata',roll:'Rodar',jump:'Saltar',speak:'Habla',show:'Pose show'};
const training={}; for(const k in TRICKS) training[k]=0;          // dominio 0..100 por truco
const achv={fetches:0,tricks:0,brushes:0,feeds:0,pets:0,visits:0,nights:0,mangos:0,days:[],streak:0,unlocked:[]};
function addStat(k,v){ stats[k]=clamp(stats[k]+v,0,100); }

export { Save, stats, DECAY, world, TRICKS, training, achv, addStat };
