import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
    MapPin, Clock, Calendar, Users, DollarSign, MessageCircle, Bell,
    Search, Plus, CheckCircle2, X, Send, User, Briefcase,
    Flag, LogOut, Check, Sliders,
    Lock, Mail, Edit3, Eye, EyeOff, Camera, Shield, Trash2, ChevronDown,
} from "lucide-react";
import { api } from "./api";
import { auth } from "./firebase";
import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
} from "firebase/auth";
// O chat usa Firestore em tempo real (veja ChatPanel e EmployerChatPanel,
// e api.listenToChat / api.sendChatMessage).

// Traduz os códigos de erro do Firebase para mensagens em português
function translateFirebaseError(err) {
    const map = {
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/invalid-email": "E-mail inválido.",
        "auth/user-not-found": "E-mail ou senha incorretos.",
        "auth/wrong-password": "E-mail ou senha incorretos.",
        "auth/email-already-in-use": "Este e-mail já está cadastrado.",
        "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
        "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente de novo.",
        "auth/network-request-failed": "Falha de conexão. Verifique sua internet.",
    };
    return new Error(map[err?.code] || err?.message || "Não foi possível concluir a operação.");
}
// Localização por CEP: formata o campo enquanto digita e busca a cidade
// automaticamente na API pública ViaCEP quando os 8 dígitos são preenchidos.
function maskCep(value) {
    const digits = (value || "").replace(/\D/g, "").slice(0, 8);
    return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}
async function fetchCep(cep) {
    const digits = (cep || "").replace(/\D/g, "");
    if (digits.length !== 8) return null;
    try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await res.json();
        if (data.erro) return null;
        return data.localidade && data.uf ? { city: `${data.localidade}, ${data.uf}` } : null;
    } catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// CONECTALANCER — front-end integrado ao backend (Express + MySQL)
// ---------------------------------------------------------------------------
const COLORS = {
    navy: "#14213D", navyLight: "#28345C", amber: "#FFB627", amberDark: "#E39A0C",
    teal: "#2A9D8F", cream: "#F7F7F5", ink: "#1B1B1E", line: "#E4E2DD",
    green: "#3FB950", yellow: "#F2C94C", orange: "#F2994A", red: "#EB5757",
};
const FONT_DISPLAY = "'Space Grotesk', sans-serif";
const FONT_BODY = "'Inter', sans-serif";
const FONT_MONO = "'IBM Plex Mono', monospace";
const CATEGORIES = ["Eventos", "Construção", "Limpeza", "Tecnologia", "Beleza", "Transporte", "Educação", "Gastronomia", "Outros"];

// Guarda pequenas preferências neste aparelho (áreas de interesse, conversas já vistas)
function readStore(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem armazenamento disponível */ }
}
// Aviso de mensagem nova no chat: compara a última mensagem recebida (Firestore)
// com a hora em que a conversa foi vista pela última vez neste aparelho.
// conversations: [{ key, oppId, freelancerId, label }]   role: "freelancer" | "contratante"
// activeKey: conversa que está aberta na tela agora (ou null)
function useChatUnread({ userId, role, conversations, activeKey, showToast }) {
    const [unread, setUnread] = useState({});
    const activeRef = useRef(activeKey);
    activeRef.current = activeKey;
    const sig = conversations.map((c) => c.key).join("|");
    useEffect(() => {
        const unsubs = conversations.map((c) => {
            const seenKey = `cl_seen_${userId}_${c.key}`;
            let first = true;
            return api.listenToLastMessage(c.oppId, c.freelancerId, (last) => {
                const wasFirst = first;
                first = false;
                if (activeRef.current === c.key) {
                    writeStore(seenKey, Math.max(Date.now(), last ? last.time.getTime() : 0));
                    setUnread((u) => (u[c.key] ? { ...u, [c.key]: false } : u));
                    return;
                }
                const isNew = !!last && last.from !== role && last.time.getTime() > readStore(seenKey, 0);
                setUnread((u) => (!!u[c.key] === isNew ? u : { ...u, [c.key]: isNew }));
                if (isNew && !wasFirst) showToast(`💬 Nova mensagem: ${c.label}`);
            });
        });
        return () => unsubs.forEach((u) => u());
    }, [sig, userId, role]);
    useEffect(() => {
        if (!activeKey) return;
        writeStore(`cl_seen_${userId}_${activeKey}`, Date.now());
        setUnread((u) => (u[activeKey] ? { ...u, [activeKey]: false } : u));
    }, [activeKey, userId]);
    return unread;
}
function fmtDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
}
function todayPlus(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}
function vagaStatus(total, filled) {
    const remaining = total - filled;
    if (remaining <= 0) return { label: "Vaga preenchida", color: COLORS.navy, key: "preenchida" };
    if (remaining === 1) return { label: "Última vaga disponível", color: COLORS.red, key: "ultima" };
    if (remaining <= Math.max(1, Math.ceil(total * 0.34))) return { label: "Últimas vagas disponíveis", color: COLORS.orange, key: "poucas" };
    if (remaining <= Math.ceil(total * 0.6)) return { label: "Poucas vagas restantes", color: COLORS.yellow, key: "atencao" };
    return { label: "Vagas disponíveis", color: COLORS.green, key: "aberta" };
}
// ---------------------------------------------------------------------------
// Componentes utilitários
// ---------------------------------------------------------------------------
function Pill({ children, color, style }) {
    return (
        <span style={{ background: color + "1A", color, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6, letterSpacing: 0.2, ...style }}>
            {children}
        </span>
    );
}
function VagaMeter({ total, filled, compact }) {
    const status = vagaStatus(total, filled);
    const segments = Array.from({ length: total });
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 4 }}>
                {segments.map((_, i) => (
                    <div key={i} style={{ height: compact ? 6 : 8, flex: 1, borderRadius: 4, background: i < filled ? status.color : COLORS.line, transition: "background 0.2s" }} />
                ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: status.color }}>
                    {status.key === "preenchida" ? "✅ " : ""}{status.label}
                </span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: COLORS.navy, opacity: 0.6 }}>{filled}/{total}</span>
            </div>
        </div>
    );
}
function Button({ children, onClick, variant = "primary", style, disabled, icon: Icon, full, ariaLabel }) {
    const base = { fontFamily: FONT_BODY, fontWeight: 600, fontSize: 14, padding: "11px 18px", borderRadius: 999, border: "none", cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: full ? "100%" : "auto", opacity: disabled ? 0.5 : 1, transition: "transform 0.12s ease" };
    const variants = {
        primary: { background: COLORS.amber, color: COLORS.navy },
        dark: { background: COLORS.navy, color: "#fff" },
        outline: { background: "transparent", color: COLORS.navy, border: `1.5px solid ${COLORS.navy}` },
        ghost: { background: "transparent", color: COLORS.navy },
        danger: { background: "#fff", color: COLORS.red, border: `1.5px solid ${COLORS.red}` },
    };
    return (
        <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant], ...style }}
            onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
            {Icon && <Icon size={16} aria-hidden="true" />}
            {children}
        </button>
    );
}
function Card({ children, style }) {
    return <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${COLORS.line}`, boxShadow: "0 2px 10px rgba(20,33,61,0.05)", ...style }}>{children}</div>;
}
function Toast({ toast }) {
    if (!toast) return null;
    return (
        <div className="cl-toast" role="status" aria-live="polite" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: COLORS.navy, color: "#fff", padding: "12px 20px", borderRadius: 999, fontFamily: FONT_BODY, fontSize: 14, fontWeight: 500, zIndex: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", gap: 8, maxWidth: "90%" }}>
            {toast}
        </div>
    );
}
function Modal({ title, onClose, children, width = 460 }) {
    // Esc fecha o modal
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", inset: 0, background: "rgba(20,33,61,0.45)", zIndex: 150, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: COLORS.navy, margin: 0 }}>{title}</h3>
                    <button type="button" aria-label="Fechar" onClick={onClose} style={{ background: COLORS.cream, border: "none", borderRadius: 999, padding: 10, cursor: "pointer", display: "flex" }}>
                        <X size={16} color={COLORS.navy} aria-hidden="true" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${COLORS.line}`, fontFamily: FONT_BODY, fontSize: 14, color: COLORS.ink, outline: "none", boxSizing: "border-box" };
const labelStyle = { fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: COLORS.navy, opacity: 0.75, display: "block", marginBottom: 6 };
function Row({ icon: Icon, text }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: COLORS.ink, marginBottom: 4 }}>
            <Icon size={14} color={COLORS.navy} aria-hidden="true" style={{ opacity: 0.6, flexShrink: 0 }} />
            <span>{text}</span>
        </div>
    );
}
function EmptyState({ text }) {
    return <Card style={{ padding: 30, textAlign: "center", color: COLORS.navy, opacity: 0.55, fontSize: 13.5 }}>{text}</Card>;
}
function Section({ title, children }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.navy, opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>{title}</div>
            {children}
        </div>
    );
}
// ---------------------------------------------------------------------------
// App principal
// ---------------------------------------------------------------------------
export default function App() {
    const [screen, setScreen] = useState("auth"); // auth | freelancer | contratante
    const [currentUser, setCurrentUser] = useState(null);
    const [toast, setToast] = useState(null);
    const [checkingSession, setCheckingSession] = useState(true); // evita "piscar" a tela de login antes de restaurar a sessão
    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };
    const goToUserScreen = (user) => setScreen(user.tipo === "contratante" ? "contratante" : "freelancer");
    // O Firebase avisa sozinho quando o login muda (inclusive ao recarregar
    // a página, graças ao browserSessionPersistence configurado em firebase.js).
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            if (!fbUser) {
                setCurrentUser(null);
                setCheckingSession(false);
                return;
            }
            try {
                const user = await api.getMe();
                setCurrentUser(user);
                goToUserScreen(user);
            } catch {
                // Existe login no Firebase mas nenhum perfil correspondente no MySQL
                // (por exemplo, um cadastro que falhou no meio do caminho) -> desloga.
                await signOut(auth).catch(() => { });
                setCurrentUser(null);
            } finally {
                setCheckingSession(false);
            }
        });
        return unsubscribe;
    }, []);
    const login = async (email, password) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            throw translateFirebaseError(err);
        }
        const user = await api.getMe();
        setCurrentUser(user);
        goToUserScreen(user);
        showToast(`Bem-vindo(a), ${user.name.split(" ")[0]}!`);
    };
    const register = async (form) => {
        let credential;
        try {
            credential = await createUserWithEmailAndPassword(auth, form.email, form.password);
        } catch (err) {
            throw translateFirebaseError(err);
        }
        try {
            const user = await api.register({ name: form.name, cep: form.cep, city: form.city, tipo: form.tipo });
            setCurrentUser(user);
            goToUserScreen(user);
            showToast(`Conta criada com sucesso! Bem-vindo(a), ${user.name.split(" ")[0]}!`);
        } catch (err) {
            // Se o cadastro no MySQL falhar, desfaz a conta criada no Firebase
            // para não sobrar um login "órfão", sem perfil no ConectaLancer.
            await credential.user.delete().catch(() => { });
            throw err;
        }
    };
    const logout = async () => {
        await signOut(auth);
        setCurrentUser(null);
        setScreen("auth");
    };
    const changePassword = async (currentPw, newPw) => {
        try {
            const cred = EmailAuthProvider.credential(auth.currentUser.email, currentPw);
            await reauthenticateWithCredential(auth.currentUser, cred);
            await updatePassword(auth.currentUser, newPw);
        } catch (err) {
            throw translateFirebaseError(err);
        }
        showToast("Senha alterada com sucesso!");
    };
    const refreshCurrentUser = async () => {
        const fresh = await api.getMe();
        setCurrentUser(fresh);
        return fresh;
    };
    // Enquanto verifica se existe sessão salva, mostra um loading em vez de
    // decidir precipitadamente que não há usuário logado.
    if (checkingSession) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.navy, color: "#fff", fontFamily: FONT_BODY }}>
                <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');`}</style>
                Carregando...
            </div>
        );
    }
    if (screen === "auth" || !currentUser) {
        return <AuthScreen onLogin={login} onRegister={register} showToast={showToast} />;
    }
    return (
        <div style={{ minHeight: "100vh", background: COLORS.cream, fontFamily: FONT_BODY }}>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');`}</style>
            <TopBar screen={screen} setScreen={setScreen} currentUser={currentUser} onLogout={logout} />
            {screen === "freelancer" && (
                <FreelancerView
                    user={currentUser}
                    showToast={showToast}
                    onUpdateProfile={async (data) => { await api.updateFreelancerProfile(currentUser.id, data); await refreshCurrentUser(); showToast("✅ Perfil atualizado!"); }}
                    onChangePassword={changePassword}
                    onLogout={logout}
                />
            )}
            {screen === "contratante" && (
                <ContratanteView
                    user={currentUser}
                    showToast={showToast}
                    onUpdateProfile={async (data) => { await api.updateEmployerProfile(currentUser.id, data); await refreshCurrentUser(); showToast("✅ Perfil atualizado!"); }}
                    onChangePassword={changePassword}
                    onLogout={logout}
                />
            )}
            <Toast toast={toast} />
        </div>
    );
}
// ---------------------------------------------------------------------------
// AUTENTICAÇÃO
// ---------------------------------------------------------------------------
function AuthScreen({ onLogin, onRegister, showToast }) {
    const [mode, setMode] = useState("entrar");
    return (
        <div style={{ minHeight: "100vh", background: COLORS.navy, color: "#fff", fontFamily: FONT_BODY }}>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');`}</style>
            <div style={{ maxWidth: 440, margin: "0 auto", padding: "56px 24px 60px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36, justifyContent: "center" }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: COLORS.amber, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <MapPin size={18} color={COLORS.navy} strokeWidth={2.5} aria-hidden="true" />
                    </div>
                    <span style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700 }}>Conecta<span style={{ color: COLORS.amber }}>Lancer</span></span>
                </div>
                <p style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.6, textAlign: "center", marginBottom: 28 }}>
                    Conectando quem precisa de um profissional com quem procura uma oportunidade.
                </p>
                <div role="tablist" style={{ display: "flex", background: "rgba(255,255,255,0.08)", borderRadius: 999, padding: 4, marginBottom: 24 }}>
                    {[["entrar", "Entrar"], ["cadastro", "Criar conta"]].map(([k, l]) => (
                        <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} style={{ flex: 1, padding: "10px 0", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5, background: mode === k ? COLORS.amber : "transparent", color: mode === k ? COLORS.navy : "#fff" }}>{l}</button>
                    ))}
                </div>
                {mode === "entrar" ? <LoginForm onLogin={onLogin} showToast={showToast} /> : <RegisterForm onRegister={onRegister} />}
            </div>
        </div>
    );
}
const authInputStyle = { width: "100%", padding: "12px 14px 12px 40px", borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)", fontFamily: FONT_BODY, fontSize: 14, color: "#fff", outline: "none", boxSizing: "border-box" };
const authFieldWrap = { position: "relative", marginBottom: 12 };
const authIconStyle = { position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", opacity: 0.7 };
function LoginForm({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState("");
    const [forgotOpen, setForgotOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const submit = async () => {
        setError(""); setLoading(true);
        try { await onLogin(email.trim(), password); }
        catch (err) { setError(err.message || "E-mail ou senha incorretos."); }
        finally { setLoading(false); }
    };
    return (
        <div>
            <div style={authFieldWrap}>
                <Mail size={16} color="#fff" aria-hidden="true" style={authIconStyle} />
                <input style={authInputStyle} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" aria-label="E-mail" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
            </div>
            <div style={authFieldWrap}>
                <Lock size={16} color="#fff" aria-hidden="true" style={authIconStyle} />
                <input style={{ ...authInputStyle, paddingRight: 48 }} type={showPw ? "text" : "password"} autoComplete="current-password" aria-label="Senha" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
                <button type="button" aria-label={showPw ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPw((v) => !v)} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", opacity: 0.8, padding: 10, display: "flex" }}>
                    {showPw ? <EyeOff size={16} color="#fff" aria-hidden="true" /> : <Eye size={16} color="#fff" aria-hidden="true" />}
                </button>
            </div>
            {error && <div role="alert" style={{ fontSize: 12.5, color: "#FF8A8A", background: "rgba(235,87,87,0.15)", padding: "8px 12px", borderRadius: 8, marginBottom: 12 }}>{error}</div>}
            <Button variant="primary" full onClick={submit} style={{ marginTop: 4 }} disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
            <button type="button" onClick={() => setForgotOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#fff", opacity: 0.85, fontSize: 13, textDecoration: "underline", width: "100%", textAlign: "center", marginTop: 14, padding: 10, fontFamily: FONT_BODY }}>
                Esqueci minha senha
            </button>
            {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}
        </div>
    );
}
function RegisterForm({ onRegister }) {
    const [form, setForm] = useState({ name: "", email: "", password: "", cep: "", city: "", tipo: "freelancer" });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [cepLoading, setCepLoading] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const handleCepChange = async (raw) => {
        const masked = maskCep(raw);
        set("cep", masked);
        if (masked.replace(/\D/g, "").length === 8) {
            setCepLoading(true);
            const result = await fetchCep(masked);
            if (result) set("city", result.city);
            setCepLoading(false);
        }
    };
    const submit = async () => {
        if (!form.name.trim() || !form.email.trim() || !form.password || !form.cep.trim() || !form.city.trim()) {
            setError("Preencha todos os campos para continuar."); return;
        }
        if (form.password.length < 6) {
            setError("A senha precisa ter pelo menos 6 caracteres."); return;
        }
        setError(""); setLoading(true);
        try { await onRegister({ ...form, email: form.email.trim() }); }
        catch (err) { setError(err.message || "Não foi possível criar a conta."); }
        finally { setLoading(false); }
    };
    return (
        <div>
            <div style={authFieldWrap}><User size={16} color="#fff" aria-hidden="true" style={authIconStyle} /><input style={authInputStyle} autoComplete="name" aria-label="Nome completo" placeholder="Nome completo" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div style={authFieldWrap}><Mail size={16} color="#fff" aria-hidden="true" style={authIconStyle} /><input style={authInputStyle} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" aria-label="E-mail" placeholder="E-mail" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div style={authFieldWrap}><Lock size={16} color="#fff" aria-hidden="true" style={authIconStyle} /><input style={authInputStyle} type="password" autoComplete="new-password" aria-label="Senha (mínimo 6 caracteres)" placeholder="Senha (mínimo 6 caracteres)" value={form.password} onChange={(e) => set("password", e.target.value)} /></div>
            <div style={authFieldWrap}><MapPin size={16} color="#fff" aria-hidden="true" style={authIconStyle} /><input style={authInputStyle} inputMode="numeric" autoComplete="postal-code" aria-label="CEP" placeholder="CEP" value={form.cep} onChange={(e) => handleCepChange(e.target.value)} maxLength={9} /></div>
            <div style={authFieldWrap}><MapPin size={16} color="#fff" aria-hidden="true" style={authIconStyle} /><input style={authInputStyle} aria-label="Cidade" placeholder={cepLoading ? "Buscando cidade..." : "Cidade"} value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, marginBottom: 8 }}>Tipo de conta</div>
                <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" aria-pressed={form.tipo === "freelancer"} onClick={() => set("tipo", "freelancer")} style={authTypeCard(form.tipo === "freelancer")}>
                        <Briefcase size={20} aria-hidden="true" />
                        <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>Caçar emprego</div><div style={{ fontSize: 11, opacity: 0.85 }}>Quero trabalhar</div></div>
                    </button>
                    <button type="button" aria-pressed={form.tipo === "contratante"} onClick={() => set("tipo", "contratante")} style={authTypeCard(form.tipo === "contratante")}>
                        <Users size={20} aria-hidden="true" />
                        <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>Procurar empregado</div><div style={{ fontSize: 11, opacity: 0.85 }}>Quero contratar</div></div>
                    </button>
                </div>
            </div>
            {error && <div role="alert" style={{ fontSize: 12.5, color: "#FF8A8A", background: "rgba(235,87,87,0.15)", padding: "8px 12px", borderRadius: 8, marginBottom: 12 }}>{error}</div>}
            <Button variant="primary" full onClick={submit} disabled={loading}>{loading ? "Criando conta..." : "Criar conta e continuar"}</Button>
        </div>
    );
}
function authTypeCard(active) {
    return { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center", padding: "16px 10px", borderRadius: 14, cursor: "pointer", fontFamily: FONT_BODY, color: "#fff", border: `1.5px solid ${active ? COLORS.amber : "rgba(255,255,255,0.25)"}`, background: active ? "rgba(255,182,39,0.14)" : "rgba(255,255,255,0.05)" };
}
function ForgotPasswordModal({ onClose }) {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState("");
    const submit = async () => {
        if (!email.trim()) return;
        setLoading(true); setError("");
        try {
            await sendPasswordResetEmail(auth, email.trim());
            setSent(true); // por segurança, o Firebase não informa se o e-mail existe ou não
        } catch (err) {
            setError(translateFirebaseError(err).message);
        } finally {
            setLoading(false);
        }
    };
    return (
        <Modal title="Recuperar senha" onClose={onClose} width={420}>
            {!sent && (
                <>
                    <p style={{ fontSize: 13, color: COLORS.navy, opacity: 0.75, lineHeight: 1.6, marginBottom: 16 }}>
                        Digite o e-mail da sua conta. Vamos enviar um link para você redefinir a senha.
                    </p>
                    <label style={labelStyle} htmlFor="forgot-email">E-mail</label>
                    <input id="forgot-email" style={inputStyle} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} placeholder="seuemail@exemplo.com" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
                    {error && <div role="alert" style={{ fontSize: 12.5, color: COLORS.red, background: "#EB57571A", padding: "8px 12px", borderRadius: 8, marginTop: 10 }}>{error}</div>}
                    <Button variant="primary" full style={{ marginTop: 16 }} onClick={submit} disabled={loading}>{loading ? "Enviando..." : "Enviar"}</Button>
                </>
            )}
            {sent && (
                <div>
                    <div style={{ background: COLORS.cream, borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 13.5, color: COLORS.ink, lineHeight: 1.6 }}>
                        <Mail size={16} aria-hidden="true" style={{ marginBottom: 6 }} /><br />
                        Se houver uma conta com o e-mail <b>{email}</b>, você vai receber um link para redefinir a senha em instantes.
                    </div>
                    <Button variant="primary" full onClick={onClose}>Entendi</Button>
                </div>
            )}
        </Modal>
    );
}
// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------
function TopBar({ screen, setScreen, currentUser, onLogout }) {
    return (
        <div style={{ background: "#fff", borderBottom: `1px solid ${COLORS.line}`, position: "sticky", top: 0, zIndex: 50 }}>
            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: COLORS.amber, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <MapPin size={15} color={COLORS.navy} strokeWidth={2.5} aria-hidden="true" />
                    </div>
                    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: COLORS.navy }}>Conecta<span style={{ color: COLORS.amberDark }}>Lancer</span></span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {currentUser?.isAdmin && (
                        <button type="button" onClick={() => setScreen(screen === "freelancer" ? "contratante" : "freelancer")}
                            style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: COLORS.navy, background: COLORS.cream, border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                            <Shield size={13} aria-hidden="true" /> Ver como {screen === "freelancer" ? "contratante" : "freelancer"}
                        </button>
                    )}
                    <div className="cl-username" style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.navy, opacity: 0.75 }}>{currentUser?.name}</div>
                    <button type="button" onClick={onLogout} title="Sair" aria-label="Sair" style={{ background: "none", border: "none", cursor: "pointer", padding: 10, display: "flex" }}>
                        <LogOut size={18} color={COLORS.navy} aria-hidden="true" style={{ opacity: 0.7 }} />
                    </button>
                </div>
            </div>
        </div>
    );
}
function SideNav({ tabs, tab, setTab, badge = {} }) {
    return (
        <nav className="cl-sidenav" aria-label="Menu principal" style={{ width: 190, flexShrink: 0 }}>
            <div className="cl-sidenav-inner" style={{ position: "sticky", top: 70, display: "flex", flexDirection: "column", gap: 4 }}>
                {tabs.map(([key, label, Icon]) => (
                    <button key={key} type="button" className="cl-navbtn" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, background: tab === key ? COLORS.navy : "transparent", color: tab === key ? "#fff" : COLORS.navy }}>
                        <Icon size={16} aria-hidden="true" style={{ opacity: tab === key ? 1 : 0.7 }} />
                        {label}
                        {badge[key] > 0 && <span style={{ marginLeft: "auto", background: COLORS.red, color: "#fff", borderRadius: 999, fontSize: 10, padding: "1px 6px" }}>{badge[key]}</span>}
                    </button>
                ))}
            </div>
        </nav>
    );
}
// ---------------------------------------------------------------------------
// FREELANCER VIEW
// ---------------------------------------------------------------------------
function FreelancerView({ user, showToast, onUpdateProfile, onChangePassword, onLogout }) {
    const [tab, setTab] = useState("buscar");
    const [opportunities, setOpportunities] = useState([]);
    const [applications, setApplications] = useState({}); // oppId -> status
    const [agenda, setAgenda] = useState([]);
    const [history, setHistory] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [applyModal, setApplyModal] = useState(null);
    const [chatOpp, setChatOpp] = useState(null);
    const [filters, setFilters] = useState({ date: "" });
    const interestsKey = `cl_interests_${user.id}`;
    const [interests, setInterests] = useState(() => readStore(interestsKey, []));
    useEffect(() => { writeStore(interestsKey, interests); }, [interests, interestsKey]);
    const modalityKey = `cl_modality_${user.id}`;
    const [modality, setModality] = useState(() => readStore(modalityKey, "todas")); // todas | presencial | remoto
    useEffect(() => { writeStore(modalityKey, modality); }, [modality, modalityKey]);
    const [cancelTarget, setCancelTarget] = useState(null);
    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [opps, apps, ag, notifs] = await Promise.all([
                api.listOpportunities(),
                api.getFreelancerApplications(user.id),
                api.getFreelancerAgenda(user.id),
                api.getNotifications(user.id),
            ]);
            setOpportunities(opps);
            const appMap = {};
            apps.forEach((a) => { appMap[a.opportunityId] = a.status; });
            setApplications(appMap);
            setAgenda(ag.agenda);
            setHistory(ag.history);
            setNotifications(notifs);
        } catch (err) {
            showToast("Erro ao carregar dados: " + err.message);
        } finally {
            setLoading(false);
        }
    }, [user.id]);
    useEffect(() => { loadAll(); }, [loadAll]);
    const tabs = [
        ["buscar", "Buscar", Search],
        ["candidaturas", "Candidaturas", CheckCircle2],
        ["contratados", "Trabalhos", Briefcase],
        ["agenda", "Agenda", Calendar],
        ["historico", "Histórico", Clock],
        ["chat", "Chat", MessageCircle],
        ["notificacoes", "Notificações", Bell],
        ["perfil", "Perfil", User],
    ];
    const filtered = useMemo(() => opportunities.filter((o) => {
        if (interests.length > 0 && !interests.includes(o.category)) return false;
        if (modality !== "todas" && (o.modality || "presencial") !== modality) return false;
        if (filters.date && o.date !== filters.date) return false;
        return true;
    }), [opportunities, interests, modality, filters]);
    const myHires = {};
    Object.entries(applications).forEach(([oppId, status]) => { if (status === "contratado") myHires[oppId] = true; });
    const hiredOpps = opportunities.filter((o) => myHires[o.id]);
    const appliedOpps = opportunities.filter((o) => applications[o.id] && applications[o.id] !== "cancelado");
    const chatOpps = [...appliedOpps, ...hiredOpps].filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
    const chatActive = chatOpp || appliedOpps[0] || hiredOpps[0];
    const chatUnread = useChatUnread({
        userId: user.id,
        role: "freelancer",
        showToast,
        conversations: chatOpps.map((o) => ({ key: `${o.id}_${user.id}`, oppId: o.id, freelancerId: user.id, label: o.employer?.name || o.title })),
        activeKey: tab === "chat" && chatActive ? `${chatActive.id}_${user.id}` : null,
    });
    // Atualiza as notificações a cada 20s (menos quando a aba de notificações está aberta)
    useEffect(() => {
        if (tab === "notificacoes") return;
        const id = setInterval(() => { api.getNotifications(user.id).then(setNotifications).catch(() => { }); }, 20000);
        return () => clearInterval(id);
    }, [tab, user.id]);
    // Ao abrir a aba: marca tudo como lido no servidor. Ao sair: some o destaque "Nova".
    useEffect(() => {
        if (tab !== "notificacoes" || loading) return;
        if (notifications.some((n) => !n.read)) api.markNotificationsRead(user.id).catch(() => { });
        return () => setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    }, [tab, loading]);
    const applyToOpportunity = async (oppId, message) => {
        try {
            await api.apply(oppId, message);
            showToast("✅ Interesse enviado com sucesso!");
            setApplyModal(null);
            loadAll();
        } catch (err) { showToast("Erro: " + err.message); }
    };
    const withdrawInterest = async (oppId) => {
        try { await api.withdraw(oppId); showToast("Interesse retirado."); loadAll(); }
        catch (err) { showToast("Erro: " + err.message); }
    };
    const doCancelHire = async (opp, reason) => {
        try {
            await api.cancelHire(opp.id, user.id, reason);
            showToast("Contratação cancelada. Vaga reaberta.");
            loadAll();
        } catch (err) { showToast("Erro: " + err.message); }
    };
    return (
        <div className="cl-layout" style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 20px 60px", display: "flex", gap: 24 }}>
            <SideNav tabs={tabs} tab={tab} setTab={setTab} badge={{ notificacoes: tab === "notificacoes" ? 0 : notifications.filter((n) => !n.read).length, chat: Object.values(chatUnread).filter(Boolean).length }} />
            <main style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: COLORS.navy, margin: "4px 0 4px" }}>Olá, {user.name.split(" ")[0]}! 👋</h2>
                <p style={{ color: COLORS.ink, opacity: 0.7, fontSize: 13.5, marginBottom: 20 }}>Encontre seu próximo trabalho.</p>
                {loading ? (
                    <Card style={{ padding: 30, textAlign: "center", color: COLORS.navy, opacity: 0.6 }}>Carregando...</Card>
                ) : (
                    <>
                        {tab === "buscar" && (
                            <>
                                <InterestPicker interests={interests} setInterests={setInterests} modality={modality} setModality={setModality} date={filters.date} setDate={(d) => setFilters({ ...filters, date: d })} shown={filtered.length} />
                                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                    {filtered.length === 0 && (
                                        <Card style={{ padding: 30, textAlign: "center" }}>
                                            <p style={{ fontSize: 13.5, color: COLORS.navy, opacity: 0.75, margin: "0 0 12px" }}>Nenhuma oportunidade encontrada para os critérios selecionados.</p>
                                            {(interests.length > 0 || modality !== "todas" || filters.date) && <Button variant="outline" onClick={() => { setInterests([]); setModality("todas"); setFilters({ date: "" }); }}>Remover filtros</Button>}
                                        </Card>
                                    )}
                                    {filtered.map((o) => (
                                        <OpportunityCard key={o.id} opp={o} appliedStatus={applications[o.id]} onApply={() => setApplyModal(o)} onOpenChat={() => { setChatOpp(o); setTab("chat"); }} />
                                    ))}
                                </div>
                            </>
                        )}
                        {tab === "candidaturas" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                {appliedOpps.length === 0 && <EmptyState text="Você ainda não se candidatou a nenhuma oportunidade." />}
                                {appliedOpps.map((o) => (
                                    <OpportunityCard key={o.id} opp={o} appliedStatus={applications[o.id]} onWithdraw={() => withdrawInterest(o.id)} onOpenChat={() => { setChatOpp(o); setTab("chat"); }} showStatus />
                                ))}
                            </div>
                        )}
                        {tab === "contratados" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                {hiredOpps.length === 0 && <EmptyState text="Nenhum trabalho contratado ainda." />}
                                {hiredOpps.map((o) => (
                                    <Card key={o.id} style={{ padding: 18 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
                                            <div>
                                                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, color: COLORS.navy, marginBottom: 6 }}>{o.title}</div>
                                                <Row icon={MapPin} text={o.city} />
                                                <Row icon={Calendar} text={fmtDate(o.date)} />
                                                <Row icon={Clock} text={`${o.start} às ${o.end}`} />
                                            </div>
                                            <Pill color={COLORS.teal}>Contratado</Pill>
                                        </div>
                                        <Button variant="danger" style={{ marginTop: 12 }} onClick={() => setCancelTarget(o)}>Cancelar contratação</Button>
                                    </Card>
                                ))}
                            </div>
                        )}
                        {tab === "agenda" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {agenda.length === 0 && <EmptyState text="Sua agenda está livre." />}
                                {[...agenda].sort((a, b) => a.date.localeCompare(b.date)).map((a) => (
                                    <Card key={a.id} style={{ padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
                                        <div style={{ background: COLORS.navy, color: "#fff", borderRadius: 10, padding: "8px 12px", textAlign: "center", fontFamily: FONT_MONO, minWidth: 56 }}>
                                            <div style={{ fontSize: 16, fontWeight: 700 }}>{a.date.slice(8, 10)}</div>
                                            <div style={{ fontSize: 10 }}>{a.date.slice(5, 7)}/{a.date.slice(0, 4)}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 14 }}>{a.title}</div>
                                            <div style={{ fontSize: 12.5, color: COLORS.ink, opacity: 0.75 }}>{a.start}–{a.end} · {a.location}</div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                        {tab === "historico" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {history.length === 0 && <EmptyState text="Nenhum trabalho concluído ainda." />}
                                {history.map((h) => (
                                    <Card key={h.id} style={{ padding: 16 }}>
                                        <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 14, marginBottom: 4 }}>{h.title}</div>
                                        <Row icon={MapPin} text={h.location} />
                                        <Row icon={Calendar} text={`${fmtDate(h.date)} · ${h.start}–${h.end}`} />
                                        <Pill color={COLORS.teal} style={{ marginTop: 8 }}>✅ Concluído através da plataforma</Pill>
                                    </Card>
                                ))}
                            </div>
                        )}
                        {tab === "chat" && (
                            <ChatPanel
                                opp={chatActive}
                                opps={chatOpps}
                                setChatOpp={setChatOpp}
                                me={user.id}
                                otherName={(o) => o?.employer?.name}
                                unread={chatUnread}
                            />
                        )}
                        {tab === "notificacoes" && <NotificationList list={notifications} />}
                        {tab === "perfil" && (
                            <FreelancerProfile freelancer={user} onUpdateProfile={onUpdateProfile} onChangePassword={onChangePassword} onLogout={onLogout} />
                        )}
                    </>
                )}
            </main>
            {applyModal && (
                <ApplyModal opp={applyModal} onClose={() => setApplyModal(null)} onSubmit={(msg) => applyToOpportunity(applyModal.id, msg)} />
            )}
            {cancelTarget && (
                <CancelHireConfirmModal opp={cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={(reason) => { doCancelHire(cancelTarget, reason); setCancelTarget(null); }} />
            )}
        </div>
    );
}
function CancelHireConfirmModal({ opp, onClose, onConfirm }) {
    const [reason, setReason] = useState("");
    return (
        <Modal title="⚠️ Cancelar contratação" onClose={onClose} width={440}>
            <p style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.6, marginBottom: 4 }}>
                Tem certeza que deseja cancelar a contratação para <b>"{opp.title}"</b>?
            </p>
            <p style={{ fontSize: 12.5, color: COLORS.navy, opacity: 0.75, marginBottom: 16 }}>
                A vaga será reaberta e ficará disponível para outros candidatos.
            </p>
            <label style={labelStyle} htmlFor="cancel-reason">Motivo do cancelamento (opcional)</label>
            <textarea id="cancel-reason" style={{ ...inputStyle, minHeight: 70 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: imprevisto de agenda, mudança de planos..." />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <Button variant="outline" full onClick={onClose}>Não, manter</Button>
                <Button variant="danger" full onClick={() => onConfirm(reason.trim())}>Sim, cancelar</Button>
            </div>
        </Modal>
    );
}
function ModalityPill({ modality }) {
    const remote = modality === "remoto";
    return <Pill color={remote ? COLORS.teal : COLORS.navyLight}>{remote ? "Home office" : "Presencial"}</Pill>;
}
function InterestPicker({ interests, setInterests, modality, setModality, date, setDate, shown }) {
    const hasFilters = interests.length > 0 || modality !== "todas" || !!date;
    const [open, setOpen] = useState(!hasFilters);
    const toggle = (c) => setInterests(interests.includes(c) ? interests.filter((x) => x !== c) : [...interests, c]);
    const modalityLabel = { presencial: "Presencial", remoto: "Home office" };
    return (
        <Card style={{ marginBottom: 18, overflow: "hidden" }}>
            <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: FONT_BODY }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.navy, marginBottom: 6 }}>Áreas de interesse e modalidade</div>
                    {!hasFilters ? (
                        <span style={{ fontSize: 13, color: COLORS.navy, opacity: 0.75 }}>Exibindo todas as áreas e modalidades. Selecione para refinar a busca.</span>
                    ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {interests.map((c) => <Pill key={c} color={COLORS.navy}>{c}</Pill>)}
                            {modality !== "todas" && <Pill color={COLORS.teal}>{modalityLabel[modality]}</Pill>}
                            {date && <Pill color={COLORS.amberDark}>{fmtDate(date)}</Pill>}
                        </div>
                    )}
                </div>
                <ChevronDown size={20} color={COLORS.navy} aria-hidden="true" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
            {open && (
                <div style={{ padding: "6px 16px 16px", borderTop: `1px solid ${COLORS.line}` }}>
                    <div style={{ ...labelStyle, marginTop: 12, marginBottom: 4, opacity: 1, fontSize: 13 }}>Áreas de atuação</div>
                    <p style={{ fontSize: 12.5, color: COLORS.navy, opacity: 0.7, margin: "0 0 10px" }}>Selecione uma ou mais áreas. Serão exibidas apenas as oportunidades correspondentes.</p>
                    <div role="group" aria-label="Áreas de atuação" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                        {CATEGORIES.map((c) => {
                            const on = interests.includes(c);
                            return (
                                <button key={c} type="button" aria-pressed={on} onClick={() => toggle(c)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: on ? "#fff" : COLORS.navy, background: on ? COLORS.navy : "#fff", border: `1.5px solid ${on ? COLORS.navy : COLORS.line}` }}>
                                    <span style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on ? COLORS.amber : "#fff", border: `1.5px solid ${on ? COLORS.amber : COLORS.line}` }}>
                                        {on && <Check size={12} color={COLORS.navy} strokeWidth={3} aria-hidden="true" />}
                                    </span>
                                    {c}
                                </button>
                            );
                        })}
                    </div>
                    <div style={{ ...labelStyle, marginTop: 18, marginBottom: 8, opacity: 1, fontSize: 13 }}>Modalidade de trabalho</div>
                    <div role="radiogroup" aria-label="Modalidade de trabalho" style={{ display: "flex", border: `1.5px solid ${COLORS.line}`, borderRadius: 10, overflow: "hidden" }}>
                        {[["todas", "Todas"], ["presencial", "Presencial"], ["remoto", "Home office"]].map(([v, l], i) => (
                            <button key={v} type="button" role="radio" aria-checked={modality === v} onClick={() => setModality(v)} style={{ flex: 1, padding: "10px 8px", border: "none", borderLeft: i ? `1.5px solid ${COLORS.line}` : "none", cursor: "pointer", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, background: modality === v ? COLORS.navy : "#fff", color: modality === v ? "#fff" : COLORS.navy }}>{l}</button>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 18 }}>
                        <div style={{ flex: "1 1 170px" }}>
                            <label style={labelStyle} htmlFor="f-date">Data da oportunidade (opcional)</label>
                            <input id="f-date" type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                        {hasFilters && <Button variant="outline" onClick={() => { setInterests([]); setModality("todas"); setDate(""); }}>Limpar seleção</Button>}
                        <Button variant="dark" onClick={() => setOpen(false)}>Exibir {shown} oportunidade(s)</Button>
                    </div>
                </div>
            )}
        </Card>
    );
}
function OpportunityCard({ opp, appliedStatus, onApply, onWithdraw, onOpenChat, showStatus }) {
    const status = vagaStatus(opp.slotsTotal, opp.slotsFilled);
    return (
        <Card style={{ padding: 18, borderLeft: `4px solid ${status.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <Pill color={COLORS.navy}>{opp.category}</Pill> <ModalityPill modality={opp.modality} />
                        {showStatus && appliedStatus && (
                            <Pill color={appliedStatus === "contratado" ? COLORS.teal : appliedStatus === "recusado" ? COLORS.red : COLORS.yellow}>
                                {appliedStatus === "pendente" ? "Interesse enviado" : appliedStatus === "contratado" ? "Contratado" : appliedStatus === "recusado" ? "Recusado" : "Retirado"}
                            </Pill>
                        )}
                    </div>
                    <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: COLORS.navy, marginBottom: 6 }}>{opp.title}</div>
                    <Row icon={MapPin} text={`${opp.city} · ${opp.distanceKm} km`} />
                    <Row icon={Calendar} text={fmtDate(opp.date)} />
                    <Row icon={Clock} text={`${opp.start} às ${opp.end}`} />
                    <Row icon={DollarSign} text={opp.payType === "valor" ? opp.payAmount : opp.payType === "combinar" ? "Valor a combinar" : "Valor não informado"} />
                </div>
                <div className="cl-meter" style={{ width: 160, flexShrink: 0 }}>
                    <VagaMeter total={opp.slotsTotal} filled={opp.slotsFilled} />
                </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                {!appliedStatus && onApply && (
                    <Button variant="primary" icon={Send} onClick={onApply} disabled={status.key === "preenchida"}>
                        {status.key === "preenchida" ? "Vaga preenchida" : "Tenho interesse"}
                    </Button>
                )}
                {appliedStatus === "pendente" && onWithdraw && <Button variant="outline" onClick={onWithdraw}>Retirar interesse</Button>}
                {appliedStatus && appliedStatus !== "retirado" && onOpenChat && <Button variant="ghost" icon={MessageCircle} onClick={onOpenChat}>Conversar</Button>}
            </div>
        </Card>
    );
}
function ApplyModal({ opp, onClose, onSubmit }) {
    const [msg, setMsg] = useState("Olá, tenho experiência nessa área e estou disponível para essa oportunidade.");
    return (
        <Modal title="Demonstrar interesse" onClose={onClose}>
            <p style={{ fontSize: 13.5, color: COLORS.navy, opacity: 0.75, marginBottom: 10 }}>Oportunidade: <b>{opp.title}</b></p>
            <label style={labelStyle} htmlFor="apply-msg">Mensagem para o contratante</label>
            <textarea id="apply-msg" style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={msg} onChange={(e) => setMsg(e.target.value)} />
            <Button variant="primary" full style={{ marginTop: 14 }} icon={Send} onClick={() => onSubmit(msg)}>Enviar interesse</Button>
        </Modal>
    );
}
// ---------------------------------------------------------------------------
// CHAT (freelancer) — Firestore: um único listener (api.listenToChat) entrega
// o histórico e as mensagens novas em tempo real.
// ---------------------------------------------------------------------------
function ChatPanel({ opp, opps, setChatOpp, me, otherName, unread = {} }) {
    const [text, setText] = useState("");
    const [msgs, setMsgs] = useState([]);
    const active = opp || (opps && opps[0]);
    useEffect(() => {
        if (!active) return;
        const unsubscribe = api.listenToChat(active.id, me, setMsgs);
        return () => unsubscribe();
    }, [active?.id, me]);
    if (!opps || opps.length === 0) return <EmptyState text="O chat é liberado depois que você demonstra interesse em uma oportunidade." />;
    const send = async () => {
        if (!text.trim() || !active) return;
        await api.sendChatMessage(active.id, me, "freelancer", text);
        setText("");
        // a mensagem aparece sozinha na tela, via listener do Firestore
    };
    return (
        <div className="cl-chat" style={{ display: "flex", gap: 14, height: 480 }}>
            <div className="cl-chat-list" style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
                {opps.map((o) => (
                    <button key={o.id} type="button" onClick={() => setChatOpp(o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, textAlign: "left", padding: 10, borderRadius: 10, cursor: "pointer", background: active.id === o.id ? COLORS.navy : "#fff", color: active.id === o.id ? "#fff" : COLORS.navy, fontSize: 12.5, fontWeight: 600, border: `1px solid ${COLORS.line}` }}>
                        <span>{o.title}</span>
                        {unread[`${o.id}_${me}`] && <span role="img" aria-label="Mensagem nova" style={{ width: 10, height: 10, borderRadius: 999, background: COLORS.red, flexShrink: 0 }} />}
                    </button>
                ))}
            </div>
            <Card style={{ flex: 1, display: "flex", flexDirection: "column", padding: 14 }}>
                <div style={{ borderBottom: `1px solid ${COLORS.line}`, paddingBottom: 10, marginBottom: 10, fontWeight: 700, color: COLORS.navy, fontSize: 14 }}>
                    {otherName(active) || "Contratante"} <span style={{ opacity: 0.6, fontWeight: 400 }}> · {active.title}</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                    {msgs.length === 0 && <div style={{ fontSize: 12.5, opacity: 0.6, color: COLORS.navy }}>💬 O chat foi liberado. Envie a primeira mensagem!</div>}
                    {msgs.map((m, i) => (
                        <div key={i} style={{ alignSelf: m.from === "freelancer" ? "flex-end" : "flex-start", background: m.from === "freelancer" ? COLORS.amber : COLORS.cream, padding: "8px 12px", borderRadius: 12, maxWidth: "75%", fontSize: 13.5, color: COLORS.ink, overflowWrap: "anywhere" }}>{m.text}</div>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <input style={inputStyle} aria-label="Mensagem" placeholder="Escreva uma mensagem..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
                    <Button variant="dark" icon={Send} onClick={send} ariaLabel="Enviar mensagem" />
                </div>
            </Card>
        </div>
    );
}
function NotificationList({ list }) {
    if (list.length === 0) return <EmptyState text="Nenhuma notificação por enquanto." />;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {list.map((n) => (
                <Card key={n.id} style={{ padding: 14, display: "flex", gap: 10, alignItems: "center", background: n.read ? "#fff" : "#FFF8E6", borderLeft: n.read ? `1px solid ${COLORS.line}` : `4px solid ${COLORS.amber}` }}>
                    <Bell size={16} color={COLORS.amberDark} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13.5, color: COLORS.ink, fontWeight: n.read ? 400 : 600, flex: 1 }}>{n.text}</span>
                    {!n.read && <Pill color={COLORS.amberDark}>Nova</Pill>}
                </Card>
            ))}
        </div>
    );
}
function FreelancerProfile({ freelancer, onUpdateProfile, onChangePassword, onLogout }) {
    const [reportOpen, setReportOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [pwOpen, setPwOpen] = useState(false);
    return (
        <Card style={{ padding: 24, maxWidth: 560 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20 }}>
                    {freelancer.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: COLORS.navy }}>{freelancer.name}</div>
                    <div style={{ fontSize: 12.5, color: COLORS.ink, opacity: 0.7, display: "flex", alignItems: "center", gap: 5 }}><MapPin size={12} aria-hidden="true" /> {freelancer.city}</div>
                    {freelancer.phoneVerified && <Pill color={COLORS.teal} style={{ marginTop: 6 }}><Check size={11} aria-hidden="true" /> Telefone verificado</Pill>}
                </div>
                <Button variant="outline" icon={Edit3} onClick={() => setEditOpen(true)}>Editar perfil</Button>
            </div>
            <Section title="Sobre mim">
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: COLORS.ink, opacity: freelancer.bio ? 1 : 0.6 }}>
                    {freelancer.bio || "Você ainda não escreveu uma bio. Clique em 'Editar perfil' para adicionar."}
                </p>
            </Section>
            <Section title="Habilidades">
                {freelancer.skills.length > 0
                    ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{freelancer.skills.map((s) => <Pill key={s} color={COLORS.navy}>{s}</Pill>)}</div>
                    : <p style={{ fontSize: 13, color: COLORS.ink, opacity: 0.6 }}>Nenhuma habilidade cadastrada ainda.</p>}
            </Section>
            <Section title="Serviços que realiza">
                {freelancer.services.length > 0
                    ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{freelancer.services.map((s) => <Pill key={s} color={COLORS.amberDark}>{s}</Pill>)}</div>
                    : <p style={{ fontSize: 13, color: COLORS.ink, opacity: 0.6 }}>Nenhum serviço cadastrado ainda.</p>}
            </Section>
            <Section title="Disponibilidade"><p style={{ fontSize: 13.5, color: COLORS.ink }}>{freelancer.availability}</p></Section>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                <Button variant="outline" icon={Lock} onClick={() => setPwOpen(true)}>Trocar senha</Button>
                <Button variant="danger" icon={Flag} onClick={() => setReportOpen(true)}>Denunciar perfil</Button>
                <Button variant="ghost" icon={LogOut} onClick={onLogout}>Sair da conta</Button>
            </div>
            {reportOpen && <ReportModal onClose={() => setReportOpen(false)} />}
            {editOpen && <EditFreelancerProfileModal freelancer={freelancer} onClose={() => setEditOpen(false)} onSubmit={async (data) => { await onUpdateProfile(data); setEditOpen(false); }} />}
            {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} onSubmit={async (current, next) => { await onChangePassword(current, next); setPwOpen(false); }} />}
        </Card>
    );
}
function EditFreelancerProfileModal({ freelancer, onClose, onSubmit }) {
    const [form, setForm] = useState({ name: freelancer.name, cep: freelancer.cep || "", city: freelancer.city, bio: freelancer.bio, skills: freelancer.skills.join(", "), services: freelancer.services.join(", "), availability: freelancer.availability });
    const [cepLoading, setCepLoading] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const handleCepChange = async (raw) => {
        const masked = maskCep(raw);
        set("cep", masked);
        if (masked.replace(/\D/g, "").length === 8) {
            setCepLoading(true);
            const result = await fetchCep(masked);
            if (result) set("city", result.city);
            setCepLoading(false);
        }
    };
    const submit = () => {
        if (!form.name.trim() || !form.city.trim()) return;
        onSubmit({
            name: form.name.trim(), cep: form.cep.trim(), city: form.city.trim(), bio: form.bio.trim(),
            skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
            services: form.services.split(",").map((s) => s.trim()).filter(Boolean),
            availability: form.availability,
        });
    };
    return (
        <Modal title="Editar perfil" onClose={onClose} width={520}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
                <div style={{ position: "relative" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 999, background: COLORS.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22 }}>
                        {(form.name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div style={{ position: "absolute", bottom: -2, right: -2, background: COLORS.amber, borderRadius: 999, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }} title="Sua foto usa as iniciais do nome">
                        <Camera size={12} color={COLORS.navy} aria-hidden="true" />
                    </div>
                </div>
            </div>
            <p style={{ fontSize: 11.5, color: COLORS.navy, opacity: 0.65, textAlign: "center", marginTop: -12, marginBottom: 16 }}>
                Sua foto de perfil é gerada automaticamente a partir das iniciais do nome.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div><label style={labelStyle} htmlFor="ep-name">Nome</label><input id="ep-name" style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
                <div><label style={labelStyle} htmlFor="ep-cep">CEP</label><input id="ep-cep" style={inputStyle} inputMode="numeric" value={form.cep} onChange={(e) => handleCepChange(e.target.value)} maxLength={9} placeholder="00000-000" /></div>
                <div><label style={labelStyle} htmlFor="ep-city">Cidade</label><input id="ep-city" style={inputStyle} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder={cepLoading ? "Buscando cidade..." : ""} /></div>
                <div><label style={labelStyle} htmlFor="ep-bio">Sobre mim</label><textarea id="ep-bio" style={{ ...inputStyle, minHeight: 80 }} value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Conte um pouco sobre sua experiência..." /></div>
                <div><label style={labelStyle} htmlFor="ep-skills">Habilidades (separadas por vírgula)</label><input id="ep-skills" style={inputStyle} value={form.skills} onChange={(e) => set("skills", e.target.value)} placeholder="Atendimento ao cliente, pontualidade..." /></div>
                <div><label style={labelStyle} htmlFor="ep-services">Serviços que realiza (separados por vírgula)</label><input id="ep-services" style={inputStyle} value={form.services} onChange={(e) => set("services", e.target.value)} placeholder="Garçom, recepcionista..." /></div>
                <Button variant="primary" full onClick={submit}>Salvar alterações</Button>
            </div>
        </Modal>
    );
}
function ChangePasswordModal({ onClose, onSubmit }) {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const submit = async () => {
        if (!current || !next || !confirm) { setError("Preencha todos os campos."); return; }
        if (next.length < 6) { setError("A nova senha deve ter pelo menos 6 caracteres."); return; }
        if (next !== confirm) { setError("A confirmação não coincide com a nova senha."); return; }
        setError("");
        try { await onSubmit(current, next); }
        catch (err) { setError(err.message || "Não foi possível trocar a senha."); }
    };
    return (
        <Modal title="Trocar senha" onClose={onClose} width={420}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div><label style={labelStyle} htmlFor="pw-current">Senha atual</label><input id="pw-current" type="password" autoComplete="current-password" style={inputStyle} value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
                <div><label style={labelStyle} htmlFor="pw-next">Nova senha</label><input id="pw-next" type="password" autoComplete="new-password" style={inputStyle} value={next} onChange={(e) => setNext(e.target.value)} /></div>
                <div><label style={labelStyle} htmlFor="pw-confirm">Confirmar nova senha</label><input id="pw-confirm" type="password" autoComplete="new-password" style={inputStyle} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
                {error && <div role="alert" style={{ fontSize: 12.5, color: COLORS.red, background: "#EB57571A", padding: "8px 12px", borderRadius: 8 }}>{error}</div>}
                <Button variant="primary" full onClick={submit}>Salvar nova senha</Button>
            </div>
        </Modal>
    );
}
function ReportModal({ onClose }) {
    const cats = ["Perfil falso", "Comportamento inadequado", "Fraude", "Informações falsas", "Outro"];
    const [selected, setSelected] = useState(null);
    const [sent, setSent] = useState(false);
    return (
        <Modal title="⚠️ Denunciar perfil" onClose={onClose}>
            {!sent ? (
                <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                        {cats.map((c) => (
                            <button key={c} type="button" aria-pressed={selected === c} onClick={() => setSelected(c)} style={{ textAlign: "left", padding: "10px 14px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${selected === c ? COLORS.navy : COLORS.line}`, background: selected === c ? COLORS.navy : "#fff", color: selected === c ? "#fff" : COLORS.ink, fontSize: 13.5 }}>{c}</button>
                        ))}
                    </div>
                    <Button variant="danger" full disabled={!selected} onClick={() => setSent(true)}>Enviar denúncia</Button>
                </>
            ) : (
                <div style={{ textAlign: "center", padding: "10px 0" }}>
                    <CheckCircle2 size={32} color={COLORS.teal} aria-hidden="true" style={{ marginBottom: 10 }} />
                    <p style={{ fontSize: 14, color: COLORS.navy }}>Denúncia enviada. Nossa equipe irá analisar.</p>
                </div>
            )}
        </Modal>
    );
}
// ---------------------------------------------------------------------------
// CONTRATANTE VIEW
// ---------------------------------------------------------------------------
function ContratanteView({ user, showToast, onUpdateProfile, onChangePassword, onLogout }) {
    const [tab, setTab] = useState("oportunidades");
    const [opportunities, setOpportunities] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [postModalOpen, setPostModalOpen] = useState(false);
    const [selectedOpp, setSelectedOpp] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [chatCandidate, setChatCandidate] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [conflictModal, setConflictModal] = useState(null);
    const [hireConfirm, setHireConfirm] = useState(null);
    const loadOpportunities = useCallback(async () => {
        setLoading(true);
        try {
            const [opps, notifs] = await Promise.all([
                api.listOpportunities({ contratanteId: user.id }),
                api.getNotifications(user.id),
            ]);
            setOpportunities(opps);
            setNotifications(notifs);
        } catch (err) {
            showToast("Erro ao carregar dados: " + err.message);
        } finally {
            setLoading(false);
        }
    }, [user.id]);
    useEffect(() => { loadOpportunities(); }, [loadOpportunities]);
    useEffect(() => {
        const opp = selectedOpp || opportunities[0];
        if (!opp) { setCandidates([]); return; }
        api.getCandidates(opp.id).then(setCandidates).catch(() => setCandidates([]));
    }, [selectedOpp, opportunities]);
    const tabs = [
        ["oportunidades", "Oportunidades", Briefcase],
        ["candidatos", "Candidatos", Users],
        ["contratados", "Contratados", CheckCircle2],
        ["chat", "Chat", MessageCircle],
        ["notificacoes", "Notificações", Bell],
        ["perfil", "Perfil", User],
    ];
    const activeOpp = selectedOpp || opportunities[0];
    // Conversas do contratante (carregadas aqui para o aviso de mensagem nova funcionar em qualquer aba)
    const [conversations, setConversations] = useState([]);
    const loadConversations = useCallback(() => {
        api.getEmployerConversations(user.id).then((rows) => {
            setConversations(rows.map((r) => ({
                key: `${r.opportunityId}_${r.freelancerId}`,
                oppId: r.opportunityId,
                freelancerId: r.freelancerId,
                label: r.freelancerName,
                opp: { id: r.opportunityId, title: r.opportunityTitle },
                cand: { freelancerId: r.freelancerId, name: r.freelancerName },
            })));
        }).catch(() => setConversations([]));
    }, [user.id]);
    useEffect(() => {
        loadConversations();
        const id = setInterval(loadConversations, 30000);
        return () => clearInterval(id);
    }, [loadConversations, opportunities]);
    const activeChat = chatCandidate || conversations[0] || null;
    const chatUnread = useChatUnread({
        userId: user.id,
        role: "contratante",
        showToast,
        conversations,
        activeKey: tab === "chat" && activeChat ? `${activeChat.opp.id}_${activeChat.cand.freelancerId}` : null,
    });
    // Atualiza as notificações a cada 20s (menos quando a aba de notificações está aberta)
    useEffect(() => {
        if (tab === "notificacoes") return;
        const id = setInterval(() => { api.getNotifications(user.id).then(setNotifications).catch(() => { }); }, 20000);
        return () => clearInterval(id);
    }, [tab, user.id]);
    // Ao abrir a aba: marca tudo como lido no servidor. Ao sair: some o destaque "Nova".
    useEffect(() => {
        if (tab !== "notificacoes" || loading) return;
        if (notifications.some((n) => !n.read)) api.markNotificationsRead(user.id).catch(() => { });
        return () => setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    }, [tab, loading]);
    const postOpportunity = async (data) => {
        try {
            await api.createOpportunity(data); // o contratante é identificado pelo token, não pelo body
            showToast("✅ Oportunidade publicada!");
            setPostModalOpen(false);
            loadOpportunities();
        } catch (err) { showToast("Erro: " + err.message); }
    };
    const deleteOpportunity = async (opp) => {
        try {
            await api.deleteOpportunity(opp.id);
            showToast("Vaga apagada.");
            setSelectedOpp(null);
            loadOpportunities();
        } catch (err) { showToast("Erro: " + err.message); }
    };
    const rejectCandidate = async (oppId, freelancerId) => {
        try {
            await api.reject(oppId, freelancerId);
            showToast("Candidato recusado.");
            const fresh = await api.getCandidates(oppId);
            setCandidates(fresh);
        } catch (err) { showToast("Erro: " + err.message); }
    };
    const attemptHire = async (opp, candidate) => {
        try {
            const { conflict } = await api.checkConflict(opp.id, candidate.freelancerId);
            if (conflict) setConflictModal({ opp, candidate, conflict });
            else setHireConfirm({ opp, candidate });
        } catch (err) { showToast("Erro: " + err.message); }
    };
    const confirmHire = async (opp, candidate) => {
        try {
            await api.hire(opp.id, candidate.freelancerId);
            showToast("✅ Freelancer contratado.");
            setConflictModal(null);
            setHireConfirm(null);
            loadOpportunities();
            const fresh = await api.getCandidates(opp.id);
            setCandidates(fresh);
        } catch (err) { showToast("Erro: " + err.message); }
    };
    const cancelHire = async (opp, freelancerId, reason) => {
        try {
            await api.cancelHire(opp.id, freelancerId, reason);
            showToast("Contratação cancelada. Vaga reaberta.");
            loadOpportunities();
        } catch (err) { showToast("Erro: " + err.message); }
    };
    const [hiredEntries, setHiredEntries] = useState([]);
    useEffect(() => {
        if (tab !== "contratados") return;
        (async () => {
            try {
                const entries = [];
                for (const o of opportunities) {
                    const cands = await api.getCandidates(o.id);
                    cands.filter((c) => c.status === "contratado").forEach((c) => entries.push({ opp: o, candidate: c }));
                }
                setHiredEntries(entries);
            } catch {
                setHiredEntries([]);
            }
        })();
    }, [tab, opportunities]);
    return (
        <div className="cl-layout" style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 20px 60px", display: "flex", gap: 24 }}>
            <SideNav tabs={tabs} tab={tab} setTab={setTab} badge={{ notificacoes: tab === "notificacoes" ? 0 : notifications.filter((n) => !n.read).length, chat: Object.values(chatUnread).filter(Boolean).length }} />
            <main style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
                    <div>
                        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: COLORS.navy, margin: "4px 0 4px" }}>Olá! 👋</h2>
                        <p style={{ color: COLORS.ink, opacity: 0.7, fontSize: 13.5, margin: 0 }}>Encontre profissionais para sua oportunidade.</p>
                    </div>
                    <Button variant="primary" icon={Plus} onClick={() => setPostModalOpen(true)}>Publicar oportunidade</Button>
                </div>
                {loading ? (
                    <Card style={{ padding: 30, textAlign: "center", color: COLORS.navy, opacity: 0.6 }}>Carregando...</Card>
                ) : (
                    <>
                        {tab === "oportunidades" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                {opportunities.length === 0 && <EmptyState text="Você ainda não publicou nenhuma oportunidade." />}
                                {opportunities.map((o) => (
                                    <EmployerOppCard key={o.id} opp={o} onManage={() => { setSelectedOpp(o); setTab("candidatos"); }} onDelete={() => setDeleteTarget(o)} />
                                ))}
                            </div>
                        )}
                        {tab === "candidatos" && activeOpp && (
                            <CandidatesPanel opportunities={opportunities} activeOpp={activeOpp} setSelectedOpp={setSelectedOpp} candidates={candidates}
                                onReject={rejectCandidate} onAttemptHire={attemptHire} onChat={(opp, cand) => { setChatCandidate({ opp, cand }); setTab("chat"); }} />
                        )}
                        {tab === "candidatos" && !activeOpp && <EmptyState text="Nenhuma oportunidade publicada." />}
                        {tab === "contratados" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {hiredEntries.length === 0 && <EmptyState text="Nenhum profissional contratado ainda." />}
                                {hiredEntries.map(({ opp, candidate }, i) => (
                                    <Card key={i} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                                        <div>
                                            <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 14 }}>{opp.title} — {candidate.name}</div>
                                            <div style={{ fontSize: 12.5, opacity: 0.75 }}>{fmtDate(opp.date)} · {opp.start}–{opp.end} · {opp.city}</div>
                                        </div>
                                        <Button variant="danger" onClick={() => setCancelTarget({ opp, freelancerId: candidate.freelancerId })}>Cancelar contratação</Button>
                                    </Card>
                                ))}
                            </div>
                        )}
                        {tab === "chat" && (
                            <EmployerChatPanel conversations={conversations} active={activeChat} setActive={setChatCandidate} unread={chatUnread} />
                        )}
                        {tab === "notificacoes" && <NotificationList list={notifications} />}
                        {tab === "perfil" && (
                            <EmployerProfile employerProfile={user} onUpdateProfile={onUpdateProfile} onChangePassword={onChangePassword} onLogout={onLogout} />
                        )}
                    </>
                )}
            </main>
            {postModalOpen && <PostOpportunityModal onClose={() => setPostModalOpen(false)} onSubmit={postOpportunity} />}
            {deleteTarget && (
                <Modal title="Apagar vaga" onClose={() => setDeleteTarget(null)} width={420}>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: COLORS.ink }}>
                        Tem certeza que deseja apagar <b>"{deleteTarget.title}"</b>? As candidaturas e a agenda dessa vaga serão removidas, e os interessados serão avisados. Essa ação não pode ser desfeita.
                    </p>
                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                        <Button variant="outline" full onClick={() => setDeleteTarget(null)}>Não, manter</Button>
                        <Button variant="danger" full icon={Trash2} onClick={() => { deleteOpportunity(deleteTarget); setDeleteTarget(null); }}>Sim, apagar</Button>
                    </div>
                </Modal>
            )}
            {cancelTarget && (
                <CancelHireConfirmModal opp={cancelTarget.opp} onClose={() => setCancelTarget(null)} onConfirm={(reason) => { cancelHire(cancelTarget.opp, cancelTarget.freelancerId, reason); setCancelTarget(null); }} />
            )}
            {conflictModal && (
                <Modal title="⚠️ Atenção — Conflito de horário" onClose={() => setConflictModal(null)}>
                    <p style={{ fontSize: 14, color: COLORS.ink, lineHeight: 1.6 }}>
                        O freelancer <b>{conflictModal.candidate.name}</b> já possui um trabalho marcado que se sobrepõe a esta oportunidade:
                    </p>
                    <Card style={{ padding: 14, marginBottom: 10, borderColor: COLORS.red }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.navy, marginBottom: 6 }}>Trabalho já agendado</div>
                        <Row icon={Calendar} text={fmtDate(conflictModal.conflict.date)} />
                        <Row icon={Clock} text={`${conflictModal.conflict.start} às ${conflictModal.conflict.end}`} />
                        <Row icon={MapPin} text={conflictModal.conflict.location} />
                    </Card>
                    <Card style={{ padding: 14, marginBottom: 16, borderColor: COLORS.navy }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.navy, marginBottom: 6 }}>Nova oportunidade</div>
                        <Row icon={Calendar} text={fmtDate(conflictModal.opp.date)} />
                        <Row icon={Clock} text={`${conflictModal.opp.start} às ${conflictModal.opp.end}`} />
                        <Row icon={MapPin} text={conflictModal.opp.city} />
                    </Card>
                    <p style={{ fontSize: 13, color: COLORS.ink, opacity: 0.8, marginBottom: 16 }}>
                        Os horários se sobrepõem. Você pode analisar a situação e decidir se deseja continuar mesmo assim.
                    </p>
                    <div style={{ display: "flex", gap: 10 }}>
                        <Button variant="outline" full onClick={() => setConflictModal(null)}>Cancelar</Button>
                        <Button variant="dark" full onClick={() => confirmHire(conflictModal.opp, conflictModal.candidate)}>Contratar mesmo assim</Button>
                    </div>
                </Modal>
            )}
            {hireConfirm && (
                <Modal title="Confirmar contratação" onClose={() => setHireConfirm(null)}>
                    <div style={{ fontSize: 14, lineHeight: 1.8, color: COLORS.ink }}>
                        <p><b>Freelancer:</b> {hireConfirm.candidate.name}</p>
                        <p><b>Oportunidade:</b> {hireConfirm.opp.title}</p>
                        <p><b>Data:</b> {fmtDate(hireConfirm.opp.date)} · {hireConfirm.opp.start}–{hireConfirm.opp.end}</p>
                        <p><b>Local:</b> {hireConfirm.opp.city}</p>
                        <p><b>Valor:</b> {hireConfirm.opp.payType === "valor" ? hireConfirm.opp.payAmount : hireConfirm.opp.payType === "combinar" ? "A combinar" : "Não informado"}</p>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                        <Button variant="outline" full onClick={() => setHireConfirm(null)}>Cancelar</Button>
                        <Button variant="primary" full onClick={() => confirmHire(hireConfirm.opp, hireConfirm.candidate)}>Confirmar contratação</Button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
function EmployerProfile({ employerProfile, onUpdateProfile, onChangePassword, onLogout }) {
    const [editOpen, setEditOpen] = useState(false);
    const [pwOpen, setPwOpen] = useState(false);
    return (
        <Card style={{ padding: 24, maxWidth: 560 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ width: 56, height: 56, borderRadius: 999, background: COLORS.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20 }}>
                    {employerProfile.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: COLORS.navy }}>{employerProfile.name}</div>
                    <div style={{ fontSize: 12.5, color: COLORS.ink, opacity: 0.7, display: "flex", alignItems: "center", gap: 5 }}><MapPin size={12} aria-hidden="true" /> {employerProfile.city}</div>
                    <Pill color={COLORS.navy} style={{ marginTop: 6 }}>{employerProfile.employerType}</Pill>
                </div>
                <Button variant="outline" icon={Edit3} onClick={() => setEditOpen(true)}>Editar perfil</Button>
            </div>
            <Section title="Sobre">
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: COLORS.ink, opacity: employerProfile.bio ? 1 : 0.6 }}>
                    {employerProfile.bio || "Você ainda não escreveu uma descrição. Clique em 'Editar perfil' para adicionar."}
                </p>
            </Section>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                <Button variant="outline" icon={Lock} onClick={() => setPwOpen(true)}>Trocar senha</Button>
                <Button variant="ghost" icon={LogOut} onClick={onLogout}>Sair da conta</Button>
            </div>
            {editOpen && <EditEmployerProfileModal employerProfile={employerProfile} onClose={() => setEditOpen(false)} onSubmit={async (data) => { await onUpdateProfile(data); setEditOpen(false); }} />}
            {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} onSubmit={async (current, next) => { await onChangePassword(current, next); setPwOpen(false); }} />}
        </Card>
    );
}
function EditEmployerProfileModal({ employerProfile, onClose, onSubmit }) {
    const [form, setForm] = useState({ name: employerProfile.name, cep: employerProfile.cep || "", city: employerProfile.city, bio: employerProfile.bio });
    const [cepLoading, setCepLoading] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const handleCepChange = async (raw) => {
        const masked = maskCep(raw);
        set("cep", masked);
        if (masked.replace(/\D/g, "").length === 8) {
            setCepLoading(true);
            const result = await fetchCep(masked);
            if (result) set("city", result.city);
            setCepLoading(false);
        }
    };
    const submit = () => {
        if (!form.name.trim() || !form.city.trim()) return;
        onSubmit({ name: form.name.trim(), cep: form.cep.trim(), city: form.city.trim(), bio: form.bio.trim() });
    };
    return (
        <Modal title="Editar perfil" onClose={onClose} width={520}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
                <div style={{ position: "relative" }}>
                    <div style={{ width: 64, height: 64, borderRadius: 999, background: COLORS.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 22 }}>
                        {(form.name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div style={{ position: "absolute", bottom: -2, right: -2, background: COLORS.amber, borderRadius: 999, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }} title="Sua foto usa as iniciais do nome">
                        <Camera size={12} color={COLORS.navy} aria-hidden="true" />
                    </div>
                </div>
            </div>
            <p style={{ fontSize: 11.5, color: COLORS.navy, opacity: 0.65, textAlign: "center", marginTop: -12, marginBottom: 16 }}>
                Sua foto de perfil é gerada automaticamente a partir das iniciais do nome.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div><label style={labelStyle} htmlFor="em-name">Nome / Empresa</label><input id="em-name" style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
                <div><label style={labelStyle} htmlFor="em-cep">CEP</label><input id="em-cep" style={inputStyle} inputMode="numeric" value={form.cep} onChange={(e) => handleCepChange(e.target.value)} maxLength={9} placeholder="00000-000" /></div>
                <div><label style={labelStyle} htmlFor="em-city">Cidade</label><input id="em-city" style={inputStyle} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder={cepLoading ? "Buscando cidade..." : ""} /></div>
                <div><label style={labelStyle} htmlFor="em-bio">Sobre</label><textarea id="em-bio" style={{ ...inputStyle, minHeight: 80 }} value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="Conte um pouco sobre sua empresa ou sobre você..." /></div>
                <Button variant="primary" full onClick={submit}>Salvar alterações</Button>
            </div>
        </Modal>
    );
}
function EmployerOppCard({ opp, onManage, onDelete }) {
    const status = vagaStatus(opp.slotsTotal, opp.slotsFilled);
    return (
        <Card style={{ padding: 18, borderLeft: `4px solid ${status.color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                    <Pill color={COLORS.navy}>{opp.category}</Pill> <ModalityPill modality={opp.modality} />
                    <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: COLORS.navy, margin: "6px 0" }}>{opp.title}</div>
                    <Row icon={MapPin} text={opp.city} />
                    <Row icon={Calendar} text={fmtDate(opp.date)} />
                    <Row icon={Clock} text={`${opp.start} às ${opp.end}`} />
                </div>
                <div className="cl-meter" style={{ width: 160, flexShrink: 0 }}><VagaMeter total={opp.slotsTotal} filled={opp.slotsFilled} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                <Button variant="dark" onClick={onManage}>Ver candidatos</Button>
                <Button variant="danger" icon={Trash2} onClick={onDelete}>Apagar vaga</Button>
                {opp.pendingCount > 0 && <Pill color={COLORS.amberDark}>{opp.pendingCount} novo(s) interessado(s)</Pill>}
            </div>
        </Card>
    );
}
function CandidatesPanel({ opportunities, activeOpp, setSelectedOpp, candidates, onReject, onAttemptHire, onChat }) {
    const opp = activeOpp;
    const status = vagaStatus(opp.slotsTotal, opp.slotsFilled);
    return (
        <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
                {opportunities.map((o) => (
                    <button key={o.id} type="button" onClick={() => setSelectedOpp(o)} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 999, border: `1.5px solid ${opp.id === o.id ? COLORS.navy : COLORS.line}`, background: opp.id === o.id ? COLORS.navy : "#fff", color: opp.id === o.id ? "#fff" : COLORS.navy, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{o.title}</button>
                ))}
            </div>
            <Card style={{ padding: 14, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div style={{ fontSize: 13, color: COLORS.navy }}>Candidatos para <b>{opp.title}</b></div>
                <div className="cl-meter" style={{ width: 180 }}><VagaMeter total={opp.slotsTotal} filled={opp.slotsFilled} compact /></div>
            </Card>
            {candidates.length === 0 && <EmptyState text="Ainda não há candidatos interessados nesta oportunidade." />}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {candidates.map((c) => (
                    <Card key={c.freelancerId} style={{ padding: 16 }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                            <div style={{ width: 42, height: 42, borderRadius: 999, background: COLORS.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                                {c.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 14.5 }}>{c.name}</div>
                                <div style={{ fontSize: 12, opacity: 0.7, display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}><MapPin size={11} aria-hidden="true" /> {c.city}</div>
                                <div style={{ fontSize: 13, color: COLORS.ink, background: COLORS.cream, padding: "8px 10px", borderRadius: 8, marginBottom: 8, overflowWrap: "anywhere" }}>"{c.message}"</div>
                                {c.status === "pendente" && (
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                        <Button variant="primary" onClick={() => onAttemptHire(opp, c)} disabled={status.key === "preenchida"}>Contratar</Button>
                                        <Button variant="ghost" icon={MessageCircle} onClick={() => onChat(opp, c)}>Conversar</Button>
                                        <Button variant="outline" onClick={() => onReject(opp.id, c.freelancerId)}>Recusar</Button>
                                    </div>
                                )}
                                {c.status !== "pendente" && <Pill color={c.status === "contratado" ? COLORS.teal : COLORS.red}>{c.status === "contratado" ? "Contratado" : c.status === "retirado" ? "Retirado" : "Recusado"}</Pill>}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
// ---------------------------------------------------------------------------
// CHAT (contratante) — Firestore: um único listener (api.listenToChat) entrega
// o histórico e as mensagens novas em tempo real.
// ---------------------------------------------------------------------------
function EmployerChatPanel({ conversations, active, setActive, unread = {} }) {
    const [text, setText] = useState("");
    const [msgs, setMsgs] = useState([]);
    useEffect(() => {
        if (!active) return;
        const unsubscribe = api.listenToChat(active.opp.id, active.cand.freelancerId, setMsgs);
        return () => unsubscribe();
    }, [active?.opp?.id, active?.cand?.freelancerId]);
    if (conversations.length === 0) return <EmptyState text="Nenhuma conversa disponível. O chat é liberado quando um freelancer demonstra interesse." />;
    if (!active) return <EmptyState text="Selecione uma conversa." />;
    const send = async () => {
        if (!text.trim()) return;
        await api.sendChatMessage(active.opp.id, active.cand.freelancerId, "contratante", text);
        setText("");
    };
    return (
        <div className="cl-chat" style={{ display: "flex", gap: 14, height: 480 }}>
            <div className="cl-chat-list" style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
                {conversations.map((c) => {
                    const isActive = active.cand.freelancerId === c.cand.freelancerId && active.opp.id === c.opp.id;
                    return (
                        <button key={c.key} type="button" onClick={() => setActive(c)} style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                            textAlign: "left", padding: 10, borderRadius: 10, cursor: "pointer",
                            background: isActive ? COLORS.navy : "#fff",
                            color: isActive ? "#fff" : COLORS.navy,
                            fontSize: 12.5, fontWeight: 600, border: `1px solid ${COLORS.line}`,
                        }}>
                            <span>
                                {c.cand.name}
                                <span style={{ display: "block", fontSize: 10.5, opacity: 0.8, fontWeight: 400 }}>{c.opp.title}</span>
                            </span>
                            {unread[c.key] && <span role="img" aria-label="Mensagem nova" style={{ width: 10, height: 10, borderRadius: 999, background: COLORS.red, flexShrink: 0 }} />}
                        </button>
                    );
                })}
            </div>
            <Card style={{ flex: 1, display: "flex", flexDirection: "column", padding: 14 }}>
                <div style={{ borderBottom: `1px solid ${COLORS.line}`, paddingBottom: 10, marginBottom: 10, fontWeight: 700, color: COLORS.navy, fontSize: 14 }}>
                    {active.cand.name} <span style={{ opacity: 0.6, fontWeight: 400 }}> · {active.opp.title}</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                    {msgs.length === 0 && <div style={{ fontSize: 12.5, opacity: 0.6, color: COLORS.navy }}>💬 Envie uma mensagem para iniciar a conversa.</div>}
                    {msgs.map((m, i) => (
                        <div key={i} style={{ alignSelf: m.from === "contratante" ? "flex-end" : "flex-start", background: m.from === "contratante" ? COLORS.amber : COLORS.cream, padding: "8px 12px", borderRadius: 12, maxWidth: "75%", fontSize: 13.5, color: COLORS.ink, overflowWrap: "anywhere" }}>{m.text}</div>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <input style={inputStyle} aria-label="Mensagem" placeholder="Escreva uma mensagem..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
                    <Button variant="dark" icon={Send} onClick={send} ariaLabel="Enviar mensagem" />
                </div>
            </Card>
        </div>
    );
}
function PostOpportunityModal({ onClose, onSubmit }) {
    const [form, setForm] = useState({
        title: "", description: "", category: CATEGORIES[0], modality: "presencial", cep: "", city: "Contagem, MG", date: todayPlus(3),
        start: "08:00", end: "17:00", slotsTotal: 1, payType: "combinar", payAmount: "", requirements: "", activities: "",
    });
    const [cepLoading, setCepLoading] = useState(false);
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const handleCepChange = async (raw) => {
        const masked = maskCep(raw);
        set("cep", masked);
        if (masked.replace(/\D/g, "").length === 8) {
            setCepLoading(true);
            const result = await fetchCep(masked);
            if (result) set("city", result.city);
            setCepLoading(false);
        }
    };
    const submit = () => {
        if (!form.title.trim()) return;
        onSubmit({ ...form, slotsTotal: Number(form.slotsTotal), distanceKm: 0 });
    };
    return (
        <Modal title="Publicar oportunidade" onClose={onClose} width={560}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div><label style={labelStyle} htmlFor="po-title">Título da oportunidade</label><input id="po-title" style={inputStyle} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex: Garçom para evento corporativo" /></div>
                <div><label style={labelStyle} htmlFor="po-desc">Descrição detalhada</label><textarea id="po-desc" style={{ ...inputStyle, minHeight: 70 }} value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
                <div className="cl-grid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={labelStyle} htmlFor="po-cat">Tipo de serviço</label>
                        <select id="po-cat" style={inputStyle} value={form.category} onChange={(e) => set("category", e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                    </div>
                    <div><label style={labelStyle} htmlFor="po-cep">CEP</label><input id="po-cep" style={inputStyle} inputMode="numeric" value={form.cep} onChange={(e) => handleCepChange(e.target.value)} maxLength={9} placeholder="00000-000" /></div>
                    <div><label style={labelStyle} htmlFor="po-city">Local</label><input id="po-city" style={inputStyle} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder={cepLoading ? "Buscando cidade..." : ""} /></div>
                    <div><label style={labelStyle} htmlFor="po-date">Data</label><input id="po-date" type="date" style={inputStyle} value={form.date} onChange={(e) => set("date", e.target.value)} /></div>
                    <div><label style={labelStyle} htmlFor="po-slots">Profissionais necessários</label><input id="po-slots" type="number" inputMode="numeric" min={1} style={inputStyle} value={form.slotsTotal} onChange={(e) => set("slotsTotal", e.target.value)} /></div>
                    <div><label style={labelStyle} htmlFor="po-start">Horário inicial</label><input id="po-start" type="time" style={inputStyle} value={form.start} onChange={(e) => set("start", e.target.value)} /></div>
                    <div><label style={labelStyle} htmlFor="po-end">Horário final</label><input id="po-end" type="time" style={inputStyle} value={form.end} onChange={(e) => set("end", e.target.value)} /></div>
                </div>
                <div>
                    <div style={labelStyle}>Modalidade</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {[["presencial", "Presencial"], ["remoto", "Home office"]].map(([v, l]) => (
                            <button key={v} type="button" aria-pressed={form.modality === v} onClick={() => set("modality", v)} style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", border: `1.5px solid ${form.modality === v ? COLORS.navy : COLORS.line}`, background: form.modality === v ? COLORS.navy : "#fff", color: form.modality === v ? "#fff" : COLORS.navy }}>{l}</button>
                        ))}
                    </div>
                </div>
                <div>
                    <div style={labelStyle}>Pagamento</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                        {[["valor", "Informar valor"], ["combinar", "A combinar"], ["nao", "Não informar"]].map(([v, l]) => (
                            <button key={v} type="button" aria-pressed={form.payType === v} onClick={() => set("payType", v)} style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12.5, cursor: "pointer", border: `1.5px solid ${form.payType === v ? COLORS.navy : COLORS.line}`, background: form.payType === v ? COLORS.navy : "#fff", color: form.payType === v ? "#fff" : COLORS.navy }}>{l}</button>
                        ))}
                    </div>
                    {form.payType === "valor" && <input style={inputStyle} aria-label="Valor do pagamento" placeholder="Ex: R$ 180,00 por diária" value={form.payAmount} onChange={(e) => set("payAmount", e.target.value)} />}
                </div>
                <div><label style={labelStyle} htmlFor="po-req">Requisitos (separados por vírgula)</label><input id="po-req" style={inputStyle} value={form.requirements} onChange={(e) => set("requirements", e.target.value)} placeholder="Pontualidade, boa comunicação..." /></div>
                <div><label style={labelStyle} htmlFor="po-act">Atividades que serão realizadas</label><textarea id="po-act" style={{ ...inputStyle, minHeight: 60 }} value={form.activities} onChange={(e) => set("activities", e.target.value)} /></div>
                <Button variant="primary" full onClick={submit}>Publicar oportunidade</Button>
            </div>
        </Modal>
    );
}