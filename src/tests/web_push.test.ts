import { describe, expect, it, vi } from "vitest";
import { sendWebPushNotification } from "../../functions/_shared/web-push.js";

const encoder = new TextEncoder();

function copyBytes(value: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

function toArrayBuffer(value: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  return copyBytes(value).buffer;
}

function encodeBase64Url(value: Uint8Array<ArrayBufferLike>): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function concatenateBytes(...parts: Uint8Array<ArrayBufferLike>[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

async function hmac(
  keyBytes: Uint8Array<ArrayBufferLike>,
  data: Uint8Array<ArrayBufferLike>
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(data)));
}

async function derive(
  pseudorandomKey: Uint8Array<ArrayBufferLike>,
  info: Uint8Array<ArrayBufferLike>,
  length: number
): Promise<Uint8Array<ArrayBuffer>> {
  let previousBlock = new Uint8Array(0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (let counter = 1; offset < length; counter += 1) {
    previousBlock = await hmac(pseudorandomKey, concatenateBytes(
      previousBlock,
      info,
      Uint8Array.of(counter)
    ));
    const blockLength = Math.min(previousBlock.length, length - offset);
    output.set(previousBlock.subarray(0, blockLength), offset);
    offset += blockLength;
  }
  return output;
}

describe("Cloudflare-compatible Web Push encryption", () => {
  it("creates a standards-compliant VAPID request with an encrypted payload", async () => {
    const clientKeyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );
    const clientPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", clientKeyPair.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const vapidKeyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const vapidPrivateJwk = await crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
    const vapidPublicKey = concatenateBytes(
      Uint8Array.of(4),
      decodeBase64Url(vapidPrivateJwk.x!),
      decodeBase64Url(vapidPrivateJwk.y!)
    );
    const env = {
      CHAT_VAPID_PUBLIC_KEY: encodeBase64Url(vapidPublicKey),
      CHAT_VAPID_PRIVATE_KEY: vapidPrivateJwk.d!,
      CHAT_VAPID_SUBJECT: "mailto:admin@example.com"
    };
    const pushEndpoint = "https://push.example.test/subscription-id";
    const payload = JSON.stringify({
      title: "Grup Dokter",
      body: "Pesan masuk",
      url: "/?tab=chat"
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await sendWebPushNotification({
        endpoint: pushEndpoint,
        keys: {
          p256dh: encodeBase64Url(clientPublicKey),
          auth: encodeBase64Url(authSecret)
        }
      }, payload, env);

      expect(response.status).toBe(201);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl, init] = fetchMock.mock.calls[0];
      expect(requestUrl).toBe(pushEndpoint);
      const headers = new Headers(init?.headers);
      expect(headers.get("Content-Encoding")).toBe("aes128gcm");
      expect(headers.get("TTL")).toBe("60");

      const authorization = headers.get("Authorization")!;
      const [, token] = authorization.match(/^vapid t=([^,]+), k=(.+)$/)!;
      const [encodedHeader, encodedClaims, encodedSignature] = token.split(".");
      const signingInput = encoder.encode(`${encodedHeader}.${encodedClaims}`);
      const verificationKey = await crypto.subtle.importKey(
        "raw",
        toArrayBuffer(vapidPublicKey),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );
      expect(await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        verificationKey,
        toArrayBuffer(decodeBase64Url(encodedSignature)),
        toArrayBuffer(signingInput)
      )).toBe(true);
      expect(JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedClaims)))).toMatchObject({
        aud: "https://push.example.test",
        sub: "mailto:admin@example.com"
      });

      const requestBody = new Uint8Array(init?.body as ArrayBuffer);
      const salt = requestBody.subarray(0, 16);
      const recordSize = new DataView(requestBody.buffer).getUint32(16, false);
      expect(recordSize).toBe(4096);
      const serverKeyLength = requestBody[20];
      const serverPublicKeyBytes = requestBody.subarray(21, 21 + serverKeyLength);
      const serverPublicKey = await crypto.subtle.importKey(
        "raw",
        toArrayBuffer(serverPublicKeyBytes),
        { name: "ECDH", namedCurve: "P-256" },
        false,
        []
      );
      const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
        { name: "ECDH", public: serverPublicKey },
        clientKeyPair.privateKey,
        256
      ));
      const authPseudorandomKey = await hmac(authSecret, sharedSecret);
      const inputKeyMaterial = await derive(
        authPseudorandomKey,
        concatenateBytes(
          encoder.encode("WebPush: info\0"),
          clientPublicKey,
          serverPublicKeyBytes
        ),
        32
      );
      const pseudorandomKey = await hmac(salt, inputKeyMaterial);
      const contentEncryptionKey = await derive(
        pseudorandomKey,
        encoder.encode("Content-Encoding: aes128gcm\0"),
        16
      );
      const nonce = await derive(
        pseudorandomKey,
        encoder.encode("Content-Encoding: nonce\0"),
        12
      );
      const aesKey = await crypto.subtle.importKey(
        "raw",
        contentEncryptionKey,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
      const plaintext = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(nonce), tagLength: 128 },
        aesKey,
        toArrayBuffer(requestBody.subarray(21 + serverKeyLength))
      ));
      expect(plaintext[plaintext.length - 1]).toBe(2);
      expect(new TextDecoder().decode(plaintext.subarray(0, -1))).toBe(payload);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
