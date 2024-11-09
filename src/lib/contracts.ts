import axios from 'axios';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { config } from '../config';
import { TOKEN_ABI } from './abis';
import type { TokenInfo } from '../types';

const client = createPublicClient({
  chain: mainnet,
  transport: http(config.alchemy.endpoint)
});

export const getTokenInfo = async (address: string): Promise<TokenInfo> => {
  try {
    // Fetch honeypot data
    const honeypotResponse = await axios.get(`https://api.honeypot.is/v2/IsHoneypot?address=${address}`);
    const honeypotData = honeypotResponse.data;

    // Fetch token data from blockchain
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      client.readContract({ 
        address: address as `0x${string}`, 
        abi: TOKEN_ABI, 
        functionName: 'name' 
      }),
      client.readContract({ 
        address: address as `0x${string}`, 
        abi: TOKEN_ABI, 
        functionName: 'symbol' 
      }),
      client.readContract({ 
        address: address as `0x${string}`, 
        abi: TOKEN_ABI, 
        functionName: 'decimals' 
      }),
      client.readContract({ 
        address: address as `0x${string}`, 
        abi: TOKEN_ABI, 
        functionName: 'totalSupply' 
      })
    ]);

    // Fetch contract verification status
    const etherscanResponse = await axios.get(
      `${config.etherscan.endpoint}`, {
        params: {
          module: 'contract',
          action: 'getabi',
          address: address,
          apikey: config.etherscan.apiKey
        }
      }
    );

    return {
      name: name as string,
      symbol: symbol as string,
      decimals: decimals as number,
      totalSupply: totalSupply as bigint,
      verified: etherscanResponse.data.status === '1',
      buyTax: Number(honeypotData.buy_tax || 0),
      sellTax: Number(honeypotData.sell_tax || 0),
      isHoneypot: Boolean(honeypotData.is_honeypot),
      holders: Number(honeypotData.holders?.total || 0),
      holderDistribution: {
        top10: Number(honeypotData.holders?.top10_holdings || 0),
        top50: Number(honeypotData.holders?.top50_holdings || 0),
        top100: Number(honeypotData.holders?.top100_holdings || 0)
      },
      liquidity: Number(honeypotData.total_liquidity || 0),
      creatorHoldings: Number(honeypotData.creator_holdings || 0),
      contractAge: Number(honeypotData.contract_age || 0),
      flags: Array.isArray(honeypotData.flags) ? honeypotData.flags : [],
      pairs: (honeypotData.pairs || []).map(pair => ({
        pair: String(pair.pair),
        dex: String(pair.dex),
        liquidity: Number(pair.liquidity?.usd || 0),
        price: Number(pair.price || 0)
      }))
    };
  } catch (error) {
    console.error('Error fetching token info:', error);
    throw new Error('Failed to fetch token data');
  }
};