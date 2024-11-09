import { getTokenInfo, getContractSource } from './api';
import { isContract, getTokenMetrics, getLiquidity } from './contracts';

export interface TokenScanResult {
  address: string;
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  verified: boolean;
  hasLiquidity: boolean;
  liquidityAmount: string;
  sourceCode?: string;
  compiler?: string;
  securityScore: number;
}

export const scanToken = async (address: string): Promise<TokenScanResult> => {
  try {
    // Basic validation
    if (!address || !address.startsWith('0x')) {
      throw new Error('Invalid address format');
    }

    // Check if address is a contract
    const contractCheck = await isContract(address);
    if (!contractCheck) {
      throw new Error('Address is not a contract');
    }

    // Gather all token information in parallel
    const [metrics, etherscanInfo, contractSource, liquidityInfo] = await Promise.all([
      getTokenMetrics(address),
      getTokenInfo(address),
      getContractSource(address),
      getLiquidity(address)
    ]);

    // Calculate security score (example implementation)
    const securityScore = calculateSecurityScore({
      verified: contractSource.SourceCode !== '',
      hasLiquidity: liquidityInfo.hasLiquidity,
      liquidityAmount: liquidityInfo.liquidityAmount
    });

    return {
      address,
      name: metrics.name,
      symbol: metrics.symbol,
      totalSupply: metrics.totalSupply,
      decimals: metrics.decimals,
      verified: contractSource.SourceCode !== '',
      hasLiquidity: liquidityInfo.hasLiquidity,
      liquidityAmount: liquidityInfo.liquidityAmount,
      sourceCode: contractSource.SourceCode,
      compiler: contractSource.CompilerVersion,
      securityScore
    };
  } catch (error) {
    console.error('Scan error:', error);
    throw error;
  }
};

const calculateSecurityScore = ({
  verified,
  hasLiquidity,
  liquidityAmount
}: {
  verified: boolean;
  hasLiquidity: boolean;
  liquidityAmount: string;
}): number => {
  let score = 0;
  
  // Contract verification: 30 points
  if (verified) score += 30;
  
  // Liquidity check: up to 40 points
  if (hasLiquidity) {
    score += 20;
    const liquidityEth = parseFloat(liquidityAmount);
    if (liquidityEth > 50) score += 20;
    else if (liquidityEth > 10) score += 10;
    else score += 5;
  }
  
  // Base security: 30 points
  score += 30;
  
  return score;
};