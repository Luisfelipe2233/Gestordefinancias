# BUGS.md — Registro de Bugs do Munny

> Qualquer bug descoberto — por você, pelos testers ou pelo DEV durante implementação —
> deve ser registrado aqui antes de ser esquecido.
> O DEV consulta este arquivo no início de cada sessão para verificar se há bugs prioritários.

---

## 🔴 Críticos — bloqueiam funcionalidade principal

<!-- Bugs que impedem o fluxo central (registrar despesa, ver saldo, fechar mês, sync). -->
<!-- Prioridade máxima. -->

*Nenhum bug crítico aberto no momento.*

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
- **Comportamento esperado:** Discussão aberta. Opção A: migração automática silenciosa (light → linho uma vez). Opção B: deixar como está, usuário escolhe. Opção C: banner uma vez "Conheça o novo tema Linho! 🌿" com botão pra aplicar.
- **Impacto:** Baixo individual (basta 2 cliques), mas estratégico — usuários atuais não veem o novo design padrão se não souberem.
- **Status:** [ ] Aberto — aguardando decisão de produto (CEO)
- **Commit de resolução:** —

---

## 🟢 Menores — melhorias e polimentos

### [MENOR] Insight rotativo "Reserva de emergência" ainda aparece após remover o card

- **Descoberto por:** DEV durante TASK de remoção do card, 2026-06-06
- **Fase:** 5
- **Descrição:** O card grande "Reserva de Emergência" no topo do Painel foi removido (commit `624d513`). Mas o sistema de insights rotativos ainda tem o item 7 ("Reserva de emergência") em `generateInsights()` — ele aparece dentro do card "Insights inteligentes" no Painel.
- **Como reproduzir:** Abrir Painel, esperar os insights rotarem (a cada 9s), eventualmente um diz algo sobre reserva.
- **Comportamento esperado:** Decisão pendente. Se o dono não queria o assunto no app, remover o insight também. Se só não queria o card grande, manter o insight como sugestão sutil.
- **Status:** [ ] Aberto — aguardando decisão de produto
- **Commit de resolução:** —

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
