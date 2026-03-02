import type { Filter } from 'nostr-tools';

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface UnsignedEvent {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

export enum NostrKind {
  KeyPackage = 443,
  Welcome = 444,
  MLSMessage = 445,
  Typing = 446,
  GiftWrap = 1059,
}

export interface RelayInfo {
  url: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastError?: string;
}

export type SubscriptionFilter = Filter;

declare global {
  interface Window {
    nostr?: Nip07Extension;
  }
}

export interface Nip07Extension {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedEvent): Promise<NostrEvent>;
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}
