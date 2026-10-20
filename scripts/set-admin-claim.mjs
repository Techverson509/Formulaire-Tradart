// Pose le custom claim {admin:true} sur un compte. Exécuté UNIQUEMENT côté serveur (GitHub Actions / ordinateur).
// Variables : FIREBASE_SERVICE_ACCOUNT (JSON de la clé de service, jamais dans le dépôt) et ADMIN_UID.
import admin from 'firebase-admin';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const uid = process.env.ADMIN_UID;
await admin.auth().setCustomUserClaims(uid, { admin: true });
console.log('Claim admin posé sur', uid, '— se déconnecter/reconnecter pour rafraîchir le jeton.');
