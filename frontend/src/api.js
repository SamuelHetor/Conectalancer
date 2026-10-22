// ============================================================
// ConectaLancer — camada de acesso à API REST (MySQL no backend)
// Autenticação: Firebase Auth (o backend confere o token em cada chamada)
// Chat: 100% Firestore (histórico + tempo real), não passa mais pelo backend
// ============================================================
import { auth, db } from "./firebase";
import {
    collection,
    query,
    orderBy,
    limit,
    addDoc,
    serverTimestamp,
    onSnapshot,
} from "firebase/firestore";

// Em desenvolvimento (npm run dev) usa localhost:5000.
// No build de produção usa VITE_API_URL (definida em .env.production).
const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000") + "/api";

async function request(path, options = {}) {
    // Se houver um usuário logado no Firebase, anexa o token dele.
    // getIdToken() renova o token sozinho quando ele está perto de expirar.
    const headers = { "Content-Type": "application/json" };
    if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(BASE + path, {
        headers,
        ...options,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* resposta vazia */ }
    if (!res.ok) throw new Error((data && data.error) || "Erro ao comunicar com o servidor.");
    return data;
}

// Monta um id de conversa estável a partir da oportunidade + freelancer.
// Ex.: opportunity "42" + freelancer "7" -> "42_7"
function chatId(oppId, freelancerId) {
    return `${oppId}_${freelancerId}`;
}

export const api = {
    // auth
    // login, cadastro de senha e recuperação de senha são feitos
    // direto pelo Firebase (veja App.jsx). Aqui só falta ligar o perfil:
    register: (form) => request("/auth/register", { method: "POST", body: JSON.stringify(form) }), // form: { name, cep, city, tipo }
    getMe: () => request("/auth/me"), // devolve o perfil do usuário logado

    // perfis
    getUser: (id) => request(`/users/${id}`),
    updateFreelancerProfile: (id, data) => request(`/freelancers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    updateEmployerProfile: (id, data) => request(`/employers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    getFreelancerAgenda: (id) => request(`/freelancers/${id}/agenda`),
    getFreelancerApplications: (id) => request(`/freelancers/${id}/applications`),

    // oportunidades
    listOpportunities: (params = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "" && v !== "Todas")).toString();
        return request(`/opportunities${qs ? "?" + qs : ""}`);
    },
    getOpportunity: (id) => request(`/opportunities/${id}`),
    createOpportunity: (data) => request("/opportunities", { method: "POST", body: JSON.stringify(data) }),
    deleteOpportunity: (id) => request(`/opportunities/${id}`, { method: "DELETE" }),
    getCandidates: (oppId) => request(`/opportunities/${oppId}/candidates`),
    apply: (oppId, message) => request(`/opportunities/${oppId}/apply`, { method: "POST", body: JSON.stringify({ message }) }),
    withdraw: (oppId) => request(`/opportunities/${oppId}/withdraw`, { method: "POST" }),
    reject: (oppId, freelancerId) => request(`/opportunities/${oppId}/reject`, { method: "POST", body: JSON.stringify({ freelancerId }) }),
    checkConflict: (oppId, freelancerId) => request(`/opportunities/${oppId}/check-conflict/${freelancerId}`),
    hire: (oppId, freelancerId) => request(`/opportunities/${oppId}/hire`, { method: "POST", body: JSON.stringify({ freelancerId }) }),
    cancelHire: (oppId, freelancerId, reason) => request(`/opportunities/${oppId}/cancel-hire`, { method: "POST", body: JSON.stringify({ freelancerId, reason }) }),

    // notificações
    getNotifications: (userId) => request(`/notifications/${userId}`),
    markNotificationsRead: (userId) => request(`/notifications/${userId}/read`, { method: "POST" }),

    // chat — 100% Firestore
    // listenToChat: assina a conversa e chama onMessages(msgs) toda vez que
    // o histórico é carregado OU uma mensagem nova chega. Retorna uma função
    // "unsubscribe" que deve ser chamada quando o componente desmontar.
    listenToChat: (oppId, freelancerId, onMessages) => {
        const ref = collection(db, "chats", chatId(oppId, freelancerId), "messages");
        const q = query(ref, orderBy("timestamp", "asc"));
        return onSnapshot(q, (snap) => {
            const msgs = snap.docs.map((d) => {
                const data = d.data();
                return {
                    from: data.from,
                    text: data.text,
                    time: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(),
                };
            });
            onMessages(msgs);
        });
    },
    // listenToLastMessage: avisa quando chega uma mensagem nova numa conversa
    // (usado para o indicador de "mensagem não lida"). Devolve { from, time } ou null.
    listenToLastMessage: (oppId, freelancerId, onLast) => {
        const ref = collection(db, "chats", chatId(oppId, freelancerId), "messages");
        const q = query(ref, orderBy("timestamp", "desc"), limit(1));
        return onSnapshot(
            q,
            (snap) => {
                const d = snap.docs[0]?.data();
                onLast(d ? { from: d.from, time: d.timestamp?.toDate ? d.timestamp.toDate() : new Date() } : null);
            },
            () => onLast(null)
        );
    },
    // sendChatMessage: grava a mensagem direto no Firestore.
    // from: "freelancer" ou "contratante" (usado só para alinhar a bolha na tela)
    sendChatMessage: (oppId, freelancerId, from, text) => {
        const ref = collection(db, "chats", chatId(oppId, freelancerId), "messages");
        return addDoc(ref, { from, text, timestamp: serverTimestamp() });
    },

    getEmployerConversations: (employerId) => request(`/employers/${employerId}/conversations`),
};