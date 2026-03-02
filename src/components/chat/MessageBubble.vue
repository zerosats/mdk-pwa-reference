<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { Message } from '../../types';
import { parsePaymentMessage } from '../../types';

const props = defineProps<{
  message: Message;
  isOwnMessage: boolean;
  replyToMessage?: Message;
  paymentClaimState?: 'idle' | 'claiming' | 'claimed' | 'failed';
  paymentClaimError?: string;
}>();

const emit = defineEmits<{
  react: [messageId: string, emoji: string];
  reply: [messageId: string];
  'claim-payment': [messageId: string];
}>();

const showActionMenu = ref(false);
const isPressing = ref(false);
const bubbleRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
let longPressTimer: number | null = null;

const payment = computed(() => parsePaymentMessage(props.message.content));

const groupedReactions = computed(() => {
  if (!props.message.reactions?.length) return [] as Array<{ emoji: string; count: number }>;

  const grouped = new Map<string, number>();
  for (const reaction of props.message.reactions) {
    grouped.set(reaction.emoji, (grouped.get(reaction.emoji) || 0) + 1);
  }

  return Array.from(grouped.entries()).map(([emoji, count]) => ({ emoji, count }));
});

const paymentMemo = computed(() => {
  if (!payment.value) return '';
  if (payment.value.memo) return payment.value.memo;

  if (props.isOwnMessage) {
    if ((props.paymentClaimState || 'idle') === 'claimed') {
      return 'Payment received\nin your wallet';
    }
    return 'See payment\nstatus below';
  }

  return 'Tap below to pay\nthis request';
});

const payLabel = computed(() => {
  if (!payment.value) return 'Pay sats';
  return `Pay ${payment.value.amount.toLocaleString()} sats`;
});

const isLegacyInvoicePayment = computed(() => payment.value?.type === 'arkade_invoice');

const replyPreview = computed(() => {
  if (!props.replyToMessage) return '';
  const replyPayment = parsePaymentMessage(props.replyToMessage.content);
  if (replyPayment) {
    return `${replyPayment.amount.toLocaleString()} sats`;
  }
  return props.replyToMessage.content.slice(0, 64);
});

function handleClaim(): void {
  emit('claim-payment', props.message.id);
}

function react(emoji: string): void {
  emit('react', props.message.id, emoji);
}

function reply(): void {
  emit('reply', props.message.id);
}

function clearLongPressTimer(): void {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function openActionMenu(): void {
  showActionMenu.value = true;
}

function closeActionMenu(): void {
  showActionMenu.value = false;
}

function handleDoubleClick(): void {
  openActionMenu();
}

function handleContextMenu(event: MouseEvent): void {
  event.preventDefault();
  openActionMenu();
}

function handleTouchStart(): void {
  isPressing.value = true;
  clearLongPressTimer();
  longPressTimer = window.setTimeout(() => {
    openActionMenu();
    clearLongPressTimer();
  }, 450);
}

function handleTouchMove(): void {
  isPressing.value = false;
  clearLongPressTimer();
}

function handleTouchEnd(): void {
  isPressing.value = false;
  clearLongPressTimer();
}

function handleMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return;
  isPressing.value = true;
}

function handleMouseUp(): void {
  isPressing.value = false;
}

function handleMouseLeave(): void {
  isPressing.value = false;
}

function handleOutsidePointer(event: PointerEvent): void {
  if (!showActionMenu.value) return;
  const target = event.target as Node | null;
  if (!target) return;
  if (bubbleRef.value?.contains(target)) return;
  if (menuRef.value?.contains(target)) return;
  closeActionMenu();
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  closeActionMenu();
}

function selectReaction(emoji: string): void {
  react(emoji);
  closeActionMenu();
}

function selectReply(): void {
  reply();
  closeActionMenu();
}

watch(showActionMenu, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return;
  }

  document.removeEventListener('pointerdown', handleOutsidePointer);
  document.removeEventListener('keydown', handleEscape);
});

onUnmounted(() => {
  isPressing.value = false;
  clearLongPressTimer();
  document.removeEventListener('pointerdown', handleOutsidePointer);
  document.removeEventListener('keydown', handleEscape);
});
</script>

<template>
  <div class="bubble-wrap" :class="isOwnMessage ? 'own' : 'other'">
    <template v-if="payment">
      <div class="interactive-shell" :class="{ own: isOwnMessage }">
        <div
          ref="bubbleRef"
          class="payment-card bubble-surface"
          :class="[isOwnMessage ? 'payment-own' : 'payment-other', { 'bubble-pressed': isPressing, 'menu-open': showActionMenu }]"
          @dblclick="handleDoubleClick"
          @contextmenu="handleContextMenu"
          @mousedown="handleMouseDown"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseLeave"
          @touchstart.passive="handleTouchStart"
          @touchmove.passive="handleTouchMove"
          @touchend.passive="handleTouchEnd"
          @touchcancel.passive="handleTouchEnd"
        >
          <div v-if="replyToMessage" class="reply-chip">
            <span class="reply-chip-label">Replying to</span>
            <span class="reply-chip-value">{{ replyPreview }}</span>
          </div>

          <div class="payment-amount-row">
            <span class="payment-amount">{{ payment.amount.toLocaleString() }}</span>
            <span class="payment-unit-col">
              <span class="payment-unit">sats</span>
              <span class="payment-bolt">⚡</span>
            </span>
          </div>

          <p class="payment-memo">{{ paymentMemo }}</p>

          <div
            v-if="isOwnMessage && (paymentClaimState || 'idle') === 'claimed'"
            class="payment-status payment-status-success"
          >
            Received ⚡
          </div>
          <p v-else-if="isOwnMessage" class="payment-state">Pending</p>
          <button
            v-else-if="(paymentClaimState || 'idle') === 'idle' && !isLegacyInvoicePayment"
            class="claim-btn"
            @click="handleClaim"
          >
            {{ payLabel }}
          </button>
          <div v-else-if="(paymentClaimState || 'idle') === 'idle'" class="payment-status payment-status-failed">
            Unsupported request
          </div>
          <div v-else-if="paymentClaimState === 'claiming'" class="payment-status payment-status-loading">
            <span class="spinner" />
            Paying...
          </div>
          <div v-else-if="paymentClaimState === 'claimed'" class="payment-status payment-status-success">
            Paid ⚡
          </div>
          <div v-else class="payment-status payment-status-failed">
            {{ paymentClaimError || 'Payment failed' }}
            <button class="retry-btn" type="button" @click="handleClaim">Retry</button>
          </div>
        </div>

        <Transition name="gesture-menu-pop">
          <div
            v-if="showActionMenu"
            ref="menuRef"
            class="gesture-menu"
            :class="{ own: isOwnMessage }"
          >
            <button class="gesture-menu-btn emoji" type="button" @click="selectReaction('👍')">👍</button>
            <button class="gesture-menu-btn emoji" type="button" @click="selectReaction('❤️')">❤️</button>
            <button class="gesture-menu-btn emoji" type="button" @click="selectReaction('😂')">😂</button>
            <button class="gesture-menu-btn reply-icon-btn" type="button" aria-label="Reply" title="Reply" @click="selectReply">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 14 4 9 9 4" />
                <path d="M20 20v-6a5 5 0 0 0-5-5H4" />
              </svg>
            </button>
          </div>
        </Transition>
      </div>
    </template>

    <template v-else>
      <div class="interactive-shell" :class="{ own: isOwnMessage }">
        <div
          ref="bubbleRef"
          class="text-bubble bubble-surface"
          :class="[isOwnMessage ? 'text-own' : 'text-other', { 'bubble-pressed': isPressing, 'menu-open': showActionMenu }]"
          @dblclick="handleDoubleClick"
          @contextmenu="handleContextMenu"
          @mousedown="handleMouseDown"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseLeave"
          @touchstart.passive="handleTouchStart"
          @touchmove.passive="handleTouchMove"
          @touchend.passive="handleTouchEnd"
          @touchcancel.passive="handleTouchEnd"
        >
          <div v-if="replyToMessage" class="reply-chip">
            <span class="reply-chip-label">Replying to</span>
            <span class="reply-chip-value">{{ replyPreview }}</span>
          </div>
          <p class="message-text">{{ message.content }}</p>
        </div>
        <Transition name="gesture-menu-pop">
          <div
            v-if="showActionMenu"
            ref="menuRef"
            class="gesture-menu"
            :class="{ own: isOwnMessage }"
          >
            <button class="gesture-menu-btn emoji" type="button" @click="selectReaction('👍')">👍</button>
            <button class="gesture-menu-btn emoji" type="button" @click="selectReaction('❤️')">❤️</button>
            <button class="gesture-menu-btn emoji" type="button" @click="selectReaction('😂')">😂</button>
            <button class="gesture-menu-btn reply-icon-btn" type="button" aria-label="Reply" title="Reply" @click="selectReply">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 14 4 9 9 4" />
                <path d="M20 20v-6a5 5 0 0 0-5-5H4" />
              </svg>
            </button>
          </div>
        </Transition>
      </div>
    </template>

    <div
      v-if="groupedReactions.length && !payment"
      class="reaction-row"
      :class="isOwnMessage ? 'reaction-own' : 'reaction-other'"
    >
      <button
        v-for="reaction in groupedReactions"
        :key="reaction.emoji"
        class="reaction-chip"
        @click="react(reaction.emoji)"
      >
        <span>{{ reaction.emoji }}</span>
        <span v-if="reaction.count > 1" class="reaction-count">{{ reaction.count }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.bubble-wrap {
  display: flex;
  flex-direction: column;
  max-width: 100%;
}

.bubble-wrap.own {
  align-items: flex-end;
}

.bubble-wrap.other {
  align-items: flex-start;
}

.text-bubble {
  max-width: 268.5px;
  border-radius: 16px;
  padding: 12px 16px;
}

.text-own {
  background: #00e5ff;
  color: #0a0a0a;
}

.text-other {
  background: #1a1a1a;
  color: #fff;
}

.message-text {
  margin: 0;
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 400;
  white-space: pre-wrap;
  word-break: break-word;
}

.payment-card {
  border: 1px solid #1a1a1a;
  border-radius: 16px;
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 17px 10px;
}

.bubble-surface {
  transform-origin: center;
  transition: transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1), filter 0.18s ease;
  will-change: transform;
}

.bubble-surface.bubble-pressed {
  transform: scale(0.986);
}

.bubble-surface.menu-open {
  transform: scale(1.008);
}

.payment-own {
  width: 203.766px;
  min-height: 176px;
}

.payment-other {
  width: 203.766px;
  min-height: 176px;
}

.payment-amount-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.payment-amount {
  font-family: 'Menlo', var(--font-mono);
  font-size: 32px;
  line-height: 48px;
  font-weight: 700;
  color: #fff;
}

.payment-unit-col {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1;
}

.payment-unit {
  color: #888;
  font-size: 14px;
  line-height: 21px;
  font-weight: 400;
}

.payment-bolt {
  color: #00e5ff;
  font-size: 12px;
  line-height: 12px;
}

.payment-memo {
  margin: 0;
  color: #888;
  font-size: 13px;
  line-height: 19.5px;
  text-align: center;
  white-space: pre-line;
  min-height: 39px;
}

.payment-state {
  margin: 0;
  color: #888;
  font-size: 11px;
  line-height: 16.5px;
  letter-spacing: 0.55px;
  text-transform: uppercase;
  min-height: 37px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.claim-btn {
  width: 153.766px;
  height: 37px;
  border: 0;
  border-radius: 9999px;
  background: #00e5ff;
  color: #0a0a0a;
  font-size: 14px;
  line-height: 21px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
}

.payment-status {
  min-height: 37px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #888;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
}

.payment-status-success {
  color: #34d399;
}

.payment-status-failed {
  flex-direction: column;
  color: #ff6b6b;
}

.retry-btn {
  border: 0;
  background: transparent;
  color: #00e5ff;
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
  cursor: pointer;
}

.spinner {
  width: 11px;
  height: 11px;
  border: 2px solid #888;
  border-right-color: transparent;
  border-radius: 9999px;
  animation: spin 0.75s linear infinite;
}

.reply-chip {
  width: calc(100% - 8px);
  border-radius: 10px;
  background: #101010;
  border: 1px solid #242424;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.reply-chip-label {
  font-size: 11px;
  line-height: 16px;
  font-weight: 500;
  color: #888;
}

.reply-chip-value {
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: #d5d5d5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.interactive-shell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  position: relative;
}

.interactive-shell.own {
  align-items: flex-end;
}

.gesture-menu {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 6px;
  border-radius: 999px;
  border: 1px solid #272727;
  background: #111;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
}

.gesture-menu-btn {
  height: 24px;
  border: 1px solid #2a2a2a;
  border-radius: 9999px;
  background: #181818;
  color: #d5d5d5;
  font-size: 11px;
  line-height: 16px;
  font-weight: 500;
  padding: 0 10px;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.gesture-menu-btn:hover {
  background: #222;
  border-color: #3a3a3a;
  color: #fff;
}

.gesture-menu-btn.emoji {
  min-width: 28px;
  padding: 0 8px;
  font-size: 12px;
}

.reply-icon-btn {
  min-width: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.gesture-menu-btn:active {
  transform: scale(0.94);
}

.gesture-menu-pop-enter-active,
.gesture-menu-pop-leave-active {
  transition: opacity 0.2s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), filter 0.2s ease;
}

.gesture-menu-pop-enter-from,
.gesture-menu-pop-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.94);
  filter: blur(2px);
}

.reaction-row {
  margin-top: 4px;
}

.reaction-own {
  align-self: flex-start;
}

.reaction-other {
  align-self: flex-start;
}

.reaction-chip {
  height: 22px;
  min-width: 31px;
  border: 0;
  border-radius: 9999px;
  padding: 0 8px;
  background: #1a1a1a;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}

.reaction-count {
  color: #888;
  font-size: 11px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
