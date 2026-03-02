<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import QRCode from 'qrcode';
import { useSettingsStore } from '../stores/settings';

const router = useRouter();
const settingsStore = useSettingsStore();

const qrCanvasRef = ref<HTMLCanvasElement | null>(null);

onMounted(async () => {
  await renderQr();
});

async function renderQr(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  if (!qrCanvasRef.value || !settingsStore.pubkeyNpub) return;

  await QRCode.toCanvas(qrCanvasRef.value, settingsStore.pubkeyNpub, {
    width: 224,
    margin: 0,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
}

async function copyNpub(): Promise<void> {
  if (!settingsStore.pubkeyNpub) return;
  await navigator.clipboard.writeText(settingsStore.pubkeyNpub);
}

async function shareCard(): Promise<void> {
  if (!settingsStore.pubkeyNpub) return;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'My MDK PWA Card',
        text: settingsStore.pubkeyNpub,
      });
      return;
    } catch {
      // fall back to clipboard
    }
  }

  await copyNpub();
}

function goBack(): void {
  router.push('/chats');
}
</script>

<template>
  <div class="my-card-view" data-node-id="1:690">
    <header class="my-card-header" data-node-id="1:692">
      <button class="back-btn" aria-label="Back" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="15" y1="6" x2="9" y2="12" />
          <line x1="9" y1="12" x2="15" y2="18" />
        </svg>
      </button>
      <h1 class="header-title">My Card</h1>
    </header>

    <main class="my-card-content">
      <div class="qr-shell" data-node-id="1:700">
        <canvas ref="qrCanvasRef" class="qr-canvas" />
      </div>

      <div class="npub-row" data-node-id="1:730">
        <p class="npub-text">{{ settingsStore.pubkeyNpub }}</p>
        <button class="copy-btn" aria-label="Copy public key" @click="copyNpub">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>

      <p class="share-hint">Share this so others can message you</p>

      <button class="share-btn" data-node-id="1:740" @click="shareCard">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.59 13.51L15.42 17.49" />
          <path d="M15.41 6.51L8.59 10.49" />
        </svg>
        <span>Share Card</span>
      </button>
    </main>
  </div>
</template>

<style scoped>
.my-card-view {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: #0a0a0a;
  color: #fff;
  font-family: var(--font-sans);
}

.my-card-header {
  height: 71px;
  border-bottom: 1px solid #1a1a1a;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px 1px;
}

.back-btn {
  width: 28px;
  height: 28px;
  border: 0;
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
}

.my-card-content {
  width: 342px;
  max-width: calc(100vw - 48px);
  margin: 48px auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-shell {
  width: 272px;
  height: 272px;
  padding: 24px;
  border-radius: 16px;
  background: #fff;
}

.qr-canvas {
  width: 224px;
  height: 224px;
  display: block;
}

.npub-row {
  margin-top: 32px;
  width: 100%;
  min-height: 71px;
  border-radius: 10px;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  gap: 10px;
}

.npub-text {
  margin: 0;
  color: #888;
  font-family: 'Menlo', var(--font-mono);
  font-size: 13px;
  line-height: 19.5px;
  word-break: break-all;
}

.copy-btn {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #888;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.share-hint {
  margin: 16px 0 0;
  color: #888;
  font-size: 15px;
  line-height: 22.5px;
  text-align: center;
}

.share-btn {
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
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  cursor: pointer;
}
</style>
