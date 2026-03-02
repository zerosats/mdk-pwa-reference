export interface ScanOptions<TWallet, TResult> {
  maxIndex: number;
  createWalletAtIndex: (index: number) => Promise<TWallet>;
  processWallet: (wallet: TWallet, index: number) => Promise<TResult>;
  aggregator?: (results: TResult[]) => TResult;
}

export async function scanHDAddresses<TWallet, TResult>(
  options: ScanOptions<TWallet, TResult>,
): Promise<TResult> {
  const { maxIndex, createWalletAtIndex, processWallet, aggregator } = options;
  const results: TResult[] = [];

  for (let i = 0; i <= maxIndex; i++) {
    try {
      const wallet = await createWalletAtIndex(i);
      const data = await processWallet(wallet, i);
      if (data !== null && data !== undefined) {
        results.push(data);
      }
    } catch (error) {
      console.warn(`Error scanning address index ${i}:`, (error as Error).message);
    }
  }

  if (aggregator) {
    return aggregator(results);
  }
  return results as unknown as TResult;
}
