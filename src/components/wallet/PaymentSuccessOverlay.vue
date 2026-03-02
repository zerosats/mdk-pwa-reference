<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  visible: boolean;
  kind: 'sent' | 'received';
  amount?: number | null;
}>();

const emit = defineEmits<{
  back: [];
}>();

const title = computed(() => (
  props.kind === 'received' ? 'Payment Received' : 'Payment Sent'
));

const subtitle = computed(() => {
  const amount = typeof props.amount === 'number' ? Math.max(0, props.amount) : 0;
  const amountLabel = `${amount.toLocaleString()} sats`;
  if (props.kind === 'received') {
    return `You received ${amountLabel} in your wallet.`;
  }
  return `You sent ${amountLabel} successfully.`;
});

function goBack(): void {
  emit('back');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="success-fade">
      <div v-if="visible" class="success-overlay">
        <div class="success-card">
          <button class="back-button" type="button" aria-label="Back to settings" @click="goBack">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="15" y1="6" x2="9" y2="12" />
              <line x1="9" y1="12" x2="15" y2="18" />
            </svg>
            <span>Back</span>
          </button>

          <span class="success-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>

          <h2 class="success-title">{{ title }}</h2>
          <p class="success-subtitle">{{ subtitle }}</p>

          <button class="settings-button" type="button" @click="goBack">Go to Settings</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.success-overlay {
  position: fixed;
  inset: 0;
  z-index: 360;
  background: rgba(10, 10, 10, 0.88);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.success-card {
  width: 290px;
  max-width: calc(100vw - 48px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
}

.back-button {
  align-self: stretch;
  height: 36px;
  border: 0;
  border-radius: 10px;
  background: #151515;
  color: #d2d2d2;
  font-family: 'Inter', var(--font-sans);
  font-size: 14px;
  line-height: 21px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
}

.success-icon {
  width: 96px;
  height: 96px;
  border-radius: 9999px;
  background: #00e5ff;
  color: #0a0a0a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.success-title {
  margin: 0;
  font-size: 28px;
  line-height: 42px;
  font-weight: 500;
  color: #fff;
  text-align: center;
}

.success-subtitle {
  margin: -14px 0 0;
  font-size: 15px;
  line-height: 24px;
  font-weight: 400;
  color: #888;
  text-align: center;
}

.settings-button {
  width: 100%;
  height: 56px;
  border: 0;
  border-radius: 14px;
  background: #00e5ff;
  color: #0a0a0a;
  font-family: 'Inter', var(--font-sans);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  cursor: pointer;
}

.success-fade-enter-active,
.success-fade-leave-active {
  transition: opacity 0.22s ease;
}

.success-fade-enter-active .success-card,
.success-fade-leave-active .success-card {
  transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease;
}

.success-fade-enter-from,
.success-fade-leave-to {
  opacity: 0;
}

.success-fade-enter-from .success-card,
.success-fade-leave-to .success-card {
  opacity: 0;
  transform: translateY(16px) scale(0.96);
}
</style>
