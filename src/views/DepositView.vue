<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import QRCode from 'qrcode';
import { useWalletStore } from '../stores/wallet';
import PaymentSuccessOverlay from '../components/wallet/PaymentSuccessOverlay.vue';

type AddressSection = 'ark' | 'btc';

const router = useRouter();
const walletStore = useWalletStore();

const btcAddress = computed(() => walletStore.boardingAddress || '');
const walletAddress = computed(() => walletStore.address || '');
const qrValue = computed(() => walletAddress.value);
const expandedSection = ref<AddressSection | null>('ark');
const copiedSection = ref<AddressSection | null>(null);
const receivedAmount = ref<number | null>(null);
let copiedTimer: number | null = null;
let historyPollTimer: ReturnType<typeof setInterval> | null = null;
let openedAtMs = Date.now();

const canvasRef = ref<HTMLCanvasElement | null>(null);

function goBack(): void {
  router.push('/wallet');
}

function normalizeTimestamp(createdAt: number): number {
  if (!Number.isFinite(createdAt)) return Date.now();
  return createdAt > 1_000_000_000_000 ? createdAt : createdAt * 1000;
}

function stopReceiveWatcher(): void {
  if (historyPollTimer) {
    clearInterval(historyPollTimer);
    historyPollTimer = null;
  }
}

async function checkForIncomingPayment(): Promise<void> {
  if (!walletStore.isInitialized || receivedAmount.value !== null) return;

  try {
    const history = await walletStore.getTransactionHistory();
    const receivedTx = history.find((tx) => (
      tx.type === 'RECEIVED'
      && tx.settled
      && Math.abs(tx.amount || 0) > 0
      && normalizeTimestamp(tx.createdAt) >= openedAtMs
    ));

    if (!receivedTx) return;
    receivedAmount.value = Math.abs(receivedTx.amount || 0);
    stopReceiveWatcher();
    await walletStore.updateBalance();
  } catch {
    // keep polling for incoming payments
  }
}

function startReceiveWatcher(): void {
  stopReceiveWatcher();
  historyPollTimer = setInterval(() => {
    checkForIncomingPayment().catch(() => {});
  }, 4000);
}

async function renderQR(): Promise<void> {
  if (!canvasRef.value || !qrValue.value) return;

  await QRCode.toCanvas(canvasRef.value, qrValue.value, {
    width: 192,
    margin: 0,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

watch(qrValue, () => {
  renderQR().catch(() => {});
});

onMounted(async () => {
  openedAtMs = Date.now();

  if (walletStore.isInitialized) {
    if (!walletStore.boardingAddress) {
      walletStore.getBitcoinDepositAddress().catch(() => {});
    }

    if (!walletStore.address) {
      walletStore.updateAddress().catch(() => {});
    }
  }

  await nextTick();
  await renderQR();
  await checkForIncomingPayment();
  startReceiveWatcher();
});

async function copyValue(value: string): Promise<void> {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // clipboard may be unavailable in some environments
  }
}

async function share(): Promise<void> {
  if (!qrValue.value) return;

  if (navigator.share) {
    try {
      await navigator.share({ text: qrValue.value });
      return;
    } catch {
      // fall back to clipboard copy
    }
  }

  await copyValue(qrValue.value);
}

function toggleAddressSection(section: AddressSection): void {
  expandedSection.value = expandedSection.value === section ? null : section;
}

async function copyAddress(section: AddressSection, value: string): Promise<void> {
  if (!value) return;
  await copyValue(value);
  copiedSection.value = section;
  if (copiedTimer !== null) {
    window.clearTimeout(copiedTimer);
  }
  copiedTimer = window.setTimeout(() => {
    copiedSection.value = null;
    copiedTimer = null;
  }, 1400);
}

onUnmounted(() => {
  stopReceiveWatcher();
  if (copiedTimer !== null) {
    window.clearTimeout(copiedTimer);
    copiedTimer = null;
  }
});

function handleSuccessBack(): void {
  receivedAmount.value = null;
  router.push('/settings');
}
</script>

<template>
  <div class="receive-view" data-node-id="1:966">
    <header class="receive-header" data-node-id="1:968">
      <button class="back-button" type="button" aria-label="Go back" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="15" y1="6" x2="9" y2="12" />
          <line x1="9" y1="12" x2="15" y2="18" />
        </svg>
      </button>
      <h1 class="header-title">Receive</h1>
    </header>

    <main class="receive-content" data-node-id="1:975">
      <div class="qr-shell" data-node-id="1:976">
        <div class="qr-inner" data-node-id="1:977">
          <canvas ref="canvasRef" class="qr-canvas" />
          <p v-if="!qrValue" class="qr-loading">Loading...</p>
        </div>
      </div>

      <div class="address-list" data-node-id="1:1000">
        <section class="address-section" :class="{ expanded: expandedSection === 'ark' }">
          <button class="address-row" type="button" @click="toggleAddressSection('ark')">
            <span class="address-label">Ark Wallet Address</span>
            <svg class="chevron-icon" :class="{ open: expandedSection === 'ark' }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <Transition name="dropdown-expand">
            <div v-if="expandedSection === 'ark'" class="address-body">
              <p class="address-value">{{ walletAddress || 'Loading address...' }}</p>
              <button
                class="copy-button"
                type="button"
                :disabled="!walletAddress"
                @click.stop="copyAddress('ark', walletAddress)"
              >
                {{ copiedSection === 'ark' ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </Transition>
        </section>

        <section class="address-section" :class="{ expanded: expandedSection === 'btc' }">
          <button class="address-row" type="button" @click="toggleAddressSection('btc')">
            <span class="address-label">BTC Deposit Address</span>
            <svg class="chevron-icon" :class="{ open: expandedSection === 'btc' }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <Transition name="dropdown-expand">
            <div v-if="expandedSection === 'btc'" class="address-body">
              <p class="address-value">{{ btcAddress || 'Loading address...' }}</p>
              <button
                class="copy-button"
                type="button"
                :disabled="!btcAddress"
                @click.stop="copyAddress('btc', btcAddress)"
              >
                {{ copiedSection === 'btc' ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </Transition>
        </section>
      </div>

      <button class="share-button" type="button" @click="share" data-node-id="1:1022">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.59 13.51L15.42 17.49" />
          <path d="M15.41 6.51L8.59 10.49" />
        </svg>
        <span>Share</span>
      </button>
    </main>

    <PaymentSuccessOverlay
      :visible="receivedAmount !== null"
      kind="received"
      :amount="receivedAmount"
      @back="handleSuccessBack"
    />
  </div>
</template>

<style scoped>
.receive-view {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: #0a0a0a;
  color: #fff;
  font-family: 'Inter', var(--font-sans);
}

.receive-header {
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

.receive-content {
  width: 342px;
  max-width: calc(100vw - 48px);
  margin: 32px auto 0;
}

.qr-shell {
  width: 240px;
  height: 240px;
  margin: 0 auto;
  border-radius: 16px;
  background: #fff;
  padding: 24px;
}

.qr-inner {
  width: 192px;
  height: 192px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr-canvas {
  width: 192px;
  height: 192px;
  display: block;
}

.qr-loading {
  position: absolute;
  margin: 0;
  font-size: 13px;
  line-height: 19.5px;
  color: #555;
}

.address-list {
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.address-section {
  width: 100%;
  border: 1px solid #1a1a1a;
  border-radius: 10px;
  overflow: hidden;
  background: transparent;
}

.address-section.expanded {
  background: #111;
}

.address-row {
  width: 100%;
  height: 56.5px;
  border: 0;
  background: transparent;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  cursor: pointer;
  transition: background 0.16s ease;
}

.address-row:hover {
  background: #141414;
}

.address-label {
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 500;
  color: #fff;
}

.chevron-icon {
  color: #888;
  transition: transform 0.2s ease;
}

.chevron-icon.open {
  transform: rotate(180deg);
}

.address-body {
  border-top: 1px solid #1a1a1a;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.address-value {
  margin: 0;
  flex: 1;
  font-size: 13px;
  line-height: 19.5px;
  color: #b8b8b8;
  word-break: break-all;
  text-align: left;
}

.copy-button {
  flex-shrink: 0;
  height: 31px;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  background: #141414;
  color: #00e5ff;
  font-family: 'Inter', var(--font-sans);
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  padding: 0 12px;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.copy-button:hover:not(:disabled) {
  background: #1a1a1a;
  border-color: #3a3a3a;
}

.copy-button:disabled {
  color: #666;
  border-color: #252525;
  cursor: not-allowed;
}

.dropdown-expand-enter-active,
.dropdown-expand-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
  transform-origin: top;
}

.dropdown-expand-enter-from,
.dropdown-expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.share-button {
  margin-top: 32px;
  width: 100%;
  height: 56px;
  border: 0;
  border-radius: 10px;
  background: #00e5ff;
  color: #0a0a0a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: 'Inter', var(--font-sans);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  cursor: pointer;
}
</style>
