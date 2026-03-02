import {
  nip59,
  type Event as NostrToolsEvent,
  type UnsignedEvent as NostrToolsUnsignedEvent,
} from 'nostr-tools';
import * as nostr from './nostr';
import type { NostrEvent } from '../types';
import { NostrKind } from '../types';

function requireLocalPrivateKey(context: string): Uint8Array {
  const key = nostr.getCurrentPrivateKeyBytes();
  if (!key) {
    throw new Error(
      `${context} requires local-key mode. NIP-07 gift-wrap support is not available yet.`
    );
  }
  return key;
}

function assertRecipientPubkey(pubkey: string): void {
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
    throw new Error('Recipient pubkey must be a 64-character hex string');
  }
}

function isTagArray(value: unknown): value is string[][] {
  return (
    Array.isArray(value)
    && value.every(
      (tag) => Array.isArray(tag) && tag.every((entry) => typeof entry === 'string')
    )
  );
}

function parseWelcomeRumorJson(welcomeRumorJson: string): Partial<NostrToolsUnsignedEvent> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(welcomeRumorJson);
  } catch (error) {
    throw new Error(
      `Invalid welcome rumor JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Welcome rumor must be a JSON object');
  }

  const rumor = parsed as Record<string, unknown>;
  if (rumor.kind !== NostrKind.Welcome) {
    throw new Error(`Expected welcome rumor kind ${NostrKind.Welcome}`);
  }
  if (typeof rumor.content !== 'string') {
    throw new Error('Welcome rumor content must be a string');
  }
  if (!isTagArray(rumor.tags)) {
    throw new Error('Welcome rumor tags must be string[][]');
  }

  const normalized: Partial<NostrToolsUnsignedEvent> = {
    kind: NostrKind.Welcome,
    tags: rumor.tags,
    content: rumor.content,
  };

  if (typeof rumor.created_at === 'number' && Number.isFinite(rumor.created_at)) {
    normalized.created_at = Math.floor(rumor.created_at);
  }

  return normalized;
}

function ensureSingleRecipientTag(wrap: NostrEvent, recipientPubkey: string): void {
  if (wrap.kind !== NostrKind.GiftWrap) {
    throw new Error(`Expected gift-wrap kind ${NostrKind.GiftWrap}, got ${wrap.kind}`);
  }

  const pTags = wrap.tags.filter((tag) => tag[0] === 'p');
  if (pTags.length !== 1 || pTags[0]?.[1] !== recipientPubkey) {
    throw new Error('Gift-wrap must contain exactly one recipient p-tag');
  }
}

export async function publishWelcomeGiftWrap(
  welcomeRumorJson: string,
  recipientPubkey: string
): Promise<NostrEvent> {
  assertRecipientPubkey(recipientPubkey);
  const rumor = parseWelcomeRumorJson(welcomeRumorJson);
  const senderPrivateKey = requireLocalPrivateKey('Gift-wrap welcome publish');
  const wrap = nip59.wrapEvent(rumor, senderPrivateKey, recipientPubkey) as unknown as NostrEvent;
  ensureSingleRecipientTag(wrap, recipientPubkey);
  await nostr.publishEvent(wrap);
  return wrap;
}

export function unwrapWelcomeGiftWrap(wrapEvent: NostrEvent): string {
  if (wrapEvent.kind !== NostrKind.GiftWrap) {
    throw new Error(`Cannot unwrap non-gift-wrap event kind ${wrapEvent.kind}`);
  }

  const recipientPrivateKey = requireLocalPrivateKey('Gift-wrap welcome receive');
  const rumor = nip59.unwrapEvent(
    wrapEvent as unknown as NostrToolsEvent,
    recipientPrivateKey
  ) as Partial<NostrToolsUnsignedEvent>;

  if (rumor.kind !== NostrKind.Welcome) {
    throw new Error(`Unwrapped rumor is not kind ${NostrKind.Welcome}`);
  }

  return JSON.stringify(rumor);
}
