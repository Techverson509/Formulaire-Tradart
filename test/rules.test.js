// Tests des règles Firestore Trad'Art v2 — s'exécutent sur l'émulateur officiel.
// Lancer : npm test   (ou via GitHub Actions : .github/workflows/rules-test.yml)
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch, increment } from 'firebase/firestore';

const ADMIN_UID = 'uid-marc-admin';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
  .replaceAll('REMPLACER_PAR_UID_MARC', ADMIN_UID);

let env;
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-tradart', firestore: { rules } }); });
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const user  = (uid, extra = {}) => env.authenticatedContext(uid, { email: `${uid}@ex.com`, email_verified: false, ...extra }).firestore();
const admin = () => user(ADMIN_UID, { email: 'tradart509@gmail.com' });
const adminClaim = () => user('uid-claim-admin', { admin: true });
const anon  = () => env.unauthenticatedContext().firestore();
const seed  = (fn) => env.withSecurityRulesDisabled(async (c) => fn(c.firestore()));
const NOW = Timestamp.now();
const future = Timestamp.fromMillis(Date.now() + 86400000 * 30);
const past   = Timestamp.fromMillis(Date.now() - 86400000);

// Profil/candidature tels qu'écrits par le site actuel (index.html du 18 oct.)
const signupPayload = (uid) => ({ prenom:'Jean', nom:'Pierre', email:`${uid}@ex.com`, whatsapp:'+509', accountType:'free', createdAt: serverTimestamp() });
const appPayload = (uid) => ({ prenom:'Jean', nom:'Pierre', email:`${uid}@ex.com`, whatsapp:'+509', pays:'Haïti', ville:'Cayes', age:'24',
  service:'debutant', objectif_debutant:'x', tan_disponib:'5h', engagement1:true, engagement2:true, engagement3:false,
  accountType:'applicant', status:'PENDING', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const claimPayload = () => ({ service:'debutant', plan:'oneoff', plan_label_fr:'A-Z', plan_label_ht:'A-Z', plan_amount:150,
  payment_method:'moncash', txn_id:'T1', txn_ref:'R1', status:'PENDING', updatedAt: serverTimestamp() });

// ---------------- Compatibilité : le site légitime doit continuer à fonctionner
test('C1 inscription gratuite (payload réel du site) -> OK', async () => {
  await assertSucceeds(setDoc(doc(user('u1'), 'members/u1'), signupPayload('u1')));
});
test('C2 candidature (set merge, status PENDING) -> OK', async () => {
  const db = user('u1');
  await assertSucceeds(setDoc(doc(db, 'members/u1'), signupPayload('u1')));
  // comme le site : createdAt existant est renvoyé tel quel (existing.createdAt || serverTimestamp())
  const existing = (await getDoc(doc(db, 'members/u1'))).data();
  await assertSucceeds(setDoc(doc(db, 'members/u1'), { ...appPayload('u1'), createdAt: existing.createdAt }, { merge: true }));
});
test('C3 enregistrement du paiement déclaré (set merge) -> OK tant que PENDING', async () => {
  const db = user('u1');
  await assertSucceeds(setDoc(doc(db, 'members/u1'), appPayload('u1')));
  await assertSucceeds(setDoc(doc(db, 'members/u1'), claimPayload(), { merge: true }));
});
test('C4 membre lit son propre profil -> OK', async () => {
  await seed((d) => setDoc(doc(d, 'members/u1'), { prenom:'J', email:'u1@ex.com', status:'PENDING', accountType:'applicant' }));
  await assertSucceeds(getDoc(doc(user('u1'), 'members/u1')));
});
test('C5 membre connecté lit setups et products (comportement actuel conservé) -> OK', async () => {
  await seed(async (d) => { await setDoc(doc(d,'setups/s1'), { title:'x' }); await setDoc(doc(d,'products/p1'), { title:'y' }); });
  await assertSucceeds(getDoc(doc(user('u1'), 'setups/s1')));
  await assertSucceeds(getDoc(doc(user('u1'), 'products/p1')));
});
test('C6 re-soumission par un membre APPROVED en gardant son statut -> OK (champs profil seulement)', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { prenom:'J', email:'u1@ex.com', status:'APPROVED', accountType:'applicant', service:'debutant', createdAt: NOW }));
  await assertSucceeds(updateDoc(doc(user('u1'),'members/u1'), { whatsapp:'+50900', updatedAt: serverTimestamp() }));
});
test('C7 re-soumission qui renvoie status:"PENDING" par un membre APPROVED -> REFUSÉ (doc le changement frontend F1)', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'APPROVED', accountType:'applicant' }));
  await assertFails(setDoc(doc(user('u1'),'members/u1'), { status:'PENDING', updatedAt: serverTimestamp() }, { merge:true }));
});
test('C8 compteur promo lisible sans connexion -> OK', async () => {
  await seed((d) => setDoc(doc(d,'promo_codes/formation_az'), { uses: 3 }));
  await assertSucceeds(getDoc(doc(anon(), 'promo_codes/formation_az')));
});

// ---------------- Scénarios demandés
test('S1a membre passe son statut à PAID (update) -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'PENDING', accountType:'applicant' }));
  await assertFails(updateDoc(doc(user('u1'),'members/u1'), { status:'PAID' }));
});
test('S1b membre passe son statut à APPROVED (set merge) -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'PENDING', accountType:'applicant' }));
  await assertFails(setDoc(doc(user('u1'),'members/u1'), { status:'APPROVED' }, { merge:true }));
});
test('S1c membre crée son profil directement avec status PAID -> REFUSÉ', async () => {
  await assertFails(setDoc(doc(user('u1'),'members/u1'), { ...signupPayload('u1'), status:'PAID' }));
});
test('S1d membre sans statut se pose lui-même ADMITTED -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', accountType:'free' }));
  await assertFails(updateDoc(doc(user('u1'),'members/u1'), { status:'ADMITTED' }));
});
test('S2a membre s\'attribue role:"admin" -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', accountType:'free' }));
  await assertFails(updateDoc(doc(user('u1'),'members/u1'), { role:'admin' }));
});
test('S2b membre ajoute admin:true / isAdmin:true -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', accountType:'free' }));
  await assertFails(updateDoc(doc(user('u1'),'members/u1'), { admin:true }));
  await assertFails(updateDoc(doc(user('u1'),'members/u1'), { isAdmin:true }));
});
test('S2c membre change accountType en "admin" ou "vip" -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', accountType:'free' }));
  await assertFails(updateDoc(doc(user('u1'),'members/u1'), { accountType:'admin' }));
  await assertFails(updateDoc(doc(user('u1'),'members/u1'), { accountType:'vip' }));
});
test('S2d un compte avec l\'email de l\'admin mais mauvais UID n\'est pas admin -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u9'), { email:'u9@ex.com', status:'PENDING' }));
  await assertFails(updateDoc(doc(user('imposteur', { email:'tradart509@gmail.com', email_verified:true }),'members/u9'), { status:'PAID' }));
});
test('S3a membre ajoute subscription/vip/access/plan_expires -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', accountType:'free' }));
  for (const f of [{subscription:'vip'},{vip:true},{access:'vip'},{plan_expires: future},{entitlements:{vip:true}},{paid:true}])
    await assertFails(updateDoc(doc(user('u1'),'members/u1'), f));
});
test('S3b membre s\'écrit un droit dans /entitlements -> REFUSÉ', async () => {
  await assertFails(setDoc(doc(user('u1'),'entitlements/u1'), { tier:'vip', expiresAt: future }));
});
test('S3c membre modifie ses déclarations de paiement APRÈS approbation -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'APPROVED', accountType:'applicant', plan_amount:300 }));
  await assertFails(updateDoc(doc(user('u1'),'members/u1'), { plan_amount:1 }));
});
test('S4a anonyme lit un profil / liste members -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com' }));
  await assertFails(getDoc(doc(anon(),'members/u1')));
  await assertFails(getDocs(collection(anon(),'members')));
});
test('S4b anonyme lit setups / products / vip_content / entitlements -> REFUSÉ', async () => {
  await seed(async (d) => { for (const p of ['setups/s1','products/p1','vip_content/v1','entitlements/u1']) await setDoc(doc(d,p), { x:1 }); });
  for (const p of ['setups/s1','products/p1','vip_content/v1','entitlements/u1']) await assertFails(getDoc(doc(anon(),p)));
});
test('S4c anonyme lit public_content -> OK ; écrit -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'public_content/a'), { title:'pub' }));
  await assertSucceeds(getDoc(doc(anon(),'public_content/a')));
  await assertFails(setDoc(doc(anon(),'public_content/b'), { title:'x' }));
});
test('S4d membre lit le profil d\'un autre membre / liste members -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u2'), { email:'u2@ex.com' }));
  await assertFails(getDoc(doc(user('u1'),'members/u2')));
  await assertFails(getDocs(collection(user('u1'),'members')));
});
test('S5a connecté sans abonnement lit vip_content -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'vip_content/v1'), { title:'vip' }));
  await assertFails(getDoc(doc(user('u1'),'vip_content/v1')));
});
test('S5b status PAID/ADMITTED seul ne donne PAS accès VIP -> REFUSÉ', async () => {
  await seed(async (d) => { await setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'PAID' }); await setDoc(doc(d,'vip_content/v1'), { t:1 }); });
  await assertFails(getDoc(doc(user('u1'),'vip_content/v1')));
});
test('S5c droit VIP actif -> OK ; expiré -> REFUSÉ ; mauvais tier -> REFUSÉ', async () => {
  await seed(async (d) => {
    await setDoc(doc(d,'vip_content/v1'), { t:1 });
    await setDoc(doc(d,'entitlements/ok'),  { tier:'vip', expiresAt: future });
    await setDoc(doc(d,'entitlements/old'), { tier:'vip', expiresAt: past });
    await setDoc(doc(d,'entitlements/acad'),{ tier:'academy', expiresAt: future });
  });
  await assertSucceeds(getDoc(doc(user('ok'),'vip_content/v1')));
  await assertFails(getDoc(doc(user('old'),'vip_content/v1')));
  await assertFails(getDoc(doc(user('acad'),'vip_content/v1')));
});
test('S5d membre lit son propre droit -> OK ; celui d\'un autre -> REFUSÉ', async () => {
  await seed(async (d) => { await setDoc(doc(d,'entitlements/u1'), { tier:'vip', expiresAt: future }); await setDoc(doc(d,'entitlements/u2'), { tier:'vip', expiresAt: future }); });
  await assertSucceeds(getDoc(doc(user('u1'),'entitlements/u1')));
  await assertFails(getDoc(doc(user('u1'),'entitlements/u2')));
});
test('S6a admin (UID autorisé) change le statut d\'un membre -> OK', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'PENDING', accountType:'applicant' }));
  await assertSucceeds(updateDoc(doc(admin(),'members/u1'), { status:'PAID' }));
});
test('S6b admin (custom claim) change le statut -> OK', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'PENDING' }));
  await assertSucceeds(updateDoc(doc(adminClaim(),'members/u1'), { status:'APPROVED' }));
});
test('S6c admin liste les candidats (orderBy createdAt) -> OK', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', createdAt: NOW }));
  await assertSucceeds(getDocs(collection(admin(),'members')));
});
test('S6d admin avec email vérifié = false (cas réel probable) garde l\'accès -> OK', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'PENDING' }));
  await assertSucceeds(updateDoc(doc(user(ADMIN_UID, { email:'tradart509@gmail.com', email_verified:false }),'members/u1'), { status:'REJECTED' }));
});
test('S6e admin ne peut modifier QUE status : changer email/plan -> REFUSÉ ; statut invalide -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'PENDING' }));
  await assertFails(updateDoc(doc(admin(),'members/u1'), { email:'x@ex.com' }));
  await assertFails(updateDoc(doc(admin(),'members/u1'), { plan_amount: 0 }));
  await assertFails(updateDoc(doc(admin(),'members/u1'), { status:'SUPERADMIN' }));
});
test('S6f admin accorde un droit VIP valide -> OK ; champ superflu -> REFUSÉ', async () => {
  await assertSucceeds(setDoc(doc(admin(),'entitlements/u1'), { tier:'vip', expiresAt: future }));
  await assertFails(setDoc(doc(admin(),'entitlements/u2'), { tier:'vip', expiresAt: future, note:'x' }));
});

// ---------------- Autres protections
test('X1 écriture client sur le compteur promo (membre ou admin sans claim) -> REFUSÉ', async () => {
  await assertFails(setDoc(doc(user('u1'),'promo_codes/formation_az'), { uses: 0 }));
  await assertFails(setDoc(doc(admin(),'promo_codes/formation_az'), { uses: 0 }));
});
test('X2 autre document promo non lisible publiquement -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'promo_codes/secret'), { x:1 }));
  await assertFails(getDoc(doc(anon(),'promo_codes/secret')));
});
test('X3 usurpation d\'email dans le profil -> REFUSÉ', async () => {
  await assertFails(setDoc(doc(user('u1'),'members/u1'), { ...signupPayload('u1'), email:'victime@ex.com' }));
});
test('X4 écrire dans le profil d\'un autre -> REFUSÉ ; suppression de son profil -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u2'), { email:'u2@ex.com' }));
  await assertFails(updateDoc(doc(user('u1'),'members/u2'), { whatsapp:'x' }));
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com' }));
  await assertFails(deleteDoc(doc(user('u1'),'members/u1')));
});
test('X5 champ non prévu (ex. "notes") ajouté par le membre -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com' }));
  await assertFails(updateDoc(doc(user('u1'),'members/u1'), { notes:'x' }));
});
test('X6 createdAt falsifié -> REFUSÉ', async () => {
  await assertFails(setDoc(doc(user('u1'),'members/u1'), { ...signupPayload('u1'), createdAt: Timestamp.fromMillis(0) }));
});
test('X7 écriture sur setups/products par un admin client -> REFUSÉ (console seulement)', async () => {
  await assertFails(setDoc(doc(admin(),'setups/s1'), { title:'x' }));
  await assertFails(setDoc(doc(admin(),'products/p1'), { title:'x' }));
});

// ---------------- Contrôles : prouvent que les refus ci-dessus ont la BONNE cause
test('K1 contrôle: membre (doc ancien sans createdAt/updatedAt) modifie son whatsapp -> OK', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'PENDING', accountType:'applicant' }));
  await assertSucceeds(updateDoc(doc(user('u1'),'members/u1'), { whatsapp:'+50911' }));
});
test('K2 contrôle: idem avec updatedAt serveur -> OK', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', status:'PENDING', accountType:'applicant' }));
  await assertSucceeds(updateDoc(doc(user('u1'),'members/u1'), { whatsapp:'+50911', updatedAt: serverTimestamp() }));
});
test('K3 contrôle: doc free sans status -> candidature pose PENDING -> OK', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', accountType:'free' }));
  await assertSucceeds(updateDoc(doc(user('u1'),'members/u1'), { accountType:'applicant', status:'PENDING', updatedAt: serverTimestamp() }));
});
test('K4 contrôle: membre sans status se pose PENDING mais PAS un autre statut', async () => {
  await seed((d) => setDoc(doc(d,'members/u1'), { email:'u1@ex.com', accountType:'free' }));
  await assertFails(updateDoc(doc(user('u1'),'members/u1'), { status:'PAID' }));
});

// ---------------- Réservation de place promo A-Z (validée par l'admin, jamais par le navigateur du client)
const seedCounter = (uses = 3) => seed((d) => setDoc(doc(d,'promo_codes/formation_az'), { uses }));
const reserve = (db, uid, uses) => { const b = writeBatch(db);
  b.set(doc(db, `promo_claims/${uid}`), { promo:'formation_az', amount:150, validatedAt: serverTimestamp() });
  b.update(doc(db, 'promo_codes/formation_az'), { uses, lastClaimUid: uid, updatedAt: serverTimestamp() });
  return b.commit(); };
test('P1 admin valide une place : claim + compteur +1 dans la même écriture -> OK', async () => {
  await seedCounter(3); await assertSucceeds(reserve(admin(), 'u1', 4)); });
test('P2 double réservation pour la même personne -> REFUSÉ', async () => {
  await seedCounter(3); await assertSucceeds(reserve(admin(), 'u1', 4)); await assertFails(reserve(admin(), 'u1', 5)); });
test('P3 incrément de 2 -> REFUSÉ', async () => { await seedCounter(3); await assertFails(reserve(admin(), 'u1', 5)); });
test('P4 dépassement de 10 places -> REFUSÉ ; la 10e -> OK', async () => {
  await seedCounter(9); await assertSucceeds(reserve(admin(), 'u1', 10)); await assertFails(reserve(admin(), 'u2', 11)); });
test('P5 compteur modifié sans créer le claim -> REFUSÉ', async () => {
  await seedCounter(3); await assertFails(updateDoc(doc(admin(),'promo_codes/formation_az'), { uses:4, lastClaimUid:'u1' })); });
test('P6 claim créé sans incrémenter le compteur -> REFUSÉ', async () => {
  await seedCounter(3); await assertFails(setDoc(doc(admin(),'promo_claims/u1'), { promo:'formation_az', amount:150, validatedAt: serverTimestamp() })); });
test('P7 membre (non admin) tente claim + compteur -> REFUSÉ', async () => {
  await seedCounter(3); await assertFails(reserve(user('u1'), 'u1', 4)); });
test('P8 membre remet le compteur à 0 / le décrémente -> REFUSÉ', async () => {
  await seedCounter(3); await assertFails(updateDoc(doc(user('u1'),'promo_codes/formation_az'), { uses:0 }));
  await assertFails(updateDoc(doc(admin(),'promo_codes/formation_az'), { uses:2, lastClaimUid:'u1' })); });
test('P9 membre lit son propre claim -> OK ; celui d\'un autre -> REFUSÉ ; anonyme -> REFUSÉ', async () => {
  await seed(async (d) => { await setDoc(doc(d,'promo_claims/u1'), { promo:'formation_az', amount:150 }); await setDoc(doc(d,'promo_claims/u2'), { promo:'formation_az', amount:150 }); });
  await assertSucceeds(getDoc(doc(user('u1'),'promo_claims/u1'))); await assertFails(getDoc(doc(user('u1'),'promo_claims/u2'))); await assertFails(getDoc(doc(anon(),'promo_claims/u1'))); });
test('P10 modification ou suppression d\'un claim existant, même par admin -> REFUSÉ', async () => {
  await seed((d) => setDoc(doc(d,'promo_claims/u1'), { promo:'formation_az', amount:150 }));
  await assertFails(updateDoc(doc(admin(),'promo_claims/u1'), { amount:1 })); await assertFails(deleteDoc(doc(admin(),'promo_claims/u1'))); });
