// Sauvegarde JSON (lecture seule) de members, setups, products, promo_codes + liste des comptes Auth. Aucune suppression.
import admin from 'firebase-admin';
import { writeFileSync, mkdirSync } from 'node:fs';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore(); const stamp = new Date().toISOString().slice(0,10);
mkdirSync('backup', { recursive: true });
for (const c of ['members','setups','products','promo_codes','entitlements']) {
  const snap = await db.collection(c).get();
  writeFileSync(`backup/${stamp}-${c}.json`, JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() })), null, 2));
  console.log(c, snap.size, 'documents');
}
let users = [], token; do { const r = await admin.auth().listUsers(1000, token); users.push(...r.users.map(u => ({ uid:u.uid, email:u.email, emailVerified:u.emailVerified, created:u.metadata.creationTime, providers:u.providerData.map(p=>p.providerId) }))); token = r.pageToken; } while (token);
writeFileSync(`backup/${stamp}-auth-users.json`, JSON.stringify(users, null, 2)); console.log('auth', users.length, 'comptes');
