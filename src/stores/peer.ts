import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { PeerInfo, JsGroup, JsWelcome, NostrEvent } from '../types';
import { NostrKind } from '../types';
import * as nostr from '../services/nostr';
import * as mdk from '../services/mdk';
import * as welcomeTransport from '../services/welcomeTransport';
import * as storage from '../services/storage';
import * as logger from '../services/logger';

export const usePeerStore = defineStore('peer', () => {
  const peer = ref<PeerInfo | null>(null);
  const groupId = ref<string | null>(null);
  const nostrGroupId = ref<string | null>(null);
  const groupStateMap = ref<Map<string, storage.GroupState>>(new Map());
  const connectionStatus = ref<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const connectionError = ref<string | null>(null);

  const isConnected = computed(() => connectionStatus.value === 'connected');
  const isConnecting = computed(() => connectionStatus.value === 'connecting');

  async function persistGroupState(): Promise<void> {
    const states = Array.from(groupStateMap.value.values()).map(s => ({
      groupId: s.groupId,
      nostrGroupId: s.nostrGroupId,
      peerPubkey: s.peerPubkey,
      peerName: s.peerName,
    }));
    await storage.setGroupStates(states);
  }

  function saveCurrentGroupState(): void {
    if (!groupId.value || !nostrGroupId.value) return;
    groupStateMap.value.set(groupId.value, {
      groupId: groupId.value,
      nostrGroupId: nostrGroupId.value,
      peerPubkey: peer.value?.pubkey,
      peerName: peer.value?.name,
    });
    persistGroupState();
  }

  async function restoreGroupStates(): Promise<void> {
    const states = await storage.getGroupStates();
    for (const state of states) {
      groupStateMap.value.set(state.groupId, state);
    }
  }

  function switchToGroup(targetGroupId: string): boolean {
    const state = groupStateMap.value.get(targetGroupId);
    if (!state) return false;
    groupId.value = state.groupId;
    nostrGroupId.value = state.nostrGroupId;
    if (state.peerPubkey) {
      peer.value = { pubkey: state.peerPubkey, name: state.peerName };
    }
    connectionStatus.value = 'connected';
    return true;
  }

  async function deriveNostrGroupId(targetGroupId: string): Promise<string> {
    const currentPubkey = nostr.getCurrentPubkey();
    if (!currentPubkey) {
      throw new Error('Cannot derive nostr group id: no active pubkey');
    }

    const probeResult = await mdk.createMessage(targetGroupId, '__probe__', currentPubkey);
    const probeEvent = JSON.parse(probeResult.event_json);
    const hTag = probeEvent.tags?.find((t: string[]) => t[0] === 'h');
    if (hTag && hTag[1]) {
      logger.debug('peer', 'Derived nostr group id from probe', {
        nostrGroupId: hTag[1],
      });
      return hTag[1];
    }
    throw new Error('Probe succeeded but h-tag missing from event');
  }

  async function setNostrGroupIdFromProbe(targetGroupId: string): Promise<void> {
    nostrGroupId.value = await deriveNostrGroupId(targetGroupId);
  }

  async function connectToPeer(npubOrPubkey: string): Promise<void> {
    if (connectionStatus.value === 'connecting') {
      return;
    }

    connectionStatus.value = 'connecting';
    connectionError.value = null;

    try {
      let pubkey: string;
      if (npubOrPubkey.startsWith('npub')) {
        pubkey = nostr.npubToPubkey(npubOrPubkey);
      } else {
        pubkey = npubOrPubkey;
      }

      const keyPackageEvent = await nostr.fetchKeyPackage(pubkey);
      if (!keyPackageEvent) {
        throw new Error('Key package not found on relays');
      }

      peer.value = {
        pubkey,
        keyPackageEventId: keyPackageEvent.id,
      };

      connectionStatus.value = 'connected';
    } catch (error) {
      connectionStatus.value = 'error';
      connectionError.value = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  async function createGroupWithPeer(
    userPubkey: string,
    relays: string[]
  ): Promise<string> {
    if (!peer.value) {
      throw new Error('No peer connected');
    }

    const keyPackageEvent = await nostr.fetchKeyPackage(peer.value.pubkey);
    if (!keyPackageEvent) {
      throw new Error('Peer key package not found');
    }

    logger.debug('peer', 'Fetched key package from relay', {
      id: keyPackageEvent.id,
      kind: keyPackageEvent.kind,
      tags: keyPackageEvent.tags,
      contentLength: keyPackageEvent.content?.length,
    });

    const result = await mdk.createGroup(userPubkey, [keyPackageEvent], {
      name: 'New Chat',
      description: '',
      relays,
      admins: [userPubkey],
    });

    groupId.value = result.group_id;
    logger.debug('peer', 'Created group', { groupId: result.group_id });

    for (const welcomeJson of result.welcome_event_jsons) {
      await welcomeTransport.publishWelcomeGiftWrap(welcomeJson, peer.value.pubkey);
    }

    await mdk.mergePendingCommit(result.group_id);

    await setNostrGroupIdFromProbe(result.group_id);
    saveCurrentGroupState();

    return result.group_id;
  }

  async function processIncomingWelcomeEvent(event: NostrEvent): Promise<JsWelcome> {
    let welcomeRumorJson: string;
    if (event.kind === NostrKind.GiftWrap) {
      welcomeRumorJson = welcomeTransport.unwrapWelcomeGiftWrap(event);
    } else if (event.kind === NostrKind.Welcome) {
      welcomeRumorJson = event.content;
    } else {
      throw new Error(`Unsupported welcome envelope kind ${event.kind}`);
    }

    const welcome = mdk.processWelcome(event.id, welcomeRumorJson);
    await mdk.acceptWelcome(event.id);

    groupId.value = welcome.group_id;
    await setNostrGroupIdFromProbe(welcome.group_id);
    connectionStatus.value = 'connected';
    connectionError.value = null;

    if (!peer.value || peer.value.pubkey !== welcome.inviter) {
      peer.value = {
        pubkey: welcome.inviter,
        name: welcome.group_name,
      };
    }

    saveCurrentGroupState();
    return welcome;
  }

  function subscribeToIncomingWelcomes(
    onWelcome: (welcome: JsWelcome, envelopeEvent: NostrEvent) => void,
    onError?: (error: unknown, envelopeEvent: NostrEvent) => void
  ): () => void {
    const recipientPubkey = nostr.getCurrentPubkey();
    if (!recipientPubkey) {
      throw new Error('No active pubkey configured for welcome subscriptions');
    }
    if (!nostr.getCurrentPrivateKeyBytes()) {
      throw new Error(
        'Incoming invite receive requires local-key mode. NIP-07 gift-wrap unwrapping is not supported yet.'
      );
    }

    const seenWelcomeEnvelopeIds = new Set<string>();
    const handleWelcomeEnvelope = async (event: NostrEvent) => {
      if (seenWelcomeEnvelopeIds.has(event.id)) {
        return;
      }
      seenWelcomeEnvelopeIds.add(event.id);

      try {
        const welcome = await processIncomingWelcomeEvent(event);
        onWelcome(welcome, event);
      } catch (error) {
        onError?.(error, event);
      }
    };

    const unsubscribeGiftWraps = nostr.subscribeToGiftWraps(
      recipientPubkey,
      handleWelcomeEnvelope
    );
    const unsubscribeLegacyWelcomes = nostr.subscribeToWelcomes(
      recipientPubkey,
      handleWelcomeEnvelope
    );

    return () => {
      unsubscribeGiftWraps();
      unsubscribeLegacyWelcomes();
    };
  }

  function updateNostrGroupIdFromMessage(eventJson: string): void {
    try {
      const event = JSON.parse(eventJson);
      const hTag = event.tags?.find((t: string[]) => t[0] === 'h');
      if (hTag && hTag[1] && hTag[1] !== nostrGroupId.value) {
        logger.debug('peer', 'Updated nostr group id from message', {
          previous: nostrGroupId.value,
          next: hTag[1],
        });
        nostrGroupId.value = hTag[1];
      }
    } catch {
      // Ignore parsing errors
    }
  }

  function disconnect(): void {
    if (groupId.value) {
      groupStateMap.value.delete(groupId.value);
      persistGroupState();
    }
    peer.value = null;
    groupId.value = null;
    nostrGroupId.value = null;
    connectionStatus.value = 'disconnected';
    connectionError.value = null;
  }

  async function restoreFromMdkState(groups: JsGroup[]): Promise<void> {
    if (groups.length === 0) return;

    const existingStates = await storage.getGroupStates();
    const existingMap = new Map<string, storage.GroupState>();
    for (const state of existingStates) {
      existingMap.set(state.groupId, state);
    }

    for (const group of groups) {
      const existing = existingMap.get(group.id);
      if (existing) {
        groupStateMap.value.set(group.id, existing);
      } else {
        try {
          const derivedNostrGroupId = await deriveNostrGroupId(group.id);
          groupStateMap.value.set(group.id, {
            groupId: group.id,
            nostrGroupId: derivedNostrGroupId,
          });
        } catch (error) {
          logger.warn('peer', 'Skipping group during restoration — could not derive nostrGroupId', {
            groupId: group.id,
            error: (error as Error).message,
          });
        }
      }
    }

    await persistGroupState();
    logger.debug('peer', 'Restored group state from MDK', {
      groupCount: groups.length,
      restoredFromIdb: existingStates.length,
      restoredToMap: groupStateMap.value.size,
    });
  }

  function resolveGroupIdFromNostrGroupId(targetNostrGroupId: string): string | null {
    for (const state of groupStateMap.value.values()) {
      if (state.groupId === state.nostrGroupId) continue;
      if (state.nostrGroupId === targetNostrGroupId) {
        return state.groupId;
      }
    }
    return null;
  }

  function subscribeToGroupMessages(
    onMessage: (event: NostrEvent) => void
  ): () => void {
    if (!nostrGroupId.value) {
      throw new Error('No active group (nostrGroupId not set)');
    }

    logger.debug('peer', 'Subscribing to group messages', {
      nostrGroupId: nostrGroupId.value,
    });
    return nostr.subscribeToMLSMessages(
      [nostrGroupId.value],
      onMessage
    );
  }

  function subscribeToAllGroupMessages(
    onMessage: (event: NostrEvent, resolvedGroupId: string) => void
  ): () => void {
    const states = Array.from(groupStateMap.value.values());
    const allNostrGroupIds = states.map(s => s.nostrGroupId);

    if (allNostrGroupIds.length === 0) {
      return () => {};
    }

    logger.debug('peer', 'Subscribing to all group messages', {
      groupCount: allNostrGroupIds.length,
    });

    return nostr.subscribeToMLSMessages(
      allNostrGroupIds,
      (event) => {
        const hTags = event.tags?.filter((t: string[]) => t[0] === 'h').map((t: string[]) => t[1]) ?? [];
        let resolved: string | null = null;
        for (const h of hTags) {
          resolved = resolveGroupIdFromNostrGroupId(h);
          if (resolved) break;
        }
        if (!resolved) {
          logger.warn('peer', 'Could not resolve group for incoming MLS event', {
            eventId: event.id,
            hTags,
          });
          return;
        }
        onMessage(event, resolved);
      }
    );
  }

  return {
    peer,
    groupId,
    nostrGroupId,
    connectionStatus,
    connectionError,
    isConnected,
    isConnecting,
    connectToPeer,
    createGroupWithPeer,
    processIncomingWelcomeEvent,
    subscribeToIncomingWelcomes,
    disconnect,
    restoreFromMdkState,
    restoreGroupStates,
    switchToGroup,
    groupStateMap,
    subscribeToGroupMessages,
    subscribeToAllGroupMessages,
    resolveGroupIdFromNostrGroupId,
    updateNostrGroupIdFromMessage,
    saveCurrentGroupState,
  };
});
