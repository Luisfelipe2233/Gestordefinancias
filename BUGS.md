# BUGS.md — Registro de Bugs do Munny

> Qualquer bug descoberto — por você, pelos testers ou pelo DEV durante implementação —
> deve ser registrado aqui antes de ser esquecido.
> O DEV consulta este arquivo no início de cada sessão para verificar se há bugs prioritários.

---

## 🔴 Críticos — bloqueiam funcionalidade principal

<!-- Bugs que impedem o fluxo central (registrar despesa, ver saldo, fechar mês, sync). -->
<!-- Prioridade máxima. -->

### [CRÍTICO] Service Worker v1 podia "brickar" a página (tela "Não é possível abrir")

- **Descoberto por:** Dono (Lipe), no iPhone/Chrome, 2026-06-07
- **Fase:** 6 (PWA)
- **Descrição:** O `sw.js` v1 (commit `d5c24be`) tinha 2 falhas: (1) se `fetch` + cache falhassem na navegação, `respondWith` resolvia pra `undefined` → página em branco/erro; (2) não tratava resposta "redirected" (GitHub Pages redireciona URL sem barra final) → alguns browsers recusam responder navegação com resposta redirecionada. Só afetava quem já tinha o SW instalado. O servidor nunca caiu (sempre HTTP 200).
- **Como reproduzir:** Instalar o SW v1, recarregar; em certas condições de rede/redirect a navegação falhava com "Não é possível abrir esta página".
- **Comportamento esperado:** SW nunca pode quebrar a navegação — sempre devolver Response válida (rede → cache → HTML offline mínimo).
- **Causa raiz:** `respondWith(undefined)` no caminho de fallback + resposta redirecionada não tratada.
- **Fix aplicado:** `sw.js` reescrito (commit `6ef59dd`, cache `munny-v2`): navegação usa `async` try/catch que SEMPRE devolve Response; `cleanRedirect()` remove a flag redirected; fallback final é uma página offline mínima. `skipWaiting` + `clients.claim` garantem que o SW novo assume e limpa o cache antigo na próxima visita.
- **Recuperação do usuário:** fechar o Chrome e reabrir (baixa o SW novo) OU limpar dados do site.
- **Status:** [x] Resolvido (aguardando confirmação do dono no device)
- **Commit de resolução:** `6ef59dd` — 2026-06-07

---

## 🟡 Importantes — degradam a experiência

### [IMPORTANTE] Theme picker abre com Claro ativo pra quem já usou o app antes do default mudar pra Linho

- **Descoberto por:** Dono (Lipe), 2026-06-06
- **Fase:** 5 (Refinamento de Design)
- **Descrição:** Usuários que já tinham `theme: 'light'` salvo no localStorage continuam vendo o tema Claro mesmo após o deploy que mudou o default pra Linho. Eles precisam manualmente abrir Configurações → Temas → Linho.
- **Como reproduzir:**
  1. Abrir o site antes do commit `1058c52` (qualquer versão anterior)
  2. Fazer login (state.theme = 'light' fica persistido)
  3. Atualizar pro commit `1058c52` ou posterior
  4. Site continua com tema Claro
- **Comportamento esperado:** Migração one-shot light → linho com flag `ui.linhoIntroduced` (não migra de novo se o usuário voltar pro Claro de propósito) + toast informativo no boot.
- **Impacto:** Baixo individual (basta 2 cliques), mas estratégico — usuários atuais não veem o novo design padrão se não souberem.
- **Fix aplicado:** Migração em `loadState()` + toast "🌿 Novo visual: tema Linho!" 2,4s após o boot.
- **Status:** [x] Resolvido
- **Commit de resolução:** `034ab99` — 2026-06-07

---

## 🟢 Menores — melhorias e polimentos

### [MENOR] Insight rotativo "Reserva de emergência" ainda aparece após remover o card

- **Descoberto por:** DEV durante TASK de remoção do card, 2026-06-06
- **Fase:** 5
- **Descrição:** O card grande "Reserva de Emergência" no topo do Painel foi removido (commit `624d513`). Mas o sistema de insights rotativos ainda tem o item 7 ("Reserva de emergência") em `generateInsights()` — ele aparece dentro do card "Insights inteligentes" no Painel.
- **Como reproduzir:** Abrir Painel, esperar os insights rotarem (a cada 9s), eventualmente um diz algo sobre reserva.
- **Comportamento esperado:** Insight removido junto ("pode socar tudo" — decisão do dono em 2026-06-07).
- **Fix aplicado:** Bloco `=== 7. Reserva de emergência` removido de `generateInsights()`.
- **Status:** [x] Resolvido
- **Commit de resolução:** `034ab99` — 2026-06-07

---

## 📌 Como registrar um bug

Use o template abaixo para cada novo bug:

```markdown
### [CRÍTICO/IMPORTANTE/MENOR] Título curto do bug

- **Descoberto por:** [você / testes / DEV / tester específico]
- **Data:** [YYYY-MM-DD]
- **Fase:** [Fase em que o bug foi encontrado]
- **Descrição:** O que acontece de errado.
- **Como reproduzir:** Passos para reproduzir o problema.
- **Comportamento esperado:** O que deveria acontecer.
- **Status:** [ ] Aberto / [ ] Em progresso / [ ] Resolvido
- **Commit de resolução:** (preencher ao resolver)
```

### Campos opcionais (use quando agregarem valor ao diagnóstico)

- **Evidência:** trecho de console.log, stack trace ou screenshot do DevTools.
- **Impacto:** o que o bug bloqueia ou degrada (1 usuário, todos no mobile, só em certo tema, etc.).
- **Tema afetado:** se o bug é específico de um dos 8 temas (Linho, Claro, Escuro, Forest, Sunset, Ocean, Sakura, OLED).
- **Viewport afetado:** se é desktop only, mobile only, ou ambos.
- **Hipóteses descartadas:** o que já foi investigado e refutado.
- **Causa raiz:** explicação técnica do problema real, uma vez confirmada.
- **Fix aplicado:** descrição da mudança que resolveu, com referência aos blocos do `index.html`.
- **Validação:** como ficou comprovado que o bug está resolvido (passos + screenshot + tema testado).

> Bugs resolvidos permanecem no arquivo como **registro histórico** — não devem ser apagados. Servem de referência para diagnóstico de regressões e para o onboarding de futuras instâncias do agente.
