<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { transitionName } from './router';
import { usePeerStore } from './stores/peer';
import { useChatStore } from './stores/chat';
import { useSettingsStore } from './stores/settings';
import { useThemeStore } from './stores/theme';
import { useSeedStore } from './stores/seed';
import { useWalletStore } from './stores/wallet';
import { initMdk, createKeyPackage, isMdkReady, getGroups } from './services/mdk';
import { entropyToMnemonic } from './lib/seed/derivation';
import { NostrKind } from './types';
import * as nostr from './services/nostr';
import * as logger from './services/logger';
import Button from './components/ui/Button.vue';
import AppSidebar from './components/common/AppSidebar.vue';

const route = useRoute();
const peerStore = usePeerStore();
const chatStore = useChatStore();
const settingsStore = useSettingsStore();
const seedStore = useSeedStore();
const walletStore = useWalletStore();
useThemeStore();
const isInitializing = ref(true);
const initError = ref<string | null>(null);
const vaultPassphrase = ref('');
const vaultPassphraseConfirm = ref('');
const unlockError = ref<string | null>(null);
const isUnlockingVault = ref(false);
let unsubscribeIncomingWelcomes: (() => void) | null = null;

function retryInit(): void {
  window.location.reload();
}

function handleVisibilityChange(): void {
  if (document.visibilityState !== 'visible') return;
  startIncomingWelcomeSubscription();
  publishOwnKeyPackage();
}

function stopIncomingWelcomeSubscription(): void {
  if (unsubscribeIncomingWelcomes) {
    unsubscribeIncomingWelcomes();
    unsubscribeIncomingWelcomes = null;
  }
}


async function publishOwnKeyPackage(): Promise<void> {
  if (!isMdkReady() || !settingsStore.isVaultUnlocked) {
    logger.debug('app', 'Skipping key package publish', {
      mdkReady: isMdkReady(),
      vaultUnlocked: settingsStore.isVaultUnlocked,
    });
    return;
  }
  const pubkey = settingsStore.pubkeyHex;
  const relayList = settingsStore.relays;
  if (!pubkey || relayList.length === 0) {
    return;
  }

  try {
    const keyPackage = await createKeyPackage(pubkey, relayList);
    const [mlsContent, mlsTags] = JSON.parse(keyPackage.event_json) as [string, string[][]];
    const unsigned = {
      pubkey,
      kind: NostrKind.KeyPackage,
      tags: mlsTags.map((t) => t.map(String)),
      content: mlsContent,
      created_at: Math.floor(Date.now() / 1000),
    };
    const signed = await nostr.signEvent(unsigned);
    await nostr.publishEvent(signed);
    logger.debug('app', 'Published own key package to relays');
  } catch (error) {
    logger.warn('app', 'Failed to publish key package', {
      error: (error as Error).message,
    });
  }
}

function startIncomingWelcomeSubscription(): void {
  if (!settingsStore.isLocalKeyMode || !settingsStore.isVaultUnlocked) {
    stopIncomingWelcomeSubscription();
    return;
  }
  if (unsubscribeIncomingWelcomes) {
    return;
  }

  unsubscribeIncomingWelcomes = peerStore.subscribeToIncomingWelcomes(
    (welcome) => {
      logger.debug('app', 'Incoming welcome accepted', {
        groupId: welcome.group_id,
        inviter: welcome.inviter,
      });
      chatStore.addGroup({
        id: welcome.group_id,
        name: 'Chat Request',
        epoch: 0,
        members: [settingsStore.pubkeyHex!, welcome.inviter],
        unreadCount: 1,
      });
      chatStore.markNeedsNaming(welcome.group_id);
    },
    (error, event) => {
      logger.warn('app', 'Failed processing incoming welcome envelope', {
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  );
}

async function initializeWallet(passphrase?: string): Promise<void> {
  if (walletStore.isInitialized) return;

  const isDerivedKeyUser = settingsStore.authMethod === 'passkey' || settingsStore.authMethod === 'password';

  try {
    if (isDerivedKeyUser && settingsStore.walletSeed) {
      const mnemonic = entropyToMnemonic(settingsStore.walletSeed);
      await walletStore.initialize(mnemonic);
      return;
    }

    await seedStore.initialize();

    if (seedStore.hasSeed && passphrase) {
      await seedStore.unlock(passphrase);
      const mnemonic = seedStore.getMnemonic();
      await walletStore.initialize(mnemonic);
    } else if (passphrase) {
      const mnemonic = await seedStore.create(passphrase);
      await walletStore.initialize(mnemonic);
    }
  } catch (error) {
    logger.warn('app', 'Wallet initialization failed, continuing without wallet', {
      error: (error as Error).message,
    });
  }
}

async function unlockVaultOnStartup(): Promise<void> {
  const isPasskeyAuth = settingsStore.authMethod === 'passkey';

  if (!isPasskeyAuth && !vaultPassphrase.value) {
    unlockError.value = 'Passphrase is required';
    return;
  }

  if (settingsStore.requiresLegacyMigration && vaultPassphrase.value !== vaultPassphraseConfirm.value) {
    unlockError.value = 'Passphrases do not match';
    return;
  }

  unlockError.value = null;
  isUnlockingVault.value = true;

  try {
    const passphrase = vaultPassphrase.value || undefined;

    if (settingsStore.requiresLegacyMigration && passphrase) {
      await settingsStore.migrateLegacyPrivateKey(passphrase);
    } else {
      await settingsStore.unlockVault(passphrase);
    }

    await chatStore.loadGroupsFromStorage();
    await initializeWallet(passphrase);

    vaultPassphrase.value = '';
    vaultPassphraseConfirm.value = '';
    startIncomingWelcomeSubscription();
    publishOwnKeyPackage();
  } catch (error) {
    unlockError.value = error instanceof Error ? error.message : 'Failed to unlock private key';
  } finally {
    isUnlockingVault.value = false;
  }
}

onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisibilityChange);

  try {
    await initMdk();

    try {
      const groups = getGroups();
      if (groups.length > 0) {
        await peerStore.restoreFromMdkState(groups);
      } else {
        await peerStore.restoreGroupStates();
      }
    } catch (error) {
      logger.warn('app', 'Failed to hydrate group state from MDK', {
        error: (error as Error).message,
      });
    }

    if (!settingsStore.requiresVaultUnlock) {
      await chatStore.loadGroupsFromStorage();
    }

    await initializeWallet();

    isInitializing.value = false;
  } catch (error) {
    initError.value = error instanceof Error ? error.message : 'Failed to initialize';
    isInitializing.value = false;
  }
});

watch(
  () => [settingsStore.isLocalKeyMode, settingsStore.isVaultUnlocked] as const,
  () => {
    startIncomingWelcomeSubscription();
    publishOwnKeyPackage();
  },
  { immediate: true }
);

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  stopIncomingWelcomeSubscription();
});
</script>

<template>
  <div class="app">
    <div v-if="isInitializing" class="loading-screen">
      <div class="spinner"></div>
      <p class="loading-text">Initializing MDK...</p>
    </div>
    <div v-else-if="initError" class="error-screen">
      <div class="error-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </div>
      <p class="error-text">{{ initError }}</p>
      <Button variant="primary" size="sm" @click="retryInit">Retry</Button>
    </div>
    <div v-else-if="settingsStore.requiresVaultUnlock" class="unlock-screen">
      <div class="unlock-card">
        <template v-if="settingsStore.authMethod === 'passkey'">
          <h2 class="unlock-title">Unlock MDK PWA</h2>
          <p class="unlock-copy">Authenticate with your passkey to continue.</p>
          <p v-if="unlockError" class="unlock-error">{{ unlockError }}</p>
          <button
            class="unlock-action"
            type="button"
            :disabled="isUnlockingVault"
            @click="unlockVaultOnStartup"
          >
            {{ isUnlockingVault ? 'Unlocking...' : 'Unlock with Passkey' }}
          </button>
        </template>
        <template v-else-if="settingsStore.authMethod === 'password'">
          <h2 class="unlock-title">Unlock MDK PWA</h2>
          <p class="unlock-copy">Enter your password to continue.</p>
          <input
            v-model="vaultPassphrase"
            type="password"
            class="unlock-input"
            placeholder="Password"
            @keyup.enter="unlockVaultOnStartup"
          />
          <p v-if="unlockError" class="unlock-error">{{ unlockError }}</p>
          <button
            class="unlock-action"
            type="button"
            :disabled="isUnlockingVault"
            @click="unlockVaultOnStartup"
          >
            {{ isUnlockingVault ? 'Unlocking...' : 'Unlock' }}
          </button>
        </template>
        <template v-else>
          <h2 class="unlock-title">
            {{ settingsStore.requiresLegacyMigration ? 'Secure Local Key' : 'Unlock Private Key' }}
          </h2>
          <p class="unlock-copy">
            {{ settingsStore.requiresLegacyMigration
              ? 'Create a passphrase to encrypt your existing local private key.'
              : 'Enter your passphrase to unlock your local private key for this session.' }}
          </p>
          <input
            v-model="vaultPassphrase"
            type="password"
            class="unlock-input"
            :placeholder="settingsStore.requiresLegacyMigration ? 'New passphrase' : 'Passphrase'"
            @keyup.enter="unlockVaultOnStartup"
          />
          <input
            v-if="settingsStore.requiresLegacyMigration"
            v-model="vaultPassphraseConfirm"
            type="password"
            class="unlock-input"
            placeholder="Confirm passphrase"
            @keyup.enter="unlockVaultOnStartup"
          />
          <p v-if="unlockError" class="unlock-error">{{ unlockError }}</p>
          <button
            class="unlock-action"
            type="button"
            :disabled="isUnlockingVault"
            @click="unlockVaultOnStartup"
          >
            {{ isUnlockingVault
              ? (settingsStore.requiresLegacyMigration ? 'Migrating...' : 'Unlocking...')
              : (settingsStore.requiresLegacyMigration ? 'Migrate & Unlock' : 'Unlock') }}
          </button>
        </template>
      </div>
    </div>
    <div v-else class="route-container">
      <router-view v-slot="{ Component }">
        <Transition :name="transitionName">
          <component :is="Component" :key="route.path" />
        </Transition>
      </router-view>
    </div>
    <AppSidebar v-if="!isInitializing && !initError && !settingsStore.requiresVaultUnlock" />
  </div>
</template>

<style scoped>
.app {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg-page);
  color: var(--text-primary);
  font-family: var(--font-sans);
  transition: background 0.3s ease, color 0.3s ease;
}

.route-container {
  position: relative;
  overflow-x: hidden;
  min-height: 100vh;
  min-height: 100dvh;
}

.loading-screen,
.error-screen,
.unlock-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 24px;
  background: var(--bg-page);
}

.unlock-screen {
  background: #0a0a0a;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-primary);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary);
}

.error-icon {
  color: var(--accent-error);
  margin-bottom: 16px;
}

.error-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  text-align: center;
}

.unlock-card {
  width: 100%;
  max-width: 360px;
  background: #1a1a1a;
  border: 1px solid #262626;
  border-radius: 14px;
  padding: 28px 24px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 14px;
  text-align: center;
}

.unlock-title {
  font-family: var(--font-sans);
  font-size: 22px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.unlock-copy {
  font-size: 14px;
  color: #888;
  line-height: 1.5;
  margin: 0;
}

.unlock-input {
  width: 100%;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 14px 16px;
  font-family: var(--font-sans);
  font-size: 15px;
  color: #fff;
  outline: none;
  transition: border-color 0.2s ease;
}

.unlock-input:focus {
  border-color: #00e5ff;
}

.unlock-input::placeholder {
  color: #666;
}

.unlock-action {
  width: 100%;
  min-height: 56px;
  border: 0;
  border-radius: 10px;
  background: #00e5ff;
  color: #0a0a0a;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.unlock-action:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.unlock-error {
  margin: 0;
  font-size: 13px;
  color: #f87171;
}
</style>
