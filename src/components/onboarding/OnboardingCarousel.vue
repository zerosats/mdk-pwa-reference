<script setup lang="ts">
import { computed, ref } from 'vue';
import Button from '../ui/Button.vue';

const emit = defineEmits<{
  'get-started': [];
  'import-account': [];
}>();

const currentStep = ref(0);

const slides = [
  {
    title: 'Heads Up',
    text: 'This is an unaudited vibe-coded PWA. Use at your own risk. Your keys, your responsibility.',
    textWidth: 229,
    iconColor: '#f59e0b',
    iconBg: 'rgba(245, 158, 11, 0.15)',
    icon: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>`,
  },
  {
    title: 'E2E Encrypted',
    text: 'All messages are end-to-end encrypted using the MLS protocol. Nobody can read your chats but you.',
    textWidth: 245,
    iconColor: '#3b82f6',
    iconBg: 'rgba(59, 130, 246, 0.15)',
    icon: `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>`,
  },
  {
    title: 'Decentralized',
    text: 'Messages are relayed through the Nostr network. No central servers, no data collection.',
    textWidth: 245,
    iconColor: '#3b82f6',
    iconBg: 'rgba(59, 130, 246, 0.15)',
    icon: `<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>`,
  },
  {
    title: 'Bitcoin Payments',
    text: 'Send Lightning and Cashu payments directly in chat. AI agents can send and receive payments too.',
    textWidth: 260,
    iconColor: '#f59e0b',
    iconBg: 'rgba(245, 158, 11, 0.15)',
    icon: `<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>`,
  },
  {
    title: 'Ready to Go',
    text: 'Create your identity to start chatting with AI agents securely.',
    textWidth: 240,
    iconColor: '#22c55e',
    iconBg: 'rgba(34, 197, 94, 0.15)',
    icon: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>`,
  },
] as const;

const isLastStep = computed(() => currentStep.value === slides.length - 1);

function goTo(index: number): void {
  currentStep.value = index;
}

function next(): void {
  if (currentStep.value < slides.length - 1) {
    goTo(currentStep.value + 1);
  }
}

function skip(): void {
  goTo(slides.length - 1);
}

let touchStartX = 0;

function onTouchStart(e: TouchEvent): void {
  touchStartX = e.touches[0].clientX;
}

function onTouchEnd(e: TouchEvent): void {
  const diff = touchStartX - e.changedTouches[0].clientX;
  if (Math.abs(diff) < 50) return;

  if (diff > 0 && currentStep.value < slides.length - 1) {
    next();
  } else if (diff < 0 && currentStep.value > 0) {
    goTo(currentStep.value - 1);
  }
}
</script>

<template>
  <div
    class="carousel"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
  >
    <div class="top-row">
      <button
        v-if="!isLastStep"
        class="skip-link"
        type="button"
        @click="skip"
      >
        Skip
      </button>
      <div v-else class="skip-spacer" aria-hidden="true" />
    </div>

    <div class="carousel-content">
      <div class="slide-stack">
        <div
          class="icon-box"
          :style="{ background: slides[currentStep].iconBg }"
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            :style="{ color: slides[currentStep].iconColor }"
            v-html="slides[currentStep].icon"
          />
        </div>
        <h2 class="carousel-title">{{ slides[currentStep].title }}</h2>
        <p class="carousel-text" :style="{ width: `${slides[currentStep].textWidth}px` }">{{ slides[currentStep].text }}</p>
      </div>
    </div>

    <div class="carousel-footer">
      <div class="dots">
        <button
          v-for="(_, i) in slides"
          :key="i"
          class="dot"
          :class="{ active: i === currentStep }"
          type="button"
          @click="goTo(i)"
        />
      </div>

      <template v-if="isLastStep">
        <Button variant="primary" size="lg" @click="emit('get-started')">
          Get Started
        </Button>
        <Button variant="primary" size="lg" @click="emit('import-account')">
          I Have an Account
        </Button>
      </template>
      <button v-else class="next-btn" type="button" @click="next">
        Next
      </button>
    </div>
  </div>
</template>

<style scoped>
.carousel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 24px;
  background: #0a0a0a;
}

.top-row {
  height: 56px;
  padding-top: 24px;
  display: flex;
  justify-content: flex-end;
}

.skip-link {
  width: 29px;
  height: 32px;
  font-size: 14px;
  line-height: 21px;
  font-weight: 500;
  color: #555;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  padding: 5.5px 0;
}

.skip-spacer {
  width: 29px;
  height: 32px;
}

.carousel-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.slide-stack {
  width: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.icon-box {
  width: 120px;
  height: 120px;
  border-radius: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.carousel-title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 24px;
  line-height: 36px;
  font-weight: 700;
  color: #fff;
  text-align: center;
}

.carousel-text {
  margin: 0;
  max-width: 100%;
  font-size: 15px;
  line-height: 24.375px;
  font-weight: 400;
  color: #888;
  text-align: center;
}

.carousel-footer {
  padding-bottom: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dots {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 8px;
  height: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #1a1a1a;
  border: none;
  padding: 0;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dot.active {
  width: 24px;
  background: #fff;
}

.next-btn {
  width: 100%;
  height: 60px;
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

.next-btn:active {
  opacity: 0.95;
}
</style>
