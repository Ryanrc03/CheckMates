function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer of cents.`);
}

/** Largest remainder allocation; ties follow the input order. */
export function allocateCents(total: number, weights: number[]): number[] {
  assertCents(total, "Amount");
  weights.forEach((weight) => assertCents(weight, "Weight"));
  const weightSum = weights.reduce((sum, weight) => sum + BigInt(weight), 0n);
  if (weightSum === 0n) {
    if (total === 0) return weights.map(() => 0);
    throw new Error("Cannot allocate an amount with zero weights.");
  }
  const parts = weights.map((weight, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    return { index, cents: Number(numerator / weightSum), remainder: numerator % weightSum };
  });
  let leftover = total - parts.reduce((sum, part) => sum + part.cents, 0);
  const ranked = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const part of ranked) {
    if (leftover-- <= 0) break;
    parts[part.index].cents += 1;
  }
  return parts.map((part) => part.cents);
}

