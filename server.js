require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'segredo_padrao_mude_isso';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_PASS = process.env.GMAIL_PASS || '';
const SITE_URL = process.env.SITE_URL || 'https://editoralucel.onrender.com';

const DB_PATH = path.join(__dirname, 'usuarios.json');
const LIVROS_PATH = path.join(__dirname, 'livros.json');

function lerDB() {
  try {
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ usuarios: [] }));
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch { return { usuarios: [] }; }
}
function salvarDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }
function buscarUsuario(email) { return lerDB().usuarios.find(u => u.email === email.toLowerCase()) || null; }
function buscarUsuarioPorId(id) { return lerDB().usuarios.find(u => u.id === id) || null; }
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

function lerLivros() {
  try {
    if (!fs.existsSync(LIVROS_PATH)) fs.writeFileSync(LIVROS_PATH, JSON.stringify({}));
    return JSON.parse(fs.readFileSync(LIVROS_PATH, 'utf8'));
  } catch { return {}; }
}
function salvarLivros(data) { fs.writeFileSync(LIVROS_PATH, JSON.stringify(data, null, 2)); }

async function enviarEmail(para, nome, expira_em) {
  if (!GMAIL_USER || !GMAIL_PASS) return;
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS }
    });
    const expiraFormatado = new Date(expira_em).toLocaleDateString('pt-BR');
    await transporter.sendMail({
      from: `"Grafica Lucel" <${GMAIL_USER}>`,
      to: para,
      subject: 'Seu acesso foi liberado — Grafica Lucel',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0f0d1a;color:#f0eeff;padding:40px;border-radius:16px">
        <h1 style="color:#a78bfa;font-size:24px;text-align:center">Grafica Lucel</h1>
        <h2>Ola, ${nome}!</h2>
        <p style="color:rgba(200,190,255,0.7);line-height:1.7">Seu acesso a plataforma de geracao de livros com IA foi liberado!</p>
        <div style="background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);border-radius:12px;padding:20px;margin:20px 0">
          <p style="margin:0 0 8px;font-weight:bold">Acesso valido ate: ${expiraFormatado}</p>
          <p style="margin:0;color:rgba(200,190,255,0.7)">Ate 10 livros completos com 12 capitulos cada</p>
        </div>
        <div style="text-align:center;margin:28px 0">
          <a href="${SITE_URL}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;text-decoration:none;padding:14px 40px;border-radius:30px;font-weight:bold;font-size:16px">Acessar agora</a>
        </div>
        <p style="color:rgba(200,190,255,0.5);font-size:13px;text-align:center">Entre com seu e-mail e senha cadastrados.<br>Duvidas? WhatsApp (11) 93496-4127</p>
      </div>`
    });
    console.log('E-mail enviado para:', para);
  } catch(e) { console.error('Erro e-mail:', e.message); }
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

function autenticar(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ erro: 'Nao autenticado' });
  try { req.usuario = jwt.verify(auth.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ erro: 'Token invalido' }); }
}

function adminAuth(req, res, next) {
  if (req.headers['x-admin-password'] !== ADMIN_PASSWORD) return res.status(403).json({ erro: 'Acesso negado' });
  next();
}

app.post('/api/cadastrar', async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ erro: 'Dados incompletos' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha muito curta' });
  try {
    if (buscarUsuario(email)) return res.status(400).json({ erro: 'E-mail ja cadastrado' });
    const hash = await bcrypt.hash(senha, 10);
    criarUsuario(nome, email, hash);
    res.json({ ok: true });
  } catch { res.status(500).json({ erro: 'Erro ao criar conta' }); }
});

app.post('/api/entrar', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'Dados incompletos' });
  const user = buscarUsuario(email);
  if (!user) return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
  const senhaOk = await bcrypt.compare(senha, user.senha_hash);
  if (!senhaOk) return res.status(401).json({ erro: 'E-mail ou senha incorretos' });
  if (!user.ativo) return res.status(403).json({ erro: 'Acesso ainda nao liberado. Entre em contato com a Grafica Lucel.' });
  if (user.expira_em && new Date(user.expira_em) < new Date()) return res.status(403).json({ erro: 'Seu acesso expirou. Renove sua assinatura.' });
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
  if (!ANTHROPIC_KEY) return res.status(500).json({ erro: 'API nao configurada' });
  const user = buscarUsuarioPorId(req.usuario.id);
  if (!user || !user.ativo) return res.status(403).json({ erro: 'Acesso nao autorizado' });
  if (user.expira_em && new Date(user.expira_em) < new Date()) return res.status(403).json({ erro: 'Acesso expirado' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(req.body)
    });
    res.json(await response.json());
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/livros', autenticar, (req, res) => {
  res.json(lerLivros()[req.usuario.id] || []);
});

app.post('/api/livros', autenticar, (req, res) => {
  const livros = lerLivros();
  livros[req.usuario.id] = req.body.livros || [];
  salvarLivros(livros);
  res.json({ ok: true });
});

app.get('/api/admin/usuarios', adminAuth, (req, res) => {
  const users = lerDB().usuarios.map(({ senha_hash, ...u }) => u).sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  res.json(users);
});

app.post('/api/admin/liberar/:id', adminAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const dias = parseInt(req.body.dias) || 30;
  const expira = new Date();
  expira.setDate(expira.getDate() + dias);
  const expiraStr = expira.toISOString().slice(0, 10);
  const user = atualizarUsuario(id, { ativo: true, expira_em: expiraStr });
  if (user) await enviarEmail(user.email, user.nome, expiraStr);
  res.json({ ok: true, expira_em: expiraStr, email: user?.email, nome: user?.nome });
});

app.post('/api/admin/revogar/:id', adminAuth, (req, res) => {
  atualizarUsuario(parseInt(req.params.id), { ativo: false });
  res.json({ ok: true });
});

app.delete('/api/admin/usuario/:id', adminAuth, (req, res) => {
  deletarUsuario(parseInt(req.params.id));
  res.json({ ok: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.listen(PORT, () => {
  console.log(`Lucel Livro rodando em http://localhost:${PORT}`);
  if (!ANTHROPIC_KEY) console.warn('ANTHROPIC_API_KEY nao configurada!');
  if (!GMAIL_USER) console.warn('GMAIL_USER nao configurado — e-mails desativados');
});
