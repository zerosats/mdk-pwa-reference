import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  Wallet,
  SingleKey,
  Ramps,
  ArkAddress,
} from '@arkade-os/sdk';
import type { ArkTransaction } from '@arkade-os/sdk';
import { ArkadeLightning, BoltzSwapProvider } from '@arkade-os/boltz-swap';
import {
  derivePrivateKey,
  generateMnemonic,
  validateMnemonic,
  isLegacyPrivateKey,
  extractBalanceFromSDK,
  formatBalanceToString,
  getDefaultSwapFees,
  scanHDAddresses,
  SanitizedStorageAdapter,
} from '../lib/arkade';
import * as storage from '../services/storage';

const ARK_SERVER_URL = 'https://arkade.computer';
const ESPLORA_URL = 'https://mempool.space/api';
const BOLTZ_API_URL = 'https://api.ark.boltz.exchange';

/* eslint-disable @typescript-eslint/no-explicit-any */
type WalletInstance = any;
type IdentityInstance = any;
type LightningInstance = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const useWalletStore = defineStore('wallet', () => {
  const wallet = ref<WalletInstance>(null);
  const arkadeLightning = ref<LightningInstance>(null);
  const identity = ref<IdentityInstance>(null);
  const mnemonic = ref<string | null>(null);
  const addressIndex = ref(0);
  const balance = ref(0n);
  const address = ref('');
  const boardingAddress = ref('');
  const isInitialized = ref(false);
  const initializationError = ref<string | null>(null);

  const balanceFormatted = computed(() => formatBalanceToString(balance.value));
  const isHDWallet = computed(() => !!mnemonic.value);

  async function createWalletAtIndex(
    mnemonicPhrase: string,
    index: number,
  ): Promise<{ wallet: WalletInstance; identity: IdentityInstance }> {
    const privateKeyHex = derivePrivateKey(mnemonicPhrase, index);
    const tempIdentity = SingleKey.fromHex(privateKeyHex);
    const storageAdapter = new SanitizedStorageAdapter();

    const tempWallet = await Wallet.create({
      identity: tempIdentity,
      arkServerUrl: ARK_SERVER_URL,
      esploraUrl: ESPLORA_URL,
      storage: storageAdapter,
    });

    return { wallet: tempWallet, identity: tempIdentity };
  }

  async function createLightningInstance(
    walletInstance: WalletInstance,
    identityInstance: IdentityInstance,
  ): Promise<LightningInstance> {
    const swapProvider = new BoltzSwapProvider({
      apiUrl: BOLTZ_API_URL,
      network: 'bitcoin',
    });

    const xOnlyPubKey = await identityInstance.xOnlyPublicKey();

    const identityWrapper = {
      ...identityInstance,
      xOnlyPublicKey: () => xOnlyPubKey,
      compressedPublicKey: () => identityInstance.compressedPublicKey(),
      signMessage: (msg: Uint8Array, type: string) => identityInstance.signMessage(msg, type),
      sign: (tx: unknown, indexes: number[]) => identityInstance.sign(tx, indexes),
      signerSession: () => identityInstance.signerSession(),
    };

    const walletWrapper = new Proxy(walletInstance, {
      get(target: Record<string | symbol, unknown>, prop: string | symbol) {
        if (prop === 'identity') return identityWrapper;
        const value = target[prop];
        if (typeof value === 'function') return (value as Function).bind(target);
        return value;
      },
    });

    return new ArkadeLightning({
      wallet: walletWrapper,
      swapProvider,
      timeoutConfig: { invoiceExpirySeconds: 600 },
    });
  }

  async function initialize(seedPhraseOrKey: string | null = null): Promise<string> {
    try {
      const walletState = await storage.getWalletState();
      const savedIndex = walletState?.addressIndex ?? 0;

      let privateKeyHex: string;

      if (seedPhraseOrKey && validateMnemonic(seedPhraseOrKey)) {
        mnemonic.value = seedPhraseOrKey;
        addressIndex.value = savedIndex;
        privateKeyHex = derivePrivateKey(seedPhraseOrKey, savedIndex);
      } else if (isLegacyPrivateKey(seedPhraseOrKey)) {
        privateKeyHex = seedPhraseOrKey;
        mnemonic.value = null;
        addressIndex.value = 0;
      } else {
        mnemonic.value = generateMnemonic(128);
        addressIndex.value = 0;
        privateKeyHex = derivePrivateKey(mnemonic.value, 0);
      }

      identity.value = SingleKey.fromHex(privateKeyHex);

      await storage.setWalletState({ addressIndex: addressIndex.value });

      const storageAdapter = new SanitizedStorageAdapter();

      wallet.value = await Wallet.create({
        identity: identity.value,
        arkServerUrl: ARK_SERVER_URL,
        esploraUrl: ESPLORA_URL,
        storage: storageAdapter,
      });

      arkadeLightning.value = await createLightningInstance(wallet.value, identity.value);

      try {
        await Promise.race([
          updateBalance(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Balance fetch timeout')), 10000),
          ),
        ]);
      } catch {
        balance.value = 0n;
      }

      try {
        await Promise.race([
          updateAddress(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Address fetch timeout')), 10000),
          ),
        ]);
      } catch {
        address.value = '';
      }

      try {
        boardingAddress.value = await wallet.value.getBoardingAddress();
      } catch {
        // boarding address fetch optional at init
      }

      isInitialized.value = true;
      initializationError.value = null;

      return mnemonic.value ?? 'legacy';
    } catch (error) {
      isInitialized.value = false;
      initializationError.value = (error as Error).message;
      throw error;
    }
  }

  async function updateBalance(): Promise<void> {
    if (!wallet.value) throw new Error('Wallet not initialized');

    if (!mnemonic.value) {
      const balanceData = await wallet.value.getBalance();
      balance.value = extractBalanceFromSDK(balanceData);
      return;
    }

    const currentIndex = addressIndex.value;
    const totalBalance = await scanHDAddresses({
      maxIndex: currentIndex,
      createWalletAtIndex: async (i: number) => {
        const { wallet: tempWallet } = await createWalletAtIndex(mnemonic.value!, i);
        return tempWallet;
      },
      processWallet: async (tempWallet: WalletInstance) => {
        const balanceData = await tempWallet.getBalance();
        return extractBalanceFromSDK(balanceData);
      },
      aggregator: (balances: bigint[]) => balances.reduce((sum, b) => sum + b, 0n),
    });

    balance.value = totalBalance;
  }

  async function updateAddress(): Promise<string> {
    if (!wallet.value) throw new Error('Wallet not initialized');
    const arkAddress = await wallet.value.getAddress();
    address.value = arkAddress;
    return arkAddress;
  }

  async function getBitcoinDepositAddress(): Promise<string> {
    if (!wallet.value) throw new Error('Wallet not initialized');
    const addr = await wallet.value.getBoardingAddress();
    boardingAddress.value = addr;
    return addr;
  }

  async function sendPayment(recipient: string, amount: number): Promise<string> {
    if (!wallet.value) throw new Error('Wallet not initialized');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid amount');

    const recipientAddress = recipient.trim();
    try {
      ArkAddress.decode(recipientAddress);
    } catch {
      throw new Error('Enter a valid Ark wallet address');
    }

    const currentBalance = await wallet.value.getBalance();
    if (currentBalance.total < BigInt(amount)) throw new Error('Insufficient balance');

    const txid = await wallet.value.sendBitcoin({
      address: recipientAddress,
      amount,
    });

    await updateBalance();
    return txid;
  }

  async function payBolt11Invoice(invoice: string): Promise<{
    amount: number;
    preimage: string;
    txid: string;
  }> {
    if (!arkadeLightning.value) throw new Error('Lightning not initialized');

    const paymentResult = await arkadeLightning.value.sendLightningPayment({ invoice });
    await updateBalance();

    return {
      amount: paymentResult.amount,
      preimage: paymentResult.preimage,
      txid: paymentResult.txid,
    };
  }

  async function receiveBolt11(amountSats: number, description = ''): Promise<string> {
    if (!arkadeLightning.value) throw new Error('Lightning not initialized');

    const amount = typeof amountSats === 'number' ? amountSats : parseInt(String(amountSats));
    if (amount < 400) throw new Error('Amount must be at least 400 sats for Boltz swaps');

    const result = await arkadeLightning.value.createLightningInvoice({
      amount,
      description: description || 'Arkade Lightning payment',
    });

    setTimeout(async () => {
      try {
        await arkadeLightning.value!.waitAndClaim(result.pendingSwap);
        await updateBalance();
      } catch (error) {
        console.error('Failed to claim Lightning payment:', error);
      }
    }, 0);

    return result.invoice;
  }

  async function generateNewAddress(): Promise<string> {
    if (!mnemonic.value) {
      throw new Error('Cannot generate new address: wallet is in legacy mode');
    }

    const newIndex = addressIndex.value + 1;
    addressIndex.value = newIndex;
    await storage.setWalletState({ addressIndex: newIndex });

    const privateKeyHex = derivePrivateKey(mnemonic.value, newIndex);
    identity.value = SingleKey.fromHex(privateKeyHex);

    const storageAdapter = new SanitizedStorageAdapter();
    wallet.value = await Wallet.create({
      identity: identity.value,
      arkServerUrl: ARK_SERVER_URL,
      esploraUrl: ESPLORA_URL,
      storage: storageAdapter,
    });

    await updateAddress();
    boardingAddress.value = await wallet.value.getBoardingAddress();
    return boardingAddress.value;
  }

  async function switchToAddressIndex(index: number): Promise<void> {
    if (!mnemonic.value) throw new Error('Cannot switch address: wallet is in legacy mode');
    if (index === addressIndex.value) return;

    const privateKeyHex = derivePrivateKey(mnemonic.value, index);
    identity.value = SingleKey.fromHex(privateKeyHex);

    const storageAdapter = new SanitizedStorageAdapter();
    wallet.value = await Wallet.create({
      identity: identity.value,
      arkServerUrl: ARK_SERVER_URL,
      esploraUrl: ESPLORA_URL,
      storage: storageAdapter,
    });

    addressIndex.value = index;
    await updateAddress();
    boardingAddress.value = await wallet.value.getBoardingAddress();

    arkadeLightning.value = await createLightningInstance(wallet.value, identity.value);
  }

  async function onboardBoardingUtxos(): Promise<string> {
    if (!wallet.value) throw new Error('Wallet not initialized');
    const ramps = new Ramps(wallet.value);
    const feeInfo = await wallet.value.getFeeInfo();
    const txid = await ramps.onboard(feeInfo);
    await updateBalance();
    return txid;
  }

  async function checkAndAutoOnboard(): Promise<{
    hasConfirmed: boolean;
    onboarded: boolean;
    pendingAmount?: number;
    error?: string;
  }> {
    try {
      if (!wallet.value) return { hasConfirmed: false, onboarded: false };

      if (mnemonic.value) {
        let totalConfirmed = 0;
        let totalUnconfirmed = 0;
        const currentIndex = addressIndex.value;
        const originalIndex = currentIndex;

        for (let i = 0; i <= currentIndex; i++) {
          try {
            const { wallet: tempWallet } = await createWalletAtIndex(mnemonic.value, i);
            const balanceData = await tempWallet.getBalance();

            const confirmed = balanceData.boarding?.confirmed || 0;
            const unconfirmed = balanceData.boarding?.unconfirmed || 0;

            if (confirmed > 0) {
              await switchToAddressIndex(i);
              await onboardBoardingUtxos();
              totalConfirmed += confirmed;
            }
            totalUnconfirmed += unconfirmed;
          } catch (e) {
            console.warn(`Failed to check boarding at index ${i}:`, (e as Error).message);
          }
        }

        if (addressIndex.value !== originalIndex) {
          await switchToAddressIndex(originalIndex);
        }

        return {
          hasConfirmed: totalConfirmed > 0,
          onboarded: totalConfirmed > 0,
          pendingAmount: totalUnconfirmed,
        };
      }

      const balanceData = await wallet.value.getBalance();
      const confirmedBoarding = balanceData.boarding?.confirmed || 0;
      const unconfirmedBoarding = balanceData.boarding?.unconfirmed || 0;

      if (confirmedBoarding > 0) {
        await onboardBoardingUtxos();
        return { hasConfirmed: true, onboarded: true };
      }

      return {
        hasConfirmed: false,
        onboarded: false,
        pendingAmount: unconfirmedBoarding,
      };
    } catch (error) {
      return { hasConfirmed: false, onboarded: false, error: (error as Error).message };
    }
  }

  async function getUTXOs(): Promise<unknown[]> {
    if (!wallet.value) throw new Error('Wallet not initialized');

    if (!mnemonic.value) {
      return await wallet.value.getVtxos();
    }

    const currentIndex = addressIndex.value;
    return await scanHDAddresses({
      maxIndex: currentIndex,
      createWalletAtIndex: async (i: number) => {
        const { wallet: tempWallet } = await createWalletAtIndex(mnemonic.value!, i);
        return tempWallet;
      },
      processWallet: async (tempWallet: WalletInstance, i: number) => {
        const utxos = await tempWallet.getVtxos();
        utxos.forEach((utxo: Record<string, unknown>) => {
          utxo.addressIndex = i;
        });
        return utxos;
      },
    });
  }

  async function getTransactionHistory(): Promise<ArkTransaction[]> {
    if (!wallet.value) throw new Error('Wallet not initialized');

    if (!mnemonic.value) {
      const history = await wallet.value.getTransactionHistory();
      return [...history].sort((a, b) => b.createdAt - a.createdAt);
    }

    const currentIndex = addressIndex.value;
    const mergedHistory = await scanHDAddresses({
      maxIndex: currentIndex,
      createWalletAtIndex: async (i: number) => {
        const { wallet: tempWallet } = await createWalletAtIndex(mnemonic.value!, i);
        return tempWallet;
      },
      processWallet: async (tempWallet: WalletInstance) => {
        const txs = await tempWallet.getTransactionHistory();
        return txs as ArkTransaction[];
      },
      aggregator: (histories: ArkTransaction[][]) => histories.flat(),
    });

    const deduped = new Map<string, ArkTransaction>();
    for (const tx of mergedHistory) {
      const key = [
        tx.key?.arkTxid ?? '',
        tx.key?.commitmentTxid ?? '',
        tx.key?.boardingTxid ?? '',
      ].join(':') || `${tx.type}:${tx.amount}:${tx.createdAt}`;

      const previous = deduped.get(key);
      if (!previous || tx.createdAt > previous.createdAt) {
        deduped.set(key, tx);
      }
    }

    return Array.from(deduped.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async function getSwapFees(): Promise<ReturnType<typeof getDefaultSwapFees>> {
    try {
      if (!arkadeLightning.value) throw new Error('Lightning not initialized');
      return await arkadeLightning.value.getFees();
    } catch {
      return getDefaultSwapFees();
    }
  }

  function resetWallet(): void {
    wallet.value = null;
    arkadeLightning.value = null;
    identity.value = null;
    mnemonic.value = null;
    addressIndex.value = 0;
    balance.value = 0n;
    address.value = '';
    boardingAddress.value = '';
    isInitialized.value = false;
    initializationError.value = null;
  }

  return {
    wallet: computed(() => wallet.value),
    mnemonic: computed(() => mnemonic.value),
    addressIndex: computed(() => addressIndex.value),
    isHDWallet,
    balance: computed(() => balance.value),
    balanceFormatted,
    address: computed(() => address.value),
    boardingAddress: computed(() => boardingAddress.value),
    isInitialized: computed(() => isInitialized.value),
    initializationError: computed(() => initializationError.value),

    initialize,
    resetWallet,
    generateNewAddress,
    updateBalance,
    updateAddress,
    getBitcoinDepositAddress,
    sendPayment,
    payBolt11Invoice,
    receiveBolt11,
    switchToAddressIndex,
    onboardBoardingUtxos,
    checkAndAutoOnboard,
    getUTXOs,
    getTransactionHistory,
    getSwapFees,
  };
});
