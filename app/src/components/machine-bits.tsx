import Link from 'next/link';

import { art, tierColor } from '@/art/manifest';
import { FACTORY_ID } from '@/config';
import { fmtMultiplier, fmtPercent, fmtPrice, fmtTokens, fmtUsdtCompact, tokenNumber } from '@/lib/format';
import type { MachineInfo, MachineView, OddsView, TierName } from '@/near/types';
import { Card, Stat } from './ui';

export function TierDot({ tier, size = 20 }: { tier: TierName; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full ring-2 ring-white"
      style={{ width: size, height: size, background: tierColor[tier] }}
    />
  );
}

/** The fixed odds table, read from get_odds(). Always shown next to the buy button. */
export function OddsTable({ odds, machineId }: { odds: OddsView; machineId: string }) {
  return (
    <div>
      <table className="w-full text-left text-sm">
        <caption className="mb-2 text-left font-display text-lg font-semibold text-ink">
          Odds (fixed at launch)
        </caption>
        <thead>
          <tr className="text-xs uppercase tracking-wide text-plum">
            <th className="py-1 font-bold">Tier</th>
            <th className="py-1 text-right font-bold">Chance</th>
            <th className="py-1 text-right font-bold">You get</th>
          </tr>
        </thead>
        <tbody>
          {odds.tiers.map((t) => (
            <tr key={t.name} className="border-t border-lilac">
              <td className="flex items-center gap-2 py-1.5 font-semibold">
                <TierDot tier={t.name} size={16} />
                {t.name}
              </td>
              <td className="py-1.5 text-right tabular-nums">{fmtPercent(t.chance_bps)}</td>
              <td className="py-1.5 text-right font-bold tabular-nums">{fmtMultiplier(t.multiplier_bps)} tokens</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink">
        Expected: {fmtMultiplier(odds.expected_multiplier_bps)} of the tokens a pack buys.{' '}
        <Link className="font-semibold text-grape underline" href={`/raw?contract=${machineId}&method=get_odds&args={}`}>
          source: get_odds()
        </Link>
      </p>
    </div>
  );
}

export function RiskNotice() {
  return (
    <p role="note" className="rounded-2xl border-2 border-warn/40 bg-[#fff6dd] p-3 text-sm text-ink">
      <strong className="font-bold">Risk notice:</strong> testnet only, mock USDT has no value. On average a pack pays
      back 0.955× the tokens it buys; flipping straight back returns about 94% of the USDT. Memecoin prices move both
      ways. Early big winners may have to wait to sell.
    </p>
  );
}

export function vaultHealth(m: MachineView) {
  const pct = Math.round((tokenNumber(m.vault) / tokenNumber(m.config.vault_seed)) * 100);
  return { pct, label: pct >= 80 ? 'Healthy' : pct >= 40 ? 'OK' : 'Low' };
}

/** Home-screen card: market cap, packs opened, best multiplier, price. */
export function MachineCard({ info, view }: { info: MachineInfo; view: MachineView | null }) {
  const id = info.account_id;
  return (
    <Card className="flex flex-col gap-4">
      <Link href={`/machine/${id}`} className="flex items-center gap-4 rounded-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art.characters.mascot} alt="" width={56} height={70} className="shrink-0" />
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-grape">{info.name}</h2>
          <p className="truncate text-sm font-semibold text-plum">
            ${info.symbol} · {id}
          </p>
        </div>
      </Link>
      {view ? (
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Market cap" value={fmtUsdtCompact(view.market_cap_usdt)} source={{ contract: id, method: 'get_machine' }} />
          <Stat label="Packs opened" value={view.packs_opened.toLocaleString('en-US')} source={{ contract: id, method: 'get_machine' }} />
          <Stat
            label="Best hit"
            value={view.best_multiplier_bps ? fmtMultiplier(view.best_multiplier_bps) : '—'}
            source={{ contract: id, method: 'get_machine' }}
          />
          <Stat label="Price" value={fmtPrice(view.price_usdt_wad)} source={{ contract: id, method: 'get_machine' }} />
        </dl>
      ) : (
        <p className="text-sm text-bad">Could not load this machine.</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-plum">
          Vault {view ? fmtTokens(view.vault) : '—'} · launched via{' '}
          <Link className="underline" href={`/raw?contract=${FACTORY_ID}&method=get_machines&args={}`}>
            factory
          </Link>
        </span>
        <Link
          href={`/machine/${id}`}
          className="rounded-full bg-grape px-5 py-2 font-display text-base font-semibold text-white shadow-chunky-ink"
        >
          Play
        </Link>
      </div>
    </Card>
  );
}
