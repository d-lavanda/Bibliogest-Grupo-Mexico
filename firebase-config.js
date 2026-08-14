// ══════════════════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN DE FIREBASE
//
//  Estos valores (apiKey, etc.) NO son secretos como una contraseña: es normal
//  y seguro que aparezcan en el código de una app web pública. La seguridad
//  real de tus datos se controla con las "Reglas de Firestore" (ver README.md).
// ══════════════════════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyA4Ypchdu9Heeec7o6WcnS-MYOUlwLc9wA",
  authDomain: "bibliogest-santabarbara.firebaseapp.com",
  projectId: "bibliogest-santabarbara",
  storageBucket: "bibliogest-santabarbara.firebasestorage.app",
  messagingSenderId: "942534206077",
  appId: "1:942534206077:web:36e6ce41f9046986ce0714"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
