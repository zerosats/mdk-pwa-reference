import {
  SimplePool,
  finalizeEvent,
  getPublicKey,
  generateSecretKey,
  verifyEvent,
  nip19,
  type Filter,
  type Event as NostrToolsEvent,
} from 'nostr-tools';
import type { NostrEvent, UnsignedEvent, SubscriptionFilter, RelayInfo } from '../types/nostr';
import { NostrKind } from '../types/nostr';
import * as logger from './logger';

const relayStatus = new Map<string, RelayInfo>();
const pool = new SimplePool({ enablePing: true, enableReconnect: true });
pool.trackRelays = true;

pool.onRelayConnectionSuccess = (url) => {
  updateRelayStatus(url, 'connected');
  logger.debug('nostr', 'Relay connected', { url });
};

pool.onRelayConnectionFailure = (url) => {
  updateRelayStatus(url, 'error', 'connection failed');
  logger.warn('nostr', 'Relay connection failed', { url });
};

let connectedRelays: string[] = [];
let currentPubkey: string | null = null;
let currentPrivkey: Uint8Array | null = null;
let useNip07 = false;

export function setRelays(relays: string[]): void {
  connectedRelays = [...relays];
  for (const url of relays) {
    if (!relayStatus.has(url)) {
      updateRelayStatus(url, 'disconnected');
    }
  }
}

export function getRelayStatuses(): RelayInfo[] {
  return Array.from(relayStatus.values());
}

export function getConnectedRelays(): string[] {
  return [...connectedRelays];
}

function updateRelayStatus(url: string, status: RelayInfo['status'], lastError?: string): void {
  const info: RelayInfo = { url, status };
  if (lastError) {
    info.lastError = lastError;
  }
  relayStatus.set(url, info);
}

function validateIncomingEvent(
  event: NostrToolsEvent,
  source: string
): event is NostrToolsEvent {
  if (!event.id || !event.sig) {
    logger.warn('nostr', 'Dropping event missing id/sig', { source });
    return false;
  }

  if (!verifyEvent(event)) {
    logger.warn('nostr', 'Dropping event with invalid signature', {
      source,
      eventId: event.id,
      kind: event.kind,
    });
    return false;
  }

  return true;
}

export function setKeys(privkeyHex: string): void {
  currentPrivkey = hexToBytes(privkeyHex);
  currentPubkey = getPublicKey(currentPrivkey);
  useNip07 = false;
}

export function setNip07Mode(pubkey: string): void {
  currentPubkey = pubkey;
  currentPrivkey = null;
  useNip07 = true;
}

export function clearKeys(): void {
  currentPrivkey = null;
  currentPubkey = null;
  useNip07 = false;
}

export function getCurrentPubkey(): string | null {
  return currentPubkey;
}

export function getCurrentPrivateKeyBytes(): Uint8Array | null {
  return currentPrivkey ? new Uint8Array(currentPrivkey) : null;
}

export function generateNewKeys(): { privkeyHex: string; pubkeyHex: string } {
  const privkey = generateSecretKey();
  const pubkey = getPublicKey(privkey);
  return {
    privkeyHex: bytesToHex(privkey),
    pubkeyHex: pubkey,
  };
}

export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

export function npubToPubkey(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub');
  }
  return decoded.data;
}

export function privkeyToNsec(privkeyHex: string): string {
  return nip19.nsecEncode(hexToBytes(privkeyHex));
}

export function nsecToPrivkey(nsec: string): string {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') {
    throw new Error('Invalid nsec');
  }
  return bytesToHex(decoded.data);
}

export async function signEvent(event: UnsignedEvent): Promise<NostrEvent> {
  if (useNip07) {
    if (!window.nostr) {
      throw new Error('NIP-07 extension not available');
    }
    return await window.nostr.signEvent(event);
  }

  if (!currentPrivkey) {
    throw new Error('No private key set');
  }

  const signedEvent = finalizeEvent(event as NostrToolsEvent, currentPrivkey);
  return signedEvent as unknown as NostrEvent;
}

export async function publishEvent(event: NostrEvent): Promise<void> {
  if (!event.id || !event.sig) {
    throw new Error('Cannot publish unsigned event: missing id or sig');
  }

  if (!verifyEvent(event as unknown as NostrToolsEvent)) {
    throw new Error(`Cannot publish invalid event signature for event ${event.id}`);
  }

  if (connectedRelays.length === 0) {
    throw new Error('No relays configured');
  }

  const publishPromises = pool.publish(connectedRelays, event as NostrToolsEvent);
  const results = await Promise.allSettled(publishPromises);
  results.forEach((result, index) => {
    const url = connectedRelays[index];
    if (!url) return;
    if (result.status === 'fulfilled') {
      logger.debug('nostr', 'Publish ok', { url });
      updateRelayStatus(url, 'connected');
    } else {
      logger.warn('nostr', 'Publish failed', { url, reason: String(result.reason) });
      updateRelayStatus(url, 'error', String(result.reason));
    }
  });
}

export function subscribe(
  filters: SubscriptionFilter[],
  onEvent: (event: NostrEvent) => void,
  onEose?: () => void
): () => void {
  if (connectedRelays.length === 0) {
    logger.warn('nostr', 'Subscription created with no relays configured');
  }

  logger.debug('nostr', 'Creating subscription', {
    filterCount: filters.length,
    relayCount: connectedRelays.length,
  });
  for (const url of connectedRelays) {
    updateRelayStatus(url, 'connecting');
  }

  if (filters.length === 0) {
    throw new Error('At least one filter is required for subscription');
  }

  let eoseCount = 0;
  const subs = filters.map((filter, index) =>
    pool.subscribeMany(connectedRelays, filter as Filter, {
      onevent: (event) => {
        if (!validateIncomingEvent(event, `subscription:${index}`)) {
          return;
        }
        logger.debug('nostr', 'Incoming event', { eventId: event.id, kind: event.kind });
        onEvent(event as unknown as NostrEvent);
      },
      oneose: () => {
        eoseCount += 1;
        if (eoseCount === filters.length) {
          logger.debug('nostr', 'Subscription EOSE reached', { filterCount: filters.length });
          onEose?.();
        }
      },
      onclose: (reasons) => {
        logger.warn('nostr', 'Subscription closed', {
          filterIndex: index,
          reasonCount: reasons.length,
        });
      },
    })
  );

  setTimeout(() => {
    const statuses = Array.from(pool.listConnectionStatus().entries());
    logger.debug('nostr', 'Relay connection snapshot', {
      statusCount: statuses.length,
      trackedRelays: getRelayStatuses().length,
    });
  }, 1000);

  return () => {
    subs.forEach((sub) => sub.close());
  };
}

export async function debugFetchEventById(eventId: string): Promise<void> {
  if (connectedRelays.length === 0) {
    logger.warn('nostr', 'debugFetchEventById with no relays configured');
    return;
  }

  const results = await Promise.allSettled(
    connectedRelays.map((url) => pool.get([url], { ids: [eventId] }))
  );

  results.forEach((result, index) => {
    const url = connectedRelays[index];
    if (!url) return;
    if (result.status === 'fulfilled') {
      const event = result.value as NostrEvent | null;
      if (event) {
        if (validateIncomingEvent(event as unknown as NostrToolsEvent, `debugFetchEventById:${url}`)) {
          logger.debug('nostr', 'debugFetchEventById found event', { url, eventId: event.id });
        } else {
          logger.warn('nostr', 'debugFetchEventById found invalid event', { url });
        }
      } else {
        logger.debug('nostr', 'debugFetchEventById not found', { url });
      }
    } else {
      logger.warn('nostr', 'debugFetchEventById relay error', { url });
    }
  });
}

if (typeof window !== 'undefined' && logger.isRuntimeDebugEnabled()) {
  (window as any).__mdkNostrDebug = {
    debugFetchEventById,
    getConnectedRelays,
    getRelayStatuses,
    pool,
    connectedRelays,
  };
}

export function subscribeToKeyPackages(
  pubkeys: string[],
  onEvent: (event: NostrEvent) => void,
  onEose?: () => void
): () => void {
  return subscribe(
    [
      {
        kinds: [NostrKind.KeyPackage],
        authors: pubkeys,
      },
    ],
    onEvent,
    onEose
  );
}

export function subscribeToWelcomes(
  recipientPubkey: string,
  onEvent: (event: NostrEvent) => void,
  onEose?: () => void
): () => void {
  return subscribe(
    [
      {
        kinds: [NostrKind.Welcome],
        '#p': [recipientPubkey],
      },
    ],
    onEvent,
    onEose
  );
}

export function subscribeToGiftWraps(
  recipientPubkey: string,
  onEvent: (event: NostrEvent) => void,
  onEose?: () => void
): () => void {
  return subscribe(
    [
      {
        kinds: [NostrKind.GiftWrap],
        '#p': [recipientPubkey],
      },
    ],
    onEvent,
    onEose
  );
}

export function subscribeToMLSMessages(
  groupIds: string[],
  onEvent: (event: NostrEvent) => void,
  onEose?: () => void
): () => void {
  const filters: SubscriptionFilter[] = [
    {
      kinds: [NostrKind.MLSMessage],
      '#h': groupIds,
    },
  ];

  logger.debug('nostr', 'Subscribing to MLS messages', {
    groupCount: groupIds.length,
  });

  const groupSet = new Set(groupIds);
  const seenIds = new Set<string>();
  // Start from 0 to avoid missing events if client clock is ahead of relay timestamps.
  let lastSeenCreatedAt = 0;

  const closeSub = subscribe(
    filters,
    (event) => {
      if (seenIds.has(event.id)) {
        logger.debug('nostr', 'Skipping duplicate MLS message event', { eventId: event.id });
        return;
      }
      seenIds.add(event.id);
      if (event.created_at > lastSeenCreatedAt) {
        lastSeenCreatedAt = event.created_at;
      }
      const hTags = event.tags?.filter((t) => t[0] === 'h').map((t) => t[1]) ?? [];
      const matchesGroup = hTags.some((h) => groupSet.has(h));
      if (!matchesGroup) {
        logger.debug('nostr', 'Ignoring MLS message outside subscribed groups', {
          eventId: event.id,
        });
        return;
      }

      logger.debug('nostr', 'Received MLS message event', { eventId: event.id });
      onEvent(event);
    },
    onEose
  );

  // Fallback: some relays don't push custom-tagged events in real time.
  // Poll using #h tag filter (more reliable than authors filter on most relays).
  let pollTimer: number | null = null;
  let pollInFlight = false;
  if (groupIds.length > 0) {
    pollTimer = window.setInterval(async () => {
      if (connectedRelays.length === 0) return;
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const filter = {
          kinds: [NostrKind.MLSMessage],
          '#h': groupIds,
          since: Math.max(0, lastSeenCreatedAt - 1),
          limit: 50,
        };
        const events = await pollEventsOnce(filter);

        for (const raw of events) {
          const event = raw as unknown as NostrEvent;
          if (seenIds.has(event.id)) continue;
          seenIds.add(event.id);
          if (event.created_at > lastSeenCreatedAt) {
            lastSeenCreatedAt = event.created_at;
          }

          onEvent(event);
        }
      } catch (error) {
        logger.warn('nostr', 'MLS poll failed');
      } finally {
        pollInFlight = false;
      }
    }, 4000);
  }

  return () => {
    closeSub();
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
    }
  };
}

export function subscribeToTypingEvents(
  groupIds: string[],
  onEvent: (event: NostrEvent) => void,
  onEose?: () => void
): () => void {
  if (groupIds.length === 0) return () => {};

  return subscribe(
    [
      {
        kinds: [NostrKind.Typing],
        '#h': groupIds,
      },
    ],
    onEvent,
    onEose
  );
}

async function pollEventsOnce(filter: SubscriptionFilter): Promise<NostrToolsEvent[]> {
  if (connectedRelays.length === 0) return [];

  try {
    const events = await pool.querySync(connectedRelays, filter);
    return (events as NostrToolsEvent[])
      .filter((event) => validateIncomingEvent(event, 'pollEventsOnce'));
  } catch (error) {
    logger.warn('nostr', 'pollEventsOnce query failed');
    return [];
  }
}

export async function fetchKeyPackage(pubkey: string): Promise<NostrEvent | null> {
  if (connectedRelays.length === 0) {
    throw new Error('No relays configured');
  }

  const events = await pool.querySync(connectedRelays, {
    kinds: [NostrKind.KeyPackage],
    authors: [pubkey],
    limit: 20,
  });

  const candidates = (events as NostrToolsEvent[])
    .filter((event) => validateIncomingEvent(event, 'fetchKeyPackage'))
    .filter((event) => event.kind === NostrKind.KeyPackage && event.pubkey === pubkey)
    .sort((a, b) => {
      // Newest key package first; deterministic tie-breaker by event id.
      if (b.created_at !== a.created_at) {
        return b.created_at - a.created_at;
      }
      return a.id.localeCompare(b.id);
    });

  if (candidates.length === 0) {
    return null;
  }

  return candidates[0] as unknown as NostrEvent;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function closeAllConnections(): void {
  pool.close(connectedRelays);
  relayStatus.clear();
}
