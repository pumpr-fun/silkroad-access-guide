const { randomBytes } = require("node:crypto");
const nacl = require("tweetnacl");
const bs58Module = require("bs58");
const bs58 = bs58Module.default || bs58Module;

const ORIGIN = "https://smedcharger.xyz";
const PAIRING_TTL_MS = 10 * 60 * 1000;
const SESSION_PREFIX = "phantom-pairing-";

function apiConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!url || !key) throw new Error("Phantom pairing storage is not configured");
  return { url, key };
}

function json(res, status, body) {
  res.setHeader("cache-control", "no-store");
  res.status(status).json(body);
}

function base58(bytes) {
  return bs58.encode(Buffer.from(bytes));
}

function unbase58(value) {
  return new Uint8Array(bs58.decode(String(value || "")));
}

async function supabase(path, options = {}) {
  const { url, key } = apiConfig();
  const response = await fetch(`${url}/rest/v1/silk_sessions${path}`, {
    ...options,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: options.prefer || "return=minimal",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Pairing storage returned HTTP ${response.status}`);
  return text ? JSON.parse(text) : null;
}

async function savePairing(pairing) {
  await supabase("?on_conflict=sid", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify({
      sid: `${SESSION_PREFIX}${pairing.id}`,
      sess: pairing,
      expire: pairing.expiresAt
    })
  });
}

async function loadPairing(id) {
  if (!/^[A-Za-z0-9_-]{32,96}$/.test(String(id || ""))) return null;
  const rows = await supabase(`?sid=eq.${encodeURIComponent(`${SESSION_PREFIX}${id}`)}&expire=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`, { method: "GET", prefer: "return=representation" });
  return rows?.[0]?.sess || null;
}

function expired(pairing) {
  return !pairing || Date.parse(pairing.expiresAt) <= Date.now();
}

function callbackUrl(id) {
  return `${ORIGIN}/api/phantom-pairing?action=callback&id=${encodeURIComponent(id)}`;
}

function decryptResponse(pairing, query) {
  const phantomPublic = query.phantom_encryption_public_key || pairing.phantomPublic;
  if (!phantomPublic) throw new Error("Phantom encryption key is missing");
  const shared = nacl.box.before(unbase58(phantomPublic), unbase58(pairing.dappSecret));
  const clear = nacl.box.open.after(unbase58(query.data), unbase58(query.nonce), shared);
  if (!clear) throw new Error("Phantom response could not be decrypted");
  return { data: JSON.parse(Buffer.from(clear).toString("utf8")), shared };
}

function connectUrl(pairing) {
  const query = new URLSearchParams({
    app_url: ORIGIN,
    dapp_encryption_public_key: pairing.dappPublic,
    redirect_link: callbackUrl(pairing.id),
    cluster: "mainnet-beta"
  });
  return `https://phantom.app/ul/v1/connect?${query}`;
}

function signUrl(pairing, shared) {
  const nonce = randomBytes(nacl.box.nonceLength);
  const payload = nacl.box.after(Buffer.from(JSON.stringify({
    message: base58(Buffer.from(pairing.message, "utf8")),
    session: pairing.phantomSession,
    display: "utf8"
  })), nonce, shared);
  const query = new URLSearchParams({
    dapp_encryption_public_key: pairing.dappPublic,
    nonce: base58(nonce),
    redirect_link: callbackUrl(pairing.id),
    payload: base58(payload)
  });
  return `https://phantom.app/ul/v1/signMessage?${query}`;
}

function callbackPage(res, title, message, error = false) {
  res.setHeader("cache-control", "no-store");
  res.status(error ? 400 : 200).send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><main><p>SILK ROAD // PHANTOM</p><h1>${title}</h1><p>${message}</p></main><style>body{margin:0;background:#120d06;color:#f3e5bc;font:16px/1.6 system-ui;display:grid;min-height:100vh;place-items:center}main{max-width:520px;padding:36px;border:1px solid #a98031;background:#211708}h1{font:700 38px Georgia,serif}main>p:first-child{color:#d9b554;font:700 11px monospace;letter-spacing:.16em}</style>`);
}

module.exports = async (req, res) => {
  try {
    const action = String(req.query.action || "");
    if (req.method === "POST" && action === "start") {
      const keyPair = nacl.box.keyPair();
      const id = randomBytes(32).toString("base64url");
      const nonce = randomBytes(18).toString("base64url");
      const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
      const pairing = {
        id,
        createdAt: new Date().toISOString(),
        expiresAt,
        status: "awaiting_connection",
        dappPublic: base58(keyPair.publicKey),
        dappSecret: base58(keyPair.secretKey),
        loginNonce: nonce,
        message: `Silk Road Phantom login\nSession: ${id}\nNonce: ${nonce}\nExpires: ${expiresAt}\n\nThis signs in to Silk Road. It is not a transaction and has no network fee.`
      };
      await savePairing(pairing);
      return json(res, 201, { id, expiresAt, connectUrl: connectUrl(pairing) });
    }

    const id = String(req.query.id || req.body?.id || "");
    if (req.method === "GET" && action === "status") {
      const pairing = await loadPairing(id);
      if (expired(pairing)) return json(res, 404, { error: "Pairing expired or was not found" });
      return json(res, 200, { id: pairing.id, status: pairing.status, expiresAt: pairing.expiresAt, ...(pairing.status === "approved" ? { address: pairing.address } : {}) });
    }

    if (req.method === "POST" && action === "consume") {
      const pairing = await loadPairing(id);
      if (expired(pairing)) return json(res, 404, { error: "Pairing expired or was not found" });
      if (pairing.status !== "approved") return json(res, 409, { error: "Pairing has not been approved" });
      pairing.status = "consumed";
      await savePairing(pairing);
      return json(res, 200, { address: pairing.address, expiresAt: pairing.expiresAt });
    }

    if (req.method === "GET" && action === "callback") {
      const pairing = await loadPairing(id);
      if (expired(pairing)) return callbackPage(res, "Pairing expired", "Return to the Tor page and start a new Phantom login.", true);
      if (req.query.errorCode) return callbackPage(res, "Connection not approved", "No wallet connection or signature was accepted.", true);
      const { data, shared } = decryptResponse(pairing, req.query);
      if (pairing.status === "awaiting_connection") {
        if (!data.public_key || !data.session) throw new Error("Phantom did not return a wallet session");
        pairing.status = "awaiting_signature";
        pairing.address = String(data.public_key);
        pairing.phantomSession = String(data.session);
        pairing.phantomPublic = String(req.query.phantom_encryption_public_key);
        await savePairing(pairing);
        res.setHeader("cache-control", "no-store");
        return res.redirect(302, signUrl(pairing, shared));
      }
      if (pairing.status === "awaiting_signature") {
        if (!data.signature || !pairing.address) throw new Error("Phantom did not return a signature");
        const verified = nacl.sign.detached.verify(Buffer.from(pairing.message, "utf8"), unbase58(data.signature), unbase58(pairing.address));
        if (!verified) throw new Error("Phantom signature verification failed");
        pairing.status = "approved";
        pairing.approvedAt = new Date().toISOString();
        await savePairing(pairing);
        return callbackPage(res, "Phantom approved", "Return to the Tor page. It will finish signing you in automatically.");
      }
      return callbackPage(res, "Pairing already completed", "Return to the Tor page to continue.");
    }

    return json(res, 404, { error: "Unknown Phantom pairing route" });
  } catch (error) {
    if (req.query.action === "callback") return callbackPage(res, "Phantom pairing failed", "The secure wallet response could not be accepted. Return to Tor and try again.", true);
    return json(res, 500, { error: "Phantom pairing is temporarily unavailable" });
  }
};
