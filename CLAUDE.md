# Munny — Gestor de Finanças Pessoais

> SPA single-file (HTML+CSS+JS vanilla) que ajuda brasileiros a controlar onde o dinheiro está indo, com sincronização entre dispositivos, calendário financeiro e experiência premium calma e orgânica.

---

## Stack (inegociável)

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + JavaScript vanilla, **tudo em um único `index.html`** (~10k linhas, ~290 KB) |
| Auth | Firebase Auth — somente Google sign-in |
| Banco | Firestore — 1 documento por usuário em `users/{uid}` (free tier) |
| Hosting | GitHub Pages, branch `main`, deploy automático a cada push |
| Persistência local | localStorage com chave `gfp_state_v2` + migração de v1 |
| Webhook de feedback | Google Apps Script (envia notas pra planilha do autor) |
| Tipografia | Inter via Google Fonts CDN, com tabular-nums em valores monetários |
| Ícones | SVG inline estilo Lucide na constante `ICONS` — **proibido emoji em ícones de UI** |

> **Regra absoluta:** zero build step, zero framework, zero bundler. Tudo é editável no `index.html` e funciona abrindo direto no navegador. Esse minimalismo é estratégico — manutenção fica simples e o app é portável.

---

## Arquitetura de Fluxo

```
Usuário abre o site (GitHub Pages)
  → Splash de 1.4s (cross-fade, NUNCA corte seco)
  → Carrega state do localStorage (gfp_state_v2)
  → Se logado no Firebase: subscribe em users/{uid} pra sync real-time
  → Renderiza aba ativa (preguiça: só renderiza a aba ativa)

Usuário adiciona despesa
  → Form valida e sanitiza input (safeText, filtro de chars perigosos)
  → state.expenses recebe entry
  → saveState() persiste em localStorage + dispara push pro Firestore
  → renderAll() recalcula painel, gráfico, summary tiles
  → Microcelebração: floating money + toast
  → Outros dispositivos do mesmo usuário recebem update via subscribe

Usuário fecha o mês
  → Move expenses + metadados pra state.history[YYYY-MM]
  → Saldo positivo opcional vai pra meta padrão
  → Reseta state.expenses
  → Push pro Firestore
```

---

## Fases do Projeto

| Fase | Descrição | Status |
|---|---|---|
| **Fase 1** | MVP local — categorias, despesas, painel, métodos 50/30/20 e 6 Potes | ✅ Concluída |
| **Fase 2** | Persistência avançada — metas, recorrentes, histórico mensal | ✅ Concluída |
| **Fase 3** | Cloud sync — Firebase Auth + Firestore com badge de status | ✅ Concluída |
| **Fase 4** | Experiência premium — 7 temas, calendário planner, gamificação, Cmd+K | ✅ Concluída |
| **Fase 5** | Refinamento de design — tema Linho (paleta orgânica), bottom nav mobile, segurança de inputs | 🚧 Em andamento |
| **Fase 6** | Mobile-first deep — PWA install, push notifications, swipe-to-delete, glassmorphism | ⏳ Pendente |
| **Fase 7** | Inteligência — categorização por IA, OCR de nota fiscal, voice input | ⏳ Pendente |

> **Histórico:** Projeto começou como ferramenta pessoal do autor (Luis Felipe, `felipe@a9p.com.br`). Decidiu-se manter single-file pra portabilidade. Migração de localStorage v1 → v2 tratada in-app. Adicionado Firebase quando virou multi-device.

---

## Detalhamento por Fase

### Fase 5 — Refinamento de Design (atual)
Objetivo: transformar o app de "template genérico de IA" em produto premium com identidade visual própria, calma e orgânica. Baseado em briefing de Designer Sênior (paleta inspirada em cerâmica/linho/sálvia, espaço negativo maximalista, tipografia dramática, spring physics).

**Critérios de aceite:**
- [x] Tema padrão "Linho" com paleta oat-milk + sálvia + terracota
- [x] Bottom Tab Bar + FAB no mobile (UX nativa)
- [x] Sombras tácteis com baixa opacidade (sensação de cerâmica)
- [x] Sanitização defensiva de inputs (XSS / SQL injection / chars perigosos em tempo real)
- [x] Máscara BRL em todos os inputs de valor
- [ ] Tipografia dramática nos saldos principais
- [ ] Divulgação progressiva no Painel (esconder detalhes em accordion)
- [ ] Spring physics aplicada em FAB, modal, bottom-nav

### Fase 6 — Mobile-first Deep (próxima)
PWA real com Service Worker, install prompt, push notifications via FCM, swipe-to-delete em despesas, pull-to-refresh, glassmorphism em cards.

**Métricas-alvo:**
- Lighthouse PWA score ≥ 90
- Cold start em 3G ≤ 2.5s
- Funciona 100% offline (cache + sync queue)

### Fase 7 — Inteligência (futura)
Recursos baseados em IA — cola extrato bancário e separar despesas, OCR de nota fiscal via Google Vision free tier, voice input via Web Speech API.

**Critérios de aceite (produto):**
- Usuário cola texto de extrato → IA identifica e classifica despesas
- Foto de nota fiscal vira despesa preenchida (valor + estabelecimento + sugestão de categoria)
- Comando de voz "gastei 150 no mercado" cria a despesa

---

## Estado Atual do Projeto

- **Fase ativa:** Fase 5 — Refinamento de Design (🚧 em andamento)
- **Fase 4 (anterior):** ✅ Concluída — combo Quick Wins (chips de categoria, reserva de emergência, 7 temas, commit `b4387bb`)
- **Próximos itens:** aplicar tipografia dramática nos saldos do Painel · divulgação progressiva (Painel mostra só KPIs críticos, expande pra detalhes)
- **Tarefas do sprint:** ver [`TASKS.md`](./TASKS.md)
- **Bugs conhecidos:** ver [`BUGS.md`](./BUGS.md)
- **Contexto de onboarding rápido:** ver [`HANDOFF.md`](./HANDOFF.md)

---

## Convenções

- Commits, comentários e PRs em **Português (pt-BR)**
- Código, nomes de variáveis e funções em **inglês** (excet labels visíveis pro usuário)
- Branches: `feat/`, `fix/`, `refactor/`, `chore/`, `style/`
- Variáveis sensíveis: Firebase config é público por design (regras Firestore restringem acesso por UID). Webhook URL hardcoded como default — testers contribuem pra mesma planilha do autor.
- Toda decisão de design relevante deve ser registrada como comentário inline no `index.html` ou em arquivo `.md` na raiz
- **Auto-deploy:** cada push em `main` republica o GitHub Pages em ~30s-1min. Não há staging.
- **Single-file:** novas features sempre dentro do `index.html`. Quem propor split em múltiplos arquivos: rejeitar.
