import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getPublicKey } from 'nostr-tools';
import {
  entropyToMnemonic,
  mnemonicToEntropy,
} from '../lib/seed/derivation';

const MASTER_SALT = 'arkade-vpn-master';
const NOSTR_INFO = 'nostr-identity';
const VAULT_INFO = 'mdk-vault-key';
const WALLET_INFO = 'arkade-wallet';
const PASSWORD_SALT = 'arkade-vpn-password-kdf';
const PASSWORD_ITERATIONS = 900_000;

// secp256k1 curve order
const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

export interface DerivedKeys {
  nostrPrivkey: Uint8Array;
  vaultKey: CryptoKey;
  walletSeed: Uint8Array;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (const byte of bytes) {
    result = (result << BigInt(8)) + BigInt(byte);
  }
  return result;
}

function assertValidSecp256k1Scalar(key: Uint8Array): void {
  const scalar = bytesToBigInt(key);
  if (scalar === BigInt(0) || scalar >= SECP256K1_N) {
    throw new Error('Derived key is not a valid secp256k1 scalar');
  }
}

export async function deriveKeys(ikm: Uint8Array): Promise<DerivedKeys> {
  const encoder = new TextEncoder();
  const salt = encoder.encode(MASTER_SALT);
  const nostrInfo = encoder.encode(NOSTR_INFO);
  const vaultInfo = encoder.encode(VAULT_INFO);
  const walletInfo = encoder.encode(WALLET_INFO);

  const nostrPrivkey = hkdf(sha256, ikm, salt, nostrInfo, 32);
  assertValidSecp256k1Scalar(nostrPrivkey);

  const vaultBytes = hkdf(sha256, ikm, salt, vaultInfo, 32);
  const vaultKey = await crypto.subtle.importKey(
    'raw',
    vaultBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const walletSeed = hkdf(sha256, ikm, salt, walletInfo, 32);

  return { nostrPrivkey, vaultKey, walletSeed };
}

export async function ikmFromPassword(password: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  // Fixed salt is intentional — deterministic derivation is required for
  // cross-device recovery where the same password must produce the same IKM.
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(PASSWORD_SALT),
      iterations: PASSWORD_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  return new Uint8Array(bits);
}

export function ikmFromSeedPhrase(mnemonic: string): Uint8Array {
  return mnemonicToEntropy(mnemonic);
}

export function ikmToSeedPhrase(ikm: Uint8Array): string {
  return entropyToMnemonic(ikm);
}

export function pubkeyFromPrivkey(privkey: Uint8Array): string {
  return getPublicKey(privkey);
}
