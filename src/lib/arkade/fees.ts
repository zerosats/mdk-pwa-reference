export interface SwapFees {
  submarine: {
    percentage: number;
    minerFees: number;
  };
  reverse: {
    percentage: number;
    minerFees: { claim: number; lockup: number };
  };
}

export function calculateSubmarineSwapFee(
  amount: number,
  fees?: { submarine?: { percentage: number; minerFees: number } },
): number {
  if (!fees?.submarine) {
    return Math.max(500, Math.ceil(amount * 0.05));
  }
  const { percentage, minerFees } = fees.submarine;
  return Math.ceil((amount * percentage) / 100 + minerFees);
}

export function getDefaultSwapFees(): SwapFees {
  return {
    submarine: {
      percentage: 0.5,
      minerFees: 500,
    },
    reverse: {
      percentage: 0.5,
      minerFees: { claim: 250, lockup: 250 },
    },
  };
}
