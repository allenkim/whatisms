import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

let warnedOnce = false;

function getKey(): Buffer | null {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    if (!warnedOnce) {
      console.warn(
        "[crypto] TOKEN_ENCRYPTION_KEY is not set — token encryption is disabled. " +
          "Set a 64-char hex string (32 bytes) in production."
      );
      warnedOnce = true;
    }
    return null;
  }
  if (hex.length !== 64) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be a 64-character hex string (got ${hex.length} chars)`
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a string in the format `iv:authTag:ciphertext` (all hex-encoded).
 * If TOKEN_ENCRYPTION_KEY is not set, returns plaintext unchanged.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a string previously produced by `encrypt()`.
 * Expects the `iv:authTag:ciphertext` hex format.
 * If TOKEN_ENCRYPTION_KEY is not set, returns the input unchanged.
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  if (!key) return encrypted;

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted format — expected iv:authTag:ciphertext"
    );
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
