import { HDKey } from '@scure/bip32';
import {
  generateMnemonic as scureGenerateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic as scureValidateMnemonic,
  entropyToMnemonic as scureEntropyToMnemonic,
  mnemonicToEntropy as scureMnemonicToEntropy,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

const DERIVATION_PATHS = {
  ARKADE: "m/84'/0'/0'",
  CASHU: "m/44'/1969'/0'",
  LENDASWAP: "m/44'/1970'/0'",
} as const;

function deriveChildKey(mnemonic: string, path: string): HDKey {
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  return root.derive(path);
}

export function deriveArkadeMnemonic(mnemonic: string): string {
  const derived = deriveChildKey(mnemonic, DERIVATION_PATHS.ARKADE);
  if (!derived.privateKey) throw new Error('Failed to derive Arkade key');
  return scureEntropyToMnemonic(derived.privateKey, wordlist);
}

export function deriveLendaswapMnemonic(mnemonic: string): string {
  const derived = deriveChildKey(mnemonic, DERIVATION_PATHS.LENDASWAP);
  if (!derived.privateKey) throw new Error('Failed to derive Lendaswap key');
  return scureEntropyToMnemonic(derived.privateKey, wordlist);
}

export function deriveArkadeSeed(mnemonic: string): Uint8Array {
  const derived = deriveChildKey(mnemonic, DERIVATION_PATHS.ARKADE);
  if (!derived.privateKey) throw new Error('Failed to derive Arkade seed');
  return derived.privateKey;
}

export function generateMnemonic(strength = 256): string {
  return scureGenerateMnemonic(wordlist, strength);
}

export function validateMnemonic(phrase: string): boolean {
  if (!phrase || typeof phrase !== 'string') return false;
  return scureValidateMnemonic(phrase, wordlist);
}

export function mnemonicToSeed(phrase: string): Uint8Array {
  if (!validateMnemonic(phrase)) {
    throw new Error('Invalid mnemonic phrase');
  }
  return mnemonicToSeedSync(phrase);
}

export function getWordCount(phrase: string): number {
  if (!phrase || typeof phrase !== 'string') return 0;
  return phrase.trim().split(/\s+/).length;
}

export function entropyToMnemonic(entropy: Uint8Array): string {
  return scureEntropyToMnemonic(entropy, wordlist);
}

export function mnemonicToEntropy(mnemonic: string): Uint8Array {
  return scureMnemonicToEntropy(mnemonic, wordlist);
}

export { DERIVATION_PATHS };
