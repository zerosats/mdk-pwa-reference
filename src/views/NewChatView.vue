<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import QrScanner from 'qr-scanner';
import { useChatStore } from '../stores/chat';
import { usePeerStore } from '../stores/peer';
import { useSettingsStore } from '../stores/settings';
import * as logger from '../services/logger';

const router = useRouter();
const route = useRoute();
const chatStore = useChatStore();
const peerStore = usePeerStore();
const settingsStore = useSettingsStore();

const mode = ref<'options' | 'paste'>('options');
const npubInput = ref('');
const inputError = ref('');
const scannerError = ref('');
const showScanner = ref(false);
const videoRef = ref<HTMLVideoElement | null>(null);
let scanner: QrScanner | null = null;

const isAgentMode = computed(() => route.query.agent === 'true');

const isValidInput = computed(() => {
  const value = npubInput.value.trim();
  if (!value) return false;
  if (value.startsWith('npub1') && value.length === 63) return true;
  return /^[0-9a-f]{64}$/i.test(value);
});

function destroyScanner(): void {
  if (!scanner) return;
  scanner.destroy();
  scanner = null;
}

async function connectWithPeer(): Promise<void> {
  if (!isValidInput.value || peerStore.isConnecting) return;
  if (!settingsStore.pubkeyHex) return;

  inputError.value = '';

  try {
    await peerStore.connectToPeer(npubInput.value.trim());
    const groupId = await peerStore.createGroupWithPeer(
      settingsStore.pubkeyHex,
      settingsStore.relays,
    );

    chatStore.markNeedsNaming(groupId).catch(() => {});
    if (isAgentMode.value) {
      chatStore.markAsAgent(groupId).catch(() => {});
    }

    router.push(`/chat/${groupId}`);
  } catch (error) {
    inputError.value = error instanceof Error ? error.message : 'Connection failed';
    logger.error('new-chat', 'Failed connecting to peer', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function goBack(): void {
  if (mode.value === 'paste') {
    mode.value = 'options';
    inputError.value = '';
    return;
  }
  router.push('/chats');
}

function openPasteMode(): void {
  mode.value = 'paste';
  inputError.value = '';
}

async function pasteFromClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      npubInput.value = text.trim();
      inputError.value = '';
    }
  } catch {
    inputError.value = 'Clipboard read failed';
  }
}

async function startScanner(): Promise<void> {
  scannerError.value = '';
  showScanner.value = true;

  await new Promise((resolve) => requestAnimationFrame(resolve));

  if (!videoRef.value) {
    scannerError.value = 'Camera view is unavailable';
    return;
  }

  const hasCamera = await QrScanner.hasCamera();
  if (!hasCamera) {
    scannerError.value = 'No camera found on this device';
    return;
  }

  scanner = new QrScanner(
    videoRef.value,
    (result) => {
      const scanned = result.data.trim();
      if (!scanned) return;

      destroyScanner();
      showScanner.value = false;
      mode.value = 'paste';
      npubInput.value = scanned;
      inputError.value = '';
    },
    {
      highlightScanRegion: true,
      highlightCodeOutline: true,
    },
  );

  try {
    await scanner.start();
  } catch {
    scannerError.value = 'Camera permission denied';
  }
}

function closeScanner(): void {
  destroyScanner();
  showScanner.value = false;
  scannerError.value = '';
}

onBeforeUnmount(() => {
  destroyScanner();
});
</script>

<template>
  <div class="add-contact-view" :data-node-id="mode === 'options' ? '1:608' : '1:658'">
    <header class="add-contact-header" data-node-id="1:610">
      <button class="icon-back" aria-label="Go back" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="15" y1="6" x2="9" y2="12" />
          <line x1="9" y1="12" x2="15" y2="18" />
        </svg>
      </button>
      <h1 class="header-title">Add Contact</h1>
    </header>

    <main class="add-contact-content">
      <template v-if="mode === 'options'">
        <div class="content-head">
          <h2 class="content-title">Connect with someone</h2>
          <p class="content-subtitle">Scan their QR code or paste their public key</p>
        </div>

        <div class="option-list">
          <button class="option-card" @click="startScanner">
            <span class="option-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 7V5a1 1 0 0 1 1-1h2" />
                <path d="M18 4h2a1 1 0 0 1 1 1v2" />
                <path d="M21 17v2a1 1 0 0 1-1 1h-2" />
                <path d="M7 21H5a1 1 0 0 1-1-1v-2" />
                <rect x="8" y="8" width="8" height="8" rx="1" />
              </svg>
            </span>
            <span class="option-copy">
              <span class="option-title">Scan QR Code</span>
              <span class="option-subtitle">Use your camera to scan</span>
            </span>
          </button>

          <button class="option-card" @click="openPasteMode">
            <span class="option-icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="3" width="6" height="3" rx="1" />
                <path d="M9 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                <path d="M14 11h7" />
                <path d="M18 7l3 4-3 4" />
              </svg>
            </span>
            <span class="option-copy">
              <span class="option-title">Paste Public Key</span>
              <span class="option-subtitle">Enter an npub manually</span>
            </span>
          </button>
        </div>
      </template>

      <template v-else>
        <div class="content-head">
          <h2 class="content-title">Paste public key</h2>
          <p class="content-subtitle">Enter the npub you want to connect with</p>
        </div>

        <div class="input-block">
          <label class="input-label">Public key (npub)</label>
          <div class="input-row">
            <input
              v-model="npubInput"
              class="npub-input"
              type="text"
              placeholder="npub1..."
              :disabled="peerStore.isConnecting"
              @keydown.enter="connectWithPeer"
            >
            <button class="paste-button" :disabled="peerStore.isConnecting" @click="pasteFromClipboard" aria-label="Paste key">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
          <p v-if="inputError" class="input-error">{{ inputError }}</p>
        </div>

        <div class="actions">
          <button
            class="primary-action"
            :class="{ disabled: !isValidInput || peerStore.isConnecting }"
            :disabled="!isValidInput || peerStore.isConnecting"
            @click="connectWithPeer"
          >
            {{ peerStore.isConnecting ? 'Connecting...' : 'Connect' }}
          </button>
          <button class="secondary-action" :disabled="peerStore.isConnecting" @click="goBack">Back</button>
        </div>
      </template>
    </main>

    <Teleport to="body">
      <div v-if="showScanner" class="scanner-overlay">
        <div class="scanner-card">
          <div class="scanner-head">
            <h3>Scan QR Code</h3>
            <button class="scanner-close" aria-label="Close" @click="closeScanner">×</button>
          </div>
          <div v-if="scannerError" class="scanner-error">{{ scannerError }}</div>
          <div v-else class="scanner-video-wrap">
            <video ref="videoRef" class="scanner-video" />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.add-contact-view {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: #0a0a0a;
  color: #fff;
  font-family: var(--font-sans);
}

.add-contact-header {
  height: 71px;
  border-bottom: 1px solid #1a1a1a;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px 1px;
}

.icon-back {
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

.add-contact-content {
  width: 342px;
  max-width: calc(100vw - 48px);
  margin: 32px auto 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.content-head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.content-title {
  margin: 0;
  font-size: 22px;
  line-height: 33px;
  font-weight: 500;
  color: #fff;
}

.content-subtitle {
  margin: 0;
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 400;
  color: #888;
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option-card {
  width: 100%;
  height: 100px;
  border-radius: 14px;
  border: 2px solid #1a1a1a;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 24px;
  color: inherit;
  cursor: pointer;
}

.option-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  background: rgba(0, 229, 255, 0.05);
  color: #00e5ff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.option-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.option-title {
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: #fff;
}

.option-subtitle {
  font-size: 14px;
  line-height: 21px;
  font-weight: 500;
  color: #888;
}

.input-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-label {
  font-size: 13px;
  line-height: 19.5px;
  letter-spacing: 0.65px;
  text-transform: uppercase;
  font-weight: 500;
  color: #888;
}

.input-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.npub-input {
  flex: 1;
  height: 55px;
  border-radius: 10px;
  border: 1px solid #1a1a1a;
  background: #1a1a1a;
  color: #fff;
  font-family: 'Menlo', var(--font-mono);
  font-size: 14px;
  padding: 0 16px;
  outline: none;
}

.npub-input::placeholder {
  color: #555;
}

.paste-button {
  width: 54px;
  height: 55px;
  border-radius: 10px;
  border: 1px solid #1a1a1a;
  background: #1a1a1a;
  color: #888;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.input-error {
  margin: 0;
  font-size: 13px;
  line-height: 19.5px;
  color: #f87171;
}

.actions {
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.primary-action,
.secondary-action {
  width: 100%;
  height: 56px;
  border-radius: 10px;
  border: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
}

.primary-action {
  background: #00e5ff;
  color: #0a0a0a;
}

.primary-action.disabled,
.primary-action:disabled {
  opacity: 0.3;
}

.secondary-action {
  background: #1a1a1a;
  color: #fff;
}

.scanner-overlay {
  position: fixed;
  inset: 0;
  z-index: 220;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.scanner-card {
  width: min(420px, 100%);
  border-radius: 14px;
  border: 1px solid #1a1a1a;
  background: #0a0a0a;
  padding: 16px;
}

.scanner-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.scanner-head h3 {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
}

.scanner-close {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.scanner-error {
  color: #f87171;
  font-size: 14px;
  line-height: 21px;
}

.scanner-video-wrap {
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid #1a1a1a;
}

.scanner-video {
  width: 100%;
  display: block;
}
</style>
