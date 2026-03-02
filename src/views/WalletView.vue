<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useWalletStore } from '../stores/wallet';
import { useSidebarStore } from '../stores/sidebar';
import type { ArkTransaction } from '@arkade-os/sdk';

const router = useRouter();
const walletStore = useWalletStore();
const sidebarStore = useSidebarStore();

const totalBalance = computed(() => Number(walletStore.balance));
const hasWallet = computed(() => walletStore.isInitialized);

type ActivityRow = {
  id: string;
  direction: 'sent' | 'received';
  amount: number;
  timestampMs: number;
  settled: boolean;
};

const activities = ref<ActivityRow[]>([]);
const activityError = ref('');
const isRefreshing = ref(false);

let pollInterval: ReturnType<typeof setInterval> | null = null;

function normalizeTimestamp(createdAt: number): number {
  if (!Number.isFinite(createdAt)) return Date.now();
  return createdAt > 1_000_000_000_000 ? createdAt : createdAt * 1000;
}

function formatTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const now = Date.now();
  const diffMinutes = Math.max(0, Math.floor((now - timestampMs) / 60000));

  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toActivityRow(tx: ArkTransaction, index: number): ActivityRow {
  return {
    id: [
      tx.key?.arkTxid ?? '',
      tx.key?.commitmentTxid ?? '',
      tx.key?.boardingTxid ?? '',
      String(index),
    ].join(':'),
    direction: tx.type === 'SENT' ? 'sent' : 'received',
    amount: Math.abs(tx.amount || 0),
    timestampMs: normalizeTimestamp(tx.createdAt),
    settled: tx.settled,
  };
}

async function refreshWalletData(): Promise<void> {
  if (!walletStore.isInitialized) {
    activities.value = [];
    return;
  }

  isRefreshing.value = true;
  activityError.value = '';

  try {
    await walletStore.updateBalance();
    const history = await walletStore.getTransactionHistory();
    activities.value = history.slice(0, 8).map(toActivityRow);
  } catch (error) {
    activityError.value = error instanceof Error ? error.message : 'Failed to load wallet activity';
  } finally {
    isRefreshing.value = false;
  }
}

onMounted(async () => {
  if (walletStore.isInitialized) {
    walletStore.checkAndAutoOnboard().catch(() => {});
  }

  await refreshWalletData();

  pollInterval = setInterval(() => {
    refreshWalletData().catch(() => {});
  }, 15000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});

function goToDeposit(): void {
  router.push('/wallet/deposit');
}

function goToWithdraw(): void {
  router.push('/wallet/withdraw');
}
</script>

<template>
  <div class="wallet-view" data-node-id="1:903">
    <header class="wallet-header" data-node-id="1:906">
      <button class="menu-button" type="button" aria-label="Open menu" @click="sidebarStore.toggle()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="5" y1="7" x2="19" y2="7" />
          <line x1="5" y1="12" x2="19" y2="12" />
          <line x1="5" y1="17" x2="19" y2="17" />
        </svg>
      </button>
      <h1 class="header-title">Wallet</h1>
    </header>

    <main class="wallet-main">
      <section class="balance-panel" data-node-id="1:909">
        <p class="balance-label">Balance</p>
        <p class="balance-amount">{{ totalBalance.toLocaleString() }} sats</p>

        <div class="action-row" data-node-id="1:914">
          <button class="action-button" type="button" @click="goToWithdraw">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
            <span>Send</span>
          </button>

          <button class="action-button" type="button" @click="goToDeposit">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="17" y1="7" x2="7" y2="17" />
              <polyline points="17 17 7 17 7 7" />
            </svg>
            <span>Receive</span>
          </button>
        </div>
      </section>

      <section class="recent-panel" data-node-id="1:927">
        <h2 class="recent-heading">Recent Activity</h2>

        <p v-if="!hasWallet" class="recent-empty">Wallet not initialized</p>
        <p v-else-if="activityError" class="recent-empty">{{ activityError }}</p>
        <p v-else-if="isRefreshing && activities.length === 0" class="recent-empty">Loading...</p>
        <p v-else-if="activities.length === 0" class="recent-empty">No activity yet</p>

        <div v-else class="activity-list">
          <div v-for="activity in activities" :key="activity.id" class="activity-row">
            <div class="activity-copy">
              <p class="activity-title">{{ activity.direction === 'sent' ? 'Sent' : 'Received' }}</p>
              <p class="activity-subtitle">
                {{ formatTime(activity.timestampMs) }} • {{ activity.settled ? 'Settled' : 'Pending' }}
              </p>
            </div>
            <p class="activity-amount" :class="activity.direction">
              {{ activity.direction === 'sent' ? '-' : '+' }}{{ activity.amount.toLocaleString() }}
            </p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.wallet-view {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: #0a0a0a;
  color: #fff;
  font-family: 'Inter', var(--font-sans);
}

.wallet-header {
  position: relative;
  height: 77px;
  border-bottom: 1px solid #1a1a1a;
  display: flex;
  align-items: center;
  padding: 0 24px 1px 72px;
}

.menu-button {
  position: absolute;
  left: 16px;
  top: 16px;
  width: 40px;
  height: 40px;
  border: 0;
  padding: 8px;
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

.wallet-main {
  width: 342px;
  max-width: calc(100vw - 48px);
  margin: 0 auto;
}

.balance-panel {
  position: relative;
  height: 330px;
}

.balance-label {
  margin: 64px 0 0;
  text-align: center;
  font-size: 13px;
  line-height: 19.5px;
  font-weight: 400;
  color: #888;
}

.balance-amount {
  margin: 8px 0 0;
  text-align: center;
  font-size: 48px;
  line-height: 72px;
  font-weight: 500;
  letter-spacing: -1.2px;
  color: #fff;
}

.action-row {
  margin-top: 48px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.action-button {
  height: 54.5px;
  border: 0;
  border-radius: 14px;
  background: rgba(0, 229, 255, 0.05);
  color: #00e5ff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: 'Inter', var(--font-sans);
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 500;
  cursor: pointer;
}

.recent-panel {
  min-height: 219px;
  border-top: 1px solid #1a1a1a;
  padding-top: 25px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.recent-heading {
  margin: 0;
  font-size: 13px;
  line-height: 19.5px;
  font-weight: 500;
  letter-spacing: 0.65px;
  text-transform: uppercase;
  color: #888;
}

.recent-empty {
  margin: 0;
  text-align: center;
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 400;
  color: #888;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 20px;
}

.activity-row {
  min-height: 56px;
  border-radius: 10px;
  border: 1px solid #1a1a1a;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.activity-copy {
  min-width: 0;
}

.activity-title {
  margin: 0;
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 600;
  color: #fff;
}

.activity-subtitle {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
  color: #888;
}

.activity-amount {
  margin: 0;
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 600;
}

.activity-amount.sent {
  color: #ff8f8f;
}

.activity-amount.received {
  color: #00e5ff;
}
</style>
