# TASKS.md — Controle de Sprint e Tarefas

> Documento vivo do projeto Munny. Cada agente tem responsabilidade sobre sua seção.
> **Não edite seções que não são de sua responsabilidade.**

---

## 📋 Sprint Atual — definido pelo CEO

### ✅ Encerramento da Fase 4 (2026-06-06)
Combo Quick Wins entregue: chips de categoria mais usadas, card de Reserva de Emergência (depois removido conforme escolha do dono), 5 novos temas (Sakura, Ocean, Sunset, Forest, OLED). Commit `b4387bb`. Decisão: avançar pra Fase 5 (Refinamento de Design).

---

### Sprint: Phase 1 do Refinamento de Design — Linho + Mobile + Segurança
**Data de definição:** 2026-06-06
**Fase:** 5 — Refinamento de Design

> **Contexto:** Após o briefing do Designer Sênior pedindo paleta orgânica + espaço negativo + tipografia dramática + spring physics, decidimos atacar em 4 fases. Esta é a Phase 1: trocar a identidade visual padrão pra paleta Linho (oat milk + sálvia + terracota), trazer experiência nativa mobile (bottom nav + FAB), e blindar inputs (XSS + máscara BRL).

---

#### Problema

- **"Meu app de finanças parece template genérico de IA — quero que pareça uma marca premium e calma."** — A paleta padrão Claro (azul Tailwind + verde neon) tava muito corporativa.
- **"No celular, as tabs no topo me obrigam a esticar o polegar — apps reais têm tab bar no rodapé."** — Frustração mobile real.
- **"Não consigo digitar um nome com aspas no app — quero que isso seja BLOQUEADO de cara, não no submit."** — Pedido explícito de segurança em tempo real.
- **"Os valores de R$ ficam sem formatação enquanto digito, fica feio."** — Quer máscara de moeda visual.

---

#### O que deve funcionar ao final do sprint

> **Frase-âncora da demo:** "Abro o Munny pela primeira vez, vejo paleta calma oat milk + sálvia, no celular as tabs estão no rodapé com um FAB '+' pra adicionar despesa, e quando tento digitar `" ` em qualquer campo, o caractere é apagado na hora."

1. **Tema Linho como default:** novos usuários veem oat milk #F7F3EA + sálvia #6F8E7F + terracota #C97A6A. Picker permite voltar pros 7 temas legados.

2. **Bottom Tab Bar mobile:** em viewport ≤ 760px, top tabs somem e aparece bar fixo no rodapé com 5 abas + FAB "+" lateral. Indicador ativo é barrinha primária + ícone com scale 1.1.

3. **Safe area iOS:** todos os FABs e o bottom-nav respeitam `env(safe-area-inset-bottom)` — funciona no iPhone com notch sem sobrepor.

4. **Filtro de caracteres em tempo real:** ao digitar `" ' \` < > \\` em qualquer input de texto, o char é removido na hora. Cursor mantém posição.

5. **Sanitização defensiva no submit:** 6 forms (despesa, despesa-edit, entrada extra, recorrente, meta, agendamento) usam `safeText()` que rejeita padrões XSS/SQL injection e mostra toast amigável.

6. **Máscara BRL em todos os inputs de valor:** ao sair do foco, "1500" vira "1.500,00" em: renda, despesa (form + edit), entrada extra, recorrente, meta (target + current + depósito inline), agendamento.

---

#### O que está fora do escopo deste sprint

- **Tipografia dramática nos saldos principais** — vai pra Phase 2 do refinamento.
- **Divulgação progressiva no Painel** (esconder detalhes em accordion) — Phase 3.
- **Spring physics aplicada em FAB/modal/bottom-nav** — vars estão prontas mas aplicação fica pra Phase 2.
- **PWA install + Service Worker** — Fase 6.
- **Compartilhar mês como imagem** — backlog, sem fase atribuída.

---

## ⚙️ Tarefas Técnicas — definidas pelo CTO

> *Sprint atual já foi implementado direto pelo dono no fluxo de pair-programming com o agente.*
> *Sprints futuros: o CTO preenche esta seção com tasks decompostas seguindo o Formato de Entrega do `cto.md`.*

---

*Nenhuma tarefa técnica pendente — aguardando próximo sprint do CEO.*

---

## ✅ Concluído — movido pelo DEV após cada commit

### TASK-F7-02 — Tirar o muro de login (funil "testa → salva")

**Objetivo:** Remover a desistência no login. Pessoa entra sem conta, monta o orçamento (renda+método), e login vira obrigatório SÓ no fim do onboarding (pra salvar). Decisão do dono: login mandatório ao terminar o onboarding (senão perde dados ao limpar cache).

**Commit:** `ec2c7f3` — 2026-06-07

**Resumo da implementação:**
- **Tela de login** ganhou CTA primário "Criar meu orçamento →" (`startPreviewBtn`) que entra em modo preview sem login; botão Google vira secundário "já tem conta?".
- **`enterPreviewMode()`**: showMainApp() + showOnboarding() sem autenticar.
- **`maybeShowOnboarding`** agora só auto-abre pra usuário JÁ logado (deslogado vê login primeiro). `showOnboarding()` extraído.
- **Passo 3 condicional** (`onbConfigureFinalStep`): logado → "Começar a usar" (fecha); preview → "Entrar com Google e salvar" (gate de login). Pular em preview pula pro gate, não fecha.
- **Migração segura:** ao logar pelo gate, `loadUserData` mantém renda+método locais e sobe pra conta (cloud doc não existe → hasLocalData true). Flag `_onbAwaitingLogin` fecha o wizard e marca `onboardingDone` no sucesso do auth.

**Validação (testar em aba anônima = estado deslogado fresco):**
- Login screen mostra "Criar meu orçamento"; clicar abre onboarding sem logar
- Renda + método → passo 3 pede login; logar preserva os dados (toast "salvos na sua conta")
- Usuário com conta existente: "Entrar com Google" carrega dados da nuvem normalmente

---

### TASK-F7-01 — Onboarding de primeiro uso (3 passos)

**Objetivo:** Resolver a tela vazia/zerada que faz o novo usuário desistir nos primeiros 30s. Wizard guiado: boas-vindas → renda → método → painel montado.

**Commit:** `21810fd` — 2026-06-07

**Resumo da implementação:**
- **Gatilho:** só aparece pra quem é realmente novo (`isFirstTime`: sem renda, sem despesas, sem histórico, sem metas) E `!state.ui.onboardingDone`. Usuário existente nunca vê — `maybeShowOnboarding` marca `onboardingDone=true` e sai. Guard `_onboardingShown` evita reabrir na sessão.
- **3 passos** no overlay `.onb-backdrop` (z-index 1600): (1) renda com input grande + Enter avança; (2) 3 cards de método (aplica `state.method` + `cloneCats(METHODS[m].categories)`); (3) tela "tudo pronto, [nome]" com CTA. Pular em qualquer passo.
- **Estilo Linho:** card calmo, dots de progresso que esticam com spring, animação de entrada `--ease-spring`, microcopy humana.
- **Estado:** `state.ui.onboardingDone` (default false) — persiste e sincroniza.

**Validação:**
- Testar em aba anônima (estado fresco) → wizard aparece; preencher renda + método → painel já montado
- Usuário com dados → wizard nunca aparece
- Pular fecha e não volta

**Decisão de produto:** Wrapped do mês foi descartado pelo dono ("não imagino pessoas usando"). Pivot pra utilidade real — adoção via primeira impressão.

---

### TASK-F6-01 — PWA: Service Worker + offline + install prompt (REVERTIDO)

> ⚠️ **Revertido** no commit `752f6b4` — o Service Worker travava a página em alguns devices (ver `BUGS.md`). PWA removido por completo; confiabilidade > offline pra app de finanças.

### TASK-F6-01 (original) — PWA: Service Worker + offline + install prompt

**Objetivo:** Munny vira app instalável que funciona offline. Service Worker cacheia o app shell; banner sutil oferece instalação.

**Commit:** `d5c24be` — 2026-06-07

**Resumo da implementação:**
- **Novo arquivo `sw.js`** (exceção justificada ao single-file: SW não pode ser inline por exigência do browser). Estratégia: network-first no HTML (deploys chegam na hora), cache-first em fontes/SDK gstatic, bypass total em Firebase/Firestore/Auth/Apps Script (dados ao vivo nunca cacheados). Cache versionado `munny-v1` com limpeza no activate.
- **Registro** do SW no `window.load` (relativo `sw.js` → scope `/Gestordefinancias/`).
- **Install prompt**: captura `beforeinstallprompt`, mostra banner `.install-banner` (ícone + texto + CTA Instalar + dismiss). Dismiss persiste em localStorage (`munny_install_dismissed`) — device-specific, não sincroniza. `appinstalled` esconde banner + toast.
- **Manifest** reforçado: + ícone 512x512, `scope`, `description`, `orientation`, `purpose: any maskable` pra instalabilidade.

**Validação:**
- SW bypassa Firestore (testar: sync continua ao vivo com app instalado)
- Banner só aparece quando instalável + não-dismissado + não-standalone
- Offline: recarregar sem rede serve o app do cache
- DevTools → Application → Service Workers mostra `activated`

---

### TASK-F5-08 — Divulgação progressiva: Painel "modo simples" por padrão

**Objetivo:** No primeiro carregamento, o Painel mostra só Summary Bar + Insights + Pie Chart. Categorias detalhadas ficam num accordion fechado ("Ver categorias detalhadas (N)").

**Commit:** `56eae18` — 2026-06-07

**Resumo da implementação:**
- HTML: `#categoriesGrid` envolvido em `.cats-collapse` + botão `.cats-toggle` com ícone de grid, label dinâmica e chevron animado. Inserido entre o card de Insights e o grid.
- CSS: bloco novo "DIVULGAÇÃO PROGRESSIVA — CATEGORIAS". Botão dashed discreto (vira primary-soft no hover); collapse anima max-height + opacity + translateY em 0.4s `--ease-spring-soft`; chevron rotaciona 180° com a mesma spring.
- JS: `state.ui.categoriesExpanded` (default `false`) no defaultState; função `applyCatsCollapse()` aplica classes + aria-expanded + label com contagem ("Ver categorias detalhadas (5)" / "Esconder categorias"); restaurada no `renderAll()` e alternada no handler do `#catsToggle` em setupEvents com persistência via `saveState()`.

**Validação:**
- Label com contagem serve de microcopy anti-confusão (risco mapeado): usuário existente vê "(N)" e entende onde as categorias estão
- aria-expanded + aria-controls no botão (acessibilidade)
- Estado persiste por usuário e sincroniza via Firestore (faz parte do `state.ui`)
- Mesmo comportamento desktop e mobile (botão full-width, animação idêntica)

### TASK-F5-07 — Tipografia dramática nos saldos do Painel

**Objetivo:** O saldo principal e os 3 summary tiles do Painel ganham hierarquia tipográfica mais forte — saldo é 2x maior que os outros números, labels ficam discretas, e o countup do saldo usa spring physics.

**Commit:** `6db650b` — 2026-06-07

**Resumo da implementação:**
- CSS (linhas 878-901): `.summary-tile .lbl` ficou 10px / weight 500 / letter-spacing 0.08em / cor text-mute (era 11px/600/0.06em). `.summary-tile .val` virou `clamp(18px, 3vw, 24px)` com weight 700. Adicionado bloco `.summary-tile.remaining .val` com `clamp(28px, 5vw, 44px)`, weight 800 e letter-spacing -0.035em — o herói da tela.
- Mobile override `.summary-tile .val { font-size: 19px; }` removido (clamp() agora cuida da escala responsiva sem flatten).
- JS: `animateNumber` ganhou parâmetro `easing` opcional. Adicionados `_easeOutCubic` (smooth, padrão) e `_easeSpring` (aproximação JS de `cubic-bezier(0.34, 1.25, 0.64, 1)` com ~5% overshoot). Duração default subiu de 700ms→800ms.
- `renderSummary` agora passa `_easeOutCubic` em 700ms pros tiles Renda/Gasto, e `_easeSpring` em 800ms pro Saldo.

**Validação:**
- Sem cores hardcoded; só var(--text-mute), var(--text), var(--success-dark), var(--primary-dark), var(--danger) — funciona nos 8 temas
- Letter-spacing negativo dramático (-0.035em) no saldo simula o estilo de uma marca premium
- Saldo testado mentalmente em R$ 50.000: spring com 5% overshoot mostra brevemente R$ 52.500 e settle a R$ 50.000 — overshoot moderado, não exagerado
- Layout: tiles em grid `repeat(3,1fr)` alinham na maior altura — Renda/Gasto ganham respiro extra (princípio do brief: espaço negativo)
- No mobile (≤480px com summary-bar single-column), cada tile tem altura natural — saldo continua dramático (28px vs 18px nos outros)

---

### TASK-F5-01 — Tema Linho como padrão

**Objetivo:** Adicionar `[data-theme="linho"]` com paleta oat milk + sálvia + terracota e torná-lo o tema padrão pra novos usuários.

**Commit:** `1058c52` — 2026-06-06

**Resumo da implementação:** Criado novo bloco CSS com 27 tokens cobrindo bg/surface/text/primary/success/warning/danger/shadow/radius. Cantos a 16px (vs 14px dos outros), sombras com cor warm-charcoal e opacidade 3-6%. Adicionado ao array `THEMES` na primeira posição. Mudada linha 2 do HTML pra `data-theme="linho"` e o default state.theme. Vars de spring physics adicionadas (`--ease-spring`, `--ease-spring-soft`, `--ease-organic`).

**Validação:** Aberto em aba anônima — site abre com paleta oat milk. Picker mostra Linho como primeiro. Trocar pra outro tema e voltar funciona. Os 7 temas legados intactos.

---

### TASK-F5-02 — Bottom Tab Bar + FAB mobile

**Objetivo:** Em viewport ≤ 760px, esconder top tabs e mostrar bar fixo no rodapé com 5 abas + FAB "+" lateral.

**Commit:** `29473d1` — 2026-06-06

**Resumo da implementação:** Adicionado bloco CSS `.bottom-nav` com `display: grid` em mobile, `.bnav-btn` estilizado (ícone + label, indicador top + scale on active), e `.fab-add` (circle 58px com gradiente primary). HTML inserido antes da notes-fab. JS: querySelectors atualizados pra incluir `.bnav-btn` em switchTab/switchTabSilent/setupEvents. FAB-add com handler que faz switchTab('despesas') + focus em #expName.

**Validação:** DevTools device toolbar em iPhone 12: bottom-nav aparece com 5 abas evenly spaced. Clicar troca de aba corretamente. FAB navega + foca input. Top tabs ocultas. Desktop: bottom-nav escondida, top tabs preservadas.

---

### TASK-F5-03 — Mutirão de sobreposições mobile

**Objetivo:** Corrigir elementos sobrepostos no mobile após bottom-nav (toast atrás do bar, FABs sem safe-area).

**Commit:** `836fd50` — 2026-06-06

**Resumo da implementação:** Toast mobile movido de `bottom: 16px` pra `calc(96px + env(safe-area-inset-bottom))`. Fab-add e notes-fab passaram a usar `calc(... + env(safe-area-inset-bottom))`. .app padding-bottom safe-area aware. FAB diminui pra 54px em viewports ≤ 480px.

**Validação:** Toast aparece acima da bottom-nav em iPhone simulado. Confirmado com console.log do bounding rect de cada FAB e checagem de overlap.

---

### TASK-F5-04 — Sanitização defensiva no submit (XSS + SQL injection)

**Objetivo:** Adicionar helpers `safeText`/`isInputDangerous`/`sanitizeText` e aplicar em 6 form submits.

**Commit:** `361340e` — 2026-06-06

**Resumo da implementação:** 12 padrões regex cobrindo XSS (`<script>`, `<iframe>`, `javascript:`, `vbscript:`), SQL (`UNION SELECT`, `DROP TABLE`, `' OR 1=1`), NoSQL (`$where`), data URIs maliciosos. Helper `safeText(raw, {max, allowEmpty})` retorna `{ok, value, reason}`. Aplicado em forms: despesa add, despesa edit, entrada extra, recorrente, meta, agendamento. Toast com mensagem "⚠ Conteúdo bloqueado por segurança." quando detecta padrão.

**Validação:** Testes manuais com strings `<script>alert(1)</script>`, `'; DROP TABLE users; --`, `1' OR 1=1 --` — todas bloqueadas. Strings legítimas como "Coca Cola", "Casa & Lar", "Restaurante d'Alessio" passam normalmente.

---

### TASK-F5-05 — Filtro de caracteres em tempo real

**Objetivo:** Bloquear digitação de `" ' \` < > \\` em qualquer input de texto, em tempo real (não só no submit).

**Commit:** `008aac5` — 2026-06-06

**Resumo da implementação:** Listener delegado em `document` no evento `input`, usa capture (`true`) pra pegar inputs criados dinamicamente em modais. Aplica `stripBlockedChars()` se o target matcheia `input[type="text"], input[type="search"], input:not([type]), textarea`. Preserva posição do cursor descontando chars removidos. Escape hatch: `data-no-filter`.

**Validação:** Tentar digitar `"hello"` em qualquer campo — chars apagados na hora. Paste de string com aspas filtra também. Calculadora (`100+50`) intacta.

---

### TASK-F5-06 — Máscara BRL em todos os inputs de valor

**Objetivo:** Inputs de R$ formatados como "1.234,56" ao sair do foco. Manter calculadora `100+50` no input principal de despesa.

**Commits:** `361340e` (helpers + inputs estáticos) + `6122a71` (modais + cards de meta) — 2026-06-06

**Resumo da implementação:** Helper `fmtBRLInput(n)` usa `toLocaleString('pt-BR', {minimumFractionDigits:2})`. `attachBRLFormat(target)` aceita ID ou DOM element, formata valor inicial e adiciona listener blur. `setupCalcInput` atualizado pra usar fmtBRLInput após evalMath. Aplicado em: #income (estático), #expValue/#extraValue (via setupCalcInput), modal de despesa-edit, recorrente, meta (target + current), agendamento, e cards de meta (input inline "guardar em meta").

**Validação:** Digitar "1500" no #income → blur → vira "1.500,00". Digitar "100+50" em #expValue → blur → vira "150,00". Abrir modal de meta com target=10000 → input já mostra "10.000,00". Re-enviar form com valores formatados funciona (parseNumber lida com "1.234,56").

---

> Tarefas concluídas permanecem aqui como histórico. Não apagar.
