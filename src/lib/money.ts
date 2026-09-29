import type { CurrencyCode } from "@/types/bill";

/** Two-decimal currencies only: every amount stays an integer number of minor units. */
export const CURRENCIES: Record<CurrencyCode, { symbol: string; label: string }> = {
  USD: { symbol: "$", label: "US dollar" },
  EUR: { symbol: "€", label: "Euro" },
  GBP: { symbol: "£", label: "British pound" },
  CNY: { symbol: "¥", label: "Chinese yuan" },
  CAD: { symbol: "CA$", label: "Canadian dollar" },
  AUD: { symbol: "A$", label: "Australian dollar" },
  HKD: { symbol: "HK$", label: "Hong Kong dollar" },
  SGD: { symbol: "S$", label: "Singapore dollar" },
  INR: { symbol: "₹", label: "Indian rupee" },
  MXN: { symbol: "MX$", label: "Mexican peso" },
  CHF: { symbol: "CHF ", label: "Swiss franc" },
};
export const DEFAULT_CURRENCY: CurrencyCode = "USD";
export const isCurrency = (value: unknown): value is CurrencyCode => typeof value === "string" && Object.hasOwn(CURRENCIES, value);

export function parseMoney(value: string): number | null {
  const match = value.trim().match(/^(?:[A-Z]{0,3}\$|€|£|¥|₹|CHF)?\s*(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatMoney(cents: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  if (!Number.isSafeInteger(cents)) return "—";
  const absolute = Math.abs(cents);
  const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(BigInt(absolute) / 100n);
  return `${cents < 0 ? "-" : ""}${CURRENCIES[currency].symbol}${whole}.${String(absolute % 100).padStart(2, "0")}`;
}

export function moneyInput(cents: number): string {
  if (!Number.isSafeInteger(cents)) return "";
  const absolute = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${BigInt(absolute) / 100n}.${String(absolute % 100).padStart(2, "0")}`;
}

/** Parses "8.25" or "8.25%" into thousandths of a percent (8250); 0–100% with up to three decimals. */
export function parsePercent(value: string): number | null {
  const match = value.trim().match(/^(\d{1,3})(?:\.(\d{1,3}))?\s*%?$/);
  if (!match) return null;
  const milli = Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0"));
  return milli <= 100_000 ? milli : null;
}

/** Applies a rate in thousandths of a percent to an amount, rounding half a cent up. */
export function percentOf(cents: number, milliPercent: number): number {
  if (!Number.isSafeInteger(cents) || cents < 0 || !Number.isSafeInteger(milliPercent) || milliPercent < 0) return NaN;
  return Number((BigInt(cents) * BigInt(milliPercent) * 2n + 100_000n) / 200_000n);
}

/** Line total for a quantity of one unit price, or null when either input is invalid or unsafe. */
export function lineTotal(unitCents: number | null, quantity: number | null): number | null {
  if (unitCents === null || quantity === null) return null;
  const total = unitCents * quantity;
  return Number.isSafeInteger(total) ? total : null;
}

export const MAX_QUANTITY = 99;
export function parseQuantity(value: string): number | null {
  const match = value.trim().match(/^\d{1,2}$/);
  if (!match) return null;
  const quantity = Number(match[0]);
  return quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null;
}
