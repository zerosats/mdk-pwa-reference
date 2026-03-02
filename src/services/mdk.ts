import type {
  JsKeyPackage,
  JsCreateGroupResult,
  JsGroup,
  JsUpdateResult,
  JsMessageResult,
  JsProcessedMessage,
  JsWelcome,
  GroupConfig,
} from '../types/mdk';
import * as storage from './storage';
import * as logger from './logger';

let mdkModule: typeof import('mdk-wasm') | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;

export function isMdkReady(): boolean {
  return isInitialized;
}

export async function initMdk(): Promise<void> {
  if (isInitialized) {
    return;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = doInit();
  await initPromise;
}

async function doInit(): Promise<void> {
  try {
    mdkModule = await import('mdk-wasm');
    mdkModule.mdk_init();

    const savedState = await storage.getMdkState();
    if (savedState) {
      try {
        const stateBytes = base64ToBytes(savedState);
        mdkModule.import_mdk_state(stateBytes);
        logger.debug('mdk', 'Restored MDK state from IndexedDB');
      } catch (error) {
        logger.warn('mdk', 'Failed to restore MDK state, starting fresh', {
          error: (error as Error).message,
        });
        await storage.clearMdkState();
      }
    }

    isInitialized = true;
  } catch (error) {
    initPromise = null;
    throw new Error(
      `Failed to initialize MDK WASM: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function initMdkWithConfig(
  maxEventAgeSecs: bigint,
  outOfOrderTolerance: number
): Promise<void> {
  if (isInitialized) {
    logger.warn('mdk', 'Already initialized, ignoring config init');
    return;
  }

  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = doInitWithConfig(maxEventAgeSecs, outOfOrderTolerance);
  await initPromise;
}

async function doInitWithConfig(
  maxEventAgeSecs: bigint,
  outOfOrderTolerance: number
): Promise<void> {
  try {
    mdkModule = await import('mdk-wasm');
    mdkModule.mdk_init_with_config(maxEventAgeSecs, outOfOrderTolerance);

    const savedState = await storage.getMdkState();
    if (savedState) {
      try {
        const stateBytes = base64ToBytes(savedState);
        mdkModule.import_mdk_state(stateBytes);
        logger.debug('mdk', 'Restored MDK state from IndexedDB');
      } catch (error) {
        logger.warn('mdk', 'Failed to restore MDK state, starting fresh', {
          error: (error as Error).message,
        });
        await storage.clearMdkState();
      }
    }

    isInitialized = true;
  } catch (error) {
    initPromise = null;
    throw new Error(
      `Failed to initialize MDK WASM with config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function ensureInitialized(): void {
  if (!isInitialized || !mdkModule) {
    throw new Error('MDK not initialized. Call initMdk() first.');
  }
}

async function persistMdkState(): Promise<void> {
  if (!isInitialized || !mdkModule) return;
  try {
    const stateBytes = mdkModule.export_mdk_state();
    const base64 = bytesToBase64(stateBytes);
    await storage.setMdkState(base64);
  } catch (error) {
    logger.warn('mdk', 'Failed to persist MDK state', {
      error: (error as Error).message,
    });
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function createKeyPackage(
  identityPubkey: string,
  relays: string[]
): Promise<JsKeyPackage> {
  ensureInitialized();
  const relaysJson = JSON.stringify(relays);
  const result = mdkModule!.create_key_package(identityPubkey, relaysJson) as JsKeyPackage;
  await persistMdkState();
  return result;
}

export async function createGroup(
  creatorPubkey: string,
  keyPackageEvents: object[],
  config: GroupConfig
): Promise<JsCreateGroupResult> {
  ensureInitialized();
  const keyPackageEventsJson = JSON.stringify(keyPackageEvents);
  const configJson = JSON.stringify(config);
  const result = mdkModule!.create_group(
    creatorPubkey,
    keyPackageEventsJson,
    configJson
  ) as JsCreateGroupResult;
  await persistMdkState();
  return result;
}

export async function mergePendingCommit(groupId: string): Promise<void> {
  ensureInitialized();
  mdkModule!.merge_pending_commit(groupId);
  await persistMdkState();
}

export function getGroups(): JsGroup[] {
  ensureInitialized();
  return mdkModule!.get_groups() as JsGroup[];
}

export function getMembers(groupId: string): string[] {
  ensureInitialized();
  return mdkModule!.get_members(groupId) as string[];
}

export async function addMembers(
  groupId: string,
  keyPackageEvents: object[]
): Promise<JsUpdateResult> {
  ensureInitialized();
  const keyPackageEventsJson = JSON.stringify(keyPackageEvents);
  const result = mdkModule!.add_members(groupId, keyPackageEventsJson) as JsUpdateResult;
  await persistMdkState();
  return result;
}

export async function removeMembers(
  groupId: string,
  memberPubkeys: string[]
): Promise<JsUpdateResult> {
  ensureInitialized();
  const memberPubkeysJson = JSON.stringify(memberPubkeys);
  const result = mdkModule!.remove_members(groupId, memberPubkeysJson) as JsUpdateResult;
  await persistMdkState();
  return result;
}

export async function leaveGroup(groupId: string): Promise<JsUpdateResult> {
  ensureInitialized();
  const result = mdkModule!.leave_group(groupId) as JsUpdateResult;
  await persistMdkState();
  return result;
}

export async function createMessage(
  groupId: string,
  content: string,
  senderPubkey: string
): Promise<JsMessageResult> {
  ensureInitialized();
  const result = mdkModule!.create_message(
    groupId,
    content,
    senderPubkey
  ) as JsMessageResult;
  await persistMdkState();
  return result;
}

export async function processMessage(eventJson: string): Promise<JsProcessedMessage> {
  ensureInitialized();
  const result = mdkModule!.process_message(eventJson) as JsProcessedMessage;
  await persistMdkState();
  return result;
}

export function processWelcome(
  eventId: string,
  welcomeRumorJson: string
): JsWelcome {
  ensureInitialized();
  return mdkModule!.process_welcome(eventId, welcomeRumorJson) as JsWelcome;
}

export async function acceptWelcome(eventId: string): Promise<void> {
  ensureInitialized();
  mdkModule!.accept_welcome(eventId);
  await persistMdkState();
}

export function exportState(): Uint8Array {
  ensureInitialized();
  return mdkModule!.export_mdk_state();
}

export function importState(data: Uint8Array): void {
  ensureInitialized();
  mdkModule!.import_mdk_state(data);
}
