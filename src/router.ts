import { createRouter, createWebHistory } from 'vue-router';
import { ref } from 'vue';
import { useSettingsStore } from './stores/settings';

const routes = [
  {
    path: '/ai',
    redirect: '/',
  },
  {
    path: '/',
    name: 'chats',
    component: () => import('./views/ChatsListView.vue'),
    meta: { depth: 0 },
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('./views/OnboardingView.vue'),
    meta: { depth: 0 },
  },
  {
    path: '/connect',
    name: 'connect',
    component: () => import('./views/NewChatView.vue'),
    meta: { depth: 1 },
  },
  {
    path: '/chat/:groupId',
    name: 'chat',
    component: () => import('./views/ChatView.vue'),
    meta: { depth: 1 },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('./views/SettingsView.vue'),
    meta: { depth: 0 },
  },
  {
    path: '/wallet',
    name: 'wallet',
    component: () => import('./views/WalletView.vue'),
    meta: { depth: 0 },
  },
  {
    path: '/wallet/deposit',
    name: 'wallet-deposit',
    component: () => import('./views/DepositView.vue'),
    meta: { depth: 2 },
  },
  {
    path: '/wallet/withdraw',
    name: 'wallet-withdraw',
    component: () => import('./views/WithdrawView.vue'),
    meta: { depth: 2 },
  },
  {
    path: '/my-card',
    name: 'my-card',
    component: () => import('./views/MyCardView.vue'),
    meta: { depth: 1 },
  },
  {
    path: '/chats',
    redirect: '/',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export const transitionName = ref('none');

let isFirstNavigation = true;

router.beforeEach(async (to, from) => {
  const settingsStore = useSettingsStore();

  if (!settingsStore.settingsLoaded) {
    await settingsStore.loadSettings();
  }

  if (
    !settingsStore.hasKeys
    && to.name !== 'onboarding'
  ) {
    return { name: 'onboarding' };
  }

  if (settingsStore.hasKeys && to.name === 'onboarding') {
    return { name: 'chats' };
  }

  if (isFirstNavigation || !from.name) {
    transitionName.value = 'none';
    isFirstNavigation = false;
    return;
  }

  const toDepth = (to.meta.depth as number) ?? 0;
  const fromDepth = (from.meta.depth as number) ?? 0;

  if (toDepth > fromDepth) {
    transitionName.value = 'slide-forward';
  } else if (toDepth < fromDepth) {
    transitionName.value = 'slide-back';
  } else {
    transitionName.value = 'crossfade';
  }
});

export default router;
