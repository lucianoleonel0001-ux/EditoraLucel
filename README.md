# ✦ Escreva seu Livro — Gráfica Lucel

Sistema completo com backend seguro, login real, controle de acesso por 30 dias e painel admin.

---

## 📁 Estrutura do projeto

```
lucel-livro/
├── server.js          ← Backend Node.js (servidor principal)
├── package.json       ← Dependências
├── .env.example       ← Modelo de variáveis de ambiente
├── lucel.db           ← Banco de dados (criado automaticamente)
└── public/
    ├── index.html     ← App para os usuários
    └── admin.html     ← Painel admin (acesso em /admin)
```

---

## 🚀 Como rodar localmente (teste)

```bash
# 1. Instalar dependências
npm install

# 2. Criar o arquivo de configuração
cp .env.example .env

# 3. Editar o .env e colocar sua chave da Anthropic
nano .env   # ou abra no editor de texto

# 4. Iniciar o servidor
npm start

# Abrir no navegador:
# App: http://localhost:3000
# Admin: http://localhost:3000/admin
```

---

## ☁️ Deploy no Render (gratuito, recomendado)

### Passo a passo:

1. Crie uma conta em **render.com**

2. Crie um repositório no GitHub e suba este projeto:
   ```bash
   git init
   git add .
   git commit -m "primeiro commit"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/lucel-livro.git
   git push -u origin main
   ```

3. No Render, clique em **New → Web Service**

4. Conecte seu repositório GitHub

5. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node

6. Em **Environment Variables**, adicione:
   ```
   ANTHROPIC_API_KEY = sk-ant-sua-chave-aqui
   JWT_SECRET       = qualquer-string-aleatoria-longa-aqui
   ADMIN_PASSWORD   = sua-senha-admin-aqui
   ```

7. Clique em **Deploy** — em 2 minutos o site está no ar!

> ⚠️ No plano gratuito do Render, o banco SQLite é reiniciado quando o servidor dorme.
> Para produção com muitos usuários, considere o plano pago ($7/mês) ou migrar para PostgreSQL.

---

## ☁️ Deploy na Vercel (alternativa)

A Vercel é ótima para frontend, mas tem limitações para SQLite persistente.
Use o Render para este projeto.

---

## 🔧 Como usar o painel admin

1. Acesse `https://seusite.com/admin`
2. Digite a senha definida em `ADMIN_PASSWORD`
3. Você verá todos os usuários cadastrados
4. Quando um cliente pagar, clique em **▶ Liberar** e escolha 30 dias
5. O usuário já consegue fazer login imediatamente

---

## 💰 Fluxo de vendas sugerido

1. Cliente acessa o site e cria conta (fica como "Aguardando")
2. Você recebe o pagamento (PIX, WhatsApp, etc.)
3. Você entra no painel admin e libera o acesso por 30 dias
4. Depois de 30 dias, o acesso expira automaticamente
5. Para renovar, o cliente paga novamente e você libera mais 30 dias

---

## 🔑 Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `ANTHROPIC_API_KEY` | Sua chave da API da Anthropic (obrigatório) |
| `JWT_SECRET` | String secreta para tokens de login (obrigatório) |
| `ADMIN_PASSWORD` | Senha do painel admin (obrigatório) |
| `PORT` | Porta do servidor (padrão: 3000) |

---

## 📞 Suporte

Gráfica Lucel — WhatsApp (11) 93496-4127
