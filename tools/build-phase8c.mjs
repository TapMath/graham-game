// Builds tools/shots-phase8c.json: the people tour (Phase 8C).
//   node tools/build-phase8c.mjs
//   node tools/smoke.mjs --shots tools/shots-phase8c.json --wait 500 --query "seed=1&intro=1"
// Part 1 scrubs the opening at 16 moments. Part 2 is a gallery: every cast member full length and in a conversation (the framing, the
// face, the speaker's gesture), a reverse shot, Jeetu-perspective conversations, Mithi in third person, Setu, the hazards' people.
import fs from 'node:fs';

const steps = [];
const adv = (name, secs, extra = '') => steps.push({ name: 'i8c-' + name, eval: `${extra}window.__grahan.do('cineAdvance',${secs}).then(function(x){return JSON.stringify({t:x.t,active:x.active,marks:x.marks})})`, wait: 1500 });

steps.push({ name: 'i8c-pause', eval: "window.__grahan.set('invulnerable',true); window.__grahan.do('pause',true); JSON.stringify(window.__grahan.state().story6b.cine)", wait: 300 });
for (const [n, s] of [['stamp', 1.6], ['vision', 3.8], ['wake', 3.4], ['mat', 4.6], ['bag', 2.4], ['door', 2.0], ['lane', 3.2], ['look-up', 2.8], ['tremble', 2.4], ['fall1', 2.2], ['fall2', 1.6], ['fall3', 1.6], ['dust', 2.4], ['white', 2.2], ['silence', 3.4], ['title', 5.0]]) adv(n, s);
steps.push({ name: 'i8c-end', eval: "window.__grahan.do('cineSkip'); window.__grahan.do('cineAdvance',1.2).then(function(x){return JSON.stringify({last:x.last, active:x.active})})", wait: 600 });

const HEAD = `window.A=__grahan; window.G=A.game;
window.ok=(c,m)=>{ if(!c) throw new Error('ASSERT FAILED: '+m); return true; };
window.go=()=>{ A.do('pause',false); if(!G.setu.found && !G.setu.dead && G.setu.health<80) G.setu.setHealth(100); if(G.visionSystem && !G.visionSystem.active) G.visionSystem.queue.length=0; if(!G.dialogue.isOpen && !G.visionSystem.active && !G.hazards.detaining) G.modal=false; };
window.stop=()=>A.do('pause',true);
window.maxCalls=0; window.sample=()=>{ const c=A.state().render.calls; if(c>maxCalls) maxCalls=c; return c; };
G.dialogue.cps=1e6; A.set('invulnerable',true); A.set('hazards',false); A.setTime(12); A.set('perceive',0); A.step(0.3);`;
steps.push({ name: 'p8c-setup', eval: `${HEAD}\nok(G.characterStyle && G.characterStyle.proportions.adultHeads===7.5,'game.characterStyle'); ok(G.voices && G.banter,'voices and banter'); ({calls:sample(), style:Object.keys(G.characterStyle)})`, wait: 600 });

const full = (id, dist) => steps.push({ name: `p8c-full-${id}`, eval: `go(); A.set('view','first'); A.set('perceive',0); G.dialogue.cam.end?.(); const r=A.do('cast','${id}',${dist}); A.step(0.9); stop(); const a=G.cast.get('${id}'); ({visible:a.group.visible, calls:sample(), kind:a.kind})`, wait: 700 });
const talk = (id, dist, adv2 = 0, label = '') => steps.push({ name: `p8c-talk-${id}${label}`, eval: `go(); A.set('perceive',0); A.do('cast','${id}',${dist}); A.step(0.4); A.do('talk','${id}'); for(let i=0;i<${adv2};i++) A.do('dialogueAdvance'); A.step(2.6); stop(); const s=A.state().dialogue6a; ok(s, 'conversation open'); ok(G.dialogue.cam.active,'conversation camera'); ({speaker:s.speaker, line:(s.line||'').slice(0,70), shot:G.dialogue.cam.kind, calls:sample()})`, wait: 700 });
const close = () => steps.push({ name: 'p8c-close', eval: "go(); G.dialogue.close(); A.step(1.0); stop(); ok(!G.dialogue.cam.active,'camera handed back'); 1", wait: 300, shot: false });

full('tara', 3.4); talk('tara', 2.8, 0, ''); talk('tara', 2.8, 2, '-reverse'); close();
full('jeetu', 3.2); talk('jeetu', 2.6); close();
full('gautam', 4.2); talk('gautam', 3.6, 3, '-reverse'); close();
full('sameer', 3.0); talk('sameer', 2.6); close();
full('nurses', 4.0); talk('nurses', 2.6); close();
full('rescuers-collapse', 4.0); talk('rescuers-collapse', 2.6); close();
full('rescuers-triage', 4.0); talk('rescuers-triage', 2.6); close();
steps.push({ name: 'p8c-oldman-buried', eval: "go(); A.set('perceive',0); A.do('cast','oldman',2.4); A.step(0.5); stop(); ({calls:sample()})", wait: 600 });
steps.push({ name: 'p8c-oldman-freed', eval: "go(); A.do('dig'); A.step(0.2); A.do('dialogueSkip'); A.step(2.2); stop(); ok(G.cast.get('oldman').model.group.visible,'the freed man stands'); ({line:A.state().dialogue6a.line.slice(0,60)})", wait: 700 });
close();
full('torchBoys', 4.0); talk('torchBoys', 2.8); close();
full('aayat', 3.0); talk('aayat', 2.6); close();
full('kaalu', 4.0); talk('kaalu', 3.2); close();
full('contractor', 3.4); talk('contractor', 3.0); close();
full('doctor', 3.2); talk('doctor', 2.8); close();
full('sleepers', 3.0); full('patients', 4.0);

// Jeetu's side: he joins, we play him, and talk to Tara, Kaalu and the doctor as a nine-year-old
steps.push({ name: 'p8c-jeetu-joins', eval: "go(); A.do('jeetuJoin'); A.step(0.5); A.do('switch','jeetu'); A.step(0.8); stop(); ok(G.party.active==='jeetu','playing Jeetu'); ({active:G.party.active})", wait: 500 });
steps.push({ name: 'p8c-as-jeetu-tara', eval: "go(); A.set('perceive',0); A.do('cast','tara',2.8); A.step(0.4); A.do('talk','tara'); A.step(2.8); stop(); const s=A.state().dialogue6a; ok(G.party.active==='jeetu','still Jeetu while talking (no swap)'); ok(/Jeetu|boy|Beta|your didi/i.test(s.line),'Tara speaks to Jeetu: '+s.line); ({line:s.line.slice(0,90), choices:s.choices})", wait: 700 });
steps.push({ name: 'p8c-as-jeetu-tara-2', eval: "go(); A.do('dialogueAdvance'); A.do('dialogueAdvance'); A.step(2.2); stop(); const d2=A.state().dialogue6a; ({line:d2?d2.line.slice(0,90):'(closed)'})", wait: 500 });
close();
steps.push({ name: 'p8c-as-jeetu-kaalu', eval: "go(); A.set('perceive',0); A.do('cast','kaalu',3.2); A.step(0.4); A.do('talk','kaalu'); A.step(2.8); stop(); ({line:A.state().dialogue6a.line.slice(0,90), choices:A.state().dialogue6a.choices})", wait: 700 });
close();
steps.push({ name: 'p8c-as-jeetu-doctor', eval: "go(); A.set('perceive',0); A.do('cast','doctor',2.8); A.step(0.4); A.do('talk','doctor'); A.step(2.8); stop(); ({line:A.state().dialogue6a.line.slice(0,90)})", wait: 700 });
close();
steps.push({ name: 'p8c-as-jeetu-aayat', eval: "go(); A.set('perceive',0); A.do('cast','aayat',2.6); A.step(0.4); A.do('talk','aayat'); A.step(2.8); stop(); ({line:A.state().dialogue6a.line.slice(0,90)})", wait: 700 });
close();
steps.push({ name: 'p8c-back-to-mithi', eval: "go(); A.do('switch','mithi'); A.step(0.6); stop(); ok(G.party.active==='mithi','Mithi again'); 1", wait: 300, shot: false });

// Mithi herself, in third person: front, side, back, walking with the cane
steps.push({ name: 'p8c-mithi-front', eval: "go(); A.set('view','third'); A.set('perceive',0); A.teleport(-44,0,-30); A.look(0,0); A.set('viewOrbit',180); A.set('viewBack',3.2); A.step(0.9); stop(); ({calls:sample()})", wait: 700 });
steps.push({ name: 'p8c-mithi-side', eval: "go(); A.set('viewOrbit',90); A.step(0.5); stop(); 1", wait: 500 });
steps.push({ name: 'p8c-mithi-back', eval: "go(); A.set('viewOrbit',0); A.step(0.5); stop(); 1", wait: 500 });
steps.push({ name: 'p8c-mithi-walk', eval: "go(); A.set('viewOrbit',60); A.run('KeyW',1.6); stop(); ({speed:A.state().speed})", wait: 700 });
steps.push({ name: 'p8c-setu-with-mithi', eval: "go(); A.set('viewOrbit',150); A.do('setuFind'); A.do('setuTeleportToPlayer',2); A.step(1.2); stop(); ({calls:sample()})", wait: 700 });
steps.push({ name: 'p8c-view-first', eval: "go(); A.set('viewOrbit',0); A.set('view','first'); A.step(0.3); stop(); 1", wait: 200, shot: false });
// the line-up of every preset, and the hazards' people
steps.push({ name: 'p8c-lineup', eval: "go(); A.set('view','third'); A.set('viewOrbit',180); A.set('viewBack',9); A.do('npcLineup',7); A.step(0.6); stop(); ({calls:sample()})", wait: 800 });
steps.push({ name: 'p8c-lineup-off', eval: "go(); A.do('npcLineup'); A.set('view','first'); A.set('viewBack',0); A.set('viewOrbit',0); stop(); 1", wait: 200, shot: false });
steps.push({ name: 'p8c-vendor', eval: "go(); A.set('perceive',0); A.do('tpVendor'); A.step(0.8); stop(); ({calls:sample()})", wait: 700 });
steps.push({ name: 'p8c-budget', eval: "ok(maxCalls<150,'draw calls stay under the budget: '+maxCalls); ({maxCalls})", wait: 100, shot: false });

fs.writeFileSync(new URL('./shots-phase8c.json', import.meta.url), JSON.stringify(steps, null, 1));
console.log('wrote', steps.length, 'steps');
