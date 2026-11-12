// Adds "NEAR Protocol Testnet" (chain 398) to MetaMask before near-connect's Ethereum Wallets sign-in page opens.
//
// Why: that page (evm-on-near.dev) connects through Reown AppKit, which asks MetaMask to SWITCH to chain 398 and gives
// up with "Connection declined" when MetaMask answers 4902 ("Unrecognized chain ID 0x18e, add it first"). The page's
// own code would add the chain, but only after AppKit has connected. Adding the chain here first lets the switch work.
// The parameters are the ones the sign-in page itself uses (its bundle: chainId 398, "NEAR Protocol Testnet",
// https://eth-rpc.testnet.near.org, https://eth-explorer-testnet.near.org), so MetaMask sees the same network.

import { NETWORK } from '@/config';

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const CHAINS = {
  testnet: {
    chainId: '0x18e', // 398
    chainName: 'NEAR Protocol Testnet',
    nativeCurrency: { name: 'NEAR', symbol: 'NEAR', decimals: 18 },
    rpcUrls: ['https://eth-rpc.testnet.near.org'],
    blockExplorerUrls: ['https://eth-explorer-testnet.near.org'],
  },
  mainnet: {
    chainId: '0x18d', // 397
    chainName: 'NEAR Protocol',
    nativeCurrency: { name: 'NEAR', symbol: 'NEAR', decimals: 18 },
    rpcUrls: ['https://eth-rpc.mainnet.near.org'],
    blockExplorerUrls: ['https://eth-explorer.near.org'],
  },
} as const;

/** MetaMask's provider, found through EIP-6963 (works when several wallet extensions are installed), else window.ethereum. */
async function metaMask(): Promise<Eip1193 | null> {
  const found: { rdns: string; provider: Eip1193 }[] = [];
  const onAnnounce = (e: Event) => {
    const d = (e as CustomEvent<{ info: { rdns: string }; provider: Eip1193 }>).detail;
    if (d?.provider) found.push({ rdns: d.info?.rdns ?? '', provider: d.provider });
  };
  window.addEventListener('eip6963:announceProvider', onAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise((r) => setTimeout(r, 300));
  window.removeEventListener('eip6963:announceProvider', onAnnounce);
  const mm = found.find((p) => p.rdns === 'io.metamask') ?? found[0];
  return mm?.provider ?? ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null);
}

export type AddNetworkResult = 'added' | 'no-wallet';

/** Asks the wallet to add (or confirm) the NEAR network. Throws on a rejection so the UI can show it. */
export async function addNearNetwork(): Promise<AddNetworkResult> {
  const provider = await metaMask();
  if (!provider) return 'no-wallet';
  const chain = CHAINS[NETWORK === 'mainnet' ? 'mainnet' : 'testnet'];
  try {
    await provider.request({ method: 'wallet_addEthereumChain', params: [chain] });
  } catch (e) {
    // Some wallets only accept this from a connected site: connect, then retry once.
    if ((e as { code?: number })?.code !== 4100) throw e;
    await provider.request({ method: 'eth_requestAccounts' });
    await provider.request({ method: 'wallet_addEthereumChain', params: [chain] });
  }
  return 'added';
}
