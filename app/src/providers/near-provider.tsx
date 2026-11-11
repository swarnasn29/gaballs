'use client';

// Wallet connection via @hot-labs/near-connect (the connector the NEAR `near-dapp` agent skill and the official
// create-near-app Next.js template use). The library is imported lazily in the browser so pages render on the
// server without it. Views do not need a wallet and go through src/near/rpc.ts.

import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { EventMap, NearConnector, NearWalletBase } from '@hot-labs/near-connect';

import { DevSignerBadge, devSignAndSend, devSignerAccount } from 'gaballs-dev-signer';

import { NETWORK, RPC_URL } from '@/config';
import type { Tx } from '@/near/contracts';
import type { ExecutionOutcome } from '@/near/outcome';

type NearContextValue = {
  loading: boolean;
  signedAccountId: string;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Signs and sends one or more transactions with a single wallet approval. Different receivers need separate
   * transactions (e.g. storage_deposit on the machine + ft_transfer_call on USDT), so "one action" for the user is
   * one batch here. Resolves when every transaction has executed.
   */
  signAndSendTransactions: (txs: Tx[]) => Promise<ExecutionOutcome[]>;
};

const NearContext = createContext<NearContextValue | undefined>(undefined);

/**
 * DEV TEST SIGNER switch. Constant `false` in every production build (NODE_ENV is inlined and next.config sets
 * NEXT_PUBLIC_DEV_SIGNER only for `next dev` with DEV_SIGNER=1), and `gaballs-dev-signer` is then an empty stub.
 * A connected real wallet always wins over the dev signer.
 */
const DEV_SIGNER_ACTIVE = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEV_SIGNER === '1';

export function NearProvider({ children }: PropsWithChildren) {
  const connectorRef = useRef<Promise<NearConnector> | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | undefined>();
  const [walletAccountId, setSignedAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [devAccountId, setDevAccountId] = useState('');

  useEffect(() => {
    if (!DEV_SIGNER_ACTIVE) return;
    void devSignerAccount().then((id) => setDevAccountId(id ?? ''));
  }, []);

  const usingDevSigner = DEV_SIGNER_ACTIVE && !wallet && devAccountId !== '';
  const signedAccountId = walletAccountId || (usingDevSigner ? devAccountId : '');

  const getConnector = useCallback(() => {
    connectorRef.current ??= import('@hot-labs/near-connect').then(
      ({ NearConnector }) =>
        new NearConnector({
          network: NETWORK,
          providers: { mainnet: ['https://free.rpc.fastnear.com'], testnet: [RPC_URL] },
        }),
    );
    return connectorRef.current;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let detach = () => {};
    const onSignIn = (p: EventMap['wallet:signIn']) => {
      if (cancelled) return;
      setWallet(p.wallet);
      setSignedAccountId(p.accounts[0]?.accountId ?? '');
    };
    const onSignOut = () => {
      if (cancelled) return;
      setWallet(undefined);
      setSignedAccountId('');
    };

    getConnector()
      .then(async (connector) => {
        connector.on('wallet:signIn', onSignIn);
        connector.on('wallet:signOut', onSignOut);
        detach = () => {
          connector.off('wallet:signIn', onSignIn);
          connector.off('wallet:signOut', onSignOut);
        };
        const connected = await connector.getConnectedWallet().catch(() => null);
        if (!cancelled && connected) {
          setWallet(connected.wallet);
          setSignedAccountId(connected.accounts[0]?.accountId ?? '');
        }
      })
      .catch((e) => console.error('wallet init failed', e))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
      detach();
    };
  }, [getConnector]);

  const signIn = useCallback(async () => {
    const connector = await getConnector();
    const connected = await connector.connect();
    setWallet(connected);
    const accounts = await connected.getAccounts();
    setSignedAccountId(accounts[0]?.accountId ?? '');
  }, [getConnector]);

  const signOut = useCallback(async () => {
    if (!wallet) return;
    const connector = await getConnector();
    await connector.disconnect(wallet);
    setWallet(undefined);
    setSignedAccountId('');
  }, [getConnector, wallet]);

  const signAndSendTransactions = useCallback(
    async (txs: Tx[]) => {
      if (!wallet && usingDevSigner) return devSignAndSend(txs);
      if (!wallet) throw new Error('Connect a wallet first');
      const outcomes = await wallet.signAndSendTransactions({ network: NETWORK, transactions: txs });
      return outcomes as unknown as ExecutionOutcome[];
    },
    [wallet, usingDevSigner],
  );

  const value = useMemo(
    () => ({ loading, signedAccountId, signIn, signOut, signAndSendTransactions }),
    [loading, signedAccountId, signIn, signOut, signAndSendTransactions],
  );
  return (
    <NearContext.Provider value={value}>
      {usingDevSigner && <DevSignerBadge accountId={devAccountId} />}
      {children}
    </NearContext.Provider>
  );
}

export function useNearWallet(): NearContextValue {
  const ctx = useContext(NearContext);
  if (!ctx) throw new Error('useNearWallet must be used inside <NearProvider>');
  return ctx;
}
