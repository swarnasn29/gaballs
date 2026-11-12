'use client';

// The connect dialog: "Continue with Google / email" (Privy, no wallet needed) first, crypto wallets below.
// WelcomeKitDialog runs once for a new Google/email player: it asks /api/welcome for the welcome kit (testnet NEAR for
// gas + storage registration on mock USDT and GABALLS) and shows the transactions.

import { useEffect, useRef, useState } from 'react';

import { USDT_ID, txUrl } from '@/config';
import { addNearNetwork } from '@/lib/evm-network';
import { shortAccount } from '@/lib/format';
import { view } from '@/near/rpc';
import { Button, cx } from './ui';

function Modal({ children, onBackdrop, labelledBy }: { children: React.ReactNode; onBackdrop?: () => void; labelledBy: string }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBackdrop?.();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onBackdrop]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-10 sm:items-center" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="fixed inset-0 bg-[rgba(43,24,64,0.65)]" onClick={onBackdrop} />
      <div className="relative w-full max-w-md rounded-[2rem] bg-white p-6 text-ink shadow-chunky ring-4 ring-white" aria-live="polite">
        {children}
      </div>
    </div>
  );
}

export function ConnectDialog({
  googleEnabled,
  onClose,
  onGoogle,
  onWallet,
  onEthereum,
}: {
  googleEnabled: boolean;
  onClose: () => void;
  onGoogle: () => void;
  onWallet: () => void;
  onEthereum: () => void;
}) {
  const [eth, setEth] = useState<null | { s: 'step1' } | { s: 'adding' } | { s: 'step2' } | { s: 'error'; message: string }>(null);

  const addNetwork = async () => {
    setEth({ s: 'adding' });
    try {
      const r = await addNearNetwork();
      if (r === 'no-wallet') return setEth({ s: 'error', message: 'MetaMask was not found in this browser. Install it, then try again.' });
      setEth({ s: 'step2' });
    } catch (e) {
      const code = (e as { code?: number })?.code;
      setEth({ s: 'error', message: code === 4001 ? 'You declined adding the network. It is needed to sign in.' : e instanceof Error ? e.message : 'MetaMask could not add the network.' });
    }
  };

  if (eth)
    return (
      <Modal onBackdrop={onClose} labelledBy="eth-title">
        <h2 id="eth-title" className="text-center text-2xl font-bold text-grape">
          MetaMask sign-in
        </h2>
        <ol className="mt-4 space-y-3 text-sm">
          <li className={cx('rounded-2xl p-3', eth.s === 'step2' ? 'bg-blush' : 'border-2 border-lilac')}>
            <p className="font-bold">Step 1 of 2: add the NEAR network to MetaMask</p>
            <p className="mt-1 text-xs text-plum">
              MetaMask asks you to add <b>NEAR Protocol Testnet</b> (chain 398, RPC eth-rpc.testnet.near.org). It is a test
              network; nothing is spent.
            </p>
            {eth.s === 'step2' ? (
              <p className="mt-2 text-xs font-semibold text-grape" data-testid="eth-step1-done">
                Done
              </p>
            ) : (
              <Button className="mt-2 w-full" onClick={() => void addNetwork()} disabled={eth.s === 'adding'} data-testid="eth-add-network">
                {eth.s === 'adding' ? 'Check MetaMask…' : 'Add NEAR network'}
              </Button>
            )}
            {eth.s === 'error' && (
              <p className="mt-2 text-xs text-red-700" role="alert">
                {eth.message}
              </p>
            )}
          </li>
          <li className={cx('rounded-2xl p-3', eth.s === 'step2' ? 'border-2 border-lilac' : 'opacity-50')}>
            <p className="font-bold">Step 2 of 2: sign in</p>
            <p className="mt-1 text-xs text-plum">
              A sign-in window opens: pick MetaMask, then approve <b>Connect</b> and <b>Set up your NEAR account</b> (free, paid
              by NEAR&apos;s relayer). After that, each pack is one MetaMask approval.
            </p>
            <Button className="mt-2 w-full" onClick={onEthereum} disabled={eth.s !== 'step2'} data-testid="eth-sign-in">
              Sign in with MetaMask
            </Button>
          </li>
        </ol>
        <Button variant="ghost" className="mt-3 w-full" onClick={onClose}>
          Cancel
        </Button>
      </Modal>
    );

  return (
    <Modal onBackdrop={onClose} labelledBy="connect-title">
      <h2 id="connect-title" className="text-center text-3xl font-bold text-grape">
        Start playing
      </h2>
      <p className="mt-1 text-center text-sm text-plum">
        Testnet only. Mock USDT is not real money. However you sign in, you can top up from any chain.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        {googleEnabled && (
          <>
            <Button onClick={onGoogle} data-testid="connect-google">
              Continue with Google / email
            </Button>
            <p className="-mt-1 text-center text-xs text-plum">
              No wallet needed. We create your NEAR account and send a free welcome kit (testnet NEAR for gas).
            </p>
            <div className="my-1 flex items-center gap-3 text-xs font-bold uppercase text-plum">
              <span className="h-px flex-1 bg-lilac" />
              or
              <span className="h-px flex-1 bg-lilac" />
            </div>
          </>
        )}
        <Button variant="secondary" onClick={() => setEth({ s: 'step1' })} data-testid="connect-ethereum">
          MetaMask or another 0x wallet
        </Button>
        <p className="-mt-1 text-center text-xs text-plum">
          Sign in with your 0x address (MetaMask, Rabby and other browser wallets): it becomes your NEAR account, and we
          send a welcome kit.
        </p>
        <Button variant={googleEnabled ? 'secondary' : 'primary'} onClick={onWallet} data-testid="connect-wallet">
          NEAR wallet
        </Button>
        <p className="-mt-1 text-center text-xs text-plum">MyNearWallet, Meteor, HOT, Intear and other NEAR wallets.</p>
      </div>
      <Button variant="ghost" className="mt-3 w-full" onClick={onClose}>
        Cancel
      </Button>
    </Modal>
  );
}

interface KitTx {
  what: string;
  hash: string;
}

type KitState = { s: 'checking' } | { s: 'sending' } | { s: 'sent'; txs: KitTx[] } | { s: 'error'; message: string } | { s: 'none' };

/** Shown once for a new Google/email account: sends and shows the welcome kit. Renders nothing for known accounts. */
export function WelcomeKitDialog({ accountId }: { accountId: string }) {
  const [state, setState] = useState<KitState>({ s: 'checking' });
  const started = useRef('');

  useEffect(() => {
    if (started.current === accountId) return;
    started.current = accountId;
    void (async () => {
      try {
        const registered = await view<object | null>(USDT_ID, 'storage_balance_of', { account_id: accountId });
        if (registered) return setState({ s: 'none' });
        setState({ s: 'sending' });
        const res = await fetch('/api/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId }),
        });
        const body = (await res.json()) as { txs?: KitTx[]; error?: string };
        if (res.status === 409) return setState({ s: 'none' });
        if (!res.ok) return setState({ s: 'error', message: body.error ?? 'The welcome kit failed.' });
        setState({ s: 'sent', txs: body.txs ?? [] });
      } catch (e) {
        setState({ s: 'error', message: e instanceof Error ? e.message : 'The welcome kit failed.' });
      }
    })();
  }, [accountId]);

  if (state.s === 'checking' || state.s === 'none') return null;
  const close = state.s === 'sending' ? undefined : () => setState({ s: 'none' });

  return (
    <Modal onBackdrop={close} labelledBy="kit-title">
      {state.s === 'sending' && (
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-lilac border-t-grape" aria-hidden />
          <h2 id="kit-title" className="mt-3 text-2xl font-bold text-grape">
            Setting up your account
          </h2>
          <p className="mt-1 text-sm">
            Your NEAR account is <b>{shortAccount(accountId)}</b>. Sending your welcome kit: testnet NEAR for gas and your
            token registrations. About 10 seconds.
          </p>
        </div>
      )}
      {state.s === 'sent' && (
        <div className="text-center" data-testid="welcome-kit-done">
          <h2 id="kit-title" className="text-3xl font-bold text-grape">
            You&apos;re in!
          </h2>
          <p className="mt-1 text-sm">
            Account <b>{shortAccount(accountId)}</b> is ready. Next: get free mock USDT from the faucet and open a pack.
          </p>
          <ul className="mt-3 space-y-0.5 rounded-2xl bg-blush p-3 text-left text-xs">
            {state.txs.map((t) => (
              <li key={t.hash}>
                Welcome kit: {t.what} ·{' '}
                <a className="font-semibold text-grape underline" href={txUrl(t.hash)} target="_blank" rel="noreferrer">
                  tx
                </a>
              </li>
            ))}
          </ul>
          <Button className="mt-4 w-full" onClick={close}>
            Start playing
          </Button>
        </div>
      )}
      {state.s === 'error' && (
        <div className="text-center">
          <h2 id="kit-title" className="text-2xl font-bold text-grape">
            No welcome kit right now
          </h2>
          <p className="mt-2 text-sm" role="alert">
            {state.message}
          </p>
          <p className="mt-2 text-xs text-plum">
            Your account {shortAccount(accountId)} needs a little testnet NEAR for gas before it can play.
          </p>
          <Button className="mt-4 w-full" onClick={close}>
            OK
          </Button>
        </div>
      )}
    </Modal>
  );
}
