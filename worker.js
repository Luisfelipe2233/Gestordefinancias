// ============================================================================
// Munny — Worker de pagamento (Cloudflare Workers, plano gratuito)
//
// O site continua sendo servido como static assets; este Worker só intercepta
// as rotas /api/* (run_worker_first no wrangler.toml). Duas rotas:
//
//   POST /api/checkout  — cria a Assinatura (preapproval) no Mercado Pago e
//                         devolve o link de pagamento. Exige o ID token do
//                         Firebase no header Authorization (a gente verifica a
//                         assinatura do token aqui, não confia no client).
//   POST /api/webhook   — recebe as notificações do Mercado Pago, valida a
//                         assinatura secreta, consulta a assinatura na API do
//                         MP e grava o resultado em subscriptions/{uid} no
//                         Firestore (via service account; o client não tem
//                         permissão de escrita nessa coleção).
//
// Secrets (npx wrangler secret put NOME — o dono digita os valores no
// terminal, nunca em código nem no chat):
//   MP_ACCESS_TOKEN           Access Token da aplicação no Mercado Pago
//   MP_WEBHOOK_SECRET         Assinatura secreta do webhook (painel do MP)
//   FIREBASE_SERVICE_ACCOUNT  JSON completo da service account do Firebase
// ============================================================================

const FIREBASE_PROJECT_ID = 'munny-d72cd';
const SITE_URL = 'https://munnygestorfinanceiro.com';   // raiz: a landing
const APP_URL = 'https://app.munnygestorfinanceiro.com'; // subdomínio: o app
const APP_HOST = 'app.munnygestorfinanceiro.com';
const DEV_EMAIL = 'luisfelipemarchioro@gmail.com';

// Preços fixados NO SERVIDOR. O client manda só o nome do plano; se mandar
// qualquer outra coisa (ou tentar mandar preço), cai no 400.
const PLANS = {
  mensal: { reason: 'Munny — assinatura mensal', amount: 19.99, frequency: 1 },
  anual:  { reason: 'Munny — assinatura anual',  amount: 203.88, frequency: 12 },
};

// Margem de tolerância depois do vencimento antes de bloquear (atraso de
// processamento do MP não pode derrubar assinante em dia).
const GRACE_DAYS = 3;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        if (url.pathname === '/api/checkout' && request.method === 'POST') {
          return await handleCheckout(request, env);
        }
        if (url.pathname === '/api/pix' && request.method === 'POST') {
          return await handlePix(request, env);
        }
        if (url.pathname === '/api/webhook' && request.method === 'POST') {
          return await handleWebhook(request, env);
        }
        if (url.pathname === '/api/unsub' && request.method === 'GET') {
          return await handleUnsub(request, env);
        }
        if (url.pathname === '/api/sales' && request.method === 'GET') {
          return await handleSales(request, env);
        }
        return json({ error: 'not_found' }, 404);
      } catch (err) {
        console.error('API error:', err && err.stack || err);
        return json({ error: 'internal' }, 500);
      }
    }

    // Fora de /api, roteia por host:
    //  - app.munnygestorfinanceiro.com -> o app (index.html / SPA), como sempre.
    //  - raiz e www                    -> a landing (landing.html) nas navegações;
    //    arquivos reais (imagens, ícones, manifest) passam direto pros assets.
    if (url.hostname === APP_HOST) {
      return env.ASSETS.fetch(request);
    }
    const isFileRequest = /\.[a-zA-Z0-9]+$/.test(url.pathname);
    if (url.pathname === '/' || !isFileRequest) {
      // Busca a URL LIMPA (/landing), não /landing.html: o Cloudflare Assets
      // redireciona .html -> URL limpa por padrão, e servir esse 307 aqui criava
      // loop de redirecionamento na raiz. Se ainda vier um redirect, segue uma vez.
      let res = await env.ASSETS.fetch(new Request(new URL('/landing', url).toString(), request));
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (loc) res = await env.ASSETS.fetch(new Request(new URL(loc, url).toString(), request));
      }
      return res;
    }
    return env.ASSETS.fetch(request);
  },

  // Cron diário (definido em wrangler.toml [triggers]). Dispara a régua de
  // e-mails de retorno. Inerte enquanto RESEND_API_KEY não existir.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runRetention(env));
  },
};

// ============================== /api/checkout ==============================

async function handleCheckout(request, env) {
  if (!env.MP_ACCESS_TOKEN) return json({ error: 'billing_disabled' }, 503);

  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await verifyFirebaseToken(idToken);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body = null;
  try { body = await request.json(); } catch (_) {}
  const plan = PLANS[body && body.plan];
  if (!plan) return json({ error: 'invalid_plan' }, 400);

  const res = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      reason: plan.reason,
      external_reference: user.uid,
      payer_email: user.email,
      back_url: `${APP_URL}/?assinatura=voltou`,
      auto_recurring: {
        frequency: plan.frequency,
        frequency_type: 'months',
        transaction_amount: plan.amount,
        currency_id: 'BRL',
      },
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.init_point) {
    console.error('MP preapproval falhou:', res.status, JSON.stringify(data).slice(0, 800));
    // Diagnóstico: o token é válido pra uma chamada básica do MP? Se /users/me
    // der 200, o token presta e o problema é permissão de Assinaturas; se der
    // 401, o token em si está errado (colado incompleto, de teste, etc.).
    let tokenCheck = null;
    try {
      const me = await fetch('https://api.mercadopago.com/users/me', {
        headers: { 'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}` },
      });
      const meData = await me.json().catch(() => ({}));
      tokenCheck = { status: me.status, id: meData.id, nickname: meData.nickname, site: meData.site_id, type: (env.MP_ACCESS_TOKEN || '').slice(0, 8) };
      console.error('Token check /users/me:', JSON.stringify(tokenCheck));
    } catch (e) { console.error('Token check erro:', String(e)); }
    const devDetail = (user.email || '').toLowerCase() === DEV_EMAIL
      ? { mp_status: res.status, mp_detail: data, token_check: tokenCheck }
      : {};
    return json({ error: 'mp_error', ...devDetail }, 502);
  }

  // Guarda os dados de atribuição de anúncio. Vai numa coleção própria, e não em
  // subscriptions/{uid}, por dois motivos: aquele doc tem um onSnapshot ligado no
  // app (não faz sentido acordar o gating de acesso por causa de marketing), e as
  // regras do Firestore negam por padrão tudo que está fora de users/ e
  // subscriptions/, então o navegador não lê isto aqui.
  // É best effort: falhar a gravação não pode derrubar um checkout que deu certo.
  try {
    await firestorePatch(env, `adAttribution/${user.uid}`, {
      fbp: { stringValue: String((body && body.fbp) || '') },
      fbc: { stringValue: String((body && body.fbc) || '') },
      email: { stringValue: String(user.email || '') },
      plan: { stringValue: String(body.plan) },
      updatedAt: { timestampValue: new Date().toISOString() },
    });
  } catch (e) {
    console.error('Falha ao guardar atribuição de anúncio:', String(e));
  }

  return json({ init_point: data.init_point });
}

// ================================ /api/pix =================================
// Pix não faz débito recorrente no Mercado Pago, então o Pix é sempre o plano
// ANUAL pago à vista: uma cobrança, 12 meses de acesso. Cria uma preferência do
// Checkout Pro (página hospedada do MP, que já cuida do QR, do copia-e-cola, do
// CPF e da expiração) restrita a Pix, e devolve o init_point. Quando o Pix cai,
// o webhook (ramo 'payment') grava a assinatura e o acesso libera sozinho.

async function handlePix(request, env) {
  if (!env.MP_ACCESS_TOKEN) return json({ error: 'billing_disabled' }, 503);

  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await verifyFirebaseToken(idToken);
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body = null;
  try { body = await request.json(); } catch (_) {}

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      items: [{
        title: PLANS.anual.reason,
        quantity: 1,
        unit_price: PLANS.anual.amount,
        currency_id: 'BRL',
      }],
      external_reference: user.uid,
      payer: { email: user.email },
      back_urls: {
        success: `${APP_URL}/?assinatura=voltou`,
        pending: `${APP_URL}/?assinatura=voltou`,
        failure: `${APP_URL}/?assinatura=voltou`,
      },
      auto_return: 'approved',
      notification_url: `${SITE_URL}/api/webhook`,
      // Este botão é o caminho Pix: tira cartão e boleto pra sobrar Pix (e saldo MP).
      payment_methods: {
        excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }],
        installments: 1,
      },
      metadata: { plan: 'anual', kind: 'pix', uid: user.uid },
      statement_descriptor: 'MUNNY',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.init_point) {
    console.error('MP preference (pix) falhou:', res.status, JSON.stringify(data).slice(0, 800));
    const devDetail = (user.email || '').toLowerCase() === DEV_EMAIL
      ? { mp_status: res.status, mp_detail: data }
      : {};
    return json({ error: 'mp_error', ...devDetail }, 502);
  }

  // Mesma atribuição de anúncio do checkout de cartão (best effort).
  try {
    await firestorePatch(env, `adAttribution/${user.uid}`, {
      fbp: { stringValue: String((body && body.fbp) || '') },
      fbc: { stringValue: String((body && body.fbc) || '') },
      email: { stringValue: String(user.email || '') },
      plan: { stringValue: 'anual' },
      method: { stringValue: 'pix' },
      updatedAt: { timestampValue: new Date().toISOString() },
    });
  } catch (e) {
    console.error('Falha ao guardar atribuição (pix):', String(e));
  }

  return json({ init_point: data.init_point });
}

// ============================== /api/webhook ===============================

async function handleWebhook(request, env) {
  const rawBody = await request.text();
  let body = {};
  try { body = JSON.parse(rawBody); } catch (_) {}
  const url = new URL(request.url);
  const dataId = String((body.data && body.data.id) || url.searchParams.get('data.id') || url.searchParams.get('id') || '');
  const type = String(body.type || url.searchParams.get('type') || url.searchParams.get('topic') || '');

  // Valida a assinatura secreta do MP (x-signature: ts=...,v1=...). Sem isso,
  // qualquer um poderia se "liberar" chamando o webhook na mão.
  const ok = await verifyMpSignature(request, dataId, env.MP_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'bad_signature' }, 401);
  if (!dataId) return json({ ok: true });

  // Resolve o id da preapproval conforme o tipo do evento
  let preapprovalId = null;
  if (type === 'subscription_preapproval') {
    preapprovalId = dataId;
  } else if (type === 'subscription_authorized_payment') {
    // Cobrança recorrente do ciclo: busca o pagamento pra achar a assinatura
    const r = await mpGet(`https://api.mercadopago.com/authorized_payments/${dataId}`, env);
    preapprovalId = r && r.preapproval_id;
  } else if (type === 'payment') {
    // Pagamento avulso (Pix / Checkout Pro do plano anual à vista). Fluxo próprio.
    return await handlePixPayment(dataId, env);
  } else {
    return json({ ok: true }); // outros eventos não interessam
  }
  if (!preapprovalId) return json({ ok: true });

  const pre = await mpGet(`https://api.mercadopago.com/preapproval/${preapprovalId}`, env);
  if (!pre || !pre.external_reference) return json({ ok: true });

  const uid = String(pre.external_reference);
  const frequency = pre.auto_recurring && pre.auto_recurring.frequency || 1;
  const plan = frequency >= 12 ? 'anual' : 'mensal';

  // validUntil: até quando o acesso vale. Autorizada = próximo vencimento +
  // carência. Cancelada/pausada NÃO encurta o que já foi pago; só para de
  // estender (o acesso morre sozinho quando validUntil passar).
  const fields = {
    status: { stringValue: String(pre.status || '') },
    plan: { stringValue: plan },
    preapprovalId: { stringValue: String(preapprovalId) },
    updatedAt: { timestampValue: new Date().toISOString() },
  };
  if (pre.status === 'authorized') {
    const base = pre.next_payment_date ? new Date(pre.next_payment_date) : addMonths(new Date(), frequency);
    const validUntil = new Date(base.getTime() + GRACE_DAYS * 86400000);
    fields.validUntil = { timestampValue: validUntil.toISOString() };
  }

  await firestorePatch(env, `subscriptions/${uid}`, fields);

  // Purchase pro Meta. Tem que sair daqui, e não do site: a cobrança acontece
  // depois do trial, quando o navegador da pessoa não está aberto, então o Pixel
  // nunca veria esse evento. Só na PRIMEIRA ativação (a própria função cuida
  // disso): mandar as renovações também infla o resultado e faz a Meta atribuir
  // uma cobrança de meses depois ao clique original do anúncio.
  // Envolvido em try porque falha de marketing não pode derrubar um pagamento.
  if (pre.status === 'authorized') {
    try {
      await sendMetaPurchase(env, {
        uid,
        plan,
        preapprovalId,
        amount: Number(pre.auto_recurring && pre.auto_recurring.transaction_amount)
          || (PLANS[plan] && PLANS[plan].amount) || 0,
        payerEmail: pre.payer_email || '',
      });
    } catch (e) {
      console.error('Meta CAPI falhou (a assinatura segue válida):', String(e));
    }
  }

  return json({ ok: true });
}

// Pix / pagamento avulso aprovado: libera o plano anual (12 meses à vista). Só
// age quando o pagamento está 'approved' (o Pix caiu de fato). validUntil é
// calculado a partir da data de aprovação, então se o MP reenviar o webhook o
// valor gravado é sempre o mesmo (idempotente, não estica o acesso a cada envio).
async function handlePixPayment(paymentId, env) {
  const pay = await mpGet(`https://api.mercadopago.com/v1/payments/${paymentId}`, env);
  if (!pay || !pay.external_reference) return json({ ok: true });
  if (pay.status !== 'approved') return json({ ok: true });

  const uid = String(pay.external_reference);
  const base = pay.date_approved ? new Date(pay.date_approved) : new Date();
  const validUntil = new Date(addMonths(base, 12).getTime() + GRACE_DAYS * 86400000);

  await firestorePatch(env, `subscriptions/${uid}`, {
    status: { stringValue: 'authorized' },
    plan: { stringValue: 'anual' },
    method: { stringValue: 'pix' },
    paymentId: { stringValue: String(paymentId) },
    validUntil: { timestampValue: validUntil.toISOString() },
    updatedAt: { timestampValue: new Date().toISOString() },
  });

  try {
    await sendMetaPurchase(env, {
      uid,
      plan: 'anual',
      preapprovalId: `pix_${paymentId}`,
      amount: Number(pay.transaction_amount) || PLANS.anual.amount,
      payerEmail: (pay.payer && pay.payer.email) || '',
    });
  } catch (e) {
    console.error('Meta CAPI (pix) falhou (a assinatura segue válida):', String(e));
  }

  return json({ ok: true });
}

async function mpGet(url, env) {
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${env.MP_ACCESS_TOKEN}` } });
  if (!res.ok) { console.error('MP GET falhou:', url, res.status); return null; }
  return res.json();
}

async function verifyMpSignature(request, dataId, secret) {
  if (!secret) return false;
  const sig = request.headers.get('x-signature') || '';
  const requestId = request.headers.get('x-request-id') || '';
  const parts = Object.fromEntries(sig.split(',').map(p => p.trim().split('=').map(s => s.trim())));
  if (!parts.ts || !parts.v1) return false;
  // Manifesto no formato documentado pelo MP; o id vai em minúsculas
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(hex, parts.v1);
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ===================== Verificação do ID token (Firebase) ==================
// Verifica a assinatura RS256 do token contra as chaves públicas do Google.
// Assim o uid/email que chegam no checkout são confiáveis de verdade.

let _jwkCache = { keys: null, exp: 0 };

async function verifyFirebaseToken(idToken) {
  try {
    const [h64, p64, s64] = idToken.split('.');
    if (!h64 || !p64 || !s64) return null;
    const header = JSON.parse(b64urlDecode(h64));
    const payload = JSON.parse(b64urlDecode(p64));
    if (header.alg !== 'RS256') return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;
    if (payload.aud !== FIREBASE_PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
    if (!payload.sub) return null;

    if (!_jwkCache.keys || _jwkCache.exp < Date.now()) {
      const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
      if (!res.ok) return null;
      _jwkCache = { keys: (await res.json()).keys, exp: Date.now() + 3600000 };
    }
    const jwk = _jwkCache.keys.find(k => k.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key,
      b64urlToBytes(s64),
      new TextEncoder().encode(`${h64}.${p64}`)
    );
    if (!valid) return null;
    return { uid: payload.sub, email: payload.email || '' };
  } catch (_) {
    return null;
  }
}

// ==================== Firestore via REST (service account) =================
// O Worker escreve em subscriptions/{uid} com credencial de servidor; as
// regras de segurança bloqueiam escrita vinda do client nessa coleção.

let _gTokenCache = { token: null, exp: 0 };

async function getGoogleAccessToken(env) {
  if (_gTokenCache.token && _gTokenCache.exp > Date.now() + 60000) return _gTokenCache.token;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const iat = Math.floor(Date.now() / 1000);
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  };
  const enc = (obj) => b64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(claims)}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToBytes(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64urlEncode(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error('Falha ao obter token do Google: ' + JSON.stringify(data).slice(0, 300));
  _gTokenCache = { token: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return _gTokenCache.token;
}

async function firestoreGet(env, docPath) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (res.status === 404) return null; // doc ainda não existe, primeira passagem
  if (!res.ok) { console.error(`Firestore GET ${docPath} falhou: ${res.status}`); return null; }
  const data = await res.json();
  return (data && data.fields) || null;
}

async function firestorePatch(env, docPath, fields) {
  const token = await getGoogleAccessToken(env);
  const mask = Object.keys(fields).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${docPath}?${mask}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore PATCH ${docPath} falhou: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

// ================= Meta: API de Conversões (evento Purchase) ===============
// Manda a compra direto pro Gerenciador de Eventos, server-side. Os dados de
// correspondência (e-mail hasheado, cookies do Pixel) são o que permite a Meta
// dizer qual anúncio gerou aquela assinatura. Sem eles a receita fica órfã.
//
// Secrets (npx wrangler secret put NOME):
//   META_PIXEL_ID    ID do Pixel (o mesmo que fica no index.html)
//   META_CAPI_TOKEN  Token da API de Conversões (este é secreto de verdade)
// Enquanto os dois não existirem, a função inteira é no-op.

const META_API_VERSION = 'v21.0';

async function sendMetaPurchase(env, { uid, plan, preapprovalId, amount, payerEmail }) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return;

  const att = await firestoreGet(env, `adAttribution/${uid}`);
  // Idempotência: o Mercado Pago reenvia webhook, e cada reenvio viraria uma
  // compra nova no relatório.
  if (att && att.metaPurchaseSent && att.metaPurchaseSent.booleanValue === true) return;

  // O e-mail do login vale mais que o do Mercado Pago pra correspondência: é o
  // do Google, e tem chance muito maior de ser o mesmo cadastrado no Facebook.
  const email = (strField(att, 'email') || payerEmail || '').trim().toLowerCase();
  const fbp = strField(att, 'fbp');
  const fbc = strField(att, 'fbc');

  const userData = { external_id: [await sha256Hex(uid)] };
  if (email) userData.em = [await sha256Hex(email)];
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      // Id estável por assinatura: se o webhook repetir, a Meta deduplica.
      event_id: `purchase_${preapprovalId}`,
      action_source: 'website',
      event_source_url: `${SITE_URL}/`,
      user_data: userData,
      custom_data: { currency: 'BRL', value: amount, content_name: plan },
    }],
  };

  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
  if (!res.ok) {
    console.error('Meta CAPI recusou:', res.status, (await res.text()).slice(0, 300));
    return; // sem marcar como enviado: o próximo webhook tenta de novo
  }

  await firestorePatch(env, `adAttribution/${uid}`, {
    metaPurchaseSent: { booleanValue: true },
    metaPurchaseAt: { timestampValue: new Date().toISOString() },
  });
}

function strField(fields, name) {
  const f = fields && fields[name];
  return (f && f.stringValue) || '';
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==================== Régua de e-mails de retenção ==========================
// Roda 1x por dia (cron). Traz de volta quem cadastrou e sumiu, e empurra a
// conversão no fim do trial. Inerte sem RESEND_API_KEY.
//
// Secrets/vars (npx wrangler secret put / [vars] no wrangler.toml):
//   RESEND_API_KEY  chave da API do Resend (secret)
//   RESEND_FROM     remetente verificado, ex: "Munny <ola@munnygestorfinanceiro.com>"
//
// Anti-estouro do plano grátis (limite de subrequests): lê users, subscriptions
// e userMeta UMA vez cada (não um GET por usuário) e monta tudo em memória. Só
// gasta requisição de rede por e-mail realmente enviado no dia.

const LAUNCH_DATE = new Date('2026-08-06T00:00:00Z'); // contas antes disso = grandfather

async function runRetention(env) {
  if (!env.RESEND_API_KEY) { console.log('Retenção: sem RESEND_API_KEY (no-op).'); return; }
  const now = Date.now();

  const users = await listAll(env, 'users', ['email', 'signupAt', 'lastSeenAt']);
  const subs  = await listAll(env, 'subscriptions', ['validUntil']);
  const metas = await listAll(env, 'userMeta', ['retentionSent', 'unsubscribed']);

  const activeSub = new Set();
  for (const d of subs) {
    const vu = tsField(d.fields, 'validUntil');
    if (vu && vu.getTime() > now) activeSub.add(idOf(d));
  }
  const sentMap = {};
  const unsub = new Set();
  for (const d of metas) {
    const uid = idOf(d);
    const m = d.fields && d.fields.retentionSent && d.fields.retentionSent.mapValue && d.fields.retentionSent.mapValue.fields;
    sentMap[uid] = m || {};
    if (d.fields && d.fields.unsubscribed && d.fields.unsubscribed.booleanValue === true) unsub.add(uid);
  }

  let sent = 0;
  for (const d of users) {
    try {
      const uid = idOf(d);
      const f = d.fields || {};
      const email = strField(f, 'email').trim();
      if (!email || email.indexOf('@') < 1) continue;      // sem e-mail utilizável
      if (activeSub.has(uid)) continue;                     // já paga: não incomoda
      if (unsub.has(uid)) continue;                         // pediu pra sair da lista
      const signupAt = tsField(f, 'signupAt');
      if (!signupAt) continue;                              // conta antiga sem o campo (pega no próximo login)
      const lastSeenAt = tsField(f, 'lastSeenAt') || signupAt;
      const dSignup = Math.floor((now - signupAt.getTime()) / 86400000);
      const dSeen   = Math.floor((now - lastSeenAt.getTime()) / 86400000);
      const stage = pickStage(dSignup, dSeen, signupAt);
      if (!stage) continue;
      if ((sentMap[uid] || {})[stage]) continue;            // já mandou esse
      const tpl = EMAILS[stage];
      if (!tpl) continue;
      const unsubHref = `${SITE_URL}/api/unsub?u=${encodeURIComponent(uid)}&t=${await unsubToken(env, uid)}`;
      const ok = await sendEmail(env, { to: email, subject: tpl.subject, html: tpl.html(stage, unsubHref) });
      if (ok) { await markSent(env, uid, stage); sent++; }
    } catch (e) {
      console.error('Retenção: erro num usuário:', String(e));
    }
  }
  console.log(`Retenção: ${users.length} usuários varridos, ${sent} e-mails enviados.`);
}

// Qual e-mail cabe hoje pra essa pessoa. Um por fase; não faz backfill (quem já
// está no dia 6 quando o sistema liga recebe o do dia 6, não o de boas-vindas).
function pickStage(dSignup, dSeen, signupAt) {
  const postLaunch = signupAt.getTime() >= LAUNCH_DATE.getTime();
  if (postLaunch) {
    if (dSignup >= 1 && dSignup <= 2) return 'welcome';
    if (dSignup >= 3 && dSignup <= 5) return 'value';
    if (dSignup === 6 || dSignup === 7) return 'trial_end_soon';
    if (dSignup >= 8 && dSignup <= 13) return 'trial_ended';
  }
  if (dSeen >= 14) return 'winback';
  return null;
}

function idOf(doc) { return String(doc.name || '').split('/').pop(); }

function tsField(fields, name) {
  const f = fields && fields[name];
  const v = f && f.timestampValue;
  return v ? new Date(v) : null;
}

async function listAll(env, collection, masks) {
  const out = [];
  let pageToken = '';
  do {
    const token = await getGoogleAccessToken(env);
    const params = new URLSearchParams();
    params.set('pageSize', '300');
    if (pageToken) params.set('pageToken', pageToken);
    for (const m of (masks || [])) params.append('mask.fieldPaths', m);
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}?${params.toString()}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) { console.error('Firestore list falhou:', collection, res.status); break; }
    const data = await res.json();
    (data.documents || []).forEach(x => out.push(x));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

// Marca a fase como enviada sem apagar as outras (field path aninhado no map).
async function markSent(env, uid, stage) {
  const token = await getGoogleAccessToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/userMeta/${uid}?updateMask.fieldPaths=${encodeURIComponent('retentionSent.' + stage)}`;
  const body = { fields: { retentionSent: { mapValue: { fields: { [stage]: { timestampValue: new Date().toISOString() } } } } } };
  const res = await fetch(url, { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) console.error('markSent falhou:', uid, stage, res.status);
}

async function sendEmail(env, { to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM || 'Munny <ola@munnygestorfinanceiro.com>', to, subject, html }),
  });
  if (!res.ok) { console.error('Resend falhou:', res.status, (await res.text()).slice(0, 300)); return false; }
  return true;
}

function ctaUrl(k) { return `${APP_URL}/?utm_source=email&utm_medium=lifecycle&utm_campaign=${encodeURIComponent(k)}`; }

function emailShell(heading, bodyHtml, ctaText, ctaHref, unsubHref) {
  return `<!doctype html><html><body style="margin:0;background:#FBF7EF;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#241F18;">`
    + `<div style="max-width:520px;margin:0 auto;padding:32px 20px;">`
    + `<div style="font-weight:800;font-size:20px;letter-spacing:-.02em;margin-bottom:22px;">`
    + `<span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;background:#6F8E7F;color:#fff;border-radius:7px;vertical-align:middle;margin-right:8px;">$</span>Munny</div>`
    + `<div style="background:#FFFDF9;border:1px solid #EBE2D2;border-radius:16px;padding:28px 26px;">`
    + `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;letter-spacing:-.02em;color:#241F18;">${heading}</h1>`
    + `<div style="font-size:15px;line-height:1.55;color:#5A5347;">${bodyHtml}</div>`
    + `<a href="${ctaHref}" style="display:inline-block;margin-top:22px;background:#C2673F;color:#FFFDF9;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:12px;">${ctaText}</a>`
    + `</div>`
    + `<p style="font-size:12px;color:#8A7C67;margin-top:18px;line-height:1.5;">Você recebe este e-mail porque criou uma conta no Munny.${unsubHref ? ` Não quer mais? <a href="${unsubHref}" style="color:#8A7C67;text-decoration:underline;">Descadastrar</a>.` : ''}</p>`
    + `</div></body></html>`;
}

const EMAILS = {
  welcome: {
    subject: 'Seu painel do Munny já está te esperando',
    html: (k, unsub) => emailShell('Bora ver pra onde vai o seu dinheiro',
      '<p style="margin:0 0 10px;">Você criou sua conta, agora falta o principal: coloque sua renda e lance o primeiro gasto. Leva uns 3 segundos e o Munny já divide tudo sozinho em Necessidades, Desejos e Poupança.</p>',
      'Abrir o Munny', ctaUrl(k), unsub),
  },
  value: {
    subject: 'Quanto ainda dá pra gastar este mês?',
    html: (k, unsub) => emailShell('O Munny responde isso na hora',
      '<p style="margin:0 0 10px;">Cada gasto que você lança já entra na categoria certa. Assim você sempre sabe quanto ainda cabe, sem ficar fazendo conta na cabeça.</p>',
      'Ver meu painel', ctaUrl(k), unsub),
  },
  trial_end_soon: {
    subject: 'Seu teste do Munny está acabando',
    html: (k, unsub) => emailShell('Faltam poucos dias do seu teste',
      '<p style="margin:0 0 10px;">Pra continuar com tudo, dá pra assinar por R$ 16,99/mês no plano anual. Sua carteira e seu histórico ficam exatamente do jeito que estão.</p>',
      'Continuar no Munny', ctaUrl(k), unsub),
  },
  trial_ended: {
    subject: 'Seu teste acabou, mas seus dados estão guardados',
    html: (k, unsub) => emailShell('Volta em um clique',
      '<p style="margin:0 0 10px;">Seu histórico e sua carteira continuam salvos esperando você. Assine pra voltar a acompanhar seu mês de onde parou.</p>',
      'Assinar agora', ctaUrl(k), unsub),
  },
  winback: {
    subject: 'Faz tempo que você não aparece no Munny',
    html: (k, unsub) => emailShell('Seu dinheiro continua acontecendo',
      '<p style="margin:0 0 10px;">Que tal uma olhada rápida em como está o mês? Em poucos segundos você atualiza seus gastos e vê quanto ainda dá pra gastar.</p>',
      'Voltar pro Munny', ctaUrl(k), unsub),
  },
};

// Descadastro: token assinado (HMAC com a chave da service account, que é
// secreta e nunca sai do servidor). Sem isso, qualquer um tiraria os outros da
// lista só trocando o uid na URL.
async function unsubToken(env, uid) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('munny-unsub:' + sa.private_key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(uid)));
  return [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function handleUnsub(request, env) {
  const url = new URL(request.url);
  const uid = url.searchParams.get('u') || '';
  const t = url.searchParams.get('t') || '';
  if (!uid || !t || !env.FIREBASE_SERVICE_ACCOUNT) return unsubPage('Link inválido', 'Esse link de descadastro não é válido.');
  if (!timingSafeEqual(t, await unsubToken(env, uid))) return unsubPage('Link inválido', 'Esse link de descadastro não é válido ou já mudou.');
  try {
    await firestorePatch(env, `userMeta/${uid}`, {
      unsubscribed: { booleanValue: true },
      unsubscribedAt: { timestampValue: new Date().toISOString() },
    });
  } catch (e) {
    console.error('unsub falhou:', String(e));
    return unsubPage('Ops', 'Não consegui processar agora. Tenta de novo em instantes.');
  }
  return unsubPage('Pronto', 'Você não vai mais receber os e-mails de lembrete do Munny. Se mudar de ideia, é só voltar a usar o app normalmente.');
}

function unsubPage(title, msg) {
  const body = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Munny</title></head>`
    + `<body style="margin:0;background:#FBF7EF;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#241F18;">`
    + `<div style="max-width:460px;margin:0 auto;padding:64px 24px;text-align:center;">`
    + `<div style="font-weight:800;font-size:22px;margin-bottom:20px;"><span style="display:inline-block;width:30px;height:30px;line-height:30px;background:#6F8E7F;color:#fff;border-radius:8px;margin-right:8px;">$</span>Munny</div>`
    + `<h1 style="font-size:24px;margin:0 0 10px;letter-spacing:-.02em;">${title}</h1>`
    + `<p style="color:#5A5347;font-size:16px;line-height:1.55;">${msg}</p>`
    + `</div></body></html>`;
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ============================ /api/sales (dev) =============================
// Contador de vendas pro dono, lido direto do Firestore (subscriptions). Só o
// dev logado acessa: verifica o ID token e checa o e-mail. Assinatura ativa =
// validUntil no futuro (mesma regra do acesso). Também conta quantos iniciaram
// o checkout (adAttribution), como referência de funil.
async function handleSales(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await verifyFirebaseToken(idToken);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if ((user.email || '').toLowerCase() !== DEV_EMAIL) return json({ error: 'forbidden' }, 403);

  const now = Date.now();
  const subs = await listAll(env, 'subscriptions', ['status', 'plan', 'validUntil']);
  let active = 0, anual = 0, mensal = 0, mrr = 0;
  for (const d of subs) {
    const vu = tsField(d.fields, 'validUntil');
    if (vu && vu.getTime() > now) {
      active++;
      if (strField(d.fields, 'plan') === 'anual') { anual++; mrr += PLANS.anual.amount / 12; }
      else { mensal++; mrr += PLANS.mensal.amount; }
    }
  }
  const att = await listAll(env, 'adAttribution', []);
  return json({
    activeCount: active,
    anual,
    mensal,
    mrr: Math.round(mrr * 100) / 100,
    totalSubs: subs.length,
    startedCheckouts: att.length,
  });
}

// ================================ Helpers ==================================

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlDecode(s) {
  return new TextDecoder().decode(b64urlToBytes(s));
}

function b64urlEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToBytes(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
