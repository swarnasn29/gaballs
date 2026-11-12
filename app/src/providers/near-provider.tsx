'use client';

// Wallet connection via @hot-labs/near-connect (the connector the NEAR `near-dapp` agent skill and the official
// create-near-app Next.js template use). The library is imported lazily in the browser so pages render on the
// server without it. Views do not need a wallet and go through src/near/rpc.ts.

import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { EventMap, NearConnector, NearWalletBase } from '@hot-labs/near-connect';

import { DevSignerBadge, devSignAndSend, devSignerAccount } from 'gaballs-dev-signer';

import { ConnectDialog, WelcomeKitDialog } from '@/components/connect-dialog';
import { NETWORK, RPC_FALLBACKS, RPC_URL } from '@/config';
import { usePrivyBridge } from '@/providers/privy-bridge';
import type { Tx } from '@/near/contracts';
import type { ExecutionOutcome } from '@/near/outcome';

type NearContextValue = {
  loading: boolean;
  signedAccountId: string;
  /** How the player connected: a wallet, Google/email (Privy, silent signing), or the local dev signer. */
  via: 'wallet' | 'google' | 'dev' | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Signs and sends one or more transactions with a single wallet approval. Different receivers need separate
   * transactions (e.g. storage_deposit on the machine + ft_transfer_call on USDT), so "one action" for the user is
   * one batch here. Resolves when every transaction has executed.
   */
  signAndSendTransactions: (txs: Tx[]) => Promise<ExecutionOutcome[]>;
};

/** near-connect's built-in "Ethereum Wallets" entry (MetaMask / WalletConnect, testnet supported; evm-on-near.dev). */
const ETHEREUM_WALLETS = 'ethereum-wallets';
/** Highest gas per action that evm-on-near.dev accepts (its bundle: 270000000000000). */
const EVM_MAX_GAS = 270_000_000_000_000n;

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const privy = usePrivyBridge();
  const google = privy.accountId;

  useEffect(() => {
    if (!DEV_SIGNER_ACTIVE) return;
    void devSignerAccount().then((id) => setDevAccountId(id ?? ''));
  }, []);

  const usingDevSigner = DEV_SIGNER_ACTIVE && !wallet && !google && devAccountId !== '';
  const signedAccountId = walletAccountId || google || (usingDevSigner ? devAccountId : '');
  const via = walletAccountId ? 'wallet' : google ? 'google' : usingDevSigner ? 'dev' : null;

  const getConnector = useCallback(() => {
    connectorRef.current ??= import('@hot-labs/near-connect').then(
      ({ NearConnector }) =>
        new NearConnector({
          network: NETWORK,
          providers: { mainnet: ['https://free.rpc.fastnear.com'], testnet: [RPC_URL, ...RPC_FALLBACKS] },
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

  /** Opens our connect dialog: Google/email first, crypto wallets below. */
  const signIn = useCallback(async () => {
    setDialogOpen(true);
  }, []);

  /** walletId: open one wallet directly, e.g. 'ethereum-wallets' (MetaMask via near-connect's Ethereum Wallets). */
  const connectWallet = useCallback(async (walletId?: string) => {
    setDialogOpen(false);
    const connector = await getConnector();
    const connected = await connector.connect(walletId ? { walletId } : undefined);
    setWallet(connected);
    const accounts = await connected.getAccounts();
    setSignedAccountId(accounts[0]?.accountId ?? '');
  }, [getConnector]);

  const signOut = useCallback(async () => {
    if (!wallet && google) {
      await privy.logout();
      return;
    }
    if (!wallet) return;
    const connector = await getConnector();
    await connector.disconnect(wallet);
    setWallet(undefined);
    setSignedAccountId('');
  }, [getConnector, wallet, google, privy]);

  const signAndSendTransactions = useCallback(
    async (txs: Tx[]) => {
      if (!wallet && google) return privy.signAndSend(txs);
      if (!wallet && usingDevSigner) return devSignAndSend(txs);
      if (!wallet) throw new Error('Connect a wallet first');
      // Ethereum Wallets (evm-on-near.dev) refuses any action above 270 Tgas ("Amount exceeds protocol limit"): its
      // calls run through the account's rlp_execute, which needs some of the 300 Tgas itself. 270 Tgas is what squad
      // packs already use on testnet (docs/DEPLOYMENTS.md: "open 5 packs", 270 Tgas), so cap there for that wallet only.
      const forWallet =
        wallet.manifest?.id === ETHEREUM_WALLETS
          ? txs.map((tx) => ({
              ...tx,
              actions: tx.actions.map((a) => ({
                ...a,
                params: { ...a.params, gas: (BigInt(a.params.gas) > EVM_MAX_GAS ? EVM_MAX_GAS : BigInt(a.params.gas)).toString() },
              })),
            }))
          : txs;
      const outcomes = await wallet.signAndSendTransactions({ network: NETWORK, transactions: forWallet });
      return outcomes as unknown as ExecutionOutcome[];
    },
    [wallet, google, privy, usingDevSigner],
  );

  const value = useMemo(
    () => ({ loading: loading || !privy.ready, signedAccountId, via: via as NearContextValue['via'], signIn, signOut, signAndSendTransactions }),
    [loading, privy.ready, signedAccountId, via, signIn, signOut, signAndSendTransactions],
  );
  return (
    <NearContext.Provider value={value}>
      {usingDevSigner && <DevSignerBadge accountId={devAccountId} />}
      {children}
      {dialogOpen && (
        <ConnectDialog
          googleEnabled={privy.enabled && privy.ready}
          onClose={() => setDialogOpen(false)}
          onGoogle={() => {
            setDialogOpen(false);
            privy.login();
          }}
          onWallet={() => void connectWallet()}
          onEthereum={() => void connectWallet(ETHEREUM_WALLETS)}
        />
      )}
      {google && !wallet && <WelcomeKitDialog accountId={google} />}
      {/^0x[0-9a-f]{40}$/.test(walletAccountId) && <WelcomeKitDialog accountId={walletAccountId} />}
    </NearContext.Provider>
  );
}

export function useNearWallet(): NearContextValue {
  const ctx = useContext(NearContext);
  if (!ctx) throw new Error('useNearWallet must be used inside <NearProvider>');
  return ctx;
}
