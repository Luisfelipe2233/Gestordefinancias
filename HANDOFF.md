# 💰 Munny — Handoff de Contexto

> Cola esse arquivo no início de um novo chat pra continuar o projeto sem perder o pé.
> A versão atual está rodando em produção. Cada commit faz deploy automático.

---

## 🎯 PROJETO

**Nome:** Munny — gestor de finanças pessoais
**Tagline:** "Seu dinheiro, sob controle"
**Idioma:** Português brasileiro (PT-BR) — usuário é brasileiro
**Tipo:** Single Page App em **um único arquivo HTML** (CSS e JS inline)
**Atual:** ~10.000 linhas, ~290 KB

## 🌐 URLs

- **Site público:** https://luisfelipe2233.github.io/Gestordefinancias/
- **Repo GitHub:** https://github.com/Luisfelipe2233/Gestordefinancias
- **Planilha de feedback:** https://docs.google.com/spreadsheets/d/1h9H0oL52FQr9OhlH5kmg8UPcSFbXvQmpcnzzf7353g0/edit
- **Firebase Console:** https://console.firebase.google.com/project/munny-d72cd

## 📁 Arquivos locais

- **Pasta do projeto:** `C:\Users\Adm\Desktop\gestao-financeira\`
- **Arquivo principal:** `index.html` (TUDO está aqui)
- **README.md** e **.gitignore** também
- **Sistema operacional:** Windows (usa PowerShell pra comandos)

---

## 🛠 STACK TÉCNICA

| Componente | Tecnologia | Observação |
|---|---|---|
| **Frontend** | HTML+CSS+JS vanilla, **um arquivo só** | Sem build, sem framework |
| **Auth** | Firebase Auth (Google sign-in apenas) | Conta do dono: `felipe@a9p.com.br` |
| **Banco** | Firestore (`users/{uid}` 1 doc por usuário) | Free tier |
| **Hosting** | GitHub Pages (branch `main`, root) | Auto-deploy em push |
| **Fonte** | Inter (Google Fonts CDN) | tabular-nums em valores monetários |
| **Ícones** | SVG inline Lucide-style (constante `ICONS`) | Sem emojis em ícones de UI |
| **Persistência local** | localStorage chave `gfp_state_v2` | Migração de v1 já tratada |
| **Webhook notas** | Google Apps Script público (do autor) | Notas dos testers vão pra planilha dele |

### Firebase Config (público, já no código)
```js
const firebaseConfig = {
  apiKey: "AIzaSyAI5EOG5h616-GDATCMxOdGcdya6TTRAYw",
  authDomain: "munny-d72cd.firebaseapp.com",
  projectId: "munny-d72cd",
  storageBucket: "munny-d72cd.firebasestorage.app",
  messagingSenderId: "893434197602",
  appId: "1:893434197602:web:5746a33be558f14170433b",
  measurementId: "G-BXP39XGNNQ"
};
```

---

## 🚢 WORKFLOW DE DEPLOY

A cada feature: assistente edita `index.html`, faz commit e push, GitHub Pages publica em ~30s-1min.

Comando padrão (PowerShell):
```powershell
Set-Location "C:\Users\Adm\Desktop\gestao-financeira"
git add index.html
git commit -m "feat: descrição"
git push
```

**Nunca usar `--force-push` sem permissão explícita.**

---

## ✅ FEATURES JÁ IMPLEMENTADAS (em ordem cronológica)

### Estrutura base
- 4 abas originais (Painel, Despesas, Metas, Histórico) + nova aba **Calendário**
- Cada aba: render dedicada, só renderiza ao virar ativa
- Mobile responsive

### Painel
- Renda mensal + entradas extras (bônus, freela)
- 3 métodos: 50/30/20, 6 Potes, Personalizado
- Categorias customizáveis: cor, nome, porcentagem OU R$ fixo
- **Modo simples** (default) vs **avançado** (mostra mode-toggle %/R$, cadeado, atalhos)
- Cadeado por categoria — protege do "Ajustar pra 100%"
- Summary tiles (Renda, Total Gasto, Saldo) com countup animado
- **Card "Reserva de Emergência"** (calcula meses cobertos, status críticos→excelente)
- **Insights inteligentes** rotativos (9 tipos, auto-rotate 9s, navegação manual)
- Gráfico de pizza com top spender em destaque e mini-bars na legenda

### Despesas
- Form com calculadora inline (`100+50` → 150 com preview)
- Auto-sugestão de categoria (dicionário + aprendizado por uso)
- **Quick chips** das top 3 categorias mais usadas
- Despesas recorrentes (só lança quando dia chega)
- Busca + filtro por categoria + clear button
- Modal de editar/excluir despesa com data customizada

### Metas
- Cards com cor, nome, target, current, deadline
- Color picker customizado (popover)
- Marca meta padrão (recebe saldo ao fechar mês) — opt-in com checkbox
- Deposit inline + confete + toast ao bater meta
- Pulse animation em metas perto de 100%

### Histórico
- Lista de meses fechados com renda, gasto, sobra
- Modal de detalhe com breakdown por categoria
- Gráfico de barras comparativo (largura máx 120px por barra)

### Calendário (aba nova)
- **Heatmap mensal** com 5 níveis de intensidade
- Cells grandes (64px) mostrando dia + valor (`fmtBRLShort`)
- Stats inline em 1 linha (total, média, maior dia, ativos)
- Hoje marcado com bolinha + borda
- Navegação ◀ ▶ + botão "Hoje"
- **Detalhe full-width** abaixo quando seleciona dia
- **Padrão da semana** (colapsável) com mini-bars por dia da semana
- **AGENDAMENTOS:**
  - 7 tipos: Despesa, Conta, Aluguel, Salário (renda), Aniversário, Viagem, Evento
  - Cada tipo tem cor + ícone + isExpense/isIncome
  - Bolinhas coloridas embaixo do dia mostram agendamentos
  - Detalhe mostra agendamentos + despesas reais separados
  - Botão ✓ marca como pago → vira despesa real OU extra income
  - Banner "vence hoje" + toast inicial no boot

### Modais e Settings (Configurações)
- Menu drop com 8+ opções via ícone ⚙
- Modais: editar despesa, recorrente, meta, fechar mês, histórico, sync config, renomear device, **theme picker**, **schedule**
- **7 temas:** Claro, Escuro, Forest, Sunset, Ocean, Sakura, OLED
- Theme picker em modal com previews de swatches
- Export/Import backup JSON (com sanitizer robusto)
- Reset all data

### Sincronização
- Firebase Auth (Google sign-in)
- Firestore real-time sync entre dispositivos (PC ↔ celular)
- Webhook de notas pra Google Sheets (URL hardcoded como default — testers contribuem)
- Cloud sync badge no header (idle/syncing/ok/error)
- localStorage com fallback offline

### Visuais e Polimento
- **Inter** como fonte (tabular-nums em monetários)
- Microanimações em tudo (cards stagger, hover lift, countup, button press)
- Dark mode com glow refinado
- **Splash screen** com cross-fade puro 1.4s (sem corte seco — IMPORTANTE)
- Empty states ilustrados com SVG
- Microcelebrações (confete em metas, sparkles em theme toggle, floating money em add despesa)
- Toast com botão **↶ Desfazer** (5s) em deletes
- **Modo Stealth** (👁) — borra valores em R$ com `filter: blur(7px)`
- **Saudação por horário** no header (Bom dia/tarde/noite, Lipe)

### Gamificação
- 20 conquistas (icons SVG dentro de círculos gradiente)
- Streak de dias seguidos (badge 🔥 laranja no header)
- Modal "Conquistas e Stats" com progress + 4 stats cards
- Toast + sparkles quando desbloqueia conquista

### Power user
- **Cmd+K Command Palette** (Linear-style) com fuzzy search
  - Parsing natural: `150 mercado` → quick-add despesa
  - Comandos pra navegação, ações, settings, categorias
- Atalhos ESC, ↑↓ Enter

### Notas / Feedback (FAB no canto inferior direito)
- Bloco de notas pessoal com timestamp
- Sync com Google Sheets (URL hardcoded como default)
- Undo no delete
- Footer transparente: "Suas notas chegam ao autor"

---

## 💡 IDEIAS PENDENTES (em ordem de impacto/esforço)

### Quick wins
- 🥇 **Bottom Tab Bar + FAB no mobile** — UX nativa
- **Atalhos de teclado tipo Linear** (`g`+`p`, `?`, etc)
- **Glassmorphism** nos cards principais (visual iOS)
- **Swipe to delete** em despesas mobile
- **Pull-to-refresh**

### Médio esforço
- **Compartilhar mês como imagem** (Spotify Wrapped do dinheiro)
- **Comparativo mês a mês** automático (badges nas categorias)
- **Vista anual** do calendário (12 mini-meses)
- **Tags livres** nas despesas (#viagem, #trabalho)
- **Sub-categorias** (Lazer > Bar, Lazer > Cinema)
- **Treemap** alternativo à pizza
- **Dashboard reordenável** (drag & drop dos widgets)

### Ambiciosas (game changers)
- **Cole extrato bancário → IA separa** despesas
- **Voice input** (Web Speech API)
- **OCR da nota fiscal** (Google Vision API free tier)
- **Push notifications** reais (Firebase Cloud Messaging)
- **Categorias por sub-cliente/conta compartilhada**

### Polimento
- **Lembrete de revisão semanal** (sexta às 18h)
- **Dark mode segue sistema** (`prefers-color-scheme`)
- **Backup automático no Drive**
- **Service Worker** pra offline robusto
- **Modo desafio** ("essa semana sem gastar em Lazer")

### Evoluções do calendário
- **Recorrência em schedules** (todo mês dia 5)
- **Snooze** ("adiar 3 dias")
- **Importar Google Calendar**
- **Marcar dia como ⭐/💩** (auto-análise)
- **Heatmap por categoria** específica

---

## 🎨 ESTILO E PREFERÊNCIAS

### Comunicação
- Sempre **PT-BR**
- Usuário (Lipe) gosta de **respostas com estrutura visual** (headers, tabelas, emojis nos títulos)
- **Direto ao ponto**, mas com personalidade
- Sugerir próximos passos com **AskUserQuestion** quando faz sentido
- Confirmar com **AskUserQuestion** antes de decisões grandes ou ambíguas

### Código
- **Sem emojis em ícones de UI** — usa SVG inline (constante `ICONS`)
- **Animações sutis e fluidas** — usuário não gosta de "corte seco"
- Preferir **transições longas** (1-1.5s) em transições importantes (splash)
- Mobile-first: tudo precisa funcionar bem em tela pequena
- Tabular-nums em valores monetários (alinhamento de coluna)
- Acessibilidade: `prefers-reduced-motion`, contrast, ARIA labels
- Performance: só renderizar aba ativa, evitar reflow

### Lembretes específicos do usuário
- Usuário **não gostou de** redesigns que ficaram "grandes demais" (cards arejados na metodologia) → preferiu compacto
- Usuário **gosta** de visualizações premium (gráficos, heatmaps, gradientes)
- Usuário **valoriza** quando o app "se sente vivo" (microanimações, sparkles, confete em momentos certos)

---

## 🔐 SEGURANÇA E AUTENTICAÇÃO

- Firebase Auth (Google) é a fonte de verdade
- Firestore rules: usuário só lê/escreve `users/{seu-uid}`
- Webhook do Sheets é público (write-only por design)
- **Nunca pedir senha do usuário** ao agente
- **Nunca usar `git push --force`** sem permissão explícita
- **Nunca commitar sem pedir** se mudanças destrutivas (resetar dados, deletar features etc.)

---

## 📋 STATE MODEL (resumo)

```js
state = {
  version: 2,
  theme: 'light' | 'dark' | 'forest' | 'sunset' | 'ocean' | 'sakura' | 'oled',
  activeTab: 'painel' | 'despesas' | 'metas' | 'calendario' | 'historico',
  income: 0,
  extraIncomes: [{id, name, value, addedAt}],
  method: '50-30-20' | '6-potes' | 'custom',
  categories: [{id, name, pct, color, mode: 'pct'|'fixed', fixedAmount, locked}],
  expenses: [{id, name, value, categoryId, date, timestamp, fromRecurring?}],
  recurring: [{id, name, value, categoryId, dayOfMonth}],
  goals: [{id, name, target, current, deadline, color}],
  history: { 'YYYY-MM': {income, expenses, totalSpent, ...} },
  learned: { 'lower_name': 'categoryId' },
  currentMonth: 'YYYY-MM',
  notes: [{id, text, createdAt, syncedAt}],
  notesWebhookUrl: '',
  deviceName: '',
  achievements: { unlocked: {} },
  streak: { current, longest, lastVisit },
  schedule: [{id, date, name, value, type, categoryId, notes, status, createdAt}],
  _methodsTried: [],
  ui: {
    showPercentEditor, search, filter, notesOpen,
    defaultGoalId, advancedMode, stealthMode,
    calendarMonth, calendarSelectedDay
  }
}
```

---

## 🚀 COMO COMEÇAR NO NOVO CHAT

Cole esse arquivo todo, depois diga algo tipo:
> *"Esse é o contexto do projeto Munny que eu venho desenvolvendo. Vamos continuar daqui. Próxima feature que quero atacar: [X]"*

Ou se quiser que o assistente sugira, é só falar:
> *"Tá no arquivo o que já fiz. O que você acha que devíamos fazer agora?"*

---

**Última atualização do projeto:** combo Quick Wins (chips de categorias, reserva de emergência, 7 temas) — commit `b4387bb`
