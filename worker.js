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
const SITE_URL = 'https://munnygestorfinanceiro.com';

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
        if (url.pathname === '/api/webhook' && request.method === 'POST') {
          return await handleWebhook(request, env);
        }
        return json({ error: 'not_found' }, 404);
      } catch (err) {
        console.error('API error:', err && err.stack || err);
        return json({ error: 'internal' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
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
      back_url: `${SITE_URL}/?assinatura=voltou`,
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
    console.error('MP preapproval falhou:', res.status, JSON.stringify(data).slice(0, 500));
    return json({ error: 'mp_error' }, 502);
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
