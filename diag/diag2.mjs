// Diagnostic 2 : quelles constructions produisent "evaluation error" alors que la valeur est simplement false ?
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
const base = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').replaceAll('REMPLACER_PAR_UID_MARC', 'x');
const prefix = base.slice(0, base.indexOf('    // ---------- /members'));
const P = [
 ['E01 constante false', 'false'],
 ['E02 1 == 2', '1 == 2'],
 ["E03 'a' == 'b'", "'a' == 'b'"],
 ['E04 auth.uid == "zzz" (faux)', "request.auth.uid == 'zzz'"],
 ["E05 resource.data.status == 'zzz' (champ existe, faux)", "resource.data.status == 'zzz'"],
 ["E06 incoming().get('status',null) == 'zzz' (faux)", "incoming().get('status',null) == 'zzz'"],
 ["E07 !('status' in resource.data) (faux)", "!('status' in resource.data)"],
 ["E08 !('status' in resource.data) && incoming().status == 'PENDING'", "(!('status' in resource.data) && incoming().status == 'PENDING')"],
 ["E09 fonction renvoyant false (signedIn() && false)", "signedIn() && false"],
 ["E10 resource.data.nonexistent == 1 (VRAIE erreur : champ absent)", "resource.data.nonexistent == 1"],
 ["E11 incoming().nonexistent == 1 (VRAIE erreur)", "incoming().nonexistent == 1"],
 ["E12 'x' in ['a','b'] (faux)", "'x' in ['a','b']"],
 ["E13 incoming().status in ['A','B'] (faux)", "incoming().status in ['A','B']"],
 ["E14 request.time < request.time (faux)", "request.time < request.time"],
 ["E15 incoming().keys().hasOnly(['a']) (faux)", "incoming().keys().hasOnly(['a'])"],
 ["E16 true || incoming().nonexistent == 1", "true || incoming().nonexistent == 1"],
 ["E17 false || incoming().status == 'PENDING' (faux)", "false || incoming().status == 'PENDING'"],
];
let m = ''; P.forEach(([n,e],i)=>{ m += `    match /e${i}/{userId} { allow update: if ${e}; }\n`; });
const rules = prefix + m + '  }\n}\n';
const env = await initializeTestEnvironment({ projectId: 'demo-diag2', firestore: { rules } });
const ctx = env.authenticatedContext('u1', { email: 'u1@ex.com' }).firestore();
const out = [];
for (let i=0;i<P.length;i++){
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c)=>setDoc(doc(c.firestore(),`e${i}/u1`),{status:'PENDING',email:'u1@ex.com'}));
  let v; try { await updateDoc(doc(ctx,`e${i}/u1`),{whatsapp:'1'}); v='ALLOW'; } catch(e){ const s=String(e.message||e); v = /evaluation error/.test(s)?'"evaluation error"':(/false for/.test(s)?'"false for" (propre)':s.slice(0,90)); }
  out.push(`${P[i][0].padEnd(70)} -> ${v}`);
}
await env.cleanup(); writeFileSync(new URL('../results/diag2-output.txt', import.meta.url), out.join('\n')); console.log(out.join('\n'));
