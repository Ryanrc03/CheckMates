export function parseMoney(value: string): number | null {
  const match = value.trim().match(/^\$?\s*(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents)) return "—";
  const absolute = Math.abs(cents);
  const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(BigInt(absolute) / 100n);
  return `${cents < 0 ? "-" : ""}$${whole}.${String(absolute % 100).padStart(2, "0")}`;
}

export function moneyInput(cents: number): string {
  if (!Number.isSafeInteger(cents)) return "";
  const absolute = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${BigInt(absolute) / 100n}.${String(absolute % 100).padStart(2, "0")}`;
}
