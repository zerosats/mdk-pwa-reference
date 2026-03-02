<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useWalletStore } from '../../stores/wallet';
import { lockBodyScroll } from '../../composables/useBodyScrollLock';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  send: [content: string];
}>();

const walletStore = useWalletStore();
let releaseBodyLock: (() => void) | null = null;

const amountInput = ref('');
const isCreating = ref(false);
const errorMessage = ref('');

const parsedAmount = computed(() => {
  const normalized = amountInput.value.replace(/[^0-9]/g, '');
  if (!normalized) return 0;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(numeric, Number.MAX_SAFE_INTEGER);
});

const availableSats = computed(() => {
  const numeric = Number(walletStore.balance);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(numeric, Number.MAX_SAFE_INTEGER);
});

const formattedAmount = computed(() => parsedAmount.value.toLocaleString());

const canCreate = computed(() => {
  if (!walletStore.isInitialized) return false;
  if (isCreating.value) return false;
  return parsedAmount.value > 0;
});

function resetState(): void {
  amountInput.value = '';
  isCreating.value = false;
  errorMessage.value = '';
}

function closeSheet(): void {
  resetState();
  emit('cancel');
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  closeSheet();
}

function setAmount(value: number): void {
  amountInput.value = String(Math.max(0, Math.floor(value)));
  errorMessage.value = '';
}

function handleAmountInput(event: Event): void {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  amountInput.value = target.value.replace(/[^0-9]/g, '');
  errorMessage.value = '';
}

function fillFromMainBalance(): void {
  setAmount(availableSats.value);
}

async function ensureRequestAddress(): Promise<string> {
  const existing = walletStore.address?.trim();
  if (existing) return existing;

  const refreshed = await walletStore.updateAddress();
  const normalized = refreshed.trim();
  if (!normalized) {
    throw new Error('Could not load your Ark address');
  }
  return normalized;
}

const confirmLabel = computed(() => {
  if (isCreating.value) return 'Creating request...';
  return `Request ${formattedAmount.value} sats`;
});

async function createPaymentRequest(): Promise<void> {
  if (!canCreate.value) return;

  isCreating.value = true;
  errorMessage.value = '';

  try {
    const address = await ensureRequestAddress();
    const payload = {
      type: 'arkade_request' as const,
      address,
      amount: parsedAmount.value,
    };

    emit('send', JSON.stringify(payload));
    closeSheet();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Could not create payment request';
  } finally {
    isCreating.value = false;
  }
}

watch(() => props.visible, (nextVisible) => {
  if (nextVisible) {
    releaseBodyLock = lockBodyScroll();
    document.addEventListener('keydown', handleEscape);
    return;
  }

  if (releaseBodyLock) {
    releaseBodyLock();
    releaseBodyLock = null;
  }
  document.removeEventListener('keydown', handleEscape);

  if (!nextVisible) {
    resetState();
  }
}, { immediate: true });

onUnmounted(() => {
  if (releaseBodyLock) {
    releaseBodyLock();
    releaseBodyLock = null;
  }
  document.removeEventListener('keydown', handleEscape);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div v-if="visible" class="sheet-overlay" @click.self="closeSheet">
        <div class="sheet-card" data-node-id="5:238">
          <div class="sheet-handle" />

          <h3 class="sheet-title">Request Payment</h3>

          <div class="amount-row">
            <input
              id="payment-amount"
              :value="amountInput"
              class="amount-input"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              placeholder="0"
              aria-label="Payment request amount in sats"
              @input="handleAmountInput"
            >
            <span class="amount-unit-col">
              <span class="amount-unit">sats</span>
              <span class="amount-bolt">⚡</span>
            </span>
          </div>

          <button
            class="confirm-btn"
            :class="{ disabled: !canCreate }"
            type="button"
            :disabled="!canCreate"
            @click="createPaymentRequest"
          >
            {{ confirmLabel }}
          </button>

          <div class="balance-row">
            <span class="balance-label">Chat balance</span>
            <span class="balance-value">{{ availableSats.toLocaleString() }} sats</span>
          </div>

          <button class="main-balance-btn" type="button" @click="fillFromMainBalance">
            Add from main balance
          </button>

          <p v-if="!walletStore.isInitialized" class="error-copy">
            Wallet is not initialized yet.
          </p>
          <p v-else-if="errorMessage" class="error-copy">{{ errorMessage }}</p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: flex-end;
}

.sheet-card {
  width: 100%;
  border-top: 1px solid #1a1a1a;
  border-radius: 16px 16px 0 0;
  background: #0a0a0a;
  padding: 24px 24px calc(26px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sheet-handle {
  width: 48px;
  height: 4px;
  border-radius: 9999px;
  background: #2a2a2a;
}

.sheet-title {
  margin: 22px 0 0;
  font-size: 20px;
  line-height: 30px;
  font-weight: 500;
  color: #fff;
  text-align: center;
}

.amount-row {
  margin-top: 24px;
  min-height: 72px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.amount-input {
  width: 164px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  text-align: right;
  font-family: 'Menlo', var(--font-mono);
  font-size: 48px;
  line-height: 72px;
  outline: none;
  caret-color: #00e5ff;
}

.amount-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.amount-unit-col {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
}

.amount-unit {
  color: #888;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
}

.amount-bolt {
  color: #00e5ff;
  font-size: 16px;
  line-height: 16px;
}

.confirm-btn {
  margin-top: 16px;
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
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.confirm-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.confirm-btn.disabled,
.confirm-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.balance-row {
  margin-top: 16px;
  width: 100%;
  height: 45px;
  border-radius: 10px;
  background: #2a2a2a;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.balance-label {
  color: #888;
  font-size: 14px;
  line-height: 21px;
  font-weight: 400;
}

.balance-value {
  color: #fff;
  font-family: 'Menlo', var(--font-mono);
  font-size: 14px;
  line-height: 21px;
  font-weight: 400;
}

.main-balance-btn {
  margin-top: 14px;
  border: 0;
  background: transparent;
  color: #00e5ff;
  font-family: 'Inter', var(--font-sans);
  font-size: 14px;
  line-height: 21px;
  font-weight: 500;
  cursor: pointer;
}

.error-copy {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: #ff6b6b;
}

.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.2s ease;
}

.sheet-fade-enter-active .sheet-card,
.sheet-fade-leave-active .sheet-card {
  transition: transform 0.24s ease;
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.sheet-fade-enter-from .sheet-card,
.sheet-fade-leave-to .sheet-card {
  transform: translateY(100%);
}
</style>
