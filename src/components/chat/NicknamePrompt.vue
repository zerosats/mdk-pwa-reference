<script setup lang="ts">
import { ref, onMounted } from 'vue';

const emit = defineEmits<{
  submit: [name: string];
}>();

const nickname = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  inputRef.value?.focus();
});

function handleSave() {
  const trimmed = nickname.value.trim();
  if (trimmed) {
    emit('submit', trimmed);
  }
}

function handleSkip() {
  emit('submit', 'Chat');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && nickname.value.trim()) {
    handleSave();
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="nickname-overlay">
      <div class="nickname-card">
        <h3 class="nickname-title">Name this contact</h3>
        <input
          ref="inputRef"
          v-model="nickname"
          type="text"
          class="nickname-input"
          placeholder="Enter a name..."
          maxlength="50"
          @keydown="handleKeydown"
        />
        <div class="nickname-actions">
          <button class="btn-skip" @click="handleSkip">Skip</button>
          <button
            class="btn-save"
            :disabled="!nickname.trim()"
            @click="handleSave"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.nickname-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.nickname-card {
  width: 100%;
  max-width: 360px;
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: var(--shadow-md);
}

.nickname-title {
  font-family: var(--font-sans);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  margin: 0;
}

.nickname-input {
  width: 100%;
  padding: 12px 16px;
  font-family: var(--font-sans);
  font-size: 16px;
  color: var(--text-primary);
  background: var(--bg-card-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  outline: none;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
}

.nickname-input:focus {
  border-color: var(--accent-primary);
}

.nickname-input::placeholder {
  color: var(--text-muted);
}

.nickname-actions {
  display: flex;
  gap: 12px;
}

.btn-skip {
  flex: 1;
  padding: 12px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-card-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-skip:hover {
  background: var(--border-primary);
  color: var(--text-primary);
}

.btn-save {
  flex: 1;
  padding: 12px;
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-on-accent, #fff);
  background: var(--accent-primary);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-save:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
