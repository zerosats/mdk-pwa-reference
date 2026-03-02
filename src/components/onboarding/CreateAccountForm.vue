<script setup lang="ts">
import { ref, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings';

const settingsStore = useSettingsStore();

const props = defineProps<{
  error?: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  submitPasskey: [];
  submitPassword: [password: string];
}>();

const showPasswordFallback = ref(false);
const password = ref('');
const confirmPassword = ref('');
const localError = ref<string | null>(null);

const displayError = computed(() => props.error || localError.value);

function validatePassword(): boolean {
  if (!password.value) {
    localError.value = 'Password is required';
    return false;
  }
  if (password.value.length < 8) {
    localError.value = 'Password must be at least 8 characters';
    return false;
  }
  if (password.value !== confirmPassword.value) {
    localError.value = 'Passwords do not match';
    return false;
  }
  localError.value = null;
  return true;
}

function handlePasskey(): void {
  localError.value = null;
  emit('submitPasskey');
}

function handlePassword(): void {
  if (!validatePassword()) return;
  emit('submitPassword', password.value);
}
</script>

<template>
  <div class="create-form-screen" data-node-id="1:160">
    <div class="create-form-card" data-node-id="1:161">
      <button class="back-btn" type="button" data-node-id="1:162" @click="emit('back')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>Back</span>
      </button>

      <template v-if="settingsStore.passkeySupported && !showPasswordFallback">
        <h2 class="form-title" data-node-id="1:166">Create Your Identity</h2>
        <p class="form-copy" data-node-id="1:168">
          Use biometrics to secure your identity. One tap, no passwords.
        </p>

        <button
          class="primary-action"
          type="button"
          data-node-id="1:170"
          :disabled="loading"
          @click="handlePasskey"
        >
          {{ loading ? 'Creating...' : 'Create with Passkey' }}
        </button>

        <button
          class="fallback-link"
          type="button"
          data-node-id="1:172"
          :disabled="loading"
          @click="showPasswordFallback = true"
        >
          Use a password instead
        </button>

        <p v-if="displayError" class="form-error">{{ displayError }}</p>
      </template>

      <template v-else>
        <h2 class="form-title">Create With Password</h2>
        <p class="form-copy">Choose a password to encrypt your identity and wallet keys.</p>
        <p v-if="settingsStore.passkeyUnsupportedReason" class="form-warning">
          {{ settingsStore.passkeyUnsupportedReason }}
        </p>

        <input
          v-model="password"
          type="password"
          class="form-input"
          placeholder="Password (min 8 characters)"
          :disabled="loading"
          @keyup.enter="handlePassword"
        />
        <input
          v-model="confirmPassword"
          type="password"
          class="form-input"
          placeholder="Confirm password"
          :disabled="loading"
          @keyup.enter="handlePassword"
        />

        <button
          class="primary-action"
          type="button"
          :disabled="loading"
          @click="handlePassword"
        >
          {{ loading ? 'Creating...' : 'Create Account' }}
        </button>

        <button
          v-if="settingsStore.passkeySupported"
          class="fallback-link"
          type="button"
          :disabled="loading"
          @click="showPasswordFallback = false"
        >
          Use passkey instead
        </button>

        <p v-if="displayError" class="form-error">{{ displayError }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.create-form-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #0a0a0a;
}

.create-form-card {
  width: min(342px, 100%);
  min-height: 304.5px;
  background: #1a1a1a;
  border-radius: 14px;
  box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.back-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  color: #888;
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 21px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  margin-bottom: 16px;
}

.back-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.form-title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 20px;
  font-weight: 600;
  line-height: 30px;
  color: #fff;
  text-align: center;
  margin-bottom: 16px;
}

.form-copy {
  margin: 0;
  width: 258px;
  max-width: 100%;
  font-family: var(--font-sans);
  font-size: 14px;
  color: #888;
  line-height: 22.75px;
  text-align: center;
  margin-bottom: 16px;
}

.primary-action {
  width: 100%;
  height: 56px;
  border: none;
  border-radius: 14px;
  background: #00e5ff;
  color: #0a0a0a;
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  cursor: pointer;
}

.primary-action:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.fallback-link {
  margin-top: 20px;
  background: none;
  border: none;
  color: #555;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 19.5px;
  font-weight: 500;
  cursor: pointer;
  text-decoration: underline;
  text-align: center;
  padding: 0;
}

.fallback-link:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.form-warning {
  width: 100%;
  margin: 0 0 12px;
  border-radius: 8px;
  padding: 12px;
  background: #2a2a2a;
  color: #888;
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}

.form-input {
  width: 100%;
  height: 56px;
  background: #2a2a2a;
  border: 1px solid #1a1a1a;
  border-radius: 8px;
  padding: 14px 16px;
  font-family: var(--font-sans);
  font-size: 14px;
  color: #fff;
  outline: none;
  margin-bottom: 12px;
}

.form-input::placeholder {
  color: #555;
}

.form-error {
  margin: 12px 0 0;
  width: 100%;
  font-size: 13px;
  line-height: 1.5;
  color: #f87171;
  text-align: center;
}
</style>
