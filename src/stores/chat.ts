import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Message, Group, Reaction } from '../types';
import * as storage from '../services/storage';
import { useSettingsStore } from './settings';

export const useChatStore = defineStore('chat', () => {
  const settingsStore = useSettingsStore();
  const groups = ref<Map<string, Group>>(new Map());
  const messages = ref<Map<string, Message[]>>(new Map());
  const activeGroupId = ref<string | null>(null);
  const isLoading = ref(false);

  const activeGroup = computed(() => {
    if (!activeGroupId.value) return null;
    return groups.value.get(activeGroupId.value) ?? null;
  });

  const activeMessages = computed(() => {
    if (!activeGroupId.value) return [];
    return messages.value.get(activeGroupId.value) ?? [];
  });

  const groupList = computed(() => {
    return Array.from(groups.value.values()).sort((a, b) => {
      const aTime = a.lastMessage?.timestamp ?? 0;
      const bTime = b.lastMessage?.timestamp ?? 0;
      return bTime - aTime;
    });
  });

  const agentGroups = computed(() => {
    return groupList.value.filter((g) => g.isAgent);
  });

  function setActiveGroup(groupId: string | null): void {
    activeGroupId.value = groupId;
    if (groupId) {
      const group = groups.value.get(groupId);
      if (group) {
        group.unreadCount = 0;
      }
    }
  }

  function addGroup(group: Group): void {
    groups.value.set(group.id, group);
  }

  function updateGroup(groupId: string, updates: Partial<Group>): void {
    const group = groups.value.get(groupId);
    if (group) {
      Object.assign(group, updates);
    }
  }

  async function removeGroup(groupId: string): Promise<void> {
    groups.value.delete(groupId);
    messages.value.delete(groupId);
    await storage.clearMessages(groupId);
    await storage.deleteGroupMeta(groupId);
    if (activeGroupId.value === groupId) {
      activeGroupId.value = null;
    }
  }

  async function renameGroup(groupId: string, name: string): Promise<void> {
    const group = groups.value.get(groupId);
    if (group) {
      group.name = name;
    }
    await storage.setGroupMeta(groupId, { name, needsNaming: false });
  }

  async function checkNeedsNaming(groupId: string): Promise<boolean> {
    const meta = await storage.getGroupMeta(groupId);
    return meta?.needsNaming === true;
  }

  async function markNeedsNaming(groupId: string): Promise<void> {
    const meta = await storage.getGroupMeta(groupId);
    await storage.setGroupMeta(groupId, { ...meta, needsNaming: true });
  }

  async function markAsAgent(groupId: string): Promise<void> {
    const meta = await storage.getGroupMeta(groupId);
    await storage.setGroupMeta(groupId, { ...meta, isAgent: true });
    const group = groups.value.get(groupId);
    if (group) {
      group.isAgent = true;
    }
  }

  async function addMessage(message: Message): Promise<void> {
    const groupMessages = messages.value.get(message.groupId);
    if (groupMessages) {
      if (!groupMessages.some((m) => m.id === message.id)) {
        groupMessages.push(message);
        groupMessages.sort((a, b) => a.timestamp - b.timestamp);
      }
    } else {
      messages.value.set(message.groupId, [message]);
    }

    const group = groups.value.get(message.groupId);
    if (group) {
      group.lastMessage = message;
      if (message.groupId !== activeGroupId.value) {
        group.unreadCount++;
      }
    }

    await storage.appendMessage({
      id: message.id,
      groupId: message.groupId,
      senderPubkey: message.senderPubkey,
      content: message.content,
      timestamp: message.timestamp,
      replyToId: message.replyToId,
      reactions: message.reactions,
    }, {
      retentionDays: settingsStore.messageRetentionDays,
    });
  }

  function addReaction(
    groupId: string,
    messageId: string,
    reaction: Reaction
  ): void {
    const groupMessages = messages.value.get(groupId);
    if (!groupMessages) return;
    const message = groupMessages.find((m) => m.id === messageId);
    if (!message) return;
    if (!message.reactions) {
      message.reactions = [];
    }
    const existing = message.reactions.find(
      (r) => r.emoji === reaction.emoji && r.senderPubkey === reaction.senderPubkey
    );
    if (existing) {
      message.reactions = message.reactions.filter((r) => r !== existing);
    } else {
      message.reactions.push(reaction);
    }

    void storage.updateMessageMetadata(groupId, messageId, {
      reactions: message.reactions,
      replyToId: message.replyToId,
    });
  }

  function updateMessageStatus(
    groupId: string,
    messageId: string,
    status: Message['status']
  ): void {
    const groupMessages = messages.value.get(groupId);
    if (groupMessages) {
      const message = groupMessages.find((m) => m.id === messageId);
      if (message) {
        message.status = status;
      }
    }
  }

  async function loadMessagesFromStorage(groupId: string): Promise<void> {
    const storedMessages = await storage.getMessages(groupId, {
      retentionDays: settingsStore.messageRetentionDays,
    });
    const loadedMessages: Message[] = storedMessages.map((m) => ({
      ...m,
      status: 'delivered' as const,
    }));
    messages.value.set(groupId, loadedMessages);
  }

  async function loadGroupsFromStorage(): Promise<void> {
    const groupIds = await storage.getAllMessageGroupIds();

    for (const groupId of groupIds) {
      if (groups.value.has(groupId)) continue;

      const storedMessages = await storage.getMessages(groupId, {
        retentionDays: settingsStore.messageRetentionDays,
      });

      if (storedMessages.length === 0) continue;

      const lastMsg = storedMessages[storedMessages.length - 1];
      const members = [...new Set(storedMessages.map((m) => m.senderPubkey))];
      const meta = await storage.getGroupMeta(groupId);

      groups.value.set(groupId, {
        id: groupId,
        name: meta?.name || 'Chat',
        epoch: 0,
        members,
        unreadCount: 0,
        isAgent: meta?.isAgent,
        lastMessage: {
          ...lastMsg,
          status: 'delivered',
        },
      });

      messages.value.set(groupId, storedMessages.map((m) => ({
        ...m,
        status: 'delivered' as const,
      })));
    }
  }

  async function clearGroupMessages(groupId: string): Promise<void> {
    messages.value.set(groupId, []);
    await storage.clearMessages(groupId);
  }

  function clearAllGroups(): void {
    groups.value.clear();
    messages.value.clear();
    activeGroupId.value = null;
  }

  return {
    groups,
    messages,
    activeGroupId,
    isLoading,
    activeGroup,
    activeMessages,
    groupList,
    agentGroups,
    setActiveGroup,
    addGroup,
    updateGroup,
    removeGroup,
    renameGroup,
    addMessage,
    addReaction,
    updateMessageStatus,
    loadMessagesFromStorage,
    loadGroupsFromStorage,
    clearGroupMessages,
    clearAllGroups,
    checkNeedsNaming,
    markNeedsNaming,
    markAsAgent,
  };
});
