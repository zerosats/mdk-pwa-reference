import {
  generateMnemonic as scureGenerateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic as scureValidateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { hex } from '@scure/base';

const DERIVATION_PATH = "m/44'/0'/0'/0";

export function derivePrivateKey(mnemonicPhrase: string, index: number): string {
  const seed = mnemonicToSeedSync(mnemonicPhrase);
  const hdKey = HDKey.fromMasterSeed(seed);
  const derived = hdKey.derive(`${DERIVATION_PATH}/${index}`);
  if (!derived.privateKey) {
    throw new Error('Failed to derive private key');
  }
  return hex.encode(derived.privateKey);
}

export function generateMnemonic(strength = 128): string {
  return scureGenerateMnemonic(wordlist, strength);
}

export function validateMnemonic(phrase: string): boolean {
  return scureValidateMnemonic(phrase, wordlist);
}

export function isLegacyPrivateKey(input: unknown): input is string {
  return (
    typeof input === 'string'
    && input.length === 64
    && /^[0-9a-fA-F]+$/.test(input)
  );
}

export { DERIVATION_PATH };
