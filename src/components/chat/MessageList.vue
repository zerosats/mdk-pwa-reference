<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import type { Message } from '../../types';
import MessageBubble from './MessageBubble.vue';

const props = defineProps<{
  messages: Message[];
  currentUserPubkey: string | null;
  paymentClaimStates?: Record<string, 'idle' | 'claiming' | 'claimed' | 'failed'>;
  paymentClaimErrors?: Record<string, string>;
}>();

const emit = defineEmits<{
  react: [messageId: string, emoji: string];
  reply: [messageId: string];
  'claim-payment': [messageId: string];
}>();

const containerRef = ref<HTMLElement | null>(null);
const isAtBottom = ref(true);

function isOwnMessage(message: Message): boolean {
  return message.senderPubkey === props.currentUserPubkey;
}

function findMessage(id: string): Message | undefined {
  return props.messages.find((message) => message.id === id);
}

function handleScroll(): void {
  if (!containerRef.value) return;
  const { scrollTop, scrollHeight, clientHeight } = containerRef.value;
  isAtBottom.value = scrollHeight - scrollTop - clientHeight < 80;
}

function scrollToBottom(smooth = false): void {
  if (!containerRef.value) return;
  containerRef.value.scrollTo({
    top: containerRef.value.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
}

watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    if (isAtBottom.value) {
      scrollToBottom(false);
    }
  },
);

onMounted(() => {
  scrollToBottom(false);
});
</script>

<template>
  <div ref="containerRef" class="message-list" @scroll="handleScroll">
    <div v-if="messages.length === 0" class="empty-state">
      <p>No messages yet</p>
    </div>

    <div v-else class="message-stack">
      <MessageBubble
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :is-own-message="isOwnMessage(message)"
        :reply-to-message="message.replyToId ? findMessage(message.replyToId) : undefined"
        :payment-claim-state="paymentClaimStates?.[message.id] || 'idle'"
        :payment-claim-error="paymentClaimErrors?.[message.id] || ''"
        @react="(messageId, emoji) => emit('react', messageId, emoji)"
        @reply="(messageId) => emit('reply', messageId)"
        @claim-payment="(messageId) => emit('claim-payment', messageId)"
      />
    </div>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: #0a0a0a;
  padding: 20px 16px 10px;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}

.message-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-size: 15px;
  line-height: 22.5px;
}
</style>
