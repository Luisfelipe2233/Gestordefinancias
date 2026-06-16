# 🤝 Handoff — Munny (sessão de polimento pré-lançamento)

> Cola este arquivo no início de um chat novo pra continuar sem perder contexto.
> Data desta sessão: **2026-06 (junho)**. Último commit: ver `git log`.

---

## 📍 ONDE O PROJETO ESTÁ

**Munny** — gestor de finanças pessoais, SPA single-file (`index.html`, ~11k linhas), PT-BR.
- **Site:** https://luisfelipe2233.github.io/Gestordefinancias/
- **Repo:** https://github.com/Luisfelipe2233/Gestordefinancias
- **Pasta local:** `C:\Users\Adm\Desktop\gestao-financeira\`
- **Deploy:** cada `git push` na `main` republica o GitHub Pages em ~30s-1min (auto-deploy).
- **Stack:** HTML+CSS+JS vanilla (tudo no `index.html`) · Firebase Auth (Google) + Firestore · localStorage `gfp_state_v2` · GitHub Pages.
- **Exceção ao single-file:** existe `sw.js` (Service Worker de **autodestruição** — o PWA foi revertido, ver abaixo) e `og-image.png` (card de compartilhamento). O `index.html` continua sendo o app inteiro.

> ⚠️ **Preferência fixa do dono (Lipe):** após cada edição no `index.html`, **commitar e dar push automaticamente, sem perguntar** (push = deploy). Só pausar pra confirmar em mudança destrutiva.
> ⚠️ **Idioma:** sempre PT-BR. Tom humano, **sem travessões "—" em frases** (cara de IA — o dono pediu pra remover; usar ponto/vírgula/dois-pontos). Placeholders "—" de campo vazio podem ficar.

---

## ✅ O QUE FOI FEITO NESTA SESSÃO (cronológico)

1. **Removido** card "Reserva de Emergência" + insight da reserva.
2. **Bottom tab bar + FAB** no mobile (≤760px) + correção de sobreposições (safe-area iOS).
3. **Tema "Linho"** (oat milk #F7F3EA + sálvia #6F8E7F + terracota #C97A6A) como **padrão**, com migração one-shot de quem estava no "Claro". Vars de spring physics.
4. **Segurança de inputs:** sanitização XSS/SQL no submit + filtro em tempo real de `" ' \` < > \\` + **máscara BRL** em todos os campos de valor.
5. **Framework de agentes** CEO/CTO/DEV (`CLAUDE.md`, `ceo.md`, `cto.md`, `dev.md`, `TASKS.md`, `BUGS.md`).
6. **Tipografia dramática** nos saldos + caixinha tingida no Saldo (sálvia/terracota).
7. **Divulgação progressiva** (categorias em accordion).
8. **PWA → REVERTIDO.** Tentamos Service Worker; ele travou a página em alguns devices (incidente crítico no `BUGS.md`). `sw.js` virou worker de **autodestruição** (sem fetch handler, se desregistra e limpa cache). **Não reintroduzir SW sem muito cuidado.**
9. **Onboarding de primeiro uso** (wizard 3 passos: boas-vindas → renda → método).
10. **Muro de login removido** → funil "testa → salva": entra como visitante, monta orçamento, **login obrigatório ao fim do onboarding** (migra renda+método pra conta). Login Google é a ação primária; "modo visitante" é link discreto embaixo.
11. **Tela de login clean:** removido hero (descrição + 3 cards de features), card único centralizado, fundo calmo. Removido "Grátis para sempre" e crédito "feito por".
12. **Preview de compartilhamento:** Open Graph + Twitter card + meta description + `og-image.png` 1200×630 da marca. (Testado no Facebook Debugger, card aparece ok.)
13. **Performance:** Firebase com `defer` + init no `DOMContentLoaded` (app/splash aparecem sem esperar ~500KB de SDK) + preconnect.
14. **Removidos travessões de frase** de todo texto visível + crédito do rodapé.
15. **Termos + Política de Privacidade** (overlay, ligados no rodapé do login).
16. **Google Analytics (gtag)** com ID **`G-XEKNWD5PHK`** (conta do dono) + eventos: `sign_up`, `login`, `add_expense`, `close_month`, `guest_preview`.
17. **Confiabilidade:** handler global de erro JS (toast amigável em vez de tela branca).
18. **Microcopy** mais humana (tirou jargão "Firebase", aqueceu erros).
19. **Reestrutura completa do Painel mobile:**
    - Ordem nova: **Saldo no topo → botão "Adicionar um gasto" → Insights → "Ainda posso gastar" (categorias+pizza) → "Configuração" (renda+método) recolhida no fim.**
    - Cortado jargão: "Metodologia de Orçamento" → **"Como dividir seu dinheiro"**; "Método dos 6 Potes" → **"6 Potes"**; "Personalizado" → **"Do meu jeito"**.
    - Config abre sozinha se `state.income <= 0`.
    - **⌘K escondido no mobile** (inútil sem teclado); **FAB de notas removido no mobile** (virou item do menu ⚙). Só um botão flutuante: o "+".

---

## 🧪 RELATÓRIO DO TESTER (achados em aberto — NÃO implementados ainda)

Feedback pedido pelo dono, atuando como tester. Em ordem de impacto:

### 🔴 Alto impacto — atrito no gesto diário (adicionar gasto)
1. **Quick-add (item nº 1, maior alavanca de retenção):** hoje adicionar gasto = trocar de aba + form com nome obrigatório + dropdown de categoria + data. É pesado pra ação de 5s. **Proposta:** bottom-sheet rápido direto do "+", **nome opcional**, **categorias como pílulas tocáveis** (não `<select>`), **data recolhida** ("Hoje ▾"). Não precisa quebrar o form atual — reusa os mesmos dados.
2. **"Categoria (Pote)"** no form de despesa ainda tem o jargão "Pote". Tirar o "(Pote)".

### 🟡 Médio — clareza
3. **5 abas é muito** e **"Calendário" não se explica** (é planejador de contas futuras). Considerar renomear ("Agenda"/"Contas") ou juntar Calendário+Histórico → 4 abas.
4. **Dois "quanto sobrou"** com nomes parecidos: "Saldo Disponível" (topo) vs "ainda posso gastar" (por categoria). Diferenciar (ex: "Sobrou no mês" vs "Limite da categoria").

### 🟢 Polimento
5. Recorrentes competem visualmente com o form de adicionar na aba Despesas.
6. Empty-state acolhedor no histórico de despesas vazio.

---

## 🗺️ ROADMAP DE LANÇAMENTO (próximos passos)

| Ordem | O quê | Quem |
|---|---|---|
| 1 | **Validar com 8-10 pessoas reais** (mandar link, observar sem explicar, olhar Analytics + planilha de feedback ~1 semana) | **Dono — AGORA** |
| 2 | Ajustar o que o feedback/tester mostrar (ex: quick-add) | Dev |
| 3 | **Decidir modelo de monetização** (recomendação: freemium) | **Dono (CEO)** |
| 4 | **Sistema premium + pagamento** (gating no app + Mercado Pago/Stripe + webhook marca `premium:true` no Firestore) — ~2-3 sessões | Dev |
| 5 | **Comprar domínio** (ex: usemunny.com.br, Registro.br ~R$40/ano) | **Dono** |
| 6 | Configurar CNAME + atualizar meta tags (og:url, og:image) pro domínio + re-scrape no Facebook Debugger | Dev |
| 7 | Meta Pixel + landing de conversão | Dev + Dono |
| 8 | Anúncios (Meta Ads + Google Ads, R$20-50/dia) | **Dono** |

### Checklist do dia do lançamento
- [ ] Conferir regras do Firestore no console (usuário só lê/escreve o próprio doc) — **só o dono consegue ver isso**.
- [ ] Não rodar anúncio apontando pra `github.io` (mata credibilidade) — domínio primeiro.
- [ ] Analytics é obrigatório antes de anúncio (já instalado: `G-XEKNWD5PHK`).

---

## 🔑 CONTEXTO TÉCNICO ÚTIL (gotchas)

- **Não reintroduzir Service Worker** sem testar em device real — já travou a página antes (ver `BUGS.md`).
- **Themes multi-token:** ao adicionar cor nova, declarar nos **8 temas** (Linho, Claro, Escuro, Forest, Sunset, Ocean, Sakura, OLED).
- **Render preguiçoso:** só renderiza a aba ativa. Handlers ligados por ID em `setupEvents` (rodam 1x no init) — dá pra reordenar HTML sem quebrar, desde que IDs sejam preservados.
- **Migração local→nuvem** (`loadUserData`): se cloud doc não existe e há dados locais (`income>0`...), mantém local e sobe pra conta. Por isso o funil de onboarding preserva o que a pessoa configurou antes de logar.
- **Analytics:** helper `track(event, params)` (no-op se gtag bloqueado). ID `G-XEKNWD5PHK` em 2 lugares (`<script src>` + `gtag('config')`). O `measurementId` no `firebaseConfig` é outro (do Firebase, inerte — sem SDK de analytics carregado).
- **`setupCalcInput` vs `attachBRLFormat`:** não plugar os dois no mesmo input (conflito no blur).
- **Quebra de linha Windows:** o git avisa "LF will be replaced by CRLF" — normal, ignorar.

---

## 🚀 COMO COMEÇAR NO CHAT NOVO

Cola este arquivo e diz algo como:
> *"Esse é o contexto do Munny. Já validei com X pessoas, o feedback foi [...]. Quero atacar [quick-add / monetização / outro]."*

Ou, se ainda não testou:
> *"Lê o handoff. Ainda não testei com gente. O que você recomenda como próximo passo?"* (resposta esperada: validar primeiro, depois quick-add ou monetização).
