import { get, set, del, keys } from 'idb-keyval';
import * as cryptoVault from './cryptoVault';
import type { Reaction } from '../types';

async function clearOpfsStorage(): Promise<void> {
  if (typeof navigator === 'undefined') return;

  const storageManager = navigator.storage as StorageManager & {
    getDirectory?: () => Promise<unknown>;
  };
  if (typeof storageManager.getDirectory !== 'function') return;

  const root = await storageManager.getDirectory() as {
    entries?: () => AsyncIterableIterator<[string, unknown]>;
    removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>;
  };

  if (typeof root.entries !== 'function' || typeof root.removeEntry !== 'function') {
    return;
  }

  for await (const [name] of root.entries()) {
    try {
      await root.removeEntry(name, { recursive: true });
    } catch {
      // Ignore per-entry OPFS cleanup errors and continue.
    }
  }
}

const STORAGE_KEYS = {
  PRIVATE_KEY_LEGACY: 'mdk-private-key',
  PRIVATE_KEY_ENC: 'mdk-private-key-enc',
  PUBLIC_KEY: 'mdk-public-key',
  RELAYS: 'mdk-relays',
  MDK_STATE: 'mdk-state',
  MESSAGES_PREFIX: 'mdk-messages-',
  SETTINGS: 'mdk-settings',
  SEED_ENC: 'mdk-seed-enc',
  WALLET_STATE: 'mdk-wallet-state',
  AUTH_METHOD: 'mdk-auth-method',
  PASSKEY_CREDENTIAL_ID: 'mdk-passkey-cred-id',
  PUBKEY_CHECK: 'mdk-pubkey-check',
  GROUP_STATE: 'mdk-group-state',
  GROUP_META_PREFIX: 'mdk-group-meta-',
} as const;

const DEFAULT_RELAYS = [
  'wss://relay.primal.net',
  'wss://relay.damus.io',
];

export interface StoredSettings {
  isNip07: boolean;
  relays: string[];
  messageRetentionDays?: number;
}

export async function getPrivateKey(): Promise<string | null> {
  const envelope = await getEncryptedPrivateKeyEnvelope();
  if (!envelope) {
    return null;
  }
  return cryptoVault.decryptWithSession(envelope);
}

export async function getLegacyPrivateKey(): Promise<string | null> {
  const value = await get<string>(STORAGE_KEYS.PRIVATE_KEY_LEGACY);
  return value ?? null;
}

export async function setLegacyPrivateKey(key: string): Promise<void> {
  await set(STORAGE_KEYS.PRIVATE_KEY_LEGACY, key);
}

export async function deleteLegacyPrivateKey(): Promise<void> {
  await del(STORAGE_KEYS.PRIVATE_KEY_LEGACY);
}

export async function getEncryptedPrivateKeyEnvelope(): Promise<cryptoVault.VaultEnvelope | null> {
  const value = await get<unknown>(STORAGE_KEYS.PRIVATE_KEY_ENC);
  if (!cryptoVault.isVaultEnvelope(value)) {
    return null;
  }
  return value;
}

export async function setEncryptedPrivateKeyEnvelope(
  envelope: cryptoVault.VaultEnvelope
): Promise<void> {
  await set(STORAGE_KEYS.PRIVATE_KEY_ENC, envelope);
}

export async function deleteEncryptedPrivateKeyEnvelope(): Promise<void> {
  await del(STORAGE_KEYS.PRIVATE_KEY_ENC);
}

export async function hasEncryptedPrivateKeyEnvelope(): Promise<boolean> {
  const envelope = await getEncryptedPrivateKeyEnvelope();
  return envelope !== null;
}

export async function hasLegacyPrivateKey(): Promise<boolean> {
  const key = await getLegacyPrivateKey();
  return key !== null;
}

export async function getPublicKey(): Promise<string | null> {
  const value = await get<string>(STORAGE_KEYS.PUBLIC_KEY);
  return value ?? null;
}

export async function setPublicKey(key: string): Promise<void> {
  await set(STORAGE_KEYS.PUBLIC_KEY, key);
}

export async function getRelays(): Promise<string[]> {
  const value = await get<string[]>(STORAGE_KEYS.RELAYS);
  return value ?? DEFAULT_RELAYS;
}

export async function setRelays(relays: string[]): Promise<void> {
  await set(STORAGE_KEYS.RELAYS, relays);
}

export async function getSettings(): Promise<StoredSettings | null> {
  const value = await get<StoredSettings>(STORAGE_KEYS.SETTINGS);
  return value ?? null;
}

export async function setSettings(settings: StoredSettings): Promise<void> {
  await set(STORAGE_KEYS.SETTINGS, settings);
}

export async function getMdkState(): Promise<string | null> {
  const value = await get<string>(STORAGE_KEYS.MDK_STATE);
  return value ?? null;
}

export async function setMdkState(state: string): Promise<void> {
  await set(STORAGE_KEYS.MDK_STATE, state);
}

export async function clearMdkState(): Promise<void> {
  await del(STORAGE_KEYS.MDK_STATE);
}

export interface StoredMessage {
  id: string;
  groupId: string;
  senderPubkey: string;
  content: string;
  timestamp: number;
  replyToId?: string;
  reactions?: Reaction[];
}

interface StoredMessageRecord {
  id: string;
  groupId: string;
  senderPubkey: string;
  timestamp: number;
  replyToId?: string;
  reactions?: Reaction[];
  content?: string;
  contentEnc?: cryptoVault.VaultEnvelope;
}

interface MessageQueryOptions {
  retentionDays?: number;
}

interface AppendMessageOptions {
  retentionDays?: number;
}

const LOCKED_MESSAGE_PLACEHOLDER = '[Encrypted message unavailable while vault is locked]';

function getMessageKey(groupId: string): string {
  return `${STORAGE_KEYS.MESSAGES_PREFIX}${groupId}`;
}

function isStoredMessageRecord(value: unknown): value is StoredMessageRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Partial<StoredMessageRecord>;

  const hasValidReplyTo = record.replyToId === undefined || typeof record.replyToId === 'string';
  const hasValidReactions = (
    record.reactions === undefined
    || (
      Array.isArray(record.reactions)
      && record.reactions.every((reaction) => (
        reaction
        && typeof reaction === 'object'
        && typeof (reaction as Partial<Reaction>).emoji === 'string'
        && typeof (reaction as Partial<Reaction>).senderPubkey === 'string'
        && typeof (reaction as Partial<Reaction>).timestamp === 'number'
      ))
    )
  );

  return (
    typeof record.id === 'string'
    && typeof record.groupId === 'string'
    && typeof record.senderPubkey === 'string'
    && typeof record.timestamp === 'number'
    && hasValidReplyTo
    && hasValidReactions
    && (
      typeof record.content === 'string'
      || cryptoVault.isVaultEnvelope(record.contentEnc)
      || (!record.content && !record.contentEnc)
    )
  );
}

async function loadRawMessages(groupId: string): Promise<StoredMessageRecord[]> {
  const value = await get<unknown>(getMessageKey(groupId));
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isStoredMessageRecord);
}

function normalizeRetentionDays(retentionDays?: number): number | null {
  if (!retentionDays || !Number.isInteger(retentionDays) || retentionDays <= 0) {
    return null;
  }
  return retentionDays;
}

function applyRetentionFilter(
  records: StoredMessageRecord[],
  retentionDays?: number
): StoredMessageRecord[] {
  const normalized = normalizeRetentionDays(retentionDays);
  if (!normalized) {
    return records;
  }
  const cutoff = Date.now() - normalized * 24 * 60 * 60 * 1000;
  return records.filter((record) => record.timestamp >= cutoff);
}

async function persistRawMessages(groupId: string, records: StoredMessageRecord[]): Promise<void> {
  await set(getMessageKey(groupId), records);
}

export async function getMessages(
  groupId: string,
  options?: MessageQueryOptions
): Promise<StoredMessage[]> {
  const rawRecords = await loadRawMessages(groupId);
  const retainedRecords = applyRetentionFilter(rawRecords, options?.retentionDays);

  if (retainedRecords.length !== rawRecords.length) {
    await persistRawMessages(groupId, retainedRecords);
  }

  const messages: StoredMessage[] = [];

  for (const record of retainedRecords) {
    let content: string | null = null;

    if (cryptoVault.isVaultEnvelope(record.contentEnc)) {
      content = await cryptoVault.decryptWithSession(record.contentEnc);
    } else if (typeof record.content === 'string' && cryptoVault.isUnlocked()) {
      // Only reveal legacy plaintext while unlocked; migration removes plaintext copies.
      content = record.content;
    }

    messages.push({
      id: record.id,
      groupId: record.groupId,
      senderPubkey: record.senderPubkey,
      content: content ?? LOCKED_MESSAGE_PLACEHOLDER,
      timestamp: record.timestamp,
      replyToId: record.replyToId,
      reactions: record.reactions,
    });
  }

  messages.sort((a, b) => a.timestamp - b.timestamp);
  return messages;
}

export async function appendMessage(
  message: StoredMessage,
  options?: AppendMessageOptions
): Promise<void> {
  // Skip persistence when vault is locked or unavailable.
  if (!cryptoVault.isUnlocked()) {
    return;
  }

  const key = getMessageKey(message.groupId);
  const existing = await loadRawMessages(message.groupId);

  if (!existing.some((m) => m.id === message.id)) {
    const contentEnc = await cryptoVault.encryptWithSession(message.content);
    existing.push({
      id: message.id,
      groupId: message.groupId,
      senderPubkey: message.senderPubkey,
      timestamp: message.timestamp,
      replyToId: message.replyToId,
      reactions: message.reactions,
      contentEnc,
    });

    const retained = applyRetentionFilter(existing, options?.retentionDays);
    retained.sort((a, b) => a.timestamp - b.timestamp);
    await set(key, retained);
  }
}

export async function updateMessageMetadata(
  groupId: string,
  messageId: string,
  updates: {
    replyToId?: string;
    reactions?: Reaction[];
  }
): Promise<void> {
  const records = await loadRawMessages(groupId);
  const index = records.findIndex((record) => record.id === messageId);
  if (index === -1) {
    return;
  }

  const existing = records[index];
  const next: StoredMessageRecord = {
    ...existing,
    replyToId: updates.replyToId ?? existing.replyToId,
    reactions: updates.reactions ?? existing.reactions,
  };

  records[index] = next;
  await persistRawMessages(groupId, records);
}

export async function clearMessages(groupId: string): Promise<void> {
  await del(getMessageKey(groupId));
}

export async function getAllMessageGroupIds(): Promise<string[]> {
  const allKeys = await keys();
  const prefix = STORAGE_KEYS.MESSAGES_PREFIX;

  return allKeys
    .filter((k): k is string => typeof k === 'string' && k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}

export async function migratePlaintextMessagesToEncrypted(): Promise<number> {
  if (!cryptoVault.isUnlocked()) {
    return 0;
  }

  const groupIds = await getAllMessageGroupIds();
  let migratedCount = 0;

  for (const groupId of groupIds) {
    const records = await loadRawMessages(groupId);
    let changed = false;

    const migratedRecords: StoredMessageRecord[] = [];

    for (const record of records) {
      if (cryptoVault.isVaultEnvelope(record.contentEnc)) {
        migratedRecords.push(record);
        continue;
      }

      if (typeof record.content === 'string') {
        const contentEnc = await cryptoVault.encryptWithSession(record.content);
        migratedRecords.push({
          id: record.id,
          groupId: record.groupId,
          senderPubkey: record.senderPubkey,
          timestamp: record.timestamp,
          replyToId: record.replyToId,
          reactions: record.reactions,
          contentEnc,
        });
        migratedCount += 1;
        changed = true;
        continue;
      }

      migratedRecords.push(record);
    }

    if (changed) {
      await persistRawMessages(groupId, migratedRecords);
    }
  }

  return migratedCount;
}

export async function enforceMessageRetention(retentionDays: number): Promise<number> {
  const normalized = normalizeRetentionDays(retentionDays);
  if (!normalized) {
    return 0;
  }

  const groupIds = await getAllMessageGroupIds();
  let removedCount = 0;

  for (const groupId of groupIds) {
    const records = await loadRawMessages(groupId);
    const retained = applyRetentionFilter(records, normalized);
    removedCount += records.length - retained.length;

    if (retained.length !== records.length) {
      await persistRawMessages(groupId, retained);
    }
  }

  return removedCount;
}

export interface WalletState {
  addressIndex: number;
}

export async function getEncryptedSeedEnvelope(): Promise<cryptoVault.VaultEnvelope | null> {
  const value = await get<unknown>(STORAGE_KEYS.SEED_ENC);
  if (!cryptoVault.isVaultEnvelope(value)) {
    return null;
  }
  return value;
}

export async function setEncryptedSeedEnvelope(
  envelope: cryptoVault.VaultEnvelope,
): Promise<void> {
  await set(STORAGE_KEYS.SEED_ENC, envelope);
}

export async function deleteEncryptedSeedEnvelope(): Promise<void> {
  await del(STORAGE_KEYS.SEED_ENC);
}

export async function hasEncryptedSeedEnvelope(): Promise<boolean> {
  const envelope = await getEncryptedSeedEnvelope();
  return envelope !== null;
}

export async function getWalletState(): Promise<WalletState | null> {
  const value = await get<WalletState>(STORAGE_KEYS.WALLET_STATE);
  return value ?? null;
}

export async function setWalletState(state: WalletState): Promise<void> {
  await set(STORAGE_KEYS.WALLET_STATE, state);
}

export type AuthMethod = 'passkey' | 'password';

export async function getAuthMethod(): Promise<AuthMethod | null> {
  const value = await get<AuthMethod>(STORAGE_KEYS.AUTH_METHOD);
  return value ?? null;
}

export async function setAuthMethod(method: AuthMethod): Promise<void> {
  await set(STORAGE_KEYS.AUTH_METHOD, method);
}

export async function deleteAuthMethod(): Promise<void> {
  await del(STORAGE_KEYS.AUTH_METHOD);
}

export async function getPasskeyCredentialId(): Promise<string | null> {
  const value = await get<string>(STORAGE_KEYS.PASSKEY_CREDENTIAL_ID);
  return value ?? null;
}

export async function setPasskeyCredentialId(credentialId: string): Promise<void> {
  await set(STORAGE_KEYS.PASSKEY_CREDENTIAL_ID, credentialId);
}

export async function deletePasskeyCredentialId(): Promise<void> {
  await del(STORAGE_KEYS.PASSKEY_CREDENTIAL_ID);
}

export async function getPubkeyCheck(): Promise<string | null> {
  const value = await get<string>(STORAGE_KEYS.PUBKEY_CHECK);
  return value ?? null;
}

export async function setPubkeyCheck(pubkey: string): Promise<void> {
  await set(STORAGE_KEYS.PUBKEY_CHECK, pubkey);
}

export async function deletePubkeyCheck(): Promise<void> {
  await del(STORAGE_KEYS.PUBKEY_CHECK);
}

export interface GroupState {
  groupId: string;
  nostrGroupId: string;
  peerPubkey?: string;
  peerName?: string;
}

export async function getGroupStates(): Promise<GroupState[]> {
  const value = await get<GroupState[]>(STORAGE_KEYS.GROUP_STATE);
  return value ?? [];
}

export async function setGroupStates(states: GroupState[]): Promise<void> {
  await set(STORAGE_KEYS.GROUP_STATE, states);
}

export async function deleteGroupStates(): Promise<void> {
  await del(STORAGE_KEYS.GROUP_STATE);
}

export interface GroupMeta {
  name?: string;
  needsNaming?: boolean;
  isAgent?: boolean;
}

export async function getGroupMeta(groupId: string): Promise<GroupMeta | null> {
  const value = await get<GroupMeta>(`${STORAGE_KEYS.GROUP_META_PREFIX}${groupId}`);
  return value ?? null;
}

export async function setGroupMeta(groupId: string, meta: GroupMeta): Promise<void> {
  await set(`${STORAGE_KEYS.GROUP_META_PREFIX}${groupId}`, meta);
}

export async function deleteGroupMeta(groupId: string): Promise<void> {
  await del(`${STORAGE_KEYS.GROUP_META_PREFIX}${groupId}`);
}

export async function clearAllData(): Promise<void> {
  const allKeys = await keys();

  for (const key of allKeys) {
    if (typeof key === 'string' && key.startsWith('mdk-')) {
      await del(key);
    }
  }

  try {
    await clearOpfsStorage();
  } catch {
    // Ignore OPFS cleanup issues and continue wiping other storage layers.
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear();
  }

  if (typeof indexedDB !== 'undefined') {
    const knownDbNames = new Set<string>(['keyval-store', 'keyval']);
    const idb = indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string }>>;
    };

    if (typeof idb.databases === 'function') {
      try {
        const dbs = await idb.databases();
        for (const db of dbs) {
          if (typeof db?.name === 'string' && db.name.length > 0) {
            knownDbNames.add(db.name);
          }
        }
      } catch {
        // Ignore database listing failures on unsupported browsers.
      }
    }

    await Promise.all(Array.from(knownDbNames).map((dbName) => new Promise<void>((resolve) => {
      try {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      } catch {
        resolve();
      }
    })));
  }

  if (typeof caches !== 'undefined') {
    const cacheNames = await caches.keys();
    const runtimeCachesToClear = new Set(['html-cache', 'static-resources']);
    await Promise.all(
      cacheNames
        .filter((cacheName) => runtimeCachesToClear.has(cacheName))
        .map((cacheName) => caches.delete(cacheName))
    );
  }
}
