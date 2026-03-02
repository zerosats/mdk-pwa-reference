<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSettingsStore } from '../stores/settings';
import { useWalletStore } from '../stores/wallet';
import * as logger from '../services/logger';
import OnboardingCarousel from '../components/onboarding/OnboardingCarousel.vue';
import CreateAccountForm from '../components/onboarding/CreateAccountForm.vue';
import ImportAccountForm from '../components/onboarding/ImportAccountForm.vue';

const router = useRouter();
const settingsStore = useSettingsStore();
const walletStore = useWalletStore();

type Phase = 'carousel' | 'create' | 'import';
const phase = ref<Phase>('carousel');
const formError = ref<string | null>(null);
const isSubmitting = ref(false);

async function initializeWalletAndChatBalance(): Promise<void> {
  if (!settingsStore.walletSeed) {
    return;
  }

  try {
    const { entropyToMnemonic } = await import('../lib/seed/derivation');
    const mnemonic = entropyToMnemonic(settingsStore.walletSeed);
    await walletStore.initialize(mnemonic);
  } catch (error) {
    logger.warn('onboarding', 'Wallet initialization failed after account creation', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreatePasskey(): Promise<void> {
  formError.value = null;
  isSubmitting.value = true;

  try {
    await settingsStore.onboardWithPasskey();
    await router.push('/');
    void initializeWalletAndChatBalance();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account creation failed';
    formError.value = message;
    logger.error('onboarding', 'Create account with passkey failed', { error: message });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleCreatePassword(password: string): Promise<void> {
  formError.value = null;
  isSubmitting.value = true;

  try {
    await settingsStore.onboardWithPassword(password);
    await router.push('/');
    void initializeWalletAndChatBalance();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account creation failed';
    formError.value = message;
    logger.error('onboarding', 'Create account with password failed', { error: message });
  } finally {
    isSubmitting.value = false;
  }
}

async function handleImport(mnemonic: string): Promise<void> {
  formError.value = null;
  isSubmitting.value = true;

  try {
    await settingsStore.restoreFromSeedPhrase(mnemonic);
    await router.push('/');
    void initializeWalletAndChatBalance();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Account import failed';
    formError.value = message;
    logger.error('onboarding', 'Import account failed', { error: message });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="onboarding-view">
    <OnboardingCarousel
      v-if="phase === 'carousel'"
      @get-started="phase = 'create'"
      @import-account="phase = 'import'"
    />
    <CreateAccountForm
      v-else-if="phase === 'create'"
      :error="formError"
      :loading="isSubmitting"
      @back="phase = 'carousel'; formError = null"
      @submit-passkey="handleCreatePasskey"
      @submit-password="handleCreatePassword"
    />
    <ImportAccountForm
      v-else-if="phase === 'import'"
      :error="formError"
      :loading="isSubmitting"
      @back="phase = 'carousel'; formError = null"
      @submit="handleImport"
    />
  </div>
</template>

<style scoped>
.onboarding-view {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #0a0a0a;
  color: #fff;
}
</style>
