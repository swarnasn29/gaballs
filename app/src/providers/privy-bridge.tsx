'use client';

// GOOGLE / EMAIL LOGIN with Privy, "Direct Privy" path of docs.near.org/web3-apps/tutorials/privy (example:
// github.com/near-examples/hello-privy). Privy logs the player in (its own modal: the only window they see) and
// creates a NEAR embedded wallet for them: an implicit account (64 hex characters). Transactions are signed silently
// through Privy's `signRawHash`, so packs, sells and claims show no wallet popups.
//
// The account only exists on-chain once it receives NEAR: the welcome kit (src/server/welcome.ts) does that on the
// first login (see NearProvider).

import { PrivyProvider, usePrivy, useLogin, useLogout } from '@privy-io/react-auth';
import { useCreateWallet, useSignRawHash } from '@privy-io/react-auth/extended-chains';
import { Account, FailoverRpcProvider, JsonRpcProvider, PublicKey, Signer, actions } from 'near-api-js';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef } from 'react';

import { PRIVY_APP_ID, RPC_FALLBACKS, RPC_URL } from '@/config';
import type { Tx } from '@/near/contracts';
import type { ExecutionOutcome } from '@/near/outcome';

type SignRawHash = ReturnType<typeof useSignRawHash>['signRawHash'];

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => Uint8Array.from(h.replace(/^0x/, '').match(/../g) ?? [], (x) => parseInt(x, 16));

/** near-api-js Signer backed by Privy's embedded NEAR wallet (as in the docs' `privySigner`). */
class PrivySigner extends Signer {
  constructor(
    private readonly signRawHash: SignRawHash,
    private readonly accountId: string,
  ) {
    super();
  }
  async getPublicKey() {
    // An implicit account's id IS its ed25519 public key.
    return new PublicKey({ keyType: 0, data: fromHex(this.accountId) });
  }
  async signBytes(bytes: Uint8Array) {
    const { signature } = await this.signRawHash({ address: this.accountId, chainType: 'near', hash: `0x${toHex(bytes)}` });
    return fromHex(signature);
  }
}

function rpcProvider() {
  return new FailoverRpcProvider([...RPC_FALLBACKS, RPC_URL].map((url) => new JsonRpcProvider({ url })));
}

export interface PrivyBridge {
  enabled: boolean;
  ready: boolean;
  /** NEAR account of the logged-in Privy user ('' while logged out or while the wallet is being created). */
  accountId: string;
  login: () => void;
  logout: () => Promise<void>;
  signAndSend: (txs: Tx[]) => Promise<ExecutionOutcome[]>;
}

const disabled: PrivyBridge = {
  enabled: false,
  ready: true,
  accountId: '',
  login: () => {},
  logout: async () => {},
  signAndSend: async () => {
    throw new Error('Google/email login is not configured');
  },
};

const PrivyBridgeContext = createContext<PrivyBridge>(disabled);
export const usePrivyBridge = () => useContext(PrivyBridgeContext);

function Bridge({ children }: PropsWithChildren) {
  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const creating = useRef(false);

  // Pick the user's NEAR wallet explicitly (a user may also have other chains); create one if missing.
  const nearWallet = user?.linkedAccounts.find((a) => a.type === 'wallet' && a.chainType === 'near');
  const accountId = authenticated && nearWallet?.type === 'wallet' ? nearWallet.address : '';

  useEffect(() => {
    if (!authenticated || !user || accountId || creating.current) return;
    creating.current = true;
    createWallet({ chainType: 'near' })
      .catch((e) => console.error('Could not create the NEAR wallet', e))
      .finally(() => (creating.current = false));
  }, [authenticated, user, accountId, createWallet]);

  const value = useMemo<PrivyBridge>(() => {
    const account = accountId ? new Account(accountId, rpcProvider(), new PrivySigner(signRawHash, accountId)) : null;
    return {
      enabled: true,
      ready,
      accountId,
      login: () => login({ loginMethods: ['google', 'email'] }),
      logout,
      signAndSend: async (txs) => {
        if (!account) throw new Error('Log in first');
        const out: ExecutionOutcome[] = [];
        for (const tx of txs) {
          const res = await account
            .signAndSendTransaction({
              receiverId: tx.receiverId,
              actions: tx.actions.map((a) =>
                actions.functionCall(a.params.methodName, a.params.args, BigInt(a.params.gas), BigInt(a.params.deposit)),
              ),
            })
            .catch((e: unknown) => {
              // NEAR holds the attached gas at a pessimistic price before running (≈0.3 NEAR for a pack).
              if (e instanceof Error && /NotEnoughBalance|Not enough balance/i.test(`${e.name} ${e.message}`))
                throw new Error('Not enough testnet NEAR for gas: a pack needs about 0.3 NEAR available (most of it is refunded).');
              throw e;
            });
          out.push(res as unknown as ExecutionOutcome);
        }
        return out;
      },
    };
  }, [ready, accountId, login, logout, signRawHash]);

  return <PrivyBridgeContext.Provider value={value}>{children}</PrivyBridgeContext.Provider>;
}

/** Wraps the app in Privy when NEXT_PUBLIC_PRIVY_APP_ID is set; otherwise the Google/email option is hidden. */
export function PrivyRoot({ children }: PropsWithChildren) {
  if (!PRIVY_APP_ID) return <PrivyBridgeContext.Provider value={disabled}>{children}</PrivyBridgeContext.Provider>;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['google', 'email'],
        appearance: { accentColor: '#6b3fa0', theme: 'light', showWalletLoginFirst: false, landingHeader: 'Play Gaballs' },
        // Only the NEAR wallet (created in Bridge); no Ethereum/Solana embedded wallets, no wallet confirmation UIs.
        embeddedWallets: { ethereum: { createOnLogin: 'off' }, solana: { createOnLogin: 'off' }, showWalletUIs: false },
      }}
    >
      <Bridge>{children}</Bridge>
    </PrivyProvider>
  );
}
