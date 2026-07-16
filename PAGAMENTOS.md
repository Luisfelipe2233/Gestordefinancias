# Pagamentos do Munny — guia de ativação

O código já está pronto e no ar, mas **dormindo**: nada cobra e nada bloqueia
ninguém até você completar os passos abaixo e ligar o interruptor. Pode fazer
com calma, em dias diferentes; nenhum passo intermediário quebra o site.

Arquitetura em uma linha: o CTA da tela de assinatura chama o Worker
(`/api/checkout`), que cria a Assinatura no Mercado Pago; quando o pagamento
aprova, o MP avisa o Worker (`/api/webhook`), que grava em
`subscriptions/{uid}` no Firestore; o app escuta esse doc em tempo real e
libera o acesso sozinho, em segundos.

**Regra de ouro: os valores dos secrets você digita SÓ no terminal ou nos
painéis (Cloudflare/MP/Firebase). Nunca cola no chat, em código ou no repo.**

---

## Passo 1 — Regras do Firestore (5 min, pode fazer já)

1. Abre [console.firebase.google.com](https://console.firebase.google.com) > projeto **munny-d72cd** > Firestore Database > aba **Regras**.
2. Antes de mexer: confere se as regras atuais têm alguma coleção além de `users`. Se tiverem, me avisa antes de substituir.
3. Cola o conteúdo do arquivo `firestore.rules` deste repo e clica **Publicar**.

Isso libera a leitura da própria assinatura e tranca a escrita (só o Worker escreve).

## Passo 2 — Credencial do Mercado Pago

1. [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers) > Suas integrações > **Criar aplicação** (nome: Munny; produto: Assinaturas).
2. Dentro da aplicação: **Credenciais de produção** > copia o **Access Token** (começa com `APP_USR-`). Não confunde com a Public Key.

## Passo 3 — Webhook do Mercado Pago

1. Na mesma aplicação: **Webhooks** > Configurar notificações > modo produção.
2. URL: `https://munnygestorfinanceiro.com/api/webhook`
3. Eventos: marca **Planos e assinaturas** (subscription_preapproval e subscription_authorized_payment).
4. Salva e copia a **assinatura secreta** que o painel mostra.

## Passo 4 — Service account do Firebase

1. Console do Firebase > engrenagem > **Configurações do projeto** > aba **Contas de serviço**.
2. **Gerar nova chave privada** > baixa o arquivo JSON. Guarda ele num lugar seguro do PC (não deixa em Downloads pra sempre e nunca comita).

## Passo 5 — Guardar os secrets no Worker

No terminal, dentro da pasta do projeto (`C:\Users\Adm\Desktop\gestao-financeira`):

```
npx wrangler login
npx wrangler secret put MP_ACCESS_TOKEN
npx wrangler secret put MP_WEBHOOK_SECRET
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
```

Cada comando abre um prompt; você cola o valor ali (no terceiro, o conteúdo
INTEIRO do JSON da service account, numa linha só). Os secrets ficam na conta
Cloudflare, valem pros deploys via git também, e ninguém consegue lê-los depois.

## Passo 6 — Testar com você mesmo

1. Ainda com `BILLING.enabled: false` (ninguém é bloqueado), loga no site com sua conta, Configurações > Dev > "Ver tela de assinatura".
2. O CTA ainda mostra o aviso? Então me chama pra eu trocar o aviso por checkout real em modo dev primeiro, OU já pede o passo 7 e testa valendo (dá pra cancelar a assinatura no MP depois e estornar).

## Passo 7 — Ligar a cobrança (quando decidir lançar)

Me pede "liga a cobrança" que eu faço, ou edita no `index.html` o bloco `BILLING`:

```js
const BILLING = {
  enabled: true,
  launchDate: '2026-08-15',  // A DATA DE HOJE no dia que ligar
  trialDays: 7,
};
```

`launchDate` é a proteção dos testers: **toda conta criada antes dessa data
nunca é bloqueada**. Quem chegar depois ganha 7 dias grátis contados da criação
da conta e depois vê a tela de assinatura (sem poder fechar).

---

## Como saber se está funcionando

- Logs do Worker: painel Cloudflare > Workers > munny > Logs (ou `npx wrangler tail`).
- Assinaturas gravadas: console Firebase > Firestore > coleção `subscriptions`.
- Assinaturas no MP: painel do Mercado Pago > Assinaturas.

## O que fazer se alguém pagar e não liberar

1. `npx wrangler tail` e olha se o webhook chegou e deu erro.
2. Se precisar liberar na mão: Firestore > `subscriptions` > cria doc com o id
   igual ao uid da pessoa, campos `status: "authorized"` (string) e
   `validUntil` (timestamp futuro). O app libera na hora.
