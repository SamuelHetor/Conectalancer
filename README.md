# ConectaLancer — design completo + banco de dados MySQL

Este pacote junta o **visual e todas as telas do seu protótipo em PDF**
(login/cadastro, filtros, candidaturas, contratação com verificação de
conflito de agenda, chat, notificações, perfil editável, histórico etc.)
com a **integração ao MySQL** que estava no seu outro arquivo (fetch para
`http://localhost:5000/api/...`).

Nada foi inventado na aparência: cores, fontes, cards, modais e fluxo de
telas são os mesmos do PDF. O que mudou foi a origem dos dados — antes em
memória (`useState` com valores mock), agora persistidos no banco.

## Estrutura

```
conectalancer/
├── backend/
│   ├── schema.sql          → cria o banco e as tabelas + contas de demo
│   ├── server.js           → API Express (todas as rotas)
│   ├── package.json
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx          → todo o design do PDF, agora ligado à API
    │   ├── api.js           → funções fetch para cada rota do backend
    │   ├── main.jsx
    │   └── index.css
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## 1. Banco de dados

Crie o banco a partir do `schema.sql` (ele já cria o database
`conectalancer` e insere as contas de demonstração):

```bash
mysql -u root -p < backend/schema.sql
```

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env     # ajuste usuário/senha do MySQL se necessário
npm run dev               # ou: npm start
```

A API sobe em `http://localhost:5000`.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

O Vite normalmente sobe em `http://localhost:5173`.

## Contas de demonstração (já cadastradas pelo schema.sql)

- **Freelancer:** carlos@exemplo.com / 123456
- **Contratante:** buffet@exemplo.com / 123456
- **Admin** (alterna entre as duas visões pelo botão "Ver como"):
  admin@conectalancer.com / admin123

## O que foi conectado ao banco

- **Login / Cadastro / Troca de senha / Esqueci minha senha** → tabela `users`
- **Publicar, listar e filtrar oportunidades** → tabela `opportunities`
- **Demonstrar interesse, retirar interesse, recusar** → tabela `candidates`
- **Contratar** (com verificação real de conflito de horário consultando a
  agenda do freelancer no banco) e **cancelar contratação** → `candidates`
  + `agenda` + `opportunities.vagas_preenchidas`
- **Agenda e histórico do freelancer** → tabela `agenda` (histórico é
  calculado automaticamente: qualquer compromisso com data já passada)
- **Chat** por oportunidade/freelancer → tabela `messages`
- **Notificações** → tabela `notifications`
- **Edição de perfil** (freelancer e contratante) → tabela `users`

## Observação sobre segurança

Este é um protótipo funcional: as senhas ficam em texto puro no banco e o
"esqueci minha senha" apenas devolve a senha na tela (do jeito que já
estava no design original). Antes de qualquer uso real, troque isso por
hash de senha (bcrypt) e um fluxo de recuperação por e-mail de verdade.
