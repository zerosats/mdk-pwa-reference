<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useChatStore } from '../stores/chat';
import { usePeerStore } from '../stores/peer';
import { useSidebarStore } from '../stores/sidebar';
import { parsePaymentMessage } from '../types';
import { lockBodyScroll } from '../composables/useBodyScrollLock';

const router = useRouter();
const chatStore = useChatStore();
const peerStore = usePeerStore();
const sidebarStore = useSidebarStore();

const showActionSheet = ref(false);
let releaseBodyLock: (() => void) | null = null;

onMounted(async () => {
  await chatStore.loadGroupsFromStorage();
});

const messageGroups = computed(() => chatStore.groupList.filter((group) => !group.isAgent));

const agentPills = computed(() => {
  return chatStore.agentGroups.slice(0, 3).map((group) => ({
    id: group.id,
    name: group.name || 'Agent',
    letter: (group.name || 'A').slice(0, 1).toUpperCase(),
  }));
});

function formatTime(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMinutes < 1) return 'now';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

function previewFor(content?: string): string {
  if (!content) return 'No messages yet';
  const payment = parsePaymentMessage(content);
  if (!payment) return content;
  return payment.memo || `${payment.amount.toLocaleString()} sats`;
}

function groupInitial(name?: string): string {
  return (name || 'C').slice(0, 1).toUpperCase();
}

function isGroupOnline(groupId: string): boolean {
  return peerStore.isConnected && peerStore.groupId === groupId;
}

function goToChat(groupId: string): void {
  chatStore.setActiveGroup(groupId);
  router.push(`/chat/${groupId}`);
}

function openAgent(groupId: string): void {
  goToChat(groupId);
}

function openAddContact(): void {
  showActionSheet.value = false;
  router.push('/connect');
}

function openConnectAgent(): void {
  showActionSheet.value = false;
  router.push('/connect?agent=true');
}

function openMyCard(): void {
  showActionSheet.value = false;
  router.push('/my-card');
}

function openWallet(): void {
  router.push('/wallet');
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  showActionSheet.value = false;
}

watch(showActionSheet, (isOpen) => {
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
});

onUnmounted(() => {
  if (releaseBodyLock) {
    releaseBodyLock();
    releaseBodyLock = null;
  }
  document.removeEventListener('keydown', handleEscape);
});
</script>

<template>
  <div class="chats-screen" data-node-id="1:175">
    <header class="top-header" data-node-id="1:178">
      <button class="header-icon menu-trigger" aria-label="Open menu" @click="sidebarStore.toggle()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      <h1 class="header-title">MDK PWA</h1>

      <div class="header-right">
        <button class="header-btc" aria-label="Open wallet" @click="openWallet">₿</button>
        <button class="header-icon" aria-label="Open quick actions" @click="showActionSheet = true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </header>

    <section class="agents-section" data-node-id="1:188">
      <div class="section-head">
        <h2 class="section-label">Agents</h2>
      </div>

      <div v-if="agentPills.length > 0" class="agents-row">
        <button
          v-for="agent in agentPills"
          :key="agent.id"
          class="agent-pill"
          @click="openAgent(agent.id)"
        >
          <span class="agent-avatar">{{ agent.letter }}</span>
          <span class="agent-name">{{ agent.name }}</span>
        </button>
      </div>
      <button v-else class="agent-empty" type="button" @click="openConnectAgent">
        Connect your first agent
      </button>
    </section>

    <section class="messages-section" data-node-id="1:213">
      <h2 class="section-label">Messages</h2>

      <div class="chat-list">
        <button
          v-for="group in messageGroups"
          :key="group.id"
          class="chat-row"
          @click="goToChat(group.id)"
        >
          <div class="chat-avatar-wrap">
            <span class="chat-avatar">{{ groupInitial(group.name) }}</span>
            <span v-if="isGroupOnline(group.id)" class="online-dot" />
          </div>

          <div class="chat-content">
            <div class="chat-top">
              <span class="chat-name">{{ group.name || 'Chat' }}</span>
              <span class="chat-time">{{ formatTime(group.lastMessage?.timestamp) }}</span>
            </div>
            <div class="chat-bottom">
              <span class="chat-preview">{{ previewFor(group.lastMessage?.content) }}</span>
              <span v-if="group.unreadCount > 0" class="chat-unread">
                {{ group.unreadCount > 99 ? '99+' : group.unreadCount }}
              </span>
            </div>
          </div>
        </button>
      </div>
    </section>

    <Teleport to="body">
      <Transition name="sheet-fade">
        <div v-if="showActionSheet" class="sheet-overlay" @click.self="showActionSheet = false">
          <div class="sheet-panel" data-node-id="1:598">
            <div class="sheet-handle" />
            <button class="sheet-item" @click="openAddContact">Add Contact</button>
            <button class="sheet-item" @click="openConnectAgent">Connect Agent</button>
            <button class="sheet-item" @click="openMyCard">My Card</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.chats-screen {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: #0a0a0a;
  color: #fff;
  display: flex;
  flex-direction: column;
  font-family: var(--font-sans);
}

.top-header {
  position: relative;
  flex-shrink: 0;
  height: 77px;
  border-bottom: 1px solid #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px 1px 72px;
}

.header-title {
  margin: 0;
  font-size: 20px;
  line-height: 30px;
  font-weight: 600;
}

.menu-trigger {
  position: absolute;
  left: 16px;
  top: 16px;
  width: 40px;
  height: 40px;
  padding: 8px;
}

.header-right {
  display: inline-flex;
  align-items: center;
  gap: 16px;
}

.header-btc {
  width: 12px;
  height: 27px;
  border: 0;
  padding: 0;
  background: transparent;
  color: #fff;
  font-size: 18px;
  line-height: 27px;
  font-weight: 500;
  cursor: pointer;
}

.header-icon {
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 10px;
  transition: background 0.16s ease, color 0.16s ease;
}

.header-icon:hover {
  background: #141414;
}

.agents-section {
  flex-shrink: 0;
  height: 169.5px;
  padding-top: 24px;
}

.section-head {
  height: 19.5px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label {
  margin: 0;
  font-size: 13px;
  line-height: 19.5px;
  letter-spacing: 0.65px;
  text-transform: uppercase;
  font-weight: 500;
  color: #888;
}

.agents-row {
  margin-top: 12px;
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 0 24px;
}

.agent-empty {
  margin: 14px 24px 0;
  width: calc(100% - 48px);
  height: 56px;
  border-radius: 10px;
  border: 1px solid #1a1a1a;
  background: transparent;
  color: #888;
  font-size: 14px;
  line-height: 21px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
}

.agents-row::-webkit-scrollbar {
  display: none;
}

.agent-pill {
  border: 0;
  background: transparent;
  width: 56px;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  border-radius: 12px;
  transition: transform 0.18s ease;
}

.agent-pill:active {
  transform: scale(0.98);
}

.agent-avatar {
  width: 56px;
  height: 56px;
  border-radius: 9999px;
  border: 1px solid #00e5ff;
  background: #1a1a1a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  line-height: 27px;
  font-weight: 500;
}

.agent-name {
  color: #888;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
}

.messages-section {
  flex: 1;
  min-height: 0;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  padding-bottom: 16px;
}

.chat-row {
  width: 100%;
  height: 80px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0;
  cursor: pointer;
  color: inherit;
  transition: background 0.16s ease;
}

.chat-row:hover {
  background: #121212;
}

.chat-avatar-wrap {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.chat-avatar {
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  background: #1a1a1a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
}

.online-dot {
  position: absolute;
  left: 38px;
  top: 38px;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  border: 2px solid #0a0a0a;
  background: #00e5ff;
}

.chat-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-top,
.chat-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 22.5px;
}

.chat-name {
  color: #fff;
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 600;
}

.chat-time {
  color: #888;
  font-size: 13px;
  line-height: 19.5px;
  font-weight: 500;
}

.chat-preview {
  color: #888;
  font-size: 14px;
  line-height: 21px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
  text-align: left;
}

.chat-unread {
  width: 20px;
  height: 20px;
  border-radius: 9999px;
  background: #00e5ff;
  color: #0a0a0a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  line-height: 16.5px;
  font-weight: 500;
  flex-shrink: 0;
}

.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 160;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
}

.sheet-panel {
  position: relative;
  width: 100%;
  height: 256.5px;
  border-top: 1px solid #1a1a1a;
  border-radius: 16px 16px 0 0;
  background: #0a0a0a;
  padding: 24px;
  padding-top: 52px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sheet-handle {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 48px;
  height: 4px;
  border-radius: 9999px;
  background: #2a2a2a;
}

.sheet-item {
  width: 100%;
  height: 54.5px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #fff;
  text-align: left;
  padding: 0 16px;
  font-size: 15px;
  line-height: 22.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.16s ease;
}

.sheet-item:hover {
  background: #141414;
}

.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.18s ease;
}

.sheet-fade-enter-active .sheet-panel,
.sheet-fade-leave-active .sheet-panel {
  transition: transform 0.24s ease;
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.sheet-fade-enter-from .sheet-panel,
.sheet-fade-leave-to .sheet-panel {
  transform: translateY(100%);
}
</style>
