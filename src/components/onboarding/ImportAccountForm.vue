<script setup lang="ts">
import { ref, computed } from 'vue';
import { validateMnemonic } from '../../lib/seed/derivation';

const props = defineProps<{
  error?: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  submit: [mnemonic: string];
}>();

const mnemonicInput = ref('');
const localError = ref<string | null>(null);

const displayError = computed(() => props.error || localError.value);

function validate(): boolean {
  const phrase = mnemonicInput.value.trim();
  if (!phrase) {
    localError.value = 'Recovery phrase is required';
    return false;
  }
  if (!validateMnemonic(phrase)) {
    localError.value = 'Invalid recovery phrase';
    return false;
  }
  localError.value = null;
  return true;
}

function handleSubmit(): void {
  if (!validate()) return;
  emit('submit', mnemonicInput.value.trim());
}
</script>

<template>
  <div class="restore-form-screen" data-node-id="1:143">
    <div class="restore-form-card" data-node-id="1:144">
      <button class="back-btn" type="button" data-node-id="1:145" @click="emit('back')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>Back</span>
      </button>

      <h2 class="form-title" data-node-id="1:149">Restore Your Account</h2>
      <p class="form-copy" data-node-id="1:151">
        Enter your 24-word recovery phrase to restore your identity and wallet.
      </p>

      <textarea
        v-model="mnemonicInput"
        class="form-textarea"
        data-node-id="1:153"
        placeholder="Enter your recovery phrase..."
        rows="3"
        :disabled="loading"
      />

      <p v-if="displayError" class="form-error">{{ displayError }}</p>

      <button
        class="primary-action"
        type="button"
        data-node-id="1:155"
        :disabled="loading"
        @click="handleSubmit"
      >
        {{ loading ? 'Restoring...' : 'Restore Account' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.restore-form-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #0a0a0a;
}

.restore-form-card {
  width: min(342px, 100%);
  min-height: 375.5px;
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

.form-textarea {
  width: 100%;
  height: 89px;
  background: #2a2a2a;
  border: 1px solid #1a1a1a;
  border-radius: 8px;
  padding: 12px 16px;
  font-family: 'Menlo', var(--font-mono);
  font-size: 14px;
  line-height: 21px;
  color: #fff;
  outline: none;
  resize: none;
  margin-bottom: 16px;
}

.form-textarea::placeholder {
  color: #555;
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

.form-error {
  margin: 0 0 12px;
  width: 100%;
  font-size: 13px;
  line-height: 1.5;
  color: #f87171;
  text-align: center;
}
</style>
