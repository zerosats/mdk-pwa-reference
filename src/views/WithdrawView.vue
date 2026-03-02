<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useWalletStore } from '../stores/wallet';
import PaymentSuccessOverlay from '../components/wallet/PaymentSuccessOverlay.vue';

const router = useRouter();
const walletStore = useWalletStore();

const address = ref('');
const amount = ref('');
const sending = ref(false);
const sendError = ref('');
const sentAmount = ref<number | null>(null);

const parsedAmount = computed(() => {
  const digitsOnly = amount.value.replace(/[^0-9]/g, '');
  if (!digitsOnly) return 0;
  return Number(digitsOnly);
});

const canSend = computed(() => (
  address.value.trim().length > 0
  && parsedAmount.value > 0
  && !sending.value
));

function goBack(): void {
  router.push('/wallet');
}

function setMax(): void {
  amount.value = String(walletStore.balance);
}

async function handleSend(): Promise<void> {
  if (!canSend.value) return;

  sending.value = true;
  sendError.value = '';
  const amountToSend = parsedAmount.value;

  try {
    await walletStore.sendPayment(address.value.trim(), parsedAmount.value);
    sentAmount.value = amountToSend;
    address.value = '';
    amount.value = '';
  } catch (error) {
    sendError.value = (error as Error).message;
  } finally {
    sending.value = false;
  }
}

function handleSuccessBack(): void {
  sentAmount.value = null;
  router.push('/settings');
}
</script>

<template>
  <div class="send-view" data-node-id="1:938">
    <header class="send-header" data-node-id="1:940">
      <button class="back-button" type="button" aria-label="Go back" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="15" y1="6" x2="9" y2="12" />
          <line x1="9" y1="12" x2="15" y2="18" />
        </svg>
      </button>
      <h1 class="header-title">Send</h1>
    </header>

    <main class="send-content" data-node-id="1:947">
      <section class="field-group" data-node-id="1:948">
        <label class="field-label" for="send-to">To (Ark Address)</label>
        <input
          id="send-to"
          v-model="address"
          type="text"
          class="text-input"
          placeholder="ark1..."
        >
      </section>

      <section class="field-group amount-group" data-node-id="1:953">
        <label class="field-label" for="send-amount">Amount</label>

        <div class="amount-wrap" data-node-id="1:958">
          <input
            id="send-amount"
            v-model="amount"
            type="text"
            inputmode="numeric"
            class="text-input"
            placeholder="0"
          >

          <button class="max-button" type="button" @click="setMax">Max</button>
        </div>

        <p class="available-copy">Available: {{ Number(walletStore.balance).toLocaleString() }} sats</p>
      </section>

      <p v-if="sendError" class="send-error">{{ sendError }}</p>

      <button
        class="send-button"
        type="button"
        :class="{ enabled: canSend }"
        :disabled="!canSend"
        @click="handleSend"
      >
        {{ sending ? 'Sending...' : 'Send' }}
      </button>
    </main>

    <PaymentSuccessOverlay
      :visible="sentAmount !== null"
      kind="sent"
      :amount="sentAmount"
      @back="handleSuccessBack"
    />
  </div>
</template>

<style scoped>
.send-view {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: #0a0a0a;
  color: #fff;
  font-family: 'Inter', var(--font-sans);
}

.send-header {
  height: 71px;
  border-bottom: 1px solid #1a1a1a;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px 1px;
}

.back-button {
  width: 28px;
  height: 28px;
  border: 0;
  padding: 4px;
  background: transparent;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.header-title {
  margin: 0;
  font-size: 20px;
  line-height: 30px;
  font-weight: 500;
  color: #fff;
}

.send-content {
  width: 342px;
  max-width: calc(100vw - 48px);
  margin: 32px auto 0;
}

.field-group {
  display: flex;
  flex-direction: column;
}

.amount-group {
  margin-top: 24px;
}

.field-label {
  font-size: 13px;
  line-height: 19.5px;
  font-weight: 500;
  letter-spacing: 0.65px;
  text-transform: uppercase;
  color: #888;
}

.text-input {
  width: 100%;
  height: 58px;
  margin-top: 8px;
  border: 1px solid #1a1a1a;
  border-radius: 10px;
  background: #1a1a1a;
  padding: 0 16px;
  font-family: 'Inter', var(--font-sans);
  font-size: 16px;
  line-height: normal;
  font-weight: 400;
  color: #fff;
}

.text-input::placeholder {
  color: #555;
}

.amount-wrap {
  position: relative;
  margin-top: 8px;
}

.max-button {
  position: absolute;
  right: 12px;
  top: 15px;
  width: 50.5px;
  height: 27.5px;
  border: 0;
  border-radius: 4px;
  background: #2a2a2a;
  color: #00e5ff;
  font-family: 'Inter', var(--font-sans);
  font-size: 13px;
  line-height: 19.5px;
  font-weight: 500;
  cursor: pointer;
}

.available-copy {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 19.5px;
  font-weight: 400;
  color: #888;
}

.send-error {
  margin: 20px 0 0;
  font-size: 13px;
  line-height: 19.5px;
  color: #f87171;
}

.send-button {
  margin-top: 48px;
  width: 100%;
  height: 56px;
  border: 0;
  border-radius: 10px;
  background: #00e5ff;
  opacity: 0.3;
  color: #0a0a0a;
  font-family: 'Inter', var(--font-sans);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  cursor: not-allowed;
}

.send-button.enabled {
  opacity: 1;
  cursor: pointer;
}
</style>
