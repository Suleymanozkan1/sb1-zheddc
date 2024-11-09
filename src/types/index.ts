export interface TokenPair {
  pair: string;
  dex: string;
  liquidity: number;
  price: number;
}

export interface HolderDistribution {
  top10: number;
  top50: number;
  top100: number;
}

export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  verified: boolean;
  buyTax: number;
  sellTax: number;
  isHoneypot: boolean;
  holders: number;
  holderDistribution: HolderDistribution;
  liquidity: number;
  creatorHoldings: number;
  contractAge: number;
  flags: string[];
  pairs: TokenPair[];
}

export interface ScanResult {
  address: string;
  tokenInfo: TokenInfo | null;
  error?: string;
}