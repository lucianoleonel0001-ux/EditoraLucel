require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'segredo_padrao_mude_isso';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ─── BANCO DE DADOS (JSON simples) ───────────────────────────────
const DB_PATH = path.join(__dirname, 'usuarios.json');

function lerDB() {
  try {
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ usuarios: [] }));
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch { return { usuarios: [] }; }
}

function salvarDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function buscarUsuario(email) {
  const db = lerDB();
  return db.usuarios.find(u => u.email === email.toLowerCase()) || null;
}

function buscarUsuarioPorId(id) {
  const db = lerDB();
  return db.usuarios.find(u => u.id === id) || null;
}

function criarUsuario(nome, email, hash) {
  const db = lerDB();
  const id = Date.now();
  const novo = { id, nome, email: email.toLowerCase(), senha_hash: hash, ativo: false, expira_em: null, criado_em: new Date().toISOString() };
  db.usuarios.push(novo);
  salvarDB(db);
  return novo;
}

function atualizarUsuario(id, campos) {
  const db = lerDB();
  const idx = db.usuarios.findIndex(u => u.id === id);
  if (idx === -1) return null;
  db.usuarios[idx] = { ...db.usuarios[idx], ...campos };
  salvarDB(db);
  return db.usuarios[idx];
}

function deletarUsuario(id) {
  const db = lerDB();
  db.usuarios = db.usuarios.filter(u => u.id !== id);
  salvarDB(db);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.post('/api/cadastrar', async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Dados incompletos' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha muito curta (mínimo 6 caracteres)' });
  try {
    if (buscarUsuario(email)) return res.status(400).json({ erro: 'E-mail já cadastrado' });
    const hash = await bcrypt.hash(senha, 10);
    criarUsuario(nome, email, hash);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao criar conta' });
  }
});

app.post('/api/entrar', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Dados incompletos' });
  const user = buscarUsuario(email);
  if (!user) return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
  const senhaOk = await bcrypt.compare(senha, user.senha_hash);
  if (!senhaOk) return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
  if (!user.ativo) return res.status(403).json({ erro: 'Acesso ainda não liberado. Entre em contato com a Gráfica Lucel.' });
  if (user.expira_em && new Date(user.expira_em) < new Date()) return res.status(403).json({ erro: 'Seu acesso expirou. Renove sua assinatura para continuar.' });
  const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ ok: true, token, nome: user.nome, email: user.email, expira_em: user.expira_em });
});

app.get('/api/verificar', autenticar, (req, res) => {
  const user = buscarUsuarioPorId(req.usuario.id);
  if (!user || !user.ativo) return res.status(403).json({ erro: 'Acesso revogado' });
  if (user.expira_em && new Date(user.expira_em) < new Date()) return res.status(403).json({ erro: 'Acesso expirado' });
  res.json({ ok: true, nome: user.nome, expira_em: user.expira_em });
});

app.post('/api/claude', autenticar, async (req, res) => {
  if (!ANTHROPIC_KEY) return res.status(500).json({ erro: 'API da Anthropic não configurada' });
  const user = buscarUsuarioPorId(req.usuario.id);
  if (!user || !user.ativo) return res.status(403).json({ erro: 'Acesso não autorizado' });
  if (user.expira_em && new Date(user.expira_em) < new Date()) return res.status(403).json({ erro: 'Acesso expirado' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao chamar Anthropic: ' + e.message });
  }
});

app.get('/api/admin/usuarios', adminAuth, (req, res) => {
  const db = lerDB();
  const users = db.usuarios.map(({ senha_hash, ...u }) => u).sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  res.json(users);
});

app.post('/api/admin/liberar/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const dias = parseInt(req.body.dias) || 30;
  const expira = new Date();
  expira.setDate(expira.getDate() + dias);
  const expiraStr = expira.toISOString().slice(0, 10);
  atualizarUsuario(id, { ativo: true, expira_em: expiraStr });
  res.json({ ok: true, expira_em: expiraStr });
});

app.post('/api/admin/revogar/:id', adminAuth, (req, res) => {
  atualizarUsuario(parseInt(req.params.id), { ativo: false });
  res.json({ ok: true });
});

app.delete('/api/admin/usuario/:id', adminAuth, (req, res) => {
  deletarUsuario(parseInt(req.params.id));
  res.json({ ok: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`✦ Lucel Livro rodando em http://localhost:${PORT}`);
  if (!ANTHROPIC_KEY) console.warn('⚠ ANTHROPIC_API_KEY não configurada!');
});
