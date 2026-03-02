<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSettingsStore } from '../stores/settings';
import { useThemeStore } from '../stores/theme';
import * as logger from '../services/logger';

type SectionKey = 'appearance' | 'account' | 'privacy' | 'network' | 'app-info';

const router = useRouter();
const settingsStore = useSettingsStore();
const themeStore = useThemeStore();

const expandedSection = ref<SectionKey | null>('appearance');

const sectionLabels: Array<{ key: SectionKey; label: string; nodeId: string }> = [
  { key: 'account', label: 'Account', nodeId: '1:1568' },
  { key: 'privacy', label: 'Privacy', nodeId: '1:1575' },
  { key: 'network', label: 'Network', nodeId: '1:1582' },
  { key: 'app-info', label: 'App Info', nodeId: '1:1589' },
];
const retentionOptions = [7, 30, 90] as const;

const themeLabel = computed(() => (themeStore.theme === 'dark' ? 'Dark' : 'Light'));
const isDarkTheme = computed(() => themeStore.theme === 'dark');
const shortNpub = computed(() => {
  if (!settingsStore.pubkeyNpub) return 'Not available';
  if (settingsStore.pubkeyNpub.length <= 24) return settingsStore.pubkeyNpub;
  return `${settingsStore.pubkeyNpub.slice(0, 12)}...${settingsStore.pubkeyNpub.slice(-8)}`;
});
const authMethodLabel = computed(() => {
  if (settingsStore.isNip07) return 'NIP-07 Extension';
  if (settingsStore.authMethod === 'passkey') return 'Passkey';
  if (settingsStore.authMethod === 'password') return 'Password';
  if (settingsStore.hasKeys) return 'Local Key';
  return 'Not configured';
});
const vaultStatusLabel = computed(() => (settingsStore.requiresVaultUnlock ? 'Locked' : 'Unlocked'));
const relayCountLabel = computed(() => {
  const count = settingsStore.relays.length;
  return `${count} ${count === 1 ? 'relay' : 'relays'}`;
});
const appVersion = '0.1.0';
const copiedAccount = ref(false);
let copiedTimer: number | null = null;

function beforeSectionEnter(el: Element): void {
  const section = el as HTMLElement;
  section.style.height = '0';
  section.style.opacity = '0';
  section.style.transform = 'translateY(-4px)';
  section.style.overflow = 'hidden';
}

function enterSection(el: Element): void {
  const section = el as HTMLElement;
  const targetHeight = section.scrollHeight;
  section.style.transition = 'height 220ms ease, opacity 160ms ease, transform 160ms ease';
  void section.offsetHeight;
  section.style.height = `${targetHeight}px`;
  section.style.opacity = '1';
  section.style.transform = 'translateY(0)';
}

function afterSectionEnter(el: Element): void {
  const section = el as HTMLElement;
  section.style.height = 'auto';
  section.style.opacity = '';
  section.style.transform = '';
  section.style.overflow = '';
  section.style.transition = '';
}

function beforeSectionLeave(el: Element): void {
  const section = el as HTMLElement;
  section.style.height = `${section.scrollHeight}px`;
  section.style.opacity = '1';
  section.style.transform = 'translateY(0)';
  section.style.overflow = 'hidden';
}

function leaveSection(el: Element): void {
  const section = el as HTMLElement;
  section.style.transition = 'height 220ms ease, opacity 160ms ease, transform 160ms ease';
  void section.offsetHeight;
  section.style.height = '0';
  section.style.opacity = '0';
  section.style.transform = 'translateY(-4px)';
}

function afterSectionLeave(el: Element): void {
  const section = el as HTMLElement;
  section.style.height = '';
  section.style.opacity = '';
  section.style.transform = '';
  section.style.overflow = '';
  section.style.transition = '';
}

function goBack(): void {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push('/');
}

function toggleSection(section: SectionKey): void {
  expandedSection.value = expandedSection.value === section ? null : section;
}

function toggleTheme(): void {
  themeStore.toggleTheme();
}

async function copyAccountId(): Promise<void> {
  if (!settingsStore.pubkeyNpub) return;

  try {
    await navigator.clipboard.writeText(settingsStore.pubkeyNpub);
    copiedAccount.value = true;
    if (copiedTimer !== null) {
      window.clearTimeout(copiedTimer);
    }
    copiedTimer = window.setTimeout(() => {
      copiedAccount.value = false;
      copiedTimer = null;
    }, 1600);
  } catch (error) {
    logger.warn('settings-view', 'Failed to copy account id', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function setRetention(days: 7 | 30 | 90): Promise<void> {
  try {
    await settingsStore.setMessageRetentionDays(days);
  } catch (error) {
    logger.error('settings-view', 'Failed to update retention window', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function clearData(): Promise<void> {
  if (!confirm('This will delete all your keys and data, clear app cache, and reset the app. Are you sure?')) return;

  try {
    await settingsStore.clearAllData();
    window.location.reload();
  } catch (error) {
    logger.error('settings-view', 'Failed to clear app data', {
      error: error instanceof Error ? error.message : String(error),
    });
    alert('Unable to fully clear app data. Please close and reopen the app, then try again.');
  }
}

onUnmounted(() => {
  if (copiedTimer !== null) {
    window.clearTimeout(copiedTimer);
    copiedTimer = null;
  }
});
</script>

<template>
  <div class="settings-view" data-node-id="1:1541">
    <header class="settings-header" data-node-id="1:1543">
      <button class="back-button" type="button" aria-label="Go back" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="15" y1="6" x2="9" y2="12" />
          <line x1="9" y1="12" x2="15" y2="18" />
        </svg>
      </button>
      <h1 class="header-title">Settings</h1>
    </header>

    <main class="settings-main" data-node-id="1:1550">
      <section class="settings-section" :class="{ expanded: expandedSection === 'appearance' }" data-node-id="1:1551">
        <button class="section-trigger" type="button" @click="toggleSection('appearance')">
          <span class="section-title">Appearance</span>
          <svg class="section-chevron" :class="{ open: expandedSection === 'appearance' }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <Transition
          :css="false"
          @before-enter="beforeSectionEnter"
          @enter="enterSection"
          @after-enter="afterSectionEnter"
          @before-leave="beforeSectionLeave"
          @leave="leaveSection"
          @after-leave="afterSectionLeave"
        >
          <div v-if="expandedSection === 'appearance'" class="section-body" data-node-id="1:1558">
            <div class="theme-row" data-node-id="1:1559">
              <span class="theme-label">Theme</span>
              <button class="theme-pill" type="button" data-node-id="1:1563" @click.stop="toggleTheme">
                <svg v-if="isDarkTheme" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <span>{{ themeLabel }}</span>
              </button>
            </div>
          </div>
        </Transition>
      </section>

      <section
        v-for="section in sectionLabels"
        :key="section.key"
        class="settings-section"
        :class="{ expanded: expandedSection === section.key }"
        :data-node-id="section.nodeId"
      >
        <button class="section-trigger" type="button" @click="toggleSection(section.key)">
          <span class="section-title">{{ section.label }}</span>
          <svg class="section-chevron" :class="{ open: expandedSection === section.key }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <Transition
          :css="false"
          @before-enter="beforeSectionEnter"
          @enter="enterSection"
          @after-enter="afterSectionEnter"
          @before-leave="beforeSectionLeave"
          @leave="leaveSection"
          @after-leave="afterSectionLeave"
        >
          <div v-if="expandedSection === section.key" class="section-body">
            <div v-if="section.key === 'account'" class="section-content">
              <div class="info-row">
                <span class="info-label">Account ID</span>
                <button
                  v-if="settingsStore.pubkeyNpub"
                  class="info-chip"
                  type="button"
                  @click.stop="copyAccountId"
                >
                  <span class="info-chip-value">{{ shortNpub }}</span>
                  <span class="info-chip-copy">{{ copiedAccount ? 'Copied' : 'Copy' }}</span>
                </button>
                <span v-else class="info-value">{{ shortNpub }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Auth Method</span>
                <span class="info-value">{{ authMethodLabel }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Vault</span>
                <span class="info-value">{{ vaultStatusLabel }}</span>
              </div>
            </div>

            <div v-else-if="section.key === 'privacy'" class="section-content">
              <div class="info-row">
                <span class="info-label">Retention</span>
                <div class="retention-controls">
                  <button
                    v-for="days in retentionOptions"
                    :key="days"
                    class="retention-pill"
                    :class="{ active: settingsStore.messageRetentionDays === days }"
                    type="button"
                    @click.stop="setRetention(days)"
                  >
                    {{ days }}d
                  </button>
                </div>
              </div>
              <div class="info-row">
                <span class="info-label">Messages</span>
                <span class="info-value">Delete after {{ settingsStore.messageRetentionDays }} days</span>
              </div>
            </div>

            <div v-else-if="section.key === 'network'" class="section-content">
              <div class="info-row">
                <span class="info-label">Mode</span>
                <span class="info-value">{{ settingsStore.isNip07 ? 'NIP-07 Extension' : 'Local' }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Relays</span>
                <span class="info-value">{{ relayCountLabel }}</span>
              </div>
              <div v-if="settingsStore.relays.length" class="relay-list">
                <div v-for="relay in settingsStore.relays.slice(0, 3)" :key="relay" class="relay-item">
                  {{ relay }}
                </div>
                <div v-if="settingsStore.relays.length > 3" class="relay-more">
                  +{{ settingsStore.relays.length - 3 }} more
                </div>
              </div>
              <div v-else class="info-empty">No relay endpoints configured.</div>
            </div>

            <div v-else class="section-content">
              <div class="info-row">
                <span class="info-label">Version</span>
                <span class="info-value">{{ appVersion }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Security</span>
                <span class="info-value">End-to-end encrypted</span>
              </div>
              <div class="info-row">
                <span class="info-label">Theme</span>
                <span class="info-value">{{ themeLabel }}</span>
              </div>
            </div>
          </div>
        </Transition>
      </section>

      <section class="danger-zone" data-node-id="1:1596">
        <div class="danger-head" data-node-id="1:1597">Danger Zone</div>
        <button class="danger-action" type="button" data-node-id="1:1599" @click="clearData">Clear All Data</button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.settings-view {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: #0a0a0a;
  color: #fff;
  font-family: 'Inter', var(--font-sans);
}

.settings-header {
  height: 71px;
  border-bottom: 1px solid #1a1a1a;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 20px 1px;
}

.back-button {
  width: 28px;
  height: 28px;
  border: 0;
  padding: 4px;
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

.settings-main {
  width: 342px;
  max-width: calc(100vw - 48px);
  margin: 24px auto 0;
  padding-bottom: 28px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-section {
  width: 100%;
  border: 1px solid #1a1a1a;
  border-radius: 10px;
  overflow: hidden;
  background: transparent;
}

.section-trigger {
  width: 100%;
  height: 54.5px;
  border: 0;
  background: transparent;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease;
}

.section-trigger:hover {
  background: #141414;
}

.section-title {
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 500;
  color: #fff;
}

.section-chevron {
  color: #888;
  transition: transform 0.18s ease;
}

.section-chevron.open {
  transform: rotate(180deg);
}

.section-body {
  border-top: 1px solid #1a1a1a;
}

.theme-row,
.info-row {
  height: 57px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-content .info-row:not(:last-child) {
  border-bottom: 1px solid #111;
}

.theme-label {
  font-size: 14px;
  line-height: 21px;
  font-weight: 400;
  color: #888;
}

.theme-pill {
  height: 33px;
  border: 0;
  border-radius: 10px;
  background: #1a1a1a;
  color: #fff;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: 'Inter', var(--font-sans);
  font-size: 14px;
  line-height: 21px;
  font-weight: 500;
  cursor: pointer;
}

.theme-pill svg {
  color: #00e5ff;
}

.info-label {
  font-size: 14px;
  line-height: 21px;
  font-weight: 400;
  color: #888;
}

.info-value {
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  color: #f1f1f1;
  text-align: right;
}

.info-chip {
  max-width: 72%;
  height: 33px;
  border: 0;
  border-radius: 10px;
  background: #1a1a1a;
  color: #fff;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.info-chip-value {
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: #d8d8d8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-chip-copy {
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  color: #00e5ff;
  text-transform: uppercase;
  letter-spacing: 0.25px;
}

.retention-controls {
  display: inline-flex;
  gap: 6px;
}

.retention-pill {
  height: 29px;
  min-width: 42px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #2a2a2a;
  background: #121212;
  color: #9a9a9a;
  font-family: 'Inter', var(--font-sans);
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  cursor: pointer;
}

.retention-pill.active {
  border-color: #00e5ff;
  color: #fff;
  background: #1a1a1a;
}

.relay-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 16px 12px;
}

.relay-item {
  height: 28px;
  border: 1px solid #222;
  border-radius: 8px;
  background: #0f0f0f;
  padding: 0 10px;
  display: flex;
  align-items: center;
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
  color: #9a9a9a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.relay-more {
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: #8e8e8e;
  padding-left: 2px;
}

.info-empty {
  padding: 0 16px 14px;
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
  color: #8e8e8e;
}

.danger-zone {
  width: 100%;
  margin-top: 24px;
  border: 1px solid #ff4444;
  border-radius: 10px;
  overflow: hidden;
}

.danger-head {
  height: 48px;
  background: rgba(255, 68, 68, 0.1);
  padding: 14px 16px;
  color: #ff4444;
  font-size: 13px;
  line-height: 19.5px;
  font-weight: 400;
  letter-spacing: 0.65px;
  text-transform: uppercase;
}

.danger-action {
  width: 100%;
  height: 54.5px;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 0 16px;
  color: #ff4444;
  font-family: 'Inter', var(--font-sans);
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 500;
  cursor: pointer;
}
</style>
