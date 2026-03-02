<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue';

const props = defineProps<{
  disabled?: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  send: [message: string];
  typing: [isTyping: boolean];
  'open-payments': [];
}>();

const inputText = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
let typingIdleTimer: ReturnType<typeof setTimeout> | null = null;

function resizeTextarea(): void {
  if (!textareaRef.value) return;
  textareaRef.value.style.height = 'auto';
  const maxHeight = 90;
  const nextHeight = Math.min(textareaRef.value.scrollHeight, maxHeight);
  textareaRef.value.style.height = `${nextHeight}px`;
}

function resetTextareaHeight(): void {
  if (!textareaRef.value) return;
  textareaRef.value.style.height = '22.5px';
}

function handleSend(): void {
  const text = inputText.value.trim();
  if (!text || props.disabled) return;

  emit('send', text);
  emit('typing', false);

  if (typingIdleTimer) {
    clearTimeout(typingIdleTimer);
    typingIdleTimer = null;
  }

  inputText.value = '';
  void nextTick(() => {
    resetTextareaHeight();
  });
}

function handleInput(): void {
  resizeTextarea();

  if (props.disabled) {
    emit('typing', false);
    return;
  }

  const hasText = inputText.value.trim().length > 0;
  if (!hasText) {
    emit('typing', false);
    if (typingIdleTimer) {
      clearTimeout(typingIdleTimer);
      typingIdleTimer = null;
    }
    return;
  }

  emit('typing', true);
  if (typingIdleTimer) clearTimeout(typingIdleTimer);
  typingIdleTimer = setTimeout(() => {
    emit('typing', false);
    typingIdleTimer = null;
  }, 1200);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return;
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
}

function handleOpenPayments(): void {
  if (props.disabled) return;
  emit('open-payments');
}

onUnmounted(() => {
  if (typingIdleTimer) {
    clearTimeout(typingIdleTimer);
  }
});
</script>

<template>
  <div class="message-input" data-node-id="1:429">
    <button
      class="money-btn"
      :class="{ disabled: disabled }"
      type="button"
      aria-label="Payment options"
      :disabled="disabled"
      @click="handleOpenPayments"
    >
      $
    </button>

    <div class="text-wrap" data-node-id="1:435">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        class="text-input"
        :placeholder="placeholder || 'Message'"
        :disabled="disabled"
        rows="1"
        @input="handleInput"
        @keydown="handleKeydown"
      />
    </div>

    <button
      class="send-btn"
      :class="{ inactive: !inputText.trim() || disabled }"
      type="button"
      aria-label="Send message"
      :disabled="!inputText.trim() || disabled"
      @click="handleSend"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 2L11 13" />
        <path d="M22 2L15 22L11 13L2 9L22 2Z" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.message-input {
  position: sticky;
  bottom: 0;
  z-index: 40;
  flex-shrink: 0;
  border-top: 1px solid #1a1a1a;
  background: #0a0a0a;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.money-btn {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 9999px;
  background: #1a1a1a;
  color: #888;
  font-size: 32px;
  line-height: 1;
  font-family: var(--font-sans);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.money-btn.disabled,
.money-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.text-wrap {
  flex: 1;
  min-height: 44px;
  border-radius: 9999px;
  background: #1a1a1a;
  padding: 10px 16px;
  display: flex;
  align-items: flex-end;
}

.text-input {
  display: block;
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  resize: none;
  color: #fff;
  font-size: 15px;
  line-height: 22.5px;
  font-family: var(--font-sans);
  min-height: 22.5px;
  max-height: 90px;
  overflow-y: auto;
}

.text-input::placeholder {
  color: #555;
}

.send-btn {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 9999px;
  background: #00e5ff;
  color: #0a0a0a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.send-btn.inactive,
.send-btn:disabled {
  opacity: 0.3;
}
</style>
