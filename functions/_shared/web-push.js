const encoder = new TextEncoder();
const MAX_RECORD_SIZE = 4096;

function concatenateBytes(...parts) {
  const totalLength = parts.reduce((length, part) => length + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function decodeBase64Url(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value) {
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

async function hkdfExtract(salt, inputKeyMaterial) {
  return hmacSha256(salt, inputKeyMaterial);
}

async function hkdfExpand(pseudorandomKey, info, length) {
  const output = new Uint8Array(length);
  let previousBlock = new Uint8Array();
  let offset = 0;
  for (let counter = 1; offset < length; counter += 1) {
    previousBlock = await hmacSha256(
      pseudorandomKey,
      concatenateBytes(previousBlock, info, Uint8Array.of(counter))
    );
    const blockLength = Math.min(previousBlock.length, length - offset);
    output.set(previousBlock.subarray(0, blockLength), offset);
    offset += blockLength;
  }
  return output;
}

async function encryptPushPayload(subscription, payload) {
  const clientPublicKeyBytes = decodeBase64Url(subscription.keys.p256dh);
  const authSecret = decodeBase64Url(subscription.keys.auth);
  if (clientPublicKeyBytes.length !== 65 || authSecret.length !== 16) {
    throw new Error("Kunci langganan push memiliki format yang tidak valid.");
  }

  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const serverPublicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey)
  );
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey },
    serverKeyPair.privateKey,
    256
  ));

  const authPseudorandomKey = await hkdfExtract(authSecret, sharedSecret);
  const inputKeyMaterial = await hkdfExpand(
    authPseudorandomKey,
    concatenateBytes(
      encoder.encode("WebPush: info\0"),
      clientPublicKeyBytes,
      serverPublicKeyBytes
    ),
    32
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pseudorandomKey = await hkdfExtract(salt, inputKeyMaterial);
  const contentEncryptionKey = await hkdfExpand(
    pseudorandomKey,
    encoder.encode("Content-Encoding: aes128gcm\0"),
    16
  );
  const nonce = await hkdfExpand(
    pseudorandomKey,
    encoder.encode("Content-Encoding: nonce\0"),
    12
  );
  const plaintext = concatenateBytes(encoder.encode(payload), Uint8Array.of(2));
  if (plaintext.length + 16 > MAX_RECORD_SIZE) {
    throw new Error("Isi notifikasi melebihi batas ukuran Web Push.");
  }

  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    plaintext
  ));
  const header = new Uint8Array(21 + serverPublicKeyBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, MAX_RECORD_SIZE, false);
  header[20] = serverPublicKeyBytes.length;
  header.set(serverPublicKeyBytes, 21);
  return concatenateBytes(header, ciphertext);
}

async function createVapidAuthorization(endpoint, env) {
  const publicKeyBytes = decodeBase64Url(env.CHAT_VAPID_PUBLIC_KEY);
  const privateKeyBytes = decodeBase64Url(env.CHAT_VAPID_PRIVATE_KEY);
  if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 4 || privateKeyBytes.length !== 32) {
    throw new Error("Pasangan kunci VAPID memiliki format yang tidak valid.");
  }

  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.CHAT_VAPID_SUBJECT
  };
  const encodedHeader = encodeBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const encodedClaims = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;
  const signingKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: encodeBase64Url(publicKeyBytes.subarray(1, 33)),
      y: encodeBase64Url(publicKeyBytes.subarray(33, 65)),
      d: encodeBase64Url(privateKeyBytes),
      ext: true,
      key_ops: ["sign"]
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    encoder.encode(unsignedToken)
  ));
  if (signature.length !== 64) {
    throw new Error("Browser Web Crypto menghasilkan tanda tangan VAPID yang tidak valid.");
  }
  return `vapid t=${unsignedToken}.${encodeBase64Url(signature)}, k=${env.CHAT_VAPID_PUBLIC_KEY}`;
}

export async function sendWebPushNotification(subscription, payload, env) {
  const body = await encryptPushPayload(subscription, payload);
  const authorization = await createVapidAuthorization(subscription.endpoint, env);
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "60",
      Urgency: "normal"
    },
    body
  });
}
