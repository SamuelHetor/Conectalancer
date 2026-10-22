-- ============================================================
-- ConectaLancer — Schema MySQL (atualizado: login via Firebase Auth)
-- Use este arquivo apenas para criar um banco NOVO. O banco que você já usa
-- continua funcionando sem rodar nada daqui.
-- ============================================================
CREATE DATABASE IF NOT EXISTS conectalancer
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE conectalancer;

-- ------------------------------------------------------------
-- Usuários (freelancers e contratantes na mesma tabela)
-- A senha fica no Firebase Auth; aqui só o perfil, ligado pelo firebase_uid.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              VARCHAR(40)  PRIMARY KEY,
  firebase_uid    VARCHAR(128) NOT NULL UNIQUE,
  email           VARCHAR(190) NOT NULL UNIQUE,
  name            VARCHAR(190) NOT NULL,
  cep             VARCHAR(9),
  city            VARCHAR(190) NOT NULL,
  tipo            ENUM('freelancer','contratante') NOT NULL,
  is_admin        BOOLEAN      NOT NULL DEFAULT FALSE,

  -- campos específicos de freelancer
  phone_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
  bio             TEXT,
  skills          TEXT,                 -- lista separada por vírgula
  services        TEXT,                 -- lista separada por vírgula
  availability    VARCHAR(255),

  -- campo específico de contratante
  employer_type   VARCHAR(100) DEFAULT 'Empresa',

  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- Oportunidades publicadas por contratantes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opportunities (
  id               VARCHAR(40)  PRIMARY KEY,
  contratante_id   VARCHAR(40)  NOT NULL,
  titulo           VARCHAR(255) NOT NULL,
  descricao        TEXT,
  categoria        VARCHAR(100),
  modalidade       ENUM('presencial','remoto') NOT NULL DEFAULT 'presencial',
  cidade           VARCHAR(190),
  cep              VARCHAR(9),
  distancia_km     INT          NOT NULL DEFAULT 0,
  data_evento      DATE         NOT NULL,
  hora_inicio      TIME         NOT NULL,
  hora_fim         TIME         NOT NULL,
  vagas_totais     INT          NOT NULL DEFAULT 1,
  vagas_preenchidas INT         NOT NULL DEFAULT 0,
  tipo_pagamento   ENUM('valor','combinar','nao') NOT NULL DEFAULT 'combinar',
  valor_pagamento  VARCHAR(190),
  requisitos       TEXT,                -- lista separada por vírgula
  atividades       TEXT,
  status           VARCHAR(30)  NOT NULL DEFAULT 'aberta',
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contratante_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Candidaturas / interesses de freelancers em oportunidades
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS candidates (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  opportunity_id VARCHAR(40) NOT NULL,
  freelancer_id  VARCHAR(40) NOT NULL,
  message        TEXT,
  status         ENUM('pendente','contratado','recusado','retirado','cancelado')
                 NOT NULL DEFAULT 'pendente',
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_candidatura (opportunity_id, freelancer_id),
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
  FOREIGN KEY (freelancer_id)  REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Agenda do freelancer (gerada automaticamente ao ser contratado)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agenda (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  freelancer_id  VARCHAR(40) NOT NULL,
  opportunity_id VARCHAR(40) NOT NULL,
  titulo         VARCHAR(255),
  data_evento    DATE,
  hora_inicio    TIME,
  hora_fim       TIME,
  local          VARCHAR(190),
  UNIQUE KEY uniq_agenda (freelancer_id, opportunity_id),
  FOREIGN KEY (freelancer_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Notificações
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(40) NOT NULL,
  text       VARCHAR(500) NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Mensagens do chat em MySQL (legado: o front atual usa Firestore)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  opportunity_id VARCHAR(40) NOT NULL,
  freelancer_id  VARCHAR(40) NOT NULL,
  sender         ENUM('freelancer','contratante') NOT NULL,
  text           TEXT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
  FOREIGN KEY (freelancer_id)  REFERENCES users(id) ON DELETE CASCADE
);