export * from './nostr';
export * from './mdk';

export interface Reaction {
  emoji: string;
  senderPubkey: string;
  timestamp: number;
}

export interface Message {
  id: string;
  groupId: string;
  senderPubkey: string;
  content: string;
  timestamp: number;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  replyToId?: string;
  reactions?: Reaction[];
}

export interface Group {
  id: string;
  name?: string;
  epoch: number;
  members: string[];
  lastMessage?: Message;
  unreadCount: number;
  isAgent?: boolean;
}

export interface PeerInfo {
  pubkey: string;
  name?: string;
  keyPackageEventId?: string;
}

/** @deprecated Use PeerInfo instead */
export type AgentInfo = PeerInfo;

export interface ArkadePaymentRequestMessage {
  type: 'arkade_request';
  address: string;
  amount: number;
  memo?: string;
}

export interface LegacyLightningPaymentMessage {
  type: 'arkade_invoice';
  invoice: string;
  amount: number;
  memo?: string;
}

export type PaymentMessage = ArkadePaymentRequestMessage | LegacyLightningPaymentMessage;

export function parsePaymentMessage(content: string): PaymentMessage | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const amount = typeof parsed.amount === 'number' ? parsed.amount : NaN;
    const memo = typeof parsed.memo === 'string' ? parsed.memo : undefined;

    if (
      parsed &&
      parsed.type === 'arkade_request' &&
      typeof parsed.address === 'string' &&
      parsed.address.trim().length > 0 &&
      Number.isFinite(amount) &&
      amount > 0
    ) {
      return {
        type: 'arkade_request',
        address: parsed.address.trim(),
        amount,
        memo,
      };
    }

    // Read legacy Lightning payloads so older stored chats still render.
    if (
      parsed &&
      parsed.type === 'arkade_invoice' &&
      typeof parsed.invoice === 'string' &&
      parsed.invoice.trim().length > 0 &&
      Number.isFinite(amount) &&
      amount > 0
    ) {
      return {
        type: 'arkade_invoice',
        invoice: parsed.invoice.trim(),
        amount,
        memo,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export interface PaymentReceiptMessage {
  type: 'arkade_request_paid';
  requestMessageId: string;
}

export function parsePaymentReceiptMessage(content: string): PaymentReceiptMessage | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (
      parsed &&
      parsed.type === 'arkade_request_paid' &&
      typeof parsed.requestMessageId === 'string' &&
      parsed.requestMessageId.trim().length > 0
    ) {
      return {
        type: 'arkade_request_paid',
        requestMessageId: parsed.requestMessageId.trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}
