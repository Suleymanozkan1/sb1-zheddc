export interface TokenInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  price: number;
  marketCap: number;
  holders: number;
  isVerified: boolean;
  isHoneypot: boolean;
  liquidity: number;
  volume24h: number;
  socialLinks: {
    website?: string;
    telegram?: string;
    twitter?: string;
    discord?: string;
  };
}

export interface ScanResult {
  address: string;
  tokenInfo: TokenInfo | null;
  error?: string;
}