<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  block?: boolean
}>()
</script>

<template>
  <button
    class="btn"
    :class="[
      `btn-${variant || 'primary'}`,
      `btn-${size || 'md'}`,
      { 'btn-block': block !== false },
    ]"
    :disabled="disabled || loading"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  font-family: var(--font-sans);
  font-weight: 600;
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-block {
  width: 100%;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm { padding: 10px 16px; font-size: 14px; }
.btn-md { padding: 16px 24px; font-size: 15px; }
.btn-lg { padding: 18px 24px; font-size: 16px; }

.btn-primary {
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-secondary {
  background: var(--button-secondary-bg);
  color: var(--button-secondary-text);
}

.btn-secondary:hover:not(:disabled) {
  opacity: 0.8;
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--bg-card-secondary);
  color: var(--text-primary);
}

.btn-danger {
  background: transparent;
  color: var(--accent-error);
  border: 1px solid var(--accent-error);
}

.btn-danger:hover:not(:disabled) {
  background: var(--accent-error);
  color: #fff;
}
</style>
