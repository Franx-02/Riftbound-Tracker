// Config sin rellenar, para activar el modo demo (src/app/core/demo.ts).
// La usa la configuración "demo" de angular.json, que es la que corren los tests:
// así nunca leen ni escriben en el Firestore real.
export const firebaseConfig = {
  apiKey: 'REEMPLAZAR',
  authDomain: 'REEMPLAZAR.firebaseapp.com',
  projectId: 'REEMPLAZAR',
  storageBucket: 'REEMPLAZAR.firebasestorage.app',
  messagingSenderId: 'REEMPLAZAR',
  appId: 'REEMPLAZAR',
};
