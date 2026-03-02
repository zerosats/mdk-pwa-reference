import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as storage from '../services/storage';
import * as nostr from '../services/nostr';
import * as cryptoVault from '../services/cryptoVault';
import * as logger from '../services/logger';
import * as keyDerivation from '../services/key-derivation';
import * as passkey from '../services/passkey';

export const useSettingsStore = defineStore('settings', () => {
  const MESSAGE_RETENTION_OPTIONS = [7, 30, 90] as const;
  type MessageRetentionDays = (typeof MESSAGE_RETENTION_OPTIONS)[number];
  const SAFE_DEFAULT_RELAYS = ['wss://relay.primal.net', 'wss://relay.damus.io'];
  const allowInsecureWsRelaysInDev = (
    import.meta.env.DEV
    && import.meta.env.VITE_ALLOW_INSECURE_WS_RELAYS === 'true'
  );

  const pubkeyHex = ref<string | null>(null);
  const privkeyHex = ref<string | null>(null);
  const isNip07 = ref(false);
  const relays = ref<string[]>([]);
  const nip07Available = ref(false);
  const settingsLoaded = ref(false);
  const hasEncryptedPrivateKey = ref(false);
  const hasLegacyPrivateKey = ref(false);
  const isVaultUnlocked = ref(false);
  const messageRetentionDays = ref<MessageRetentionDays>(30);
  const authMethod = ref<'passkey' | 'password' | 'nip07' | null>(null);
  const passkeySupported = ref(false);
  const passkeyUnsupportedReason = ref<string | null>(null);
  const walletSeed = ref<Uint8Array | null>(null);
  const masterIkm = ref<Uint8Array | null>(null);

  const hasKeys = computed(() => pubkeyHex.value !== null);

  const pubkeyNpub = computed(() => {
    if (!pubkeyHex.value) return '';
    return nostr.pubkeyToNpub(pubkeyHex.value);
  });

  const privkeyNsec = computed(() => {
    if (!privkeyHex.value) return '';
    return nostr.privkeyToNsec(privkeyHex.value);
  });

  const isLocalKeyMode = computed(() => hasKeys.value && !isNip07.value);

  const requiresLegacyMigration = computed(
    () => isLocalKeyMode.value && hasLegacyPrivateKey.value && !hasEncryptedPrivateKey.value
  );

  const isDerivedKeyUser = computed(
    () => authMethod.value === 'passkey' || authMethod.value === 'password'
  );

  const isVaultLocked = computed(() => {
    if (isDerivedKeyUser.value) {
      return !isVaultUnlocked.value && pubkeyHex.value !== null;
    }
    return isLocalKeyMode.value && hasEncryptedPrivateKey.value && !isVaultUnlocked.value;
  });

  const requiresVaultUnlock = computed(() => {
    if (isDerivedKeyUser.value) {
      return isVaultLocked.value;
    }
    return isLocalKeyMode.value && (requiresLegacyMigration.value || isVaultLocked.value);
  });

  function clearLocalKeyMaterial(): void {
    privkeyHex.value = null;
    isVaultUnlocked.value = false;
    if (walletSeed.value) {
      walletSeed.value.fill(0);
      walletSeed.value = null;
    }
    if (masterIkm.value) {
      masterIkm.value.fill(0);
      masterIkm.value = null;
    }
    cryptoVault.lock();
    nostr.clearKeys();
  }

  function setUnlockedLocalKeyMaterial(privkey: string): void {
    privkeyHex.value = privkey;
    isVaultUnlocked.value = true;
    nostr.setKeys(privkey);
  }

  async function refreshPrivateKeyState(): Promise<void> {
    hasEncryptedPrivateKey.value = await storage.hasEncryptedPrivateKeyEnvelope();
    hasLegacyPrivateKey.value = await storage.hasLegacyPrivateKey();
  }

  function normalizeRetentionDays(value: number | undefined): MessageRetentionDays {
    if (value === 7 || value === 30 || value === 90) {
      return value;
    }
    return 30;
  }

  function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => value === b[index]);
  }

  function normalizeRelayUrl(url: string, allowWs: boolean): string | null {
    const trimmed = url.trim();
    if (!trimmed) {
      return null;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }

    if (parsed.username || parsed.password) {
      return null;
    }

    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') {
      return null;
    }

    if (parsed.protocol === 'ws:' && !allowWs) {
      parsed.protocol = 'wss:';
    }

    const hasDefaultPath = parsed.pathname === '/' && !parsed.search && !parsed.hash;
    const normalized = hasDefaultPath ? `${parsed.protocol}//${parsed.host}` : parsed.toString();
    return normalized;
  }

  function sanitizeRelayList(relayUrls: string[]): string[] {
    const sanitized: string[] = [];
    const seen = new Set<string>();

    for (const relayUrl of relayUrls) {
      const normalized = normalizeRelayUrl(relayUrl, allowInsecureWsRelaysInDev);
      if (!normalized) {
        continue;
      }
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      sanitized.push(normalized);
    }

    return sanitized;
  }

  async function runPostUnlockMaintenance(): Promise<void> {
    if (!isVaultUnlocked.value) {
      return;
    }
    await storage.migratePlaintextMessagesToEncrypted();
    await storage.enforceMessageRetention(messageRetentionDays.value);
  }

  async function loadSettings(): Promise<void> {
    if (settingsLoaded.value) return;

    nip07Available.value = typeof window.nostr !== 'undefined';
    authMethod.value = await storage.getAuthMethod();
    passkeyUnsupportedReason.value = passkey.getPasskeyUnsupportedReason();
    passkey.isPrfSupported().then((supported) => {
      passkeySupported.value = supported;
    }).catch(() => {
      passkeySupported.value = false;
    });

    let relaySource: string[];
    const storedSettings = await storage.getSettings();
    if (storedSettings) {
      isNip07.value = storedSettings.isNip07;
      relaySource = storedSettings.relays;
      messageRetentionDays.value = normalizeRetentionDays(storedSettings.messageRetentionDays);
    } else {
      relaySource = await storage.getRelays();
      messageRetentionDays.value = 30;
    }

    const sanitizedRelays = sanitizeRelayList(relaySource);
    relays.value = sanitizedRelays.length > 0 || relaySource.length === 0
      ? sanitizedRelays
      : [...SAFE_DEFAULT_RELAYS];
    const relaysChanged = !arraysEqual(relaySource, relays.value);
    if (relaysChanged) {
      await storage.setRelays(relays.value);
      if (storedSettings) {
        await saveSettings();
      }
    }

    nostr.setRelays(relays.value);

    const storedPubkey = await storage.getPublicKey();
    await refreshPrivateKeyState();

    clearLocalKeyMaterial();
    pubkeyHex.value = storedPubkey;

    if (!storedPubkey) {
      return;
    }

    if (isNip07.value) {
      if (nip07Available.value) {
        nostr.setNip07Mode(storedPubkey);
      }
      return;
    }

    if (hasEncryptedPrivateKey.value) {
      const unlockedPrivateKey = await storage.getPrivateKey();
      if (unlockedPrivateKey) {
        setUnlockedLocalKeyMaterial(unlockedPrivateKey);
        await runPostUnlockMaintenance();
      }
    }

    settingsLoaded.value = true;
  }

  async function generateKeys(passphrase: string): Promise<void> {
    const normalizedPassphrase = passphrase.trim();
    if (!normalizedPassphrase) {
      throw new Error('Passphrase is required');
    }

    const { privkeyHex: newPrivkey, pubkeyHex: newPubkey } = nostr.generateNewKeys();
    const envelope = await cryptoVault.createEnvelope(newPrivkey, normalizedPassphrase);

    await storage.setEncryptedPrivateKeyEnvelope(envelope);
    const verifiedDecrypt = await cryptoVault.unlockWithPassphrase(envelope, normalizedPassphrase);
    if (verifiedDecrypt !== newPrivkey) {
      throw new Error('Vault verification failed after key generation');
    }

    await storage.deleteLegacyPrivateKey();
    await storage.setPublicKey(newPubkey);

    pubkeyHex.value = newPubkey;
    isNip07.value = false;
    setUnlockedLocalKeyMaterial(newPrivkey);
    await refreshPrivateKeyState();
    await runPostUnlockMaintenance();
    await saveSettings();
  }

  async function migrateLegacyPrivateKey(passphrase: string): Promise<void> {
    const normalizedPassphrase = passphrase.trim();
    if (!normalizedPassphrase) {
      throw new Error('Passphrase is required');
    }

    const legacyPrivateKey = await storage.getLegacyPrivateKey();
    if (!legacyPrivateKey) {
      throw new Error('No legacy plaintext private key found');
    }

    const envelope = await cryptoVault.createEnvelope(legacyPrivateKey, normalizedPassphrase);
    await storage.setEncryptedPrivateKeyEnvelope(envelope);

    const verifiedDecrypt = await cryptoVault.unlockWithPassphrase(envelope, normalizedPassphrase);
    if (verifiedDecrypt !== legacyPrivateKey) {
      throw new Error('Vault verification failed during migration');
    }

    await storage.deleteLegacyPrivateKey();
    isNip07.value = false;
    setUnlockedLocalKeyMaterial(legacyPrivateKey);
    await refreshPrivateKeyState();
    await runPostUnlockMaintenance();
    await saveSettings();
  }

  async function setDerivedSession(ikm: Uint8Array): Promise<void> {
    const keys = await keyDerivation.deriveKeys(ikm);
    const pubkey = keyDerivation.pubkeyFromPrivkey(keys.nostrPrivkey);

    const storedCheck = await storage.getPubkeyCheck();
    if (storedCheck && storedCheck !== pubkey) {
      throw new Error('Derived pubkey does not match stored identity');
    }

    const privHex = Array.from(keys.nostrPrivkey).map((b) => b.toString(16).padStart(2, '0')).join('');
    cryptoVault.setSessionKey(keys.vaultKey);
    walletSeed.value = keys.walletSeed;
    masterIkm.value = new Uint8Array(ikm);

    pubkeyHex.value = pubkey;
    isNip07.value = false;
    setUnlockedLocalKeyMaterial(privHex);
  }

  async function onboardWithPasskey(): Promise<void> {
    const { credentialId, ikm } = await passkey.registerPasskey('Arkade Chat User');
    const keys = await keyDerivation.deriveKeys(ikm);
    const pubkey = keyDerivation.pubkeyFromPrivkey(keys.nostrPrivkey);
    const privHex = Array.from(keys.nostrPrivkey).map((b) => b.toString(16).padStart(2, '0')).join('');

    cryptoVault.setSessionKey(keys.vaultKey);
    walletSeed.value = keys.walletSeed;
    masterIkm.value = new Uint8Array(ikm);

    await storage.setPasskeyCredentialId(credentialId);
    await storage.setAuthMethod('passkey');
    await storage.setPubkeyCheck(pubkey);
    await storage.setPublicKey(pubkey);
    await storage.deleteLegacyPrivateKey();

    authMethod.value = 'passkey';
    pubkeyHex.value = pubkey;
    isNip07.value = false;
    setUnlockedLocalKeyMaterial(privHex);
    await refreshPrivateKeyState();
    await runPostUnlockMaintenance();
    await saveSettings();
  }

  async function onboardWithPassword(password: string): Promise<void> {
    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      throw new Error('Password is required');
    }

    const ikm = await keyDerivation.ikmFromPassword(normalizedPassword);
    const keys = await keyDerivation.deriveKeys(ikm);
    const pubkey = keyDerivation.pubkeyFromPrivkey(keys.nostrPrivkey);
    const privHex = Array.from(keys.nostrPrivkey).map((b) => b.toString(16).padStart(2, '0')).join('');

    cryptoVault.setSessionKey(keys.vaultKey);
    walletSeed.value = keys.walletSeed;
    masterIkm.value = new Uint8Array(ikm);

    await storage.setAuthMethod('password');
    await storage.setPubkeyCheck(pubkey);
    await storage.setPublicKey(pubkey);
    await storage.deleteLegacyPrivateKey();

    authMethod.value = 'password';
    pubkeyHex.value = pubkey;
    isNip07.value = false;
    setUnlockedLocalKeyMaterial(privHex);
    await refreshPrivateKeyState();
    await runPostUnlockMaintenance();
    await saveSettings();
  }

  async function restoreFromSeedPhrase(mnemonic: string): Promise<void> {
    const ikm = keyDerivation.ikmFromSeedPhrase(mnemonic);
    await setDerivedSession(ikm);

    await storage.setPubkeyCheck(pubkeyHex.value!);
    await storage.setPublicKey(pubkeyHex.value!);
    await refreshPrivateKeyState();
    await runPostUnlockMaintenance();
  }

  async function unlockWithPasskey(): Promise<void> {
    const credentialId = await storage.getPasskeyCredentialId();
    if (!credentialId) {
      throw new Error('No passkey credential stored');
    }

    const { ikm } = await passkey.authenticatePasskey(credentialId);
    await setDerivedSession(ikm);
    await refreshPrivateKeyState();
    await runPostUnlockMaintenance();
  }

  async function unlockWithPassword(password: string): Promise<void> {
    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      throw new Error('Password is required');
    }

    const ikm = await keyDerivation.ikmFromPassword(normalizedPassword);
    await setDerivedSession(ikm);
    await refreshPrivateKeyState();
    await runPostUnlockMaintenance();
  }

  function exportSeedPhrase(): string {
    if (!isVaultUnlocked.value || !masterIkm.value) {
      throw new Error('Vault must be unlocked to export seed phrase');
    }
    return keyDerivation.ikmToSeedPhrase(masterIkm.value);
  }

  async function unlockVault(passphrase?: string): Promise<void> {
    if (authMethod.value === 'passkey') {
      await unlockWithPasskey();
      return;
    }

    if (authMethod.value === 'password') {
      if (!passphrase) {
        throw new Error('Password is required');
      }
      await unlockWithPassword(passphrase);
      return;
    }

    const normalizedPassphrase = (passphrase ?? '').trim();
    if (!normalizedPassphrase) {
      throw new Error('Passphrase is required');
    }

    const envelope = await storage.getEncryptedPrivateKeyEnvelope();
    if (!envelope) {
      throw new Error('Encrypted private key not found');
    }

    const privateKey = await cryptoVault.unlockWithPassphrase(envelope, normalizedPassphrase);
    isNip07.value = false;
    setUnlockedLocalKeyMaterial(privateKey);

    if (hasLegacyPrivateKey.value) {
      await storage.deleteLegacyPrivateKey();
    }
    await refreshPrivateKeyState();
    await runPostUnlockMaintenance();
  }

  function lockVault(): void {
    if (isNip07.value) {
      return;
    }
    clearLocalKeyMaterial();
  }

  async function connectNip07(): Promise<void> {
    if (!window.nostr) {
      throw new Error('NIP-07 extension not available');
    }

    const pubkey = await window.nostr.getPublicKey();

    pubkeyHex.value = pubkey;
    isNip07.value = true;
    clearLocalKeyMaterial();

    await storage.setPublicKey(pubkey);
    await storage.deleteLegacyPrivateKey();
    await storage.deleteEncryptedPrivateKeyEnvelope();
    await refreshPrivateKeyState();
    await saveSettings();

    nostr.setNip07Mode(pubkey);

    if (window.nostr.getRelays) {
      try {
        const nip07Relays = await window.nostr.getRelays();
        const writeRelays = Object.entries(nip07Relays ?? {})
          .filter(([, config]) => config.write)
          .map(([url]) => url);

        if (writeRelays.length > 0) {
          for (const relay of writeRelays) {
            const normalized = normalizeRelayUrl(relay, allowInsecureWsRelaysInDev);
            if (normalized && !relays.value.includes(normalized)) {
              relays.value.push(normalized);
            }
          }
          await saveRelays();
        }
      } catch {
        logger.warn('settings', 'Failed to load relays from NIP-07 extension');
      }
    }
  }

  async function addRelay(url: string): Promise<void> {
    const trimmed = url.trim();
    if (trimmed.startsWith('ws://') && !allowInsecureWsRelaysInDev) {
      throw new Error('Insecure ws:// relays are blocked in production. Use wss://.');
    }

    const normalized = normalizeRelayUrl(trimmed, allowInsecureWsRelaysInDev);
    if (!normalized) {
      throw new Error('Invalid relay URL, must be a valid wss:// relay');
    }

    if (normalized.startsWith('ws://') && !allowInsecureWsRelaysInDev) {
      throw new Error('Insecure ws:// relays are blocked in production. Use wss://.');
    }

    if (!relays.value.includes(normalized)) {
      relays.value.push(normalized);
      await saveRelays();
    }
  }

  async function removeRelay(url: string): Promise<void> {
    const index = relays.value.indexOf(url);
    if (index !== -1) {
      relays.value.splice(index, 1);
      await saveRelays();
    }
  }

  async function saveRelays(): Promise<void> {
    const relayList = sanitizeRelayList(relays.value);
    relays.value = relayList;
    await storage.setRelays(relayList);
    nostr.setRelays(relayList);
    await saveSettings();
  }

  async function saveSettings(): Promise<void> {
    const relayList = [...relays.value];
    await storage.setSettings({
      isNip07: isNip07.value,
      relays: relayList,
      messageRetentionDays: messageRetentionDays.value,
    });
  }

  async function setMessageRetentionDays(days: number): Promise<void> {
    const normalized = normalizeRetentionDays(days);
    messageRetentionDays.value = normalized;
    await storage.enforceMessageRetention(normalized);
    await saveSettings();
  }

  async function clearAllData(): Promise<void> {
    await storage.clearAllData();
    pubkeyHex.value = null;
    isNip07.value = false;
    authMethod.value = null;
    clearLocalKeyMaterial();
    messageRetentionDays.value = 30;
    relays.value = await storage.getRelays();
    await refreshPrivateKeyState();
    nostr.setRelays(relays.value);
  }

  return {
    pubkeyHex,
    privkeyHex,
    isNip07,
    relays,
    nip07Available,
    settingsLoaded,
    hasEncryptedPrivateKey,
    hasLegacyPrivateKey,
    isVaultUnlocked,
    messageRetentionDays,
    authMethod,
    passkeySupported,
    passkeyUnsupportedReason,
    walletSeed,
    masterIkm,
    hasKeys,
    pubkeyNpub,
    privkeyNsec,
    isLocalKeyMode,
    requiresLegacyMigration,
    isVaultLocked,
    requiresVaultUnlock,
    loadSettings,
    generateKeys,
    migrateLegacyPrivateKey,
    onboardWithPasskey,
    onboardWithPassword,
    restoreFromSeedPhrase,
    unlockVault,
    lockVault,
    exportSeedPhrase,
    setMessageRetentionDays,
    connectNip07,
    addRelay,
    removeRelay,
    clearAllData,
  };
});
