// src/firebase.js
import { initializeApp } from "firebase/app";
import {
    getAuth,
    setPersistence,
    browserSessionPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp); // 🆕 Firestore para o chat

// Sessão por ABA, não por navegador. Sem isso, logar em uma aba troca
// a conta em todas as outras abas abertas do mesmo site (o mesmo problema
// que o sessionStorage manual já tinha resolvido antes desta migração).
setPersistence(auth, browserSessionPersistence).catch((err) => {
    console.error("Não foi possível configurar a persistência do Firebase:", err);
});