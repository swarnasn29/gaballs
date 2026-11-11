// Number formatting. All on-chain amounts are integer strings; we convert with BigInt and only use floats for display.

const USDT_DECIMALS = 6n;
const TOKEN_DECIMALS = 18n;

function scaled(value: string | bigint, decimals: bigint): number {
  const v = BigInt(value);
  const base = 10n ** decimals;
  return Number(v / base) + Number(v % base) / Number(base);
}

export const usdtNumber = (units: string | bigint) => scaled(units, USDT_DECIMALS);
export const tokenNumber = (wad: string | bigint) => scaled(wad, TOKEN_DECIMALS);
export const nearNumber = (yocto: string | bigint) => scaled(yocto, 24n);

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const fmtUsdt = (units: string | bigint) => `$${plain.format(usdtNumber(units))}`;
export const fmtUsdtCompact = (units: string | bigint) => `$${compact.format(usdtNumber(units))}`;
export const fmtTokens = (wad: string | bigint) => compact.format(tokenNumber(wad));
export const fmtNear = (yocto: string | bigint) => `${nearNumber(yocto).toFixed(2)} NEAR`;
export const fmtMultiplier = (bps: number) => `${(bps / 10_000).toLocaleString('en-US', { maximumFractionDigits: 4 })}×`;
export const fmtPercent = (bps: number) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

/** price_usdt_wad (USDT per token × 1e18) → "$0.0000045" */
export function fmtPrice(wad: string | bigint): string {
  const p = tokenNumber(wad);
  return `$${p < 0.01 ? p.toPrecision(3) : plain.format(p)}`;
}

/** USDT value of `tokens` (18 decimals) at `priceWad` (USDT × 1e18 per whole token). */
export function tokensToUsdt(tokens: string | bigint, priceWad: string | bigint): number {
  return tokenNumber(tokens) * tokenNumber(priceWad);
}

export const shortAccount = (id: string) => (id.length > 22 ? `${id.slice(0, 10)}…${id.slice(-10)}` : id);
