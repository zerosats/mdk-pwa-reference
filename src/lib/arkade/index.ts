export {
  derivePrivateKey,
  generateMnemonic,
  validateMnemonic,
  isLegacyPrivateKey,
  DERIVATION_PATH,
} from './derivation';

export {
  extractBalanceFromSDK,
  formatBalanceToString,
} from './balance';

export {
  calculateSubmarineSwapFee,
  getDefaultSwapFees,
} from './fees';
export type { SwapFees } from './fees';

export { scanHDAddresses } from './hdScanner';
export type { ScanOptions } from './hdScanner';

export { SanitizedStorageAdapter } from './storageAdapter';
