const PALETTE_SIZE = 6;
// Colors follow bill.people order so the first six friends never share one; names stay visible, so color is never the only cue.
export function personColor(index: number) { return `person-${(index % PALETTE_SIZE + PALETTE_SIZE) % PALETTE_SIZE + 1}`; }
export function personInitial(name: string) { return [...name.trim()][0]?.toUpperCase() ?? "?"; }
