# Blueprint - Simulador Facil Imob

Este documento descreve o projeto **Simulador Facil Imob** em detalhes suficientes para replicacao por outra IA, outro desenvolvedor ou outro ambiente.

## 1. Visao Geral

**Nome do projeto:** Simulador Facil Imob  
**Objetivo:** aplicacao interna para colaboradores simularem garantia de aluguel com duas opcoes: `Com FCI` e `Sem FCI`.

O sistema permite:

- Login interno sem senha via codigo OTP por e-mail.
- Simulacao de garantia com taxas configuraveis.
- Comparacao entre `Com FCI` e `Sem FCI`.
- Geracao de Pix copia e cola e QR Code.
- Salvamento de simulacoes em historico.
- Exportacao em PDF, JPEG e impressao.
- Gerenciamento de colaboradores por area administrativa.
- Exclusao de registros individuais ou de todo o historico.

## 2. Stack

- Node.js
- Express
- Supabase Auth
- Supabase Postgres
- HTML, CSS e JavaScript vanilla
- express-session
- html2canvas
- jsPDF
- pix-utils
- qrcode
- Render para hospedagem

## 3. Estrutura De Pastas

```text
.
├─ package.json
├─ render.yaml
├─ BLUEPRINT.md
├─ public/
│  ├─ index.html
│  ├─ login.html
│  ├─ historico.html
│  ├─ settings.html
│  ├─ admin.html
│  ├─ assets/
│  │  ├─ favicon.png
│  │  ├─ logo-facilimob.png
│  │  ├─ logo-facilimob-full-cropped.png
│  │  └─ logo-facilimob-horizontal-cropped.png
│  ├─ css/
│  │  └─ styles.css
│  └─ js/
│     ├─ api.js
│     ├─ app.js
│     ├─ login.js
│     ├─ history.js
│     ├─ settings.js
│     ├─ admin.js
│     ├─ summary.js
│     ├─ export.js
│     └─ layout.js
├─ server/
│  ├─ index.js
│  ├─ supabaseAdmin.js
│  ├─ middleware/
│  │  └─ auth.js
│  ├─ routes/
│  │  ├─ auth.js
│  │  ├─ admin.js
│  │  ├─ config.js
│  │  └─ simulations.js
│  └─ scripts/
│     ├─ migrate.js
│     ├─ check-db.js
│     └─ create-user.js
└─ supabase/
   └─ migration.sql
```

## 4. Dependencias

```json
{
  "@supabase/supabase-js": "^2.45.4",
  "cookie-parser": "^1.4.6",
  "dotenv": "^16.4.5",
  "express": "^4.19.2",
  "express-session": "^1.19.0",
  "html2canvas": "^1.4.1",
  "jspdf": "^4.2.1",
  "pg": "^8.12.0",
  "pix-utils": "^2.8.2",
  "qrcode": "^1.5.4"
}
```

Scripts:

```json
{
  "start": "node server/index.js",
  "dev": "node --watch server/index.js",
  "migrate": "node server/scripts/migrate.js",
  "create-user": "node server/scripts/create-user.js"
}
```

## 5. Variaveis De Ambiente

Usar localmente no `.env` e em producao no Render:

```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=uma_string_longa_segura

SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

DATABASE_URL=postgresql://...
```

Nunca expor no frontend:

- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- tokens da Supabase Management API
- senha SMTP

## 6. Backend Express

Arquivo principal: `server/index.js`.

Responsabilidades:

- Carregar variaveis com `dotenv`.
- Configurar `express.json`.
- Configurar `cookie-parser`.
- Configurar `express-session`.
- Servir arquivos estaticos de `public/`.
- Servir vendors:
  - `/vendor/html2canvas`
  - `/vendor/jspdf`
- Registrar rotas:
  - `/api/auth`
  - `/api/admin`
  - `/api/config`
  - `/api/simulations`

Sessao:

```js
session({
  name: 'facilimob.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7200000
  }
});
```

Importante:

- `rolling: true` renova a sessao a cada requisicao autenticada.
- `maxAge: 7200000` equivale a 2 horas de inatividade.
- `app.set('trust proxy', 1)` e necessario em producao no Render.

## 7. Banco De Dados

Arquivo: `supabase/migration.sql`.

### Tabela `settings`

```sql
create table if not exists public.settings (
  id integer primary key generated always as identity,
  taxa_com_fci numeric not null default 10,
  taxa_sem_fci numeric not null default 13,
  taxa_setup_padrao numeric not null default 0,
  pix_tipo_chave text not null default 'cpf',
  pix_chave text not null default '',
  pix_nome_recebedor text not null default '',
  pix_cidade text not null default '',
  pix_descricao_padrao text not null default 'Facil Imob',
  atualizado_em timestamptz not null default now()
);

insert into public.settings (id) overriding system value values (1)
on conflict (id) do nothing;
```

### Tabela `simulations`

```sql
create table if not exists public.simulations (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  cliente_nome text not null,
  cliente_cpf text not null,
  cliente_telefone text not null,
  cliente_email text not null,
  valor_aluguel numeric not null,
  taxa_setup_aplicada numeric not null,
  opcao_escolhida text not null check (opcao_escolhida in ('com_fci','sem_fci')),
  taxa_aplicada numeric not null,
  parcela_mensal numeric not null,
  total_primeiro_pagamento numeric not null,
  pix_payload text not null
);
```

### RLS

```sql
alter table public.settings enable row level security;
alter table public.simulations enable row level security;

create policy "authenticated read settings"
on public.settings for select
using (auth.role() = 'authenticated');

create policy "authenticated update settings"
on public.settings for update
using (auth.role() = 'authenticated');

create policy "authenticated read simulations"
on public.simulations for select
using (auth.role() = 'authenticated');

create policy "authenticated insert simulations"
on public.simulations for insert
with check (auth.role() = 'authenticated');
```

Observacao: exclusoes de historico sao feitas pelo backend com `supabaseAdmin`, usando `SERVICE_ROLE_KEY`.

## 8. Supabase Clients

Arquivo: `server/supabaseAdmin.js`.

Clientes:

- `supabaseAnon`: usa `SUPABASE_ANON_KEY`.
- `supabaseAdmin`: usa `SUPABASE_SERVICE_ROLE_KEY`.
- `userClient(accessToken)`: usa anon key com `Authorization: Bearer accessToken`.

Todos usam:

```js
auth: {
  persistSession: false,
  autoRefreshToken: false
}
```

## 9. Autenticacao

Login sem senha via OTP por e-mail.

### Solicitar codigo

Rota:

```text
POST /api/auth/request-code
```

Chamada Supabase:

```js
supabaseAnon.auth.signInWithOtp({
  email,
  options: {
    shouldCreateUser: false
  }
});
```

`shouldCreateUser: false` e obrigatorio para impedir cadastro publico.

### Verificar codigo

Rota:

```text
POST /api/auth/verify-code
```

Chamada Supabase:

```js
supabaseAnon.auth.verifyOtp({
  email,
  token,
  type: 'email'
});
```

Se correto, backend grava:

```js
req.session.accessToken = data.session.access_token;
req.session.refreshToken = data.session.refresh_token;
req.session.userId = data.user.id;
req.session.role = normalizeRole(data.user.app_metadata?.role);
```

### Logout

```text
POST /api/auth/logout
```

Destroi a sessao e limpa cookie `facilimob.sid`.

## 10. Middleware De Auth

Arquivo: `server/middleware/auth.js`.

Funcoes:

- `requireAuth`
- `requireAdmin`
- `pageAuth`

Paginas protegidas:

```text
/
/index.html
/historico.html
/settings.html
/admin.html
```

`/admin.html` exige `role: admin`.

Roles:

```text
admin
colaborador
```

O role e lido de:

```js
data.user.app_metadata?.role
```

## 11. Area Admin

Arquivo backend: `server/routes/admin.js`.  
Arquivo frontend: `public/js/admin.js`.  
Pagina: `public/admin.html`.

Funcionalidades:

- Listar colaboradores.
- Convidar colaborador.
- Definir papel: `admin` ou `colaborador`.
- Remover colaborador.

### Convite

Usa Supabase Invite, nao OTP:

```js
supabaseAdmin.auth.admin.inviteUserByEmail(email, {
  data: {
    nome,
    name: nome,
    role
  }
});
```

Depois salva metadados:

```js
supabaseAdmin.auth.admin.updateUserById(data.user.id, {
  user_metadata: { nome, name: nome, role },
  app_metadata: { role, nome }
});
```

## 12. Templates De E-mail Supabase

Existem dois fluxos separados.

### Convite

Campo:

```text
mailer_templates_invite_content
```

Usado por:

```js
inviteUserByEmail
```

Caracteristicas:

- E-mail de boas-vindas.
- Nao mostra codigo de 6 digitos.
- Pode conter link para `/login.html`.
- Explica que o colaborador deve acessar o sistema e informar o e-mail para receber codigo.

### Codigo De Acesso

Campo:

```text
mailer_templates_magic_link_content
```

Usado por:

```js
signInWithOtp
```

Caracteristicas:

- Mostra `{{ .Token }}` em destaque.
- Nao deve depender de `{{ .ConfirmationURL }}`.
- Fluxo principal e digitar codigo de 6 digitos na tela de login.

## 13. SMTP Supabase

Recomendado usar SMTP customizado para evitar limite baixo do envio padrao.

Exemplo:

```text
Host: smtp.resend.com
Port: 587
Username: resend
Sender email: noreply@dominio-verificado.com.br
Sender name: Facil Imob
```

Configurar via Supabase Management API ou painel.

## 14. Configuracoes Do Sistema

Rota:

```text
GET /api/config
PUT /api/config
```

Campos editaveis:

- `taxa_com_fci`
- `taxa_sem_fci`
- `taxa_setup_padrao`
- `pix_tipo_chave`
- `pix_chave`
- `pix_nome_recebedor`
- `pix_cidade`
- `pix_descricao_padrao`

Tela:

```text
public/settings.html
public/js/settings.js
```

## 15. Simulacao

Tela:

```text
public/index.html
public/js/app.js
```

Campos:

- nome completo
- CPF
- telefone
- e-mail
- valor mensal do aluguel

Opcoes:

- `Com FCI`
- `Sem FCI`

Comportamento:

- Ao clicar em `Simular`, se nenhuma opcao estiver selecionada, selecionar `Com FCI`.
- Ao clicar nos cards, atualizar todos os campos do resumo imediatamente.
- `selectedOption` e a fonte de verdade no frontend.

Formula:

```js
parcela_mensal = valor_aluguel * (taxa_aplicada / 100);
total_primeiro_pagamento = parcela_mensal + taxa_setup;
```

## 16. Geracao De Pix

Rota:

```text
POST /api/simulations
```

Backend:

- Busca `settings`.
- Valida dados Pix.
- Recalcula taxa e total no servidor.
- Gera Pix com `pix-utils`.
- Gera QR Code com `qrcode`.
- Salva registro na tabela `simulations`.

Pix:

```js
createStaticPix({
  merchantName: settings.pix_nome_recebedor,
  merchantCity: settings.pix_cidade,
  pixKey: settings.pix_chave,
  infoAdicional: description,
  transactionAmount: totalPrimeiroPagamento
});
```

## 17. Historico

Tela:

```text
public/historico.html
public/js/history.js
```

Funcionalidades:

- Listar simulacoes recentes.
- Buscar por nome ou CPF.
- Abrir drawer com detalhes.
- Copiar Pix.
- Exportar PDF.
- Exportar JPEG.
- Imprimir.
- Excluir uma simulacao.
- Limpar historico inteiro.

Rotas:

```text
GET    /api/simulations
GET    /api/simulations/:id
DELETE /api/simulations/:id
DELETE /api/simulations
```

## 18. Exportacao PDF, JPEG E Impressao

Fonte unica:

```text
public/js/summary.js
```

Exportacao:

```text
public/js/export.js
```

O mesmo componente gera:

- resumo na tela
- PDF
- JPEG
- impressao
- detalhes no historico
- resumo do modal de Pix

Layout do relatorio:

- Logo em `/assets/logo-facilimob.png`.
- Titulo `Simulacao de garantia`.
- Nome do cliente.
- Data.
- Responsavel.
- Dados do cliente:
  - CPF
  - telefone
  - aluguel mensal
- Cards lado a lado:
  - Com FCI
  - Sem FCI
- Tabela comparativa:
  - taxa aplicada
  - parcela mensal
  - taxa de setup
  - total do 1o pagamento
- Destaque da diferenca mensal.

PDF/JPEG:

```js
html2canvas(target, {
  scale: 2,
  backgroundColor: '#ffffff',
  useCORS: true
});
```

PDF:

```js
new jspdf.jsPDF('p', 'mm', 'a4');
```

Impressao:

- `printTarget(target)` clona o relatorio.
- Adiciona classe `printing-export`.
- Imprime apenas o relatorio.

## 19. UI E Identidade Visual

Paleta:

```text
Azul principal: #005da3
Azul hover: #004982
Laranja marca: #f4770b
Cinza texto: #25303b
Cinza secundario: #626c78
Fundo: #f7f8fa
```

Diretrizes:

- Visual sobrio.
- Sem gradientes.
- Sem efeitos glow/neon.
- Cards com raio pequeno.
- Layout operacional e limpo.
- Relatorios legiveis em preto e branco.
- Icones nos botoes de PDF, JPEG e impressao.

## 20. Paginas

### `login.html`

- Etapa 1: e-mail e botao `Enviar codigo`.
- Etapa 2: campo de codigo de 6 digitos e botao `Reenviar codigo`.
- Sem campo de e-mail na etapa 2.
- Sem botao `Entrar`; verifica automaticamente no 6o digito.

### `index.html`

- Formulario de simulacao.
- Cards `Com FCI` e `Sem FCI`.
- Resumo comparativo.
- Gerar Pix.
- Exportar PDF/JPEG por icones.
- Imprimir por icone.
- Nova simulacao.

### `historico.html`

- Busca.
- Tabela.
- Drawer de detalhes.
- Copiar Pix.
- PDF/JPEG/impressao por icones.
- Excluir registro.
- Limpar historico.

### `settings.html`

- Taxas.
- Setup.
- Configuracao Pix.

### `admin.html`

- Lista colaboradores.
- Convida colaborador.
- Remove colaborador.

## 21. Deploy Render

Tipo:

```text
Web Service
```

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Branch:

```text
main
```

Auto-deploy:

```text
Ativo a cada push na branch main
```

Variaveis obrigatorias no Render:

```env
NODE_ENV=production
SESSION_SECRET=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=...
```

## 22. Comandos Uteis

Instalar:

```bash
npm install
```

Rodar local:

```bash
npm run dev
```

Rodar producao local:

```bash
npm start
```

Migration:

```bash
npm run migrate
```

Criar admin inicial:

```bash
npm run create-user -- "Nome" email@dominio.com admin
```

Git:

```bash
git add .
git commit -m "mensagem"
git push origin main
```

## 23. Checklist De Replicacao

1. Criar projeto Supabase.
2. Configurar Supabase Auth.
3. Configurar SMTP customizado.
4. Criar templates de e-mail:
   - Invite
   - Magic Link/OTP
5. Aplicar `supabase/migration.sql`.
6. Criar `.env`.
7. Instalar dependencias.
8. Criar usuario admin inicial.
9. Subir codigo no GitHub.
10. Criar Web Service no Render.
11. Configurar variaveis no Render.
12. Testar login OTP.
13. Testar area admin.
14. Configurar taxas e Pix.
15. Fazer simulacao.
16. Gerar Pix.
17. Validar historico.
18. Validar PDF/JPEG/impressao.
19. Validar exclusao de historico.

## 24. Pontos Criticos

- `shouldCreateUser: false` no OTP e obrigatorio.
- Nunca usar `SERVICE_ROLE_KEY` no frontend.
- Role deve ficar em `app_metadata`.
- Convite usa `inviteUserByEmail`, nao `signInWithOtp`.
- Login usa `signInWithOtp`.
- Template de OTP deve conter `{{ .Token }}`.
- Template de OTP nao deve depender de `{{ .ConfirmationURL }}`.
- Template de convite nao deve mostrar codigo.
- Sessao usa `rolling: true`.
- Cookie em producao deve ser `secure: true`.
- Render precisa de `trust proxy`.
- Exportacao deve usar `summary.js` como fonte unica.
- Exclusao de historico usa backend com `supabaseAdmin`.

## 25. Atualizacoes Prioritarias Implementadas

### 25.1 Pix Por Modalidade

A tela de simulacao possui um seletor de modalidade para Pix:

```text
Com FCI
Sem FCI
```

Comportamento esperado:

- O resumo comparativo continua mostrando as duas modalidades.
- A modalidade ativa para Pix aparece destacada no resumo.
- O QR Code e o Pix copia e cola sao gerados apenas para a modalidade ativa.
- Ao alternar a modalidade com o modal de Pix aberto, o sistema chama:

```text
POST /api/simulations/pix-preview
```

Esse endpoint regenera o Pix sem criar novo registro no historico.

O botao `Gerar Pix` ainda salva a simulacao inicialmente usando:

```text
POST /api/simulations
```

Depois que uma simulacao ja foi salva, alternar modalidade apenas atualiza o Pix em tela.

### 25.2 Remocao Do Destaque Comparativo De Diferenca

O destaque textual de diferenca entre modalidades foi removido de:

- tela de resultado
- summary
- PDF
- JPEG
- impressao
- pagina compartilhada

O componente `public/js/summary.js` nao deve reintroduzir esse bloco.

### 25.3 Historico Com Filtros E Exclusao Em Massa

Tela:

```text
public/historico.html
public/js/history.js
```

Filtros disponiveis:

- busca por nome ou CPF
- data inicial
- data final
- modalidade (`Com FCI`, `Sem FCI`, todas)
- valor minimo do aluguel
- valor maximo do aluguel

Validacoes:

- data inicial nao pode ser maior que data final
- aluguel minimo nao pode ser maior que aluguel maximo
- modalidade deve ser `com_fci`, `sem_fci` ou vazia

Selecao em massa:

- checkbox por linha
- botao `Selecionar Todos`
- botao `Excluir Selecionados`
- modal de confirmacao mostrando a quantidade de registros selecionados

Rotas:

```text
DELETE /api/simulations/bulk
DELETE /api/simulations
DELETE /api/simulations/:id
```

Logs:

- exclusao selecionada registra `[simulations:bulk-delete]`
- limpeza total registra `[simulations:clear-history]`

### 25.4 Compartilhamento De Simulacao

Nova pagina publica:

```text
public/compartilhar.html
public/js/share.js
```

Nova rota:

```text
server/routes/share.js
```

Rotas:

```text
POST /api/share
GET  /api/share/:hash
POST /api/share/:hash/pix
```

Fluxo:

1. Colaborador simula normalmente.
2. Clica em `Compartilhar`.
3. Frontend codifica os dados nao sensiveis com `URLSearchParams`.
4. Backend gera hash com:

```js
crypto.createHash('sha256').digest('base64url')
```

5. Backend armazena os dados em `shared_simulations`.
6. Link gerado:

```text
/compartilhar.html?s=HASH
```

7. Cliente abre a pagina sem login.
8. Pagina valida o hash no backend.
9. Cliente escolhe `Com FCI` ou `Sem FCI`.
10. Backend gera Pix para a modalidade escolhida.

Seguranca:

- URL contem apenas hash.
- URL nao expoe e-mail, ID interno nem Pix key.
- Hash precisa existir no banco.
- Link expira em 7 dias.
- Geracao de links tem rate limit por usuario: 10 links por hora.

Tabela:

```sql
create table if not exists public.shared_simulations (
  id uuid primary key default gen_random_uuid(),
  share_hash text not null unique,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  criado_por uuid references auth.users(id),
  dados jsonb not null
);
```

Indices:

```sql
create index if not exists shared_simulations_share_hash_idx
on public.shared_simulations (share_hash);

create index if not exists shared_simulations_expira_em_idx
on public.shared_simulations (expira_em);
```

### 25.5 Deploy Apos Estas Alteracoes

Antes do deploy funcional, aplicar migration:

```bash
npm run migrate
```

Depois:

```bash
git add .
git commit -m "Add Pix modality, sharing and bulk history actions"
git push origin main
```

No Render, confirmar auto-deploy da branch `main`.
