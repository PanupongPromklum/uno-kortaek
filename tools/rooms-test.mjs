import { apply } from '../supabase/functions/uno/rooms.js';
const chars = ['mai','pam','min','aek','fah','phai'];
let room = { code:'TEST', host:'u1', phase:'lobby', rules:{stacking:true,jumpIn:true,sevenZero:true}, players:[{id:'u1',name:'A',char:'mai',bot:false,ready:false,loaded:false,away:false}], state:null, events:[], seq:0, version:0, load_deadline:null };
let game = null, now = 1000;
const run = (uid, m) => { const r = apply(room, game, uid, 'X', m, now); if (r.error) throw new Error(m.t+': '+r.error); game = r.game; return r; };
run('u1',{t:'addBot',chars}); run('u1',{t:'addBot',chars}); run('u1',{t:'start'});
console.log('phase', room.phase, room.players.map(p=>p.char));
run('u1',{t:'loaded'}); console.log('phase', room.phase);
let k=0; while(room.phase==='playing' && k++<3000){ now = Math.max(now+1, room.state.wakeAt+1); run('u1',{t:'tick'}); }
console.log('end', room.phase, room.state.winner, 'ticks', k, room.state.standings);
run('u1',{t:'again'}); console.log('again ->', room.phase);
