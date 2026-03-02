import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as cryptoVault from '../services/cryptoVault';
import * as storage from '../services/storage';
import {
  generateMnemonic,
  validateMnemonic,
  getWordCount,
} from '../lib/seed/derivation';

export const useSeedStore = defineStore('seed', () => {
  const mnemonic = ref<string | null>(null);
  const initialized = ref(false);
  const locked = ref(true);
  const seedExists = ref(false);

  async function initialize(): Promise<void> {
    if (initialized.value) return;

    const hasEnvelope = await storage.hasEncryptedSeedEnvelope();
    seedExists.value = hasEnvelope;
    if (hasEnvelope) {
      locked.value = true;
    }

    initialized.value = true;
  }

  async function create(password: string, strength = 256): Promise<string> {
    const hasEnvelope = await storage.hasEncryptedSeedEnvelope();
    if (hasEnvelope) {
      throw new Error('Master seed already exists. Clear it first.');
    }

    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      throw new Error('Password is required');
    }

    const newMnemonic = generateMnemonic(strength);
    const envelope = await cryptoVault.createEnvelope(newMnemonic, normalizedPassword);
    await storage.setEncryptedSeedEnvelope(envelope);

    const verified = await cryptoVault.unlockWithPassphrase(envelope, normalizedPassword);
    if (verified !== newMnemonic) {
      throw new Error('Vault verification failed after seed creation');
    }

    mnemonic.value = newMnemonic;
    locked.value = false;
    seedExists.value = true;

    return newMnemonic;
  }

  async function unlock(password: string): Promise<void> {
    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      throw new Error('Password is required');
    }

    const envelope = await storage.getEncryptedSeedEnvelope();
    if (!envelope) {
      throw new Error('No encrypted seed found');
    }

    const decrypted = await cryptoVault.unlockWithPassphrase(envelope, normalizedPassword);
    if (!decrypted || !validateMnemonic(decrypted)) {
      throw new Error('Failed to decrypt or invalid mnemonic');
    }

    mnemonic.value = decrypted;
    locked.value = false;
  }

  function lock(): void {
    mnemonic.value = null;
    locked.value = true;
  }

  async function restore(phrase: string, password: string): Promise<void> {
    if (!validateMnemonic(phrase)) {
      throw new Error('Invalid mnemonic phrase');
    }

    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      throw new Error('Password is required');
    }

    const envelope = await cryptoVault.createEnvelope(phrase, normalizedPassword);
    await storage.setEncryptedSeedEnvelope(envelope);

    const verified = await cryptoVault.unlockWithPassphrase(envelope, normalizedPassword);
    if (verified !== phrase) {
      throw new Error('Vault verification failed during restore');
    }

    mnemonic.value = phrase;
    locked.value = false;
    seedExists.value = true;
  }

  function getMnemonic(): string {
    if (locked.value || !mnemonic.value) {
      throw new Error('Wallet is locked or no seed available');
    }
    return mnemonic.value;
  }

  async function clear(): Promise<void> {
    mnemonic.value = null;
    await storage.deleteEncryptedSeedEnvelope();
    initialized.value = false;
    locked.value = true;
    seedExists.value = false;
  }

  return {
    mnemonic: computed(() => mnemonic.value),
    isLocked: computed(() => locked.value),
    isInitialized: computed(() => initialized.value),
    hasSeed: computed(() => seedExists.value),
    wordCount: computed(() => (mnemonic.value ? getWordCount(mnemonic.value) : 0)),

    initialize,
    create,
    unlock,
    lock,
    restore,
    getMnemonic,
    clear,
  };
});
