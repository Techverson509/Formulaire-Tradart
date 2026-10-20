# Trad'Art — Sécurité Firestore v2 (revue 2) — NON PUBLIÉE

## 1. État de vérification (honnête)
- Règles RÉELLEMENT déployées : **non vérifiées** (aucun accès à la console). Le problème initial (auto-approbation) est établi sur les règles *documentées* (GUIDE-ESPACE-MEMBRE.md), pas sur les règles live.
- Tests : écrits (40), **non exécutés** — l'émulateur officiel ne peut pas être téléchargé depuis l'environnement de travail (accès à storage.googleapis.com bloqué). Ils s'exécutent sur GitHub Actions (§6). La syntaxe des règles n'est donc **pas encore validée par le compilateur Firebase**.

## 2. Faute corrigée de la v1
La v1 exigeait `email_verified == true` pour l'admin. Le site n'appelle jamais `sendEmailVerification` ni la connexion Google : un compte email/mot de passe est donc très probablement NON vérifié -> **l'admin aurait perdu l'accès**. v2 supprime tout test sur l'email.

## 3. Admin : UID maintenant, custom claim ensuite
1. Console Firebase > Authentication > Users : copier l'**UID** du compte admin officiel (colonne « User UID »).
2. Dans `firestore.rules`, remplacer `REMPLACER_PAR_UID_MARC` par cet UID (ne pas publier avant).
3. Avant de publier : Rules Playground, simuler une écriture `members/<autre uid>` {status:'PAID'} authentifiée avec cet UID -> doit être autorisée.
4. Phase 2 : `scripts/set-admin-claim.mjs` (GitHub Actions + secret FIREBASE_SERVICE_ACCOUNT) pose `{admin:true}`; reconnexion requise. Les deux chemins coexistent, puis on retire l'UID.
5. Les droits payants/VIP ne vont PAS dans les claims (ils expirent, limite 1000 octets) : ils sont dans `/entitlements/{uid}`.

## 4. Champs réellement utilisés par le site (index.html 18 oct.)
- Inscription gratuite : prenom, nom, email, whatsapp, accountType='free', createdAt.
- Candidature : champs du formulaire + accountType='applicant', status=existant||'PENDING', createdAt, updatedAt.
- Paiement déclaré : service, plan, plan_label_fr/ht, plan_amount, payment_method, txn_id, txn_ref, status, updatedAt.
- Admin : update({status}) uniquement.
Liste blanche v2 = exactement ces champs. Tout autre champ (role, admin, vip, subscription, access, paid, entitlements…) est refusé. Les déclarations de paiement sont verrouillées dès que status != PENDING. `plan_amount` reste une DÉCLARATION non fiable : le prix réel doit venir du serveur.

## 5. Changements frontend requis (non appliqués)
- **F1 (obligatoire)** `saveApplicationToFirestore` : supprimer la ligne `status: data.status,` (le statut est déjà posé par `submitApplication`). Sinon un membre déjà APPROVED/PAID qui repasse par le paiement verrait son écriture refusée.
- **F2 (décision commerciale)** `claimAzSpot` écrit dans `promo_codes` : refusé par v2 (et déjà par les règles documentées). Effet actuel si les règles live refusent : TOUT candidat « débutant » voit « places déjà prises, prix normal $300 ». Proposition : lire le compteur (public), appliquer $150 « sous réserve : 10 premiers paiements validés », et l'admin incrémente `uses` après validation. À valider avant code.
- F3 (aucun) : `isAdminUser` n'est qu'un affichage; la vraie protection est dans les règles.
- `claimTradersonSpot` n'est pas défini dans le code (appel mort, car `isTradersonExpired()` renvoie toujours true) : à nettoyer plus tard.

## 6. Tests
Option A (téléphone) : pousser ce dossier dans un dépôt GitHub > onglet Actions > « Tests règles Firestore » > Run workflow. Option B (ordinateur) : `npm install && npm test`.
Un test rouge = ne pas publier.

## 7. Publication, sauvegarde, retour arrière
1. **Avant** : coller les règles live dans `rules-backup/ACTUEL-AAAA-MM-JJ.rules`. Exécuter `scripts/backup-firestore.mjs` (lecture seule) ou, plan Blaze, un export Firestore. Exporter aussi les comptes Auth. Aucune suppression nulle part.
2. Publier hors heures de pointe. Les règles ne modifient aucune donnée.
3. Vérifier : inscription, candidature, paiement déclaré, connexion, tableau admin, lecture Idées Trading/boutique.
4. **Retour arrière** : recoller `rules-backup/ACTUEL-…rules` dans l'onglet Règles et publier (< 1 min). L'historique des versions de règles de la console peut aussi servir (à vérifier dans ton interface).

## 8. Contenus payants — limites
- Le code n'a AUCUN champ de niveau (tier/vip) : le site traite setups et products comme « membre connecté », conformément au guide et à l'e-mail de bienvenue. Je ne peux pas savoir si certains documents déjà saisis contiennent du contenu réservé aux payants (je n'ai pas lu les données).
- Les règles ne filtrent pas : elles protègent par CHEMIN. v2 : `public_content` (public), `setups`/`products` (connecté), `vip_content` (droit actif dans `/entitlements`). Tout contenu payant existant doit être déplacé dans `vip_content`.
- `status == PAID/ADMITTED` ne donne volontairement AUCUN accès VIP.
- Un lien direct (imageUrl, coverImage, PDF) stocké dans un document reste ouvert à qui a l'URL : Firestore ne protège pas les fichiers. La protection des fichiers viendra avec Storage + URL signées.
