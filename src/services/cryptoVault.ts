const DEFAULT_ITERATIONS = 310000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface VaultEnvelopeV1 {
  version: 1;
  kdf: 'PBKDF2-SHA-256';
  salt: string;
  iterations: number;
  iv: string;
  ciphertext: string;
}

export interface VaultEnvelopeV2 {
  version: 2;
  kdf: 'HKDF-SHA-256';
  iv: string;
  ciphertext: string;
}

export type VaultEnvelope = VaultEnvelopeV1 | VaultEnvelopeV2;

const HKDF_SENTINEL_SALT = 'hkdf-derived';

interface SessionKeyContext {
  key: CryptoKey;
  salt: string;
  iterations: number;
}

let session: SessionKeyContext | null = null;

function assertWebCrypto(): void {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('WebCrypto API not available');
  }
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  assertWebCrypto();

  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encodeUtf8(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    passphraseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptWithKey(
  plaintext: string,
  key: CryptoKey,
  iv: Uint8Array
): Promise<string> {
  assertWebCrypto();
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    encodeUtf8(plaintext)
  );
  return bytesToBase64(new Uint8Array(ciphertext));
}

async function decryptWithKey(
  ciphertextBase64: string,
  key: CryptoKey,
  iv: Uint8Array
): Promise<string> {
  assertWebCrypto();
  const ciphertext = base64ToBytes(ciphertextBase64);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    ciphertext
  );
  return decodeUtf8(new Uint8Array(plaintext));
}

export function getDefaultVaultIterations(): number {
  return DEFAULT_ITERATIONS;
}

export function isUnlocked(): boolean {
  return session !== null;
}

export function lock(): void {
  session = null;
}

export function setSessionKey(key: CryptoKey): void {
  session = { key, salt: HKDF_SENTINEL_SALT, iterations: 0 };
}

export function isHkdfSession(): boolean {
  return session?.salt === HKDF_SENTINEL_SALT;
}

export async function createEnvelope(
  plaintext: string,
  passphrase: string,
  iterations = DEFAULT_ITERATIONS
): Promise<VaultEnvelopeV1> {
  if (!passphrase) {
    throw new Error('Passphrase is required');
  }
  if (!Number.isInteger(iterations) || iterations < 100000) {
    throw new Error('Invalid PBKDF2 iterations');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, iterations);
  const ciphertext = await encryptWithKey(plaintext, key, iv);

  return {
    version: 1,
    kdf: 'PBKDF2-SHA-256',
    salt: bytesToBase64(salt),
    iterations,
    iv: bytesToBase64(iv),
    ciphertext,
  };
}

export function isVaultEnvelopeV1(value: unknown): value is VaultEnvelopeV1 {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const envelope = value as Partial<VaultEnvelopeV1>;
  return (
    envelope.version === 1
    && envelope.kdf === 'PBKDF2-SHA-256'
    && typeof envelope.salt === 'string'
    && typeof envelope.iterations === 'number'
    && typeof envelope.iv === 'string'
    && typeof envelope.ciphertext === 'string'
  );
}

function isVaultEnvelopeV2(value: unknown): value is VaultEnvelopeV2 {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const envelope = value as Partial<VaultEnvelopeV2>;
  return (
    envelope.version === 2
    && envelope.kdf === 'HKDF-SHA-256'
    && typeof envelope.iv === 'string'
    && typeof envelope.ciphertext === 'string'
  );
}

export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  return isVaultEnvelopeV1(value) || isVaultEnvelopeV2(value);
}

export async function unlockWithPassphrase(
  envelope: VaultEnvelope,
  passphrase: string
): Promise<string> {
  if (!passphrase) {
    throw new Error('Passphrase is required');
  }
  if (!isVaultEnvelopeV1(envelope)) {
    throw new Error('Invalid vault envelope');
  }

  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const key = await deriveKey(passphrase, salt, envelope.iterations);
  const plaintext = await decryptWithKey(envelope.ciphertext, key, iv);

  session = {
    key,
    salt: envelope.salt,
    iterations: envelope.iterations,
  };

  return plaintext;
}

export async function decryptWithSession(
  envelope: VaultEnvelope
): Promise<string | null> {
  if (!session) {
    return null;
  }
  if (!isVaultEnvelope(envelope)) {
    return null;
  }

  if (isVaultEnvelopeV2(envelope)) {
    if (!isHkdfSession()) {
      return null;
    }
  } else {
    if (session.salt !== envelope.salt || session.iterations !== envelope.iterations) {
      return null;
    }
  }

  try {
    return await decryptWithKey(
      envelope.ciphertext,
      session.key,
      base64ToBytes(envelope.iv)
    );
  } catch {
    return null;
  }
}

export async function encryptWithSession(
  plaintext: string
): Promise<VaultEnvelope> {
  if (!session) {
    throw new Error('Vault is locked');
  }

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await encryptWithKey(plaintext, session.key, iv);

  if (isHkdfSession()) {
    return {
      version: 2,
      kdf: 'HKDF-SHA-256',
      iv: bytesToBase64(iv),
      ciphertext,
    };
  }

  return {
    version: 1,
    kdf: 'PBKDF2-SHA-256',
    salt: session.salt,
    iterations: session.iterations,
    iv: bytesToBase64(iv),
    ciphertext,
  };
}
