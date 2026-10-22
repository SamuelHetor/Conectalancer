//BACKEND
require("dotenv").config();
const express = require("express");
require("express-async-errors"); // captura erros de rotas async (evita o servidor cair)
const cors = require("cors");
const mysql = require("mysql2/promise");
const http = require("http");
const { Server } = require("socket.io");
const admin = require("firebase-admin");

// ------------------------------------------------------------
// FIREBASE ADMIN — valida os tokens que o front-end envia
// ------------------------------------------------------------
// FIREBASE_SERVICE_ACCOUNT_PATH aponta para o arquivo JSON baixado em
// Firebase Console → Configurações do projeto → Contas de serviço → Gerar nova chave.
// Esse arquivo NUNCA deve ir para o Git.
admin.initializeApp({
    credential: admin.credential.cert(require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)),
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(cors());
app.use(express.json());
const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "conectalancer",
    waitForConnections: true,
    connectionLimit: 10,
});
// Confere o token do Firebase enviado em "Authorization: Bearer <token>"
// e carrega a linha correspondente de `users` em req.user.
async function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Token não enviado." });
    let decoded;
    try {
        decoded = await admin.auth().verifyIdToken(token);
    } catch (err) {
        return res.status(401).json({ error: "Token inválido ou expirado." });
    }
    req.firebaseUid = decoded.uid;
    req.firebaseEmail = decoded.email;
    const [rows] = await pool.query("SELECT * FROM users WHERE firebase_uid = ?", [decoded.uid]);
    if (!rows.length) return res.status(404).json({ error: "Usuário sem cadastro no ConectaLancer." });
    req.user = serializeUser(rows[0]);
    next();
}
// Garante que o :id da rota é o próprio usuário autenticado
function requireSelf(paramName) {
    return (req, res, next) => {
        if (req.params[paramName] !== req.user.id)
            return res.status(403).json({ error: "Você não tem permissão para isso." });
        next();
    };
}
// Garante que a oportunidade :id existe e pertence ao usuário autenticado
async function requireOppOwner(req, res, next) {
    const [[opp]] = await pool.query("SELECT contratante_id FROM opportunities WHERE id = ?", [req.params.id]);
    if (!opp) return res.status(404).json({ error: "Oportunidade não encontrada." });
    if (opp.contratante_id !== req.user.id)
        return res.status(403).json({ error: "Só o contratante dono da vaga pode fazer isso." });
    next();
}
function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function toList(str) {
    return (str || "").split(",").map((s) => s.trim()).filter(Boolean);
}
function fromList(arr) {
    return Array.isArray(arr) ? arr.join(",") : (arr || "");
}
function overlaps(aStart, aEnd, bStart, bEnd) {
    const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    let as = toMin(aStart), ae = toMin(aEnd);
    let bs = toMin(bStart), be = toMin(bEnd);
    if (ae <= as) ae += 24 * 60;
    if (be <= bs) be += 24 * 60;
    return as < be && bs < ae;
}
function serializeUser(u) {
    if (!u) return null;
    return {
        id: u.id,
        email: u.email,
        name: u.name,
        cep: u.cep || "",
        city: u.city,
        tipo: u.tipo,
        isAdmin: !!u.is_admin,
        phoneVerified: !!u.phone_verified,
        bio: u.bio || "",
        skills: toList(u.skills),
        services: toList(u.services),
        availability: u.availability || "A combinar",
        employerType: u.employer_type || "Empresa",
    };
}
function serializeOpp(o) {
    return {
        id: o.id,
        contratanteId: o.contratante_id,
        title: o.titulo,
        description: o.descricao,
        category: o.categoria,
        modality: o.modalidade || "presencial",
        city: o.cidade,
        cep: o.cep || "",
        distanceKm: o.distancia_km,
        date: o.data_evento instanceof Date ? o.data_evento.toISOString().slice(0, 10) : o.data_evento,
        start: (o.hora_inicio || "").toString().slice(0, 5),
        end: (o.hora_fim || "").toString().slice(0, 5),
        slotsTotal: o.vagas_totais,
        slotsFilled: o.vagas_preenchidas,
        payType: o.tipo_pagamento,
        payAmount: o.valor_pagamento,
        requirements: toList(o.requisitos),
        activities: o.atividades,
        status: o.status,
        pendingCount: o.pending_count != null ? Number(o.pending_count) : undefined,
        employer: { id: o.contratante_id, name: o.employer_name, type: o.employer_type },
    };
}
// ------------------------------------------------------------
// AUTENTICAÇÃO
// ------------------------------------------------------------
// A senha, o login e a recuperação por e-mail passaram a ser do Firebase Auth.
// O front chama o Firebase direto (signInWithEmailAndPassword, sendPasswordResetEmail, etc.)
// e só fala com o backend para criar/ler o perfil correspondente no MySQL.

// Cria o perfil no MySQL para um usuário que acabou de se cadastrar no Firebase.
// Exige um token válido; usa o UID e o e-mail do próprio token, nunca do corpo da requisição.
app.post("/api/auth/register", async (req, res) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Token não enviado." });
    let decoded;
    try {
        decoded = await admin.auth().verifyIdToken(token);
    } catch {
        return res.status(401).json({ error: "Token inválido ou expirado." });
    }
    const { name, cep, city, tipo } = req.body;
    if (!name || !city || !tipo)
        return res.status(400).json({ error: "Preencha todos os campos." });
    if (!["freelancer", "contratante"].includes(tipo))
        return res.status(400).json({ error: "Tipo de conta inválido." });

    const [existing] = await pool.query("SELECT * FROM users WHERE firebase_uid = ?", [decoded.uid]);
    if (existing.length) return res.status(200).json(serializeUser(existing[0]));

    const id = uid("u");
    await pool.query(
        `INSERT INTO users (id, firebase_uid, email, name, cep, city, tipo, is_admin, phone_verified, bio, skills, services, availability, employer_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, FALSE, '', '', '', 'A combinar', ?)`,
        [id, decoded.uid, (decoded.email || "").toLowerCase(), name.trim(), cep || null, city.trim(), tipo, tipo === "contratante" ? "Empresa" : null]
    );
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    res.status(201).json(serializeUser(rows[0]));
});
// Devolve o perfil do usuário logado (o front chama isso depois do onAuthStateChanged)
app.get("/api/auth/me", requireAuth, async (req, res) => {
    res.json(req.user);
});
// ------------------------------------------------------------
// PERFIS
// ------------------------------------------------------------
app.get("/api/users/:id", async (req, res) => {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Usuário não encontrado." });
    res.json(serializeUser(rows[0]));
});
app.put("/api/freelancers/:id", requireAuth, requireSelf("id"), async (req, res) => {
    const { name, cep, city, bio, skills, services, availability } = req.body;
    await pool.query(
        `UPDATE users SET name=?, cep=?, city=?, bio=?, skills=?, services=?, availability=? WHERE id=?`,
        [name, cep || null, city, bio || "", fromList(skills), fromList(services), availability || "A combinar", req.params.id]
    );
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.params.id]);
    res.json(serializeUser(rows[0]));
});
app.put("/api/employers/:id", requireAuth, requireSelf("id"), async (req, res) => {
    const { name, cep, city, bio } = req.body;
    await pool.query(`UPDATE users SET name=?, cep=?, city=?, bio=? WHERE id=?`, [name, cep || null, city, bio || "", req.params.id]);
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.params.id]);
    res.json(serializeUser(rows[0]));
});
// Agenda + histórico de um freelancer
app.get("/api/freelancers/:id/agenda", requireAuth, requireSelf("id"), async (req, res) => {
    const [rows] = await pool.query(
        `SELECT a.*, DATE(a.data_evento) < CURDATE() AS is_past
     FROM agenda a WHERE a.freelancer_id = ? ORDER BY a.data_evento`,
        [req.params.id]
    );
    const agenda = [], history = [];
    for (const r of rows) {
        const item = {
            id: "ag_" + r.id,
            title: r.titulo,
            date: r.data_evento instanceof Date ? r.data_evento.toISOString().slice(0, 10) : r.data_evento,
            start: (r.hora_inicio || "").toString().slice(0, 5),
            end: (r.hora_fim || "").toString().slice(0, 5),
            location: r.local,
            opportunityId: r.opportunity_id,
        };
        (r.is_past ? history : agenda).push(item);
    }
    res.json({ agenda, history });
});
// ------------------------------------------------------------
// OPORTUNIDADES
// ------------------------------------------------------------
app.get("/api/opportunities", async (req, res) => {
    const { contratanteId, category, maxDistance, date } = req.query;
    let sql = `SELECT o.*, u.name AS employer_name, u.employer_type,
             (SELECT COUNT(*) FROM candidates c WHERE c.opportunity_id = o.id AND c.status = 'pendente') AS pending_count
             FROM opportunities o JOIN users u ON u.id = o.contratante_id WHERE 1=1`;
    const params = [];
    if (contratanteId) { sql += " AND o.contratante_id = ?"; params.push(contratanteId); }
    if (category && category !== "Todas") { sql += " AND o.categoria = ?"; params.push(category); }
    if (maxDistance) { sql += " AND o.distancia_km <= ?"; params.push(Number(maxDistance)); }
    if (date) { sql += " AND o.data_evento = ?"; params.push(date); }
    sql += " ORDER BY o.created_at DESC";
    const [rows] = await pool.query(sql, params);
    res.json(rows.map(serializeOpp));
});
app.get("/api/opportunities/:id", async (req, res) => {
    const [rows] = await pool.query(
        `SELECT o.*, u.name AS employer_name, u.employer_type
     FROM opportunities o JOIN users u ON u.id = o.contratante_id WHERE o.id = ?`,
        [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Oportunidade não encontrada." });
    res.json(serializeOpp(rows[0]));
});
app.post("/api/opportunities", requireAuth, async (req, res) => {
    if (req.user.tipo !== "contratante")
        return res.status(403).json({ error: "Só contratantes podem publicar oportunidades." });
    const b = req.body;
    const id = uid("op");
    await pool.query(
        `INSERT INTO opportunities
     (id, contratante_id, titulo, descricao, categoria, cidade, cep, distancia_km, data_evento,
      hora_inicio, hora_fim, vagas_totais, vagas_preenchidas, tipo_pagamento, valor_pagamento,
      requisitos, atividades, status, modalidade)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'aberta', ?)`,
        [
            id, req.user.id, b.title, b.description || "", b.category, b.city, b.cep || null,
            b.distanceKm || 0, b.date, b.start, b.end, Number(b.slotsTotal) || 1,
            b.payType || "combinar", b.payAmount || null, fromList(b.requirements), b.activities || "",
            ["presencial", "remoto"].includes(b.modality) ? b.modality : "presencial",
        ]
    );
    const [rows] = await pool.query(
        `SELECT o.*, u.name AS employer_name, u.employer_type
     FROM opportunities o JOIN users u ON u.id = o.contratante_id WHERE o.id = ?`,
        [id]
    );
    res.status(201).json(serializeOpp(rows[0]));
});
// Apagar uma vaga — só o contratante que a publicou.
// Candidaturas, agenda e mensagens somem junto (ON DELETE CASCADE no banco);
// quem estava interessado ou contratado recebe uma notificação antes.
app.delete("/api/opportunities/:id", requireAuth, requireOppOwner, async (req, res) => {
    const oppId = req.params.id;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[opp]] = await conn.query("SELECT titulo FROM opportunities WHERE id = ?", [oppId]);
        const [cands] = await conn.query(
            "SELECT freelancer_id FROM candidates WHERE opportunity_id = ? AND status IN ('pendente','contratado')",
            [oppId]
        );
        for (const c of cands) {
            await conn.query("INSERT INTO notifications (user_id, text) VALUES (?, ?)", [
                c.freelancer_id, `A vaga "${opp.titulo}" foi removida pelo contratante.`,
            ]);
        }
        await conn.query("DELETE FROM opportunities WHERE id = ?", [oppId]);
        await conn.commit();
        res.json({ ok: true });
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
});
// Candidatos de uma oportunidade (só o contratante dono vê)
app.get("/api/opportunities/:id/candidates", requireAuth, requireOppOwner, async (req, res) => {
    const [rows] = await pool.query(
        `SELECT c.*, u.name, u.city FROM candidates c JOIN users u ON u.id = c.freelancer_id
     WHERE c.opportunity_id = ? ORDER BY c.created_at`,
        [req.params.id]
    );
    res.json(rows.map((r) => ({
        freelancerId: r.freelancer_id,
        name: r.name,
        city: r.city,
        message: r.message,
        status: r.status,
    })));
});
// Demonstrar interesse (candidatar-se)
app.post("/api/opportunities/:id/apply", requireAuth, async (req, res) => {
    if (req.user.tipo !== "freelancer")
        return res.status(403).json({ error: "Só freelancers podem se candidatar." });
    const freelancerId = req.user.id;
    const { message } = req.body;
    const oppId = req.params.id;
    const [[opp]] = await pool.query("SELECT contratante_id, titulo FROM opportunities WHERE id = ?", [oppId]);
    if (!opp) return res.status(404).json({ error: "Oportunidade não encontrada." });
    await pool.query(
        `INSERT INTO candidates (opportunity_id, freelancer_id, message, status)
       VALUES (?, ?, ?, 'pendente')
       ON DUPLICATE KEY UPDATE message = VALUES(message), status = 'pendente'`,
        [oppId, freelancerId, message || ""]
    );
    await pool.query("INSERT INTO notifications (user_id, text) VALUES (?, ?)", [
        opp.contratante_id, `${req.user.name} demonstrou interesse na sua oportunidade "${opp.titulo}".`,
    ]);
    res.json({ ok: true });
});
app.post("/api/opportunities/:id/withdraw", requireAuth, async (req, res) => {
    await pool.query(
        "UPDATE candidates SET status = 'retirado' WHERE opportunity_id = ? AND freelancer_id = ?",
        [req.params.id, req.user.id]
    );
    res.json({ ok: true });
});
app.post("/api/opportunities/:id/reject", requireAuth, async (req, res) => {
    const { freelancerId } = req.body;
    const oppId = req.params.id;
    const [[opp]] = await pool.query("SELECT titulo, contratante_id FROM opportunities WHERE id = ?", [oppId]);
    if (!opp) return res.status(404).json({ error: "Oportunidade não encontrada." });
    if (opp.contratante_id !== req.user.id)
        return res.status(403).json({ error: "Só o contratante dono da vaga pode recusar." });
    await pool.query(
        "UPDATE candidates SET status = 'recusado' WHERE opportunity_id = ? AND freelancer_id = ?",
        [oppId, freelancerId]
    );
    await pool.query("INSERT INTO notifications (user_id, text) VALUES (?, ?)", [
        freelancerId, `Você foi recusado para a oportunidade "${opp.titulo}".`,
    ]);
    res.json({ ok: true });
});
// Verifica conflito de agenda antes de contratar
app.get("/api/opportunities/:id/check-conflict/:freelancerId", requireAuth, requireOppOwner, async (req, res) => {
    const { id, freelancerId } = req.params;
    const [[opp]] = await pool.query("SELECT * FROM opportunities WHERE id = ?", [id]);
    const [agendaRows] = await pool.query(
        "SELECT * FROM agenda WHERE freelancer_id = ? AND data_evento = ?",
        [freelancerId, opp.data_evento]
    );
    const oppStart = opp.hora_inicio.toString().slice(0, 5);
    const oppEnd = opp.hora_fim.toString().slice(0, 5);
    const clash = agendaRows.find((a) =>
        overlaps(a.hora_inicio.toString().slice(0, 5), a.hora_fim.toString().slice(0, 5), oppStart, oppEnd)
    );
    if (!clash) return res.json({ conflict: null });
    res.json({
        conflict: {
            title: clash.titulo,
            date: clash.data_evento instanceof Date ? clash.data_evento.toISOString().slice(0, 10) : clash.data_evento,
            start: clash.hora_inicio.toString().slice(0, 5),
            end: clash.hora_fim.toString().slice(0, 5),
            location: clash.local,
        },
    });
});
// Contratar um candidato (o aviso de conflito é mostrado no front antes de chegar aqui)
app.post("/api/opportunities/:id/hire", requireAuth, async (req, res) => {
    const oppId = req.params.id;
    const { freelancerId } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[opp]] = await conn.query("SELECT * FROM opportunities WHERE id = ? FOR UPDATE", [oppId]);
        if (!opp) throw new Error("Oportunidade não encontrada.");
        if (opp.contratante_id !== req.user.id) throw new Error("Só o contratante dono da vaga pode contratar.");
        if (opp.vagas_preenchidas >= opp.vagas_totais) throw new Error("Vaga já preenchida.");
        await conn.query(
            "UPDATE candidates SET status = 'contratado' WHERE opportunity_id = ? AND freelancer_id = ?",
            [oppId, freelancerId]
        );
        await conn.query("UPDATE opportunities SET vagas_preenchidas = vagas_preenchidas + 1 WHERE id = ?", [oppId]);
        await conn.query(
            `INSERT INTO agenda (freelancer_id, opportunity_id, titulo, data_evento, hora_inicio, hora_fim, local)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE titulo = VALUES(titulo)`,
            [freelancerId, oppId, opp.titulo, opp.data_evento, opp.hora_inicio, opp.hora_fim, opp.cidade]
        );
        await conn.query("INSERT INTO notifications (user_id, text) VALUES (?, ?)", [
            freelancerId, `🎉 Você foi contratado para "${opp.titulo}"!`,
        ]);
        await conn.query("INSERT INTO notifications (user_id, text) VALUES (?, ?)", [
            opp.contratante_id, `Freelancer contratado para "${opp.titulo}".`,
        ]);
        await conn.commit();
        res.json({ ok: true });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});
// Cancelar contratação (reabre a vaga)
app.post("/api/opportunities/:id/cancel-hire", requireAuth, async (req, res) => {
    const oppId = req.params.id;
    const { freelancerId, reason } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[opp]] = await conn.query("SELECT * FROM opportunities WHERE id = ? FOR UPDATE", [oppId]);
        if (!opp) throw new Error("Oportunidade não encontrada.");
        // o contratante dono da vaga ou o próprio freelancer contratado podem cancelar
        if (opp.contratante_id !== req.user.id && freelancerId !== req.user.id)
            throw new Error("Você não tem permissão para cancelar esta contratação.");
        await conn.query(
            "UPDATE candidates SET status = 'recusado' WHERE opportunity_id = ? AND freelancer_id = ?",
            [oppId, freelancerId]
        );
        await conn.query(
            "UPDATE opportunities SET vagas_preenchidas = GREATEST(0, vagas_preenchidas - 1) WHERE id = ?",
            [oppId]
        );
        await conn.query("DELETE FROM agenda WHERE freelancer_id = ? AND opportunity_id = ?", [freelancerId, oppId]);
        const suffix = reason ? ` Motivo: "${reason}"` : "";
        await conn.query("INSERT INTO notifications (user_id, text) VALUES (?, ?)", [
            freelancerId, `A contratação para "${opp.titulo}" foi cancelada. Vaga reaberta.${suffix}`,
        ]);
        await conn.query("INSERT INTO notifications (user_id, text) VALUES (?, ?)", [
            opp.contratante_id, `Contratação cancelada — vaga reaberta para "${opp.titulo}".${suffix}`,
        ]);
        await conn.commit();
        res.json({ ok: true });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message });
    } finally {
        conn.release();
    }
});
// Candidaturas de um freelancer (para saber o status em cada oportunidade)
app.get("/api/freelancers/:id/applications", requireAuth, requireSelf("id"), async (req, res) => {
    const [rows] = await pool.query(
        "SELECT opportunity_id, status FROM candidates WHERE freelancer_id = ?",
        [req.params.id]
    );
    res.json(rows.map((r) => ({ opportunityId: r.opportunity_id, status: r.status })));
});
// ------------------------------------------------------------
// NOTIFICAÇÕES
// ------------------------------------------------------------
app.get("/api/notifications/:userId", requireAuth, requireSelf("userId"), async (req, res) => {
    const [rows] = await pool.query(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC", [req.params.userId]
    );
    res.json(rows.map((n) => ({ id: n.id, text: n.text, read: !!n.is_read, time: n.created_at })));
});
// Marca todas as notificações do usuário como lidas (chamado ao abrir a aba de notificações)
app.post("/api/notifications/:userId/read", requireAuth, requireSelf("userId"), async (req, res) => {
    await pool.query("UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE", [req.params.userId]);
    res.json({ ok: true });
});
// ------------------------------------------------------------
// CHAT (legado em MySQL — o front-end atual usa Firestore, mas as rotas seguem disponíveis)
// ------------------------------------------------------------
// Confere se o usuário logado é um dos dois participantes desta conversa
async function requireChatParticipant(req, res, next) {
    const { oppId, freelancerId } = req.params;
    if (req.user.id === freelancerId) return next(); // é o próprio freelancer da conversa
    const [[opp]] = await pool.query("SELECT contratante_id FROM opportunities WHERE id = ?", [oppId]);
    if (opp && opp.contratante_id === req.user.id) return next(); // é o contratante dono da vaga
    return res.status(403).json({ error: "Você não participa desta conversa." });
}
app.get("/api/chats/:oppId/:freelancerId", requireAuth, requireChatParticipant, async (req, res) => {
    const [rows] = await pool.query(
        "SELECT * FROM messages WHERE opportunity_id = ? AND freelancer_id = ? ORDER BY created_at",
        [req.params.oppId, req.params.freelancerId]
    );
    res.json(rows.map((m) => ({ from: m.sender, text: m.text, time: m.created_at })));
});
app.post("/api/chats/:oppId/:freelancerId", requireAuth, requireChatParticipant, async (req, res) => {
    // o remetente é sempre o usuário logado, nunca um valor vindo do corpo
    const sender = req.user.id === req.params.freelancerId ? "freelancer" : "contratante";
    const { text } = req.body;
    await pool.query(
        "INSERT INTO messages (opportunity_id, freelancer_id, sender, text) VALUES (?, ?, ?, ?)",
        [req.params.oppId, req.params.freelancerId, sender, text]
    );
    io.emit("nova-mensagem", {
        opportunity_id: req.params.oppId,
        freelancer_id: req.params.freelancerId,
        sender,
        text,
        time: new Date(),
    });
    res.status(201).json({ ok: true });
});
// Lista todas as conversas de um contratante (para o painel de chat dele)
app.get("/api/employers/:id/conversations", requireAuth, requireSelf("id"), async (req, res) => {
    const [rows] = await pool.query(
        `SELECT DISTINCT c.opportunity_id, c.freelancer_id, o.titulo, u.name AS freelancer_name
     FROM candidates c
     JOIN opportunities o ON o.id = c.opportunity_id
     JOIN users u ON u.id = c.freelancer_id
     WHERE o.contratante_id = ?`,
        [req.params.id]
    );
    res.json(rows.map((r) => ({
        opportunityId: r.opportunity_id,
        freelancerId: r.freelancer_id,
        opportunityTitle: r.titulo,
        freelancerName: r.freelancer_name,
    })));
});
// ------------------------------------------------------------
// TRATAMENTO DE ERROS (precisa ficar DEPOIS de todas as rotas)
// ------------------------------------------------------------
app.use((err, req, res, next) => {
    console.error("ERRO NA ROTA:", req.method, req.originalUrl, "\n", err);
    res.status(500).json({ error: err.message || "Erro interno do servidor." });
});

process.on("unhandledRejection", (reason) => {
    console.error("Promise rejeitada sem tratamento:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("Exceção não capturada:", err);
});

// ------------------------------------------------------------
// INICIALIZAÇÃO
// ------------------------------------------------------------
const PORT = process.env.PORT || 5000;

console.log(`Tentando MySQL em ${process.env.DB_HOST || "localhost"}:${Number(process.env.DB_PORT) || 3306} com o usuário "${process.env.DB_USER || "root"}"`);
pool.query("SELECT @@port AS porta, @@version AS versao, CURRENT_USER() AS usuario")
    .then(([r]) => console.log("MySQL conectado ✅", r[0]))
    .catch((e) => console.error("Falha ao conectar no MySQL ❌", e.message));

// Prepara o banco: cria sozinho a coluna "modalidade" (presencial / home office) se ela ainda não existir
async function ensureSchema() {
    const [cols] = await pool.query(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opportunities' AND COLUMN_NAME = 'modalidade'"
    );
    if (!cols.length) {
        await pool.query("ALTER TABLE opportunities ADD COLUMN modalidade ENUM('presencial','remoto') NOT NULL DEFAULT 'presencial'");
        console.log("Coluna 'modalidade' criada na tabela opportunities ✅");
    }
}
ensureSchema().catch((e) => console.error("Falha ao preparar o banco ❌", e.message));

server.listen(PORT, () => {
    console.log(`ConectaLancer API rodando em http://localhost:${PORT}`);
});