require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'segredo_padrao_mude_isso';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ─── BANCO DE DADOS ───────────────────────────────────────────────
const db = new Database('lucel.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    ativo INTEGER DEFAULT 0,
    expira_em TEXT DEFAULT NULL,
    criado_em TEXT DEFAULT (datetime('now'))
  );
`);

// ─── MIDDLEWARES ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MIDDLEWARE DE AUTH ───────────────────────────────────────────
function autenticar(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ erro: 'Não autenticado' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.usuario = payload;
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

function adminAuth(req, res, next) {
  const senha = req.headers['x-admin-password'];
  if (senha !== ADMIN_PASSWORD) return res.status(403).json({ erro: 'Acesso negado' });
  next();
}

// ─── ROTAS DE AUTH ────────────────────────────────────────────────

// Cadastro
app.post('/api/cadastrar', async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Dados incompletos' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha muito curta (mínimo 6 caracteres)' });

  try {
    const hash = await bcrypt.hash(senha, 10);
    db.prepare('INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)').run(nome, email.toLowerCase(), hash);
    res.json({ ok: true, msg: 'Conta criada! Aguarde liberação do acesso pelo administrador.' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ erro: 'E-mail já cadastrado' });
    res.status(500).json({ erro: 'Erro ao criar conta' });
  }
});

// Login
app.post('/api/entrar', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Dados incompletos' });

  const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ erro: 'E-mail ou senha incorretos' });

  const senhaOk = await bcrypt.compare(senha, user.senha_hash);
  if (!senhaOk) return res.status(401).json({ erro: 'E-mail ou senha incorretos' });

  if (!user.ativo) return res.status(403).json({ erro: 'Acesso ainda não liberado. Entre em contato com a Gráfica Lucel.' });

  // Verificar expiração
  if (user.expira_em) {
    const expira = new Date(user.expira_em);
    if (expira < new Date()) return res.status(403).json({ erro: 'Seu acesso expirou. Renove sua assinatura para continuar.' });
  }

  const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ ok: true, token, nome: user.nome, email: user.email, expira_em: user.expira_em });
});

// Verificar token (para checar na abertura do app)
app.get('/api/verificar', autenticar, (req, res) => {
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!user || !user.ativo) return res.status(403).json({ erro: 'Acesso revogado' });
  if (user.expira_em && new Date(user.expira_em) < new Date()) return res.status(403).json({ erro: 'Acesso expirado' });
  res.json({ ok: true, nome: user.nome, expira_em: user.expira_em });
});

// ─── PROXY ANTHROPIC ──────────────────────────────────────────────
app.post('/api/claude', autenticar, async (req, res) => {
  if (!ANTHROPIC_KEY) return res.status(500).json({ erro: 'API da Anthropic não configurada no servidor' });

  // Verificar acesso ativo
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!user || !user.ativo) return res.status(403).json({ erro: 'Acesso não autorizado' });
  if (user.expira_em && new Date(user.expira_em) < new Date()) return res.status(403).json({ erro: 'Acesso expirado' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao chamar API da Anthropic: ' + e.message });
  }
});

// ─── ROTAS ADMIN ──────────────────────────────────────────────────

// Listar usuários
app.get('/api/admin/usuarios', adminAuth, (req, res) => {
  const users = db.prepare('SELECT id, nome, email, ativo, expira_em, criado_em FROM usuarios ORDER BY criado_em DESC').all();
  res.json(users);
});

// Liberar acesso por 30 dias
app.post('/api/admin/liberar/:id', adminAuth, (req, res) => {
  const { id } = req.params;
  const dias = parseInt(req.body.dias) || 30;
  const expira = new Date();
  expira.setDate(expira.getDate() + dias);
  const expiraStr = expira.toISOString().slice(0, 10);
  db.prepare('UPDATE usuarios SET ativo = 1, expira_em = ? WHERE id = ?').run(expiraStr, id);
  res.json({ ok: true, expira_em: expiraStr });
});

// Revogar acesso
app.post('/api/admin/revogar/:id', adminAuth, (req, res) => {
  db.prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Excluir usuário
app.delete('/api/admin/usuario/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Alterar senha (admin)
app.post('/api/admin/senha/:id', adminAuth, async (req, res) => {
  const { nova_senha } = req.body;
  if (!nova_senha || nova_senha.length < 6) return res.status(400).json({ erro: 'Senha muito curta' });
  const hash = await bcrypt.hash(nova_senha, 10);
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ ok: true });
});

// Painel admin HTML (rota protegida por senha no front)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── INICIAR SERVIDOR ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✦ Lucel Livro rodando em http://localhost:${PORT}`);
  console.log(`✦ Painel admin em http://localhost:${PORT}/admin`);
  if (!ANTHROPIC_KEY) console.warn('⚠ ANTHROPIC_API_KEY não configurada no .env!');
});
