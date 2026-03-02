<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSidebarStore } from '../../stores/sidebar';
import { useSettingsStore } from '../../stores/settings';
import { lockBodyScroll } from '../../composables/useBodyScrollLock';

const route = useRoute();
const router = useRouter();
const sidebarStore = useSidebarStore();
const settingsStore = useSettingsStore();
let releaseBodyLock: (() => void) | null = null;

const currentPath = computed(() => route.path);
const profileName = computed(() => {
  if (!settingsStore.pubkeyNpub) return 'MDK PWA User';
  const npub = settingsStore.pubkeyNpub;
  return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
});
const profileDetail = computed(() => {
  if (settingsStore.authMethod === 'passkey') return 'Passkey secured';
  if (settingsStore.authMethod === 'password') return 'Password secured';
  if (settingsStore.isNip07) return 'NIP-07 extension';
  return 'Local key mode';
});
const profileLetter = computed(() => profileName.value.slice(0, 1).toUpperCase());

function isActive(path: string): boolean {
  if (path === '/') {
    return (
      currentPath.value === '/' ||
      currentPath.value === '/connect' ||
      currentPath.value.startsWith('/chat/') ||
      currentPath.value === '/my-card'
    );
  }
  return currentPath.value.startsWith(path);
}

function navigate(path: string): void {
  if (currentPath.value !== path) {
    router.push(path);
  }
  sidebarStore.close();
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  sidebarStore.close();
}

watch(() => route.path, () => {
  sidebarStore.close();
});

watch(() => sidebarStore.isOpen, (isOpen) => {
  if (isOpen) {
    releaseBodyLock = lockBodyScroll();
    document.addEventListener('keydown', handleEscape);
    return;
  }

  if (releaseBodyLock) {
    releaseBodyLock();
    releaseBodyLock = null;
  }
  document.removeEventListener('keydown', handleEscape);
}, { immediate: true });

onUnmounted(() => {
  if (releaseBodyLock) {
    releaseBodyLock();
    releaseBodyLock = null;
  }
  document.removeEventListener('keydown', handleEscape);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="sidebar-fade">
      <div v-if="sidebarStore.isOpen" class="sidebar-backdrop" @click.self="sidebarStore.close()">
        <aside class="sidebar-panel" data-node-id="1:856">
          <header class="sidebar-header">
            <h2 class="sidebar-brand">MDK PWA</h2>
            <button class="sidebar-close" aria-label="Close menu" @click="sidebarStore.close()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <nav class="sidebar-nav" data-node-id="1:864">
            <button class="nav-item" :class="{ active: isActive('/') }" @click="navigate('/')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Chats</span>
            </button>

            <button class="nav-item" :class="{ active: isActive('/wallet') }" @click="navigate('/wallet')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <path d="M16 12h3" />
              </svg>
              <span>Wallet</span>
            </button>

            <button class="nav-item" :class="{ active: isActive('/settings') }" @click="navigate('/settings')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 14H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1A1.65 1.65 0 0 0 4.27 7.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.17.69.82 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Settings</span>
            </button>
          </nav>

          <footer class="sidebar-footer">
            <div class="profile-avatar">{{ profileLetter }}</div>
            <div class="profile-meta">
              <p class="profile-name">{{ profileName }}</p>
              <p class="profile-email">{{ profileDetail }}</p>
            </div>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sidebar-backdrop {
  position: fixed;
  inset: 0;
  z-index: 140;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}

.sidebar-panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  border-right: 1px solid #1a1a1a;
  background: #0a0a0a;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  height: 85px;
  border-bottom: 1px solid #1a1a1a;
  padding: 0 16px 1px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-brand {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
  color: #fff;
}

.sidebar-close {
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  color: #888;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.16s ease, color 0.16s ease;
}

.sidebar-close:hover {
  background: #141414;
  color: #fff;
}

.sidebar-nav {
  margin-top: 16px;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  width: 100%;
  height: 48px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #888;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding-left: 16px;
  cursor: pointer;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  font-family: var(--font-sans);
  text-align: left;
  transition: background 0.16s ease, color 0.16s ease;
}

.nav-item:hover {
  background: #141414;
  color: #fff;
}

.nav-item.active {
  background: rgba(0, 229, 255, 0.05);
  color: #00e5ff;
}

.sidebar-footer {
  margin-top: auto;
  height: 93px;
  border-top: 1px solid #1a1a1a;
  padding: 17px 16px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.profile-avatar {
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  background: linear-gradient(180deg, #00e5ff 0%, #2a2a2a 100%);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 16px;
  font-weight: 700;
}

.profile-meta {
  min-width: 0;
}

.profile-name {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: #fff;
}

.profile-email {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.sidebar-fade-enter-active,
.sidebar-fade-leave-active {
  transition: opacity 0.22s ease;
}

.sidebar-fade-enter-active .sidebar-panel,
.sidebar-fade-leave-active .sidebar-panel {
  transition: transform 0.24s ease;
}

.sidebar-fade-enter-from,
.sidebar-fade-leave-to {
  opacity: 0;
}

.sidebar-fade-enter-from .sidebar-panel,
.sidebar-fade-leave-to .sidebar-panel {
  transform: translateX(-100%);
}
</style>
