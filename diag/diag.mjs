// Diagnostic : pour chaque scénario refusé, trouve le terme de la règle qui produit "evaluation error" au lieu de "false".
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

const base = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').replaceAll('REMPLACER_PAR_UID_MARC', 'uid-marc-admin');
const prefix = base.slice(0, base.indexOf('    // ---------- /members'));

const UPD = [
 ['T1 signedIn()', 'signedIn()'],
 ['T2 uid==userId', 'request.auth.uid == userId'],
 ['T3 diff.affectedKeys.hasOnly(allowedKeys())', "incoming().diff(resource.data).affectedKeys().hasOnly(allowedKeys())"],
 ['T4 statusUnchangedOrInitPending()', 'statusUnchangedOrInitPending()'],
 ['T4a get(status)==get(status)', "incoming().get('status', null) == resource.data.get('status', null)"],
 ['T4b initPending branch', "(!('status' in resource.data) && incoming().status == 'PENDING')"],
 ['T5 accountTypeSafe()', 'accountTypeSafe()'],
 ['T6 claimEditable()', 'claimEditable()'],
 ['T7 emailMatches()', 'emailMatches()'],
 ['T8 textOk()', 'textOk()'],
 ['T9 createdAt group', "(incoming().get('createdAt',null) == resource.data.get('createdAt',null) || (!('createdAt' in resource.data) && incoming().createdAt == request.time))"],
 ['T10 updatedAt group', "(incoming().get('updatedAt',null) == resource.data.get('updatedAt',null) || incoming().updatedAt == request.time)"],
];
const CRE = [
 ['C3 keys.hasOnly(allowedKeys())', 'incoming().keys().hasOnly(allowedKeys())'],
 ['C4 accountType in', "incoming().get('accountType','free') in ['free','applicant']"],
 ['C5 status absent|PENDING', "(!('status' in incoming()) || incoming().status == 'PENDING')"],
 ['C6 emailMatches()', 'emailMatches()'],
 ['C7 textOk()', 'textOk()'],
 ['C8 createdAt', "(!('createdAt' in incoming()) || incoming().createdAt == request.time)"],
 ['C9 updatedAt', "(!('updatedAt' in incoming()) || incoming().updatedAt == request.time)"],
];
let m = '';
UPD.forEach(([n, e], i) => { m += `    match /u${i}/{userId} { allow update: if ${e}; }\n`; });
CRE.forEach(([n, e], i) => { m += `    match /c${i}/{userId} { allow create: if signedIn() && request.auth.uid == userId && ${e}; }\n`; });
const rules = prefix + m + '  }\n}\n';
writeFileSync(new URL('../results/diag-rules.txt', import.meta.url), rules);

const env = await initializeTestEnvironment({ projectId: 'demo-diag', firestore: { rules } });
const out = [];
const verdict = async (fn) => { try { await fn(); return 'ALLOW'; } catch (e) { const s = String(e.message || e); return /evaluation error/.test(s) ? 'EVAL-ERROR' : (/false for/.test(s) ? 'false' : 'denied:' + s.slice(0, 80)); } };
const user = () => env.authenticatedContext('u1', { email: 'u1@ex.com', email_verified: false }).firestore();
const scen = {
  'S1a update {status:PAID} (seed PENDING)': { seed: { email:'u1@ex.com', status:'PENDING', accountType:'applicant' }, upd: { status:'PAID' } },
  'S2a update {role:admin}':               { seed: { email:'u1@ex.com', status:'PENDING', accountType:'applicant' }, upd: { role:'admin' } },
  'K1 control update {whatsapp}':          { seed: { email:'u1@ex.com', status:'PENDING', accountType:'applicant' }, upd: { whatsapp:'+509' } },
  'S3c update {plan_amount} (seed APPROVED)': { seed: { email:'u1@ex.com', status:'APPROVED', accountType:'applicant', plan_amount:300 }, upd: { plan_amount:1 } },
};
for (const [name, sc] of Object.entries(scen)) {
  out.push(`\n### ${name}`);
  for (let i = 0; i < UPD.length; i++) {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), `u${i}/u1`), sc.seed));
    out.push(`${UPD[i][0].padEnd(52)} -> ` + await verdict(() => updateDoc(doc(user(), `u${i}/u1`), sc.upd)));
  }
}
const cscen = {
  'S1c create {...signup, status:PAID}': { prenom:'J', nom:'P', email:'u1@ex.com', whatsapp:'1', accountType:'free', status:'PAID', createdAt: serverTimestamp() },
  'X3 create email=victime@ex.com':      { prenom:'J', nom:'P', email:'victime@ex.com', whatsapp:'1', accountType:'free', createdAt: serverTimestamp() },
  'C1 control create signup normal':     { prenom:'J', nom:'P', email:'u1@ex.com', whatsapp:'1', accountType:'free', createdAt: serverTimestamp() },
};
for (const [name, data] of Object.entries(cscen)) {
  out.push(`\n### ${name}`);
  for (let i = 0; i < CRE.length; i++) {
    await env.clearFirestore();
    out.push(`${CRE[i][0].padEnd(52)} -> ` + await verdict(() => setDoc(doc(user(), `c${i}/u1`), data)));
  }
}
await env.cleanup();
writeFileSync(new URL('../results/diag-output.txt', import.meta.url), out.join('\n'));
console.log(out.join('\n'));
