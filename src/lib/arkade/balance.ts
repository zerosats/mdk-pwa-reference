interface BalanceData {
  total?: number | bigint | string;
  available?: number | bigint | string;
  pending?: number | bigint | string;
  recoverable?: number | bigint | string;
  settled?: number | bigint | string;
  boarding?: {
    confirmed?: number;
    unconfirmed?: number;
    total?: number;
  };
}

function toBigInt(val: unknown): bigint {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(val);
  if (typeof val === 'string') return BigInt(val);
  if (typeof val === 'object' && val !== null && 'total' in val) {
    return toBigInt((val as { total: unknown }).total);
  }
  return 0n;
}

export function extractBalanceFromSDK(balanceData: BalanceData): bigint {
  if (!balanceData || typeof balanceData !== 'object') return 0n;

  const hasBoardingConfirmed =
    (balanceData.boarding?.confirmed ?? 0) > 0
    || (balanceData.boarding?.total ?? 0) > 0;
  const hasSettledOrAvailable =
    Number(balanceData.settled ?? 0) > 0
    || Number(balanceData.available ?? 0) > 0;

  if (hasBoardingConfirmed && hasSettledOrAvailable) {
    return (
      toBigInt(balanceData.available ?? 0)
      + toBigInt(balanceData.pending ?? 0)
      + toBigInt(balanceData.recoverable ?? 0)
    );
  }

  if (balanceData.total !== undefined) {
    return toBigInt(balanceData.total);
  }

  return (
    toBigInt(balanceData.available ?? 0)
    + toBigInt(balanceData.pending ?? 0)
    + toBigInt(balanceData.recoverable ?? 0)
  );
}

export function formatBalanceToString(balance: bigint | number | null | undefined): string {
  if (balance === null || balance === undefined) return '0';
  if (typeof balance === 'bigint') return balance.toString();
  if (typeof balance === 'number') return balance.toString();
  return '0';
}
