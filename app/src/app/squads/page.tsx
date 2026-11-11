'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';

import { Button, Card } from '@/components/ui';
import { FEATURED_SQUAD, SPUTNIK_FACTORY, SQUAD_CREATE_NEAR, accountUrl } from '@/config';
import { rememberSquad, rememberedSquads } from '@/lib/pull-tracker';
import { useGaballsActions } from '@/near/actions';
import { isValidSquadName, squadIdFor } from '@/near/sputnik';

const subscribe = () => () => undefined;

function friendly(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|cancel|denied|closed/i.test(m)) return 'You cancelled in the wallet; no NEAR was spent.';
  if (/already exists|ERR_ACCOUNT_EXISTS/i.test(m)) return 'A DAO with that name already exists. Pick another name.';
  return m;
}

export default function Squads() {
  const router = useRouter();
  const { account, createSquad } = useGaballsActions();
  // Remembered squads live in this browser only (read after hydration).
  const remembered = useSyncExternalStore(subscribe, () => JSON.stringify(rememberedSquads()), () => '[]');
  const mine: string[] = JSON.parse(remembered);
  const [openName, setOpenName] = useState('');

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  // null until edited: then it starts from the connected account.
  const [membersEdit, setMembersText] = useState<string | null>(null);
  const membersText = membersEdit ?? account ?? '';
  // null = automatic: a majority of the members (2 of 3, 3 of 4...).
  const [thresholdPick, setThreshold] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = [...new Set(membersText.split(/[\s,]+/).map((m) => m.trim().toLowerCase()).filter(Boolean))];
  const badMember = members.find((m) => !/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(m) || m.length < 2);
  const nameOk = isValidSquadName(name);
  const n = Math.max(1, members.length);
  const threshold = Math.min(thresholdPick ?? Math.floor(n / 2) + 1, n);
  const thresholdOk = threshold >= 1 && threshold <= n;
  const canCreate = !!account && nameOk && members.length >= 1 && !badMember && thresholdOk && title.trim().length > 0;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const { dao } = await createSquad(name, members, threshold, title.trim());
      rememberSquad(dao);
      router.push(`/squads/${dao}`);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  function open(e: React.FormEvent) {
    e.preventDefault();
    const raw = openName.trim().toLowerCase();
    if (!raw) return;
    const dao = raw.includes('.') ? raw : squadIdFor(raw);
    rememberSquad(dao);
    router.push(`/squads/${dao}`);
  }

  const squads = [FEATURED_SQUAD, ...mine.filter((d) => d !== FEATURED_SQUAD)];

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-3xl">
        <h1 className="text-4xl font-bold text-grape">Squads</h1>
        <p className="mt-2 text-lg">
          Gacha with friends. A squad is a shared treasury: members chip in USDT, vote to open packs together, and split
          the prize or sell it back. Two of three (or whatever you choose) must approve before anything moves.
        </p>
        <p className="mt-2 text-sm text-plum">
          Built on Sputnik DAO ({SPUTNIK_FACTORY}), no custom multisig: every squad is a standard DAO, and every action is
          a proposal you can inspect on the explorer.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <Card className="flex flex-col gap-4 self-start">
          <h2 className="text-2xl font-bold">Open a squad</h2>
          <ul className="flex flex-col gap-2">
            {squads.map((dao) => (
              <li key={dao}>
                <Link
                  href={`/squads/${dao}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-blush px-4 py-3 font-semibold text-grape hover:bg-white hover:ring-2 hover:ring-lilac"
                >
                  <span className="min-w-0 truncate">{dao}</span>
                  <span className="shrink-0 text-sm text-plum">{dao === FEATURED_SQUAD ? 'Demo squad' : 'Opened here'} →</span>
                </Link>
              </li>
            ))}
          </ul>
          <form onSubmit={open} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="open-squad">
              Squad name or account
            </label>
            <input
              id="open-squad"
              value={openName}
              onChange={(e) => setOpenName(e.target.value)}
              placeholder={`name or name.${SPUTNIK_FACTORY}`}
              className="min-w-0 flex-1 rounded-2xl border-2 border-lilac bg-white px-4 py-2"
            />
            <Button type="submit" variant="secondary" className="min-h-11 py-2 text-base">
              Open
            </Button>
          </form>
        </Card>

        <Card>
          <form onSubmit={create} className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold">Create a squad</h2>
            <div className="rounded-2xl bg-blush p-4 ring-4 ring-grape">
              <p className="text-xs font-bold uppercase tracking-wide text-plum">Cost</p>
              <p className="font-display text-2xl font-bold">{SQUAD_CREATE_NEAR} NEAR</p>
              <p className="text-sm">
                Paid to the Sputnik factory to create the DAO account and its storage (the amount the NEAR docs give), plus
                about 0.02 NEAR so the squad can hold USDT and prize tokens. Each proposal later takes a 0.1 NEAR bond,
                returned when it passes.
              </p>
            </div>
            <label className="flex flex-col gap-1 font-bold">
              Squad name
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={48}
                placeholder="Friday Gumball Club"
                className="rounded-2xl border-2 border-lilac bg-white px-4 py-3 font-normal"
              />
            </label>
            <label className="flex flex-col gap-1 font-bold">
              Account name (lowercase letters, digits, dashes)
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                aria-invalid={name !== '' && !nameOk}
                placeholder="friday-club"
                className="rounded-2xl border-2 border-lilac bg-white px-4 py-3 font-normal"
              />
              <span className="break-all text-sm font-normal text-plum">Account: {name ? squadIdFor(name) : '—'}</span>
            </label>
            <label className="flex flex-col gap-1 font-bold">
              Members (one NEAR account per line or comma)
              <textarea
                rows={3}
                value={membersText}
                onChange={(e) => setMembersText(e.target.value)}
                aria-invalid={!!badMember}
                className="rounded-2xl border-2 border-lilac bg-white px-4 py-3 font-normal"
              />
              {badMember && <span className="text-sm font-semibold text-bad">“{badMember}” is not a NEAR account id.</span>}
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="font-bold">Approvals needed</legend>
              <div className="flex flex-wrap items-center gap-2">
                {Array.from({ length: Math.max(1, members.length) }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={threshold === n}
                    onClick={() => setThreshold(n)}
                    className={
                      threshold === n
                        ? 'h-11 w-11 rounded-full bg-grape font-display text-lg font-semibold text-white'
                        : 'h-11 w-11 rounded-full bg-blush font-display text-lg font-semibold text-grape ring-2 ring-lilac'
                    }
                  >
                    {n}
                  </button>
                ))}
                <span className="font-semibold">
                  of {Math.max(1, members.length)} member{members.length === 1 ? '' : 's'}
                </span>
              </div>
            </fieldset>
            <Button type="submit" disabled={!canCreate || busy}>
              {!account ? 'Connect a wallet to create' : busy ? 'Creating…' : `Create squad for ${SQUAD_CREATE_NEAR} NEAR`}
            </Button>
            {error && <p className="text-sm font-semibold text-bad">{error}</p>}
            <p className="text-xs text-plum">
              The squad is a Sputnik DAO at <a className="underline" href={accountUrl(SPUTNIK_FACTORY)} target="_blank" rel="noreferrer">{SPUTNIK_FACTORY}</a>:
              members are its council, only members can propose.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
