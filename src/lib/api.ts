import { TokenScanResult } from '../types';
import { isContract, getTokenInfo, checkHoneypot, getLiquidity, getSocialData, getMetrics } from './contracts';

export const scanToken = async (address: string): Promise<TokenScanResult> => {
  try {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('Invalid Ethereum address');
    }

    // Run all checks in parallel for better performance
    const [
      contractExists,
      tokenInfo,
      isHoneypot,
      liquidityInfo,
      socialData,
      metrics
    ] = await Promise.all([
      isContract(address),
      getTokenInfo(address),
      checkHoneypot(address),
      getLiquidity(address),
      getSocialData(address),
      getMetrics(address)
    ]);

    if (!contractExists) {
      throw new Error('Address is not a contract');
    }

    const tokenData = {
      address,
      name: tokenInfo.name,
      symbol: tokenInfo.symbol,
      verified: tokenInfo.verified,
      honeypot: isHoneypot,
      totalSupply: tokenInfo.totalSupply.toString(),
      holders: metrics.holders,
      liquidityLocked: liquidityInfo.locked,
      riskLevel: isHoneypot ? 'high' : liquidityInfo.liquidityAmount > 50000 ? 'low' : 'medium',
      securityChecks: {
        contractVerified: tokenInfo.verified,
        honeypotTest: !isHoneypot,
        liquidityLocked: liquidityInfo.locked,
        ownershipRenounced: tokenInfo.ownershipRenounced,
      },
      socialPresence: socialData,
      metrics: {
        marketCap: metrics.marketCap,
        liquidityAmount: liquidityInfo.liquidityAmount,
        holders: metrics.holders,
        transactions24h: metrics.transactions24h,
        volume24h: metrics.volume24h,
      },
    };

    const score = calculateSecurityScore(tokenData as Omit<TokenScanResult, 'score'>);
    
    return {
      ...tokenData,
      score,
    } as TokenScanResult;
  } catch (error) {
    console.error('Scan error:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to scan token');
  }
};

const calculateSecurityScore = (result: Omit<TokenScanResult, 'score'>): TokenScanResult['score'] => {
  let contractScore = 0;
  let liquidityScore = 0;
  let socialScore = 0;
  let communityScore = 0;

  // Contract Security (40% of total)
  if (result.securityChecks.contractVerified) contractScore += 20;
  if (!result.honeypot) contractScore += 10;
  if (result.securityChecks.ownershipRenounced) contractScore += 10;

  // Liquidity Security (25% of total)
  if (result.liquidityLocked) liquidityScore += 15;
  if (result.metrics.liquidityAmount > 50000) liquidityScore += 10;

  // Social Presence (20% of total)
  if (result.socialPresence.website) socialScore += 5;
  if (result.socialPresence.github) socialScore += 5;
  if (result.socialPresence.telegram) socialScore += 4;
  if (result.socialPresence.twitter) socialScore += 3;
  if (result.socialPresence.discord) socialScore += 3;

  // Community Metrics (15% of total)
  if (result.metrics.holders > 500) communityScore += 5;
  if (result.metrics.transactions24h > 100) communityScore += 5;
  if (result.metrics.volume24h > 10000) communityScore += 5;

  const total = Math.min(100, contractScore + liquidityScore + socialScore + communityScore);

  return {
    contract: contractScore,
    liquidity: liquidityScore,
    social: socialScore,
    community: communityScore,
    total
  };
};