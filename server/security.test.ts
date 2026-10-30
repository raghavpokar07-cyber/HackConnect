import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizeCertificateImage } from "./certificate-image.js";
import {
  createCsrfToken,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpCode,
  verifyCsrfToken,
  verifyTotpCode,
} from "./security.js";

test("TOTP matches the RFC 6238 SHA-1 test vector", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(generateTotpCode(secret, 1), "287082");
  assert.equal(verifyTotpCode(secret, "287082", 59_000), 1);
  assert.equal(verifyTotpCode(secret, "000000", 59_000), null);
});

test("TOTP codes cannot be reused for a consumed time step", () => {
  const secret = "JBSWY3DPEHPK3PXP";
  const step = 60_000 / 30_000;
  const code = generateTotpCode(secret, step);
  assert.equal(verifyTotpCode(secret, code, step * 30_000, step), null);
});

test("authenticator secrets are encrypted and recoverable only with the signing key", () => {
  const secret = "JBSWY3DPEHPK3PXP";
  const encrypted = encryptTotpSecret(secret, "test-signing-key-that-is-at-least-32-characters");
  assert.notEqual(encrypted, secret);
  assert.equal(
    decryptTotpSecret(encrypted, "test-signing-key-that-is-at-least-32-characters"),
    secret,
  );
  assert.throws(() =>
    decryptTotpSecret(encrypted, "a-different-signing-key-that-is-32-characters"),
  );
});

test("CSRF tokens are signed and reject modified or unsigned values", () => {
  const key = "test-signing-key-that-is-at-least-32-characters";
  const token = createCsrfToken(key);
  assert.equal(verifyCsrfToken(token, key), true);
  assert.equal(verifyCsrfToken(`${token}x`, key), false);
  assert.equal(verifyCsrfToken("attacker-controlled", key), false);
});

test("certificate photos are fully decoded and normalized to WebP", async () => {
  const png = await sharp({
    create: { width: 24, height: 18, channels: 3, background: "#ffffff" },
  }).png().toBuffer();
  const normalized = await normalizeCertificateImage(png);
  assert.equal((await sharp(normalized).metadata()).format, "webp");
  await assert.rejects(normalizeCertificateImage(Buffer.from("<svg></svg>")));
  await assert.rejects(normalizeCertificateImage(Buffer.from("not an image")));
});
