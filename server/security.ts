import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const totpPeriodSeconds = 30;

function encryptionKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", secret, "hackconnect-mfa-v1", "totp-secret-encryption", 32),
  );
}

export function encryptTotpSecret(value: string, signingSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(signingSecret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptTotpSecret(value: string, signingSecret: string): string {
  const [version, encodedIv, encodedTag, encodedData] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedData) {
    throw new Error("Invalid encrypted authenticator secret.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(signingSecret),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedData, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let result = "";
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += base32Alphabet[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += base32Alphabet[(accumulator << (5 - bits)) & 31];
  return result;
}

function decodeBase32(value: string): Buffer | null {
  let accumulator = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase().replace(/=+$/, "")) {
    const digit = base32Alphabet.indexOf(character);
    if (digit < 0) return null;
    accumulator = (accumulator << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, step: number): string {
  const key = decodeBase32(secret);
  if (!key) throw new Error("Invalid authenticator secret.");
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary =
    ((digest[offset] & 127) << 24) |
    ((digest[offset + 1] & 255) << 16) |
    ((digest[offset + 2] & 255) << 8) |
    (digest[offset + 3] & 255);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

export function verifyTotpCode(
  secret: string,
  code: string,
  now = Date.now(),
  minimumStep = -1,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const currentStep = Math.floor(now / (totpPeriodSeconds * 1000));
  for (const step of [currentStep, currentStep - 1, currentStep + 1]) {
    if (step <= minimumStep) continue;
    const expected = Buffer.from(generateTotpCode(secret, step));
    const actual = Buffer.from(code);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return step;
  }
  return null;
}

export function createTotpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`HackConnect:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer: "HackConnect",
    algorithm: "SHA1",
    digits: "6",
    period: String(totpPeriodSeconds),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function createCsrfToken(signingSecret: string): string {
  const nonce = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", signingSecret).update(nonce).digest("base64url");
  return `${nonce}.${signature}`;
}

export function verifyCsrfToken(token: string, signingSecret: string): boolean {
  const [nonce, signature, extra] = token.split(".");
  if (!nonce || !signature || extra !== undefined) return false;
  const expected = createHmac("sha256", signingSecret).update(nonce).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
