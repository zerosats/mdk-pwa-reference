<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useChatStore } from '../stores/chat';
import { usePeerStore } from '../stores/peer';
import { useSettingsStore } from '../stores/settings';
import { useWalletStore } from '../stores/wallet';
import * as nostr from '../services/nostr';
import * as mdk from '../services/mdk';
import * as logger from '../services/logger';
import type { Message, NostrEvent } from '../types';
import { NostrKind, parsePaymentMessage, parsePaymentReceiptMessage } from '../types';
import MessageList from '../components/chat/MessageList.vue';
import MessageInput from '../components/chat/MessageInput.vue';
import NicknamePrompt from '../components/chat/NicknamePrompt.vue';
import PaymentComposerSheet from '../components/chat/PaymentComposerSheet.vue';

const router = useRouter();
const route = useRoute();
const chatStore = useChatStore();
const peerStore = usePeerStore();
const settingsStore = useSettingsStore();
const walletStore = useWalletStore();

const routeGroupId = computed(() => route.params.groupId as string | undefined);

const isSending = ref(false);
const showHeaderMenu = ref(false);
const showNicknamePrompt = ref(false);
const replyToMessageId = ref<string | null>(null);
const showPaymentSheet = ref(false);
const paymentClaimStates = ref<Record<string, 'idle' | 'claiming' | 'claimed' | 'failed'>>({});
const paymentClaimErrors = ref<Record<string, string>>({});

const CLAIMED_PAYMENT_STORAGE_KEY = 'arkade_claimed_payments_v1';

let unsubscribeMessages: (() => void) | null = null;
let unsubscribeTyping: (() => void) | null = null;
let isViewActive = false;
let mountedGroupId: string | null = null;
let lastTypingPublishAt = 0;

const TYPING_SIGNAL_CONTENT = '__arkade_typing_v1__';
const TYPING_PUBLISH_THROTTLE_MS = 1200;

const currentGroup = computed(() => chatStore.activeGroup);
const messages = computed(() => chatStore.activeMessages);

const peerName = computed(() => currentGroup.value?.name || peerStore.peer?.name || 'Chat');
const peerInitial = computed(() => peerName.value.slice(0, 1).toUpperCase());

const replyPreviewText = computed(() => {
  const message = messages.value.find((item) => item.id === replyToMessageId.value);
  if (!message) return 'Message';
  const payment = parsePaymentMessage(message.content);
  if (payment) return `${payment.amount.toLocaleString()} sats`;
  return message.content.slice(0, 50);
});

function closeHeaderMenu(): void {
  showHeaderMenu.value = false;
}

function toggleHeaderMenu(): void {
  showHeaderMenu.value = !showHeaderMenu.value;
}

function handleMenuEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  closeHeaderMenu();
}

function goBack(): void {
  router.push('/chats');
}

async function handleSendMessage(content: string): Promise<void> {
  const groupId = chatStore.activeGroupId;
  const senderPubkey = settingsStore.pubkeyHex;

  if (!groupId || !senderPubkey || isSending.value || !peerStore.isConnected) return;

  isSending.value = true;
  const timestamp = Date.now();
  let messageId: string | null = null;

  try {
    const result = await mdk.createMessage(groupId, content, senderPubkey);

    peerStore.updateNostrGroupIdFromMessage(result.event_json);

    const eventFromMdk = JSON.parse(result.event_json) as Partial<NostrEvent>;
    if (!eventFromMdk.id) {
      throw new Error('MDK returned message event without id');
    }

    messageId = eventFromMdk.id;

    const pendingMessage: Message = {
      id: messageId,
      groupId,
      senderPubkey,
      content,
      timestamp,
      status: 'pending',
      replyToId: replyToMessageId.value || undefined,
    };

    replyToMessageId.value = null;
    await chatStore.addMessage(pendingMessage);

    await nostr.publishEvent(eventFromMdk as NostrEvent);
    chatStore.updateMessageStatus(groupId, messageId, 'sent');
  } catch (error) {
    logger.error('chat', 'Failed to send message', {
      error: error instanceof Error ? error.message : String(error),
      groupId,
      messageId,
    });
    if (messageId) {
      chatStore.updateMessageStatus(groupId, messageId, 'failed');
    }
  } finally {
    isSending.value = false;
  }
}

async function handleIncomingEvent(event: NostrEvent): Promise<void> {
  if (!isViewActive || !mountedGroupId) return;

  const targetGroupId = mountedGroupId;
  const eventNostrGroupId = event.tags?.find((tag) => tag[0] === 'h')?.[1];

  if (eventNostrGroupId) {
    const resolvedGroupId = peerStore.resolveGroupIdFromNostrGroupId(eventNostrGroupId);
    if (resolvedGroupId && resolvedGroupId !== targetGroupId) {
      return;
    }
  }

  if (chatStore.activeGroupId !== targetGroupId) return;
  if (event.pubkey === settingsStore.pubkeyHex) return;

  try {
    const processed = await mdk.processMessage(JSON.stringify(event));

    if (processed.message_type !== 'application' || !processed.content || processed.sender === settingsStore.pubkeyHex) {
      return;
    }

    const paymentReceipt = parsePaymentReceiptMessage(processed.content);
    if (paymentReceipt) {
      markPaymentAsClaimed(paymentReceipt.requestMessageId);
      return;
    }

    const incomingMessage: Message = {
      id: event.id,
      groupId: targetGroupId,
      senderPubkey: processed.sender || event.pubkey,
      content: processed.content,
      timestamp: event.created_at * 1000,
      status: 'delivered',
    };

    await chatStore.addMessage(incomingMessage);
  } catch (error) {
    logger.error('chat', 'Failed to process incoming event', {
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function handleIncomingTypingEvent(event: NostrEvent): void {
  if (!isViewActive || !mountedGroupId) return;
  if (event.kind !== NostrKind.Typing) return;
  if (event.content !== TYPING_SIGNAL_CONTENT) return;
  if (event.pubkey === settingsStore.pubkeyHex) return;

  const eventNostrGroupId = event.tags?.find((tag) => tag[0] === 'h')?.[1];
  if (!eventNostrGroupId) return;

  const resolvedGroupId = peerStore.resolveGroupIdFromNostrGroupId(eventNostrGroupId);
  if (resolvedGroupId && resolvedGroupId !== mountedGroupId) return;
}

async function publishTypingSignal(): Promise<void> {
  if (!peerStore.nostrGroupId || !settingsStore.pubkeyHex || !peerStore.isConnected) return;

  const unsignedEvent = {
    pubkey: settingsStore.pubkeyHex,
    created_at: Math.floor(Date.now() / 1000),
    kind: NostrKind.Typing,
    tags: [['h', peerStore.nostrGroupId]],
    content: TYPING_SIGNAL_CONTENT,
  };

  try {
    const signedEvent = await nostr.signEvent(unsignedEvent);
    await nostr.publishEvent(signedEvent);
  } catch {
    // typing signal failure is non-critical
  }
}

function handleLocalTyping(isTyping: boolean): void {
  if (!isTyping) return;

  const now = Date.now();
  if (now - lastTypingPublishAt < TYPING_PUBLISH_THROTTLE_MS) return;

  lastTypingPublishAt = now;
  void publishTypingSignal();
}

function handleReact(messageId: string, emoji: string): void {
  const groupId = chatStore.activeGroupId;
  if (!groupId || !settingsStore.pubkeyHex) return;

  chatStore.addReaction(groupId, messageId, {
    emoji,
    senderPubkey: settingsStore.pubkeyHex,
    timestamp: Date.now(),
  });
}

function handleReply(messageId: string): void {
  replyToMessageId.value = messageId;
}

function cancelReply(): void {
  replyToMessageId.value = null;
}

function openPaymentSheet(): void {
  showPaymentSheet.value = true;
}

async function handleSendPaymentRequest(content: string): Promise<void> {
  showPaymentSheet.value = false;
  await handleSendMessage(content);
}

async function sendPaymentReceipt(requestMessageId: string): Promise<void> {
  const groupId = chatStore.activeGroupId;
  const senderPubkey = settingsStore.pubkeyHex;

  if (!groupId || !senderPubkey || !peerStore.isConnected) return;

  const payload = JSON.stringify({
    type: 'arkade_request_paid' as const,
    requestMessageId,
  });

  const result = await mdk.createMessage(groupId, payload, senderPubkey);
  peerStore.updateNostrGroupIdFromMessage(result.event_json);

  const eventFromMdk = JSON.parse(result.event_json) as Partial<NostrEvent>;
  if (!eventFromMdk.id) {
    throw new Error('MDK returned receipt event without id');
  }

  await nostr.publishEvent(eventFromMdk as NostrEvent);
}

function loadClaimedPaymentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CLAIMED_PAYMENT_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function persistClaimedPaymentIds(ids: Set<string>): void {
  localStorage.setItem(CLAIMED_PAYMENT_STORAGE_KEY, JSON.stringify(Array.from(ids)));
}

function markPaymentAsClaimed(messageId: string): void {
  paymentClaimStates.value = {
    ...paymentClaimStates.value,
    [messageId]: 'claimed',
  };
  paymentClaimErrors.value = {
    ...paymentClaimErrors.value,
    [messageId]: '',
  };

  const claimedIds = loadClaimedPaymentIds();
  if (!claimedIds.has(messageId)) {
    claimedIds.add(messageId);
    persistClaimedPaymentIds(claimedIds);
  }
}

function hydrateClaimedPaymentState(): void {
  const claimedIds = loadClaimedPaymentIds();
  const nextStates: Record<string, 'idle' | 'claiming' | 'claimed' | 'failed'> = {};

  for (const message of messages.value) {
    const payment = parsePaymentMessage(message.content);
    if (!payment) continue;
    nextStates[message.id] = claimedIds.has(message.id) ? 'claimed' : 'idle';
  }

  paymentClaimStates.value = nextStates;
  paymentClaimErrors.value = {};
}

async function handleClaimPayment(messageId: string): Promise<void> {
  const targetMessage = messages.value.find((message) => message.id === messageId);
  if (!targetMessage) return;

  const payment = parsePaymentMessage(targetMessage.content);
  if (!payment) return;

  const currentState = paymentClaimStates.value[messageId] || 'idle';
  if (currentState === 'claiming' || currentState === 'claimed') return;

  if (!walletStore.isInitialized) {
    paymentClaimStates.value = {
      ...paymentClaimStates.value,
      [messageId]: 'failed',
    };
    paymentClaimErrors.value = {
      ...paymentClaimErrors.value,
      [messageId]: 'Wallet not initialized',
    };
    return;
  }

  paymentClaimStates.value = {
    ...paymentClaimStates.value,
    [messageId]: 'claiming',
  };
  paymentClaimErrors.value = {
    ...paymentClaimErrors.value,
    [messageId]: '',
  };

  try {
    if (payment.type !== 'arkade_request') {
      throw new Error('This payment request uses a retired Lightning format');
    }

    await walletStore.sendPayment(payment.address, payment.amount);
    markPaymentAsClaimed(messageId);

    try {
      await sendPaymentReceipt(messageId);
    } catch (error) {
      logger.error('chat', 'Failed to send payment receipt', {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } catch (error) {
    paymentClaimStates.value = {
      ...paymentClaimStates.value,
      [messageId]: 'failed',
    };
    paymentClaimErrors.value = {
      ...paymentClaimErrors.value,
      [messageId]: error instanceof Error ? error.message : 'Payment failed',
    };
  }
}

function handleMenuRename(): void {
  closeHeaderMenu();
  const currentName = currentGroup.value?.name || '';
  const newName = prompt('Rename chat:', currentName);
  if (!newName || !chatStore.activeGroupId) return;
  chatStore.renameGroup(chatStore.activeGroupId, newName.trim());
}

async function handleMenuPeerInfo(): Promise<void> {
  closeHeaderMenu();
  const key = peerStore.peer?.pubkey || 'Unavailable';
  try {
    await navigator.clipboard.writeText(key);
  } catch {
    // ignore clipboard failure
  }
  alert(`Peer public key:\n${key}`);
}

async function handleMenuDelete(): Promise<void> {
  closeHeaderMenu();
  const groupId = chatStore.activeGroupId;
  if (!groupId) return;
  if (!confirm('Delete this chat? This cannot be undone.')) return;

  await chatStore.removeGroup(groupId);
  router.push('/chats');
}

async function handleNicknameSubmit(name: string): Promise<void> {
  showNicknamePrompt.value = false;
  const groupId = chatStore.activeGroupId;
  if (!groupId) return;

  await chatStore.renameGroup(groupId, name);

  if (peerStore.peer) {
    peerStore.peer.name = name;
    peerStore.saveCurrentGroupState();
  }
}

onMounted(async () => {
  const targetGroupId = routeGroupId.value || peerStore.groupId;

  if (!targetGroupId) {
    router.push('/connect');
    return;
  }

  if (!peerStore.isConnected && !chatStore.groups.has(targetGroupId)) {
    if (!peerStore.switchToGroup(targetGroupId)) {
      router.push('/connect');
      return;
    }
  } else if (peerStore.groupId !== targetGroupId) {
    peerStore.switchToGroup(targetGroupId);
  }

  isViewActive = true;
  mountedGroupId = targetGroupId;

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }
  if (unsubscribeTyping) {
    unsubscribeTyping();
    unsubscribeTyping = null;
  }

  chatStore.setActiveGroup(targetGroupId);
  await chatStore.loadMessagesFromStorage(targetGroupId);
  hydrateClaimedPaymentState();

  if (!chatStore.groups.has(targetGroupId) && peerStore.peer && settingsStore.pubkeyHex) {
    chatStore.addGroup({
      id: targetGroupId,
      name: peerStore.peer.name || 'Chat',
      epoch: 0,
      members: [settingsStore.pubkeyHex, peerStore.peer.pubkey],
      unreadCount: 0,
    });
  }

  if (peerStore.isConnected && peerStore.nostrGroupId) {
    unsubscribeMessages = peerStore.subscribeToGroupMessages(handleIncomingEvent);
    unsubscribeTyping = nostr.subscribeToTypingEvents(
      [peerStore.nostrGroupId],
      handleIncomingTypingEvent,
    );
  }

  const needsNaming = await chatStore.checkNeedsNaming(targetGroupId);
  if (needsNaming) {
    showNicknamePrompt.value = true;
  }
});

onUnmounted(() => {
  isViewActive = false;
  mountedGroupId = null;

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  if (unsubscribeTyping) {
    unsubscribeTyping();
    unsubscribeTyping = null;
  }

  chatStore.setActiveGroup(null);
  document.removeEventListener('keydown', handleMenuEscape);
});

watch(messages, () => {
  hydrateClaimedPaymentState();
});

watch(showHeaderMenu, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleMenuEscape);
    return;
  }
  document.removeEventListener('keydown', handleMenuEscape);
});

watch(showPaymentSheet, (isOpen) => {
  if (isOpen) closeHeaderMenu();
});

watch(showNicknamePrompt, (isOpen) => {
  if (isOpen) closeHeaderMenu();
});
</script>

<template>
  <div class="chat-view" data-node-id="1:281" @click="closeHeaderMenu">
    <header class="chat-header" data-node-id="1:349" @click.stop>
      <button class="header-icon" aria-label="Back" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="15" y1="6" x2="9" y2="12" />
          <line x1="9" y1="12" x2="15" y2="18" />
        </svg>
      </button>

      <button class="peer-summary" type="button">
        <span class="peer-avatar">{{ peerInitial }}</span>
        <span class="peer-copy">
          <span class="peer-name">{{ peerName }}</span>
          <span class="peer-status">
            <span class="peer-dot" />
            Online
          </span>
        </span>
      </button>

      <div class="menu-wrap">
        <button class="header-icon" aria-label="More options" :aria-expanded="showHeaderMenu" @click="toggleHeaderMenu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>

        <Transition name="menu-fade">
          <div v-if="showHeaderMenu" class="header-menu" data-node-id="1:465">
            <button class="menu-item" @click="handleMenuRename">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z" />
              </svg>
              <span>Rename</span>
            </button>
            <button class="menu-item" @click="handleMenuPeerInfo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Peer Info</span>
            </button>
            <button class="menu-item menu-item-danger" @click="handleMenuDelete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Delete Chat</span>
            </button>
          </div>
        </Transition>
      </div>
    </header>

    <MessageList
      :messages="messages"
      :current-user-pubkey="settingsStore.pubkeyHex"
      :payment-claim-states="paymentClaimStates"
      :payment-claim-errors="paymentClaimErrors"
      @react="handleReact"
      @reply="handleReply"
      @claim-payment="handleClaimPayment"
    />

    <div v-if="replyToMessageId" class="reply-row">
      <span class="reply-text">Replying to: {{ replyPreviewText }}</span>
      <button class="reply-cancel" aria-label="Cancel reply" @click="cancelReply">×</button>
    </div>

    <MessageInput
      :disabled="isSending || !peerStore.isConnected || !chatStore.activeGroupId"
      placeholder="Message"
      @send="handleSendMessage"
      @typing="handleLocalTyping"
      @open-payments="openPaymentSheet"
    />

    <PaymentComposerSheet
      :visible="showPaymentSheet"
      @cancel="showPaymentSheet = false"
      @send="handleSendPaymentRequest"
    />

    <NicknamePrompt v-if="showNicknamePrompt" @submit="handleNicknameSubmit" />
  </div>
</template>

<style scoped>
.chat-view {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  background: #0a0a0a;
  color: #fff;
  display: flex;
  flex-direction: column;
  font-family: var(--font-sans);
  overflow: hidden;
}

.chat-header {
  flex-shrink: 0;
  height: calc(75px + env(safe-area-inset-top, 0px));
  border-bottom: 1px solid #1a1a1a;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 16px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-icon {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 8px;
  transition: background 0.16s ease, color 0.16s ease;
}

.header-icon:hover {
  background: #141414;
}

.peer-summary {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  cursor: default;
}

.peer-avatar {
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  background: #1a1a1a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  line-height: 21px;
  font-weight: 500;
  flex-shrink: 0;
}

.peer-copy {
  display: inline-flex;
  flex-direction: column;
  min-width: 0;
}

.peer-name {
  color: #fff;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
}

.peer-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #888;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
}

.peer-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #00ff88;
}

.menu-wrap {
  position: relative;
  flex-shrink: 0;
}

.header-menu {
  position: absolute;
  top: 56px;
  right: 0;
  width: 180px;
  border-radius: 14px;
  border: 1px solid #1a1a1a;
  background: #1a1a1a;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  z-index: 200;
}

.menu-item {
  width: 100%;
  height: 50.5px;
  border: 0;
  background: transparent;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding-left: 16px;
  color: #fff;
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  text-align: left;
  transition: background 0.16s ease;
}

.menu-item:hover {
  background: #141414;
}

.menu-item + .menu-item {
  border-top: 1px solid #1a1a1a;
}

.menu-item-danger {
  color: #ff4444;
}

.reply-row {
  flex-shrink: 0;
  min-height: 36px;
  border-top: 1px solid #1a1a1a;
  background: #0a0a0a;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.reply-text {
  font-size: 13px;
  line-height: 19.5px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.reply-cancel {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  color: #888;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.16s ease, color 0.16s ease;
}

.reply-cancel:hover {
  background: #141414;
  color: #fff;
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.16s ease;
}

.menu-fade-enter-active .header-menu,
.menu-fade-leave-active .header-menu {
  transition: transform 0.16s ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
}

.menu-fade-enter-from .header-menu,
.menu-fade-leave-to .header-menu {
  transform: translateY(-6px) scale(0.98);
}
</style>
