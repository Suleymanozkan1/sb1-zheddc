import { publicClient } from './web3';
import { formatEther, parseAbi } from 'viem';
import { config } from '../config';

const ERC20_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
]);

const FACTORY_ABI = parseAbi([
  'function getPair(address,address) view returns (address)'
]);

export const isContract = async (address: string) => {
  try {
    const code = await publicClient.getBytecode({ address: address as `0x${string}` });
    return code !== undefined && code !== '0x';
  } catch (error) {
    console.error('Error checking if address is contract:', error);
    throw error;
  }
};

export const getTokenMetrics = async (address: string) => {
  try {
    const [decimals, totalSupply, name, symbol] = await Promise.all([
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals'
      }),
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'totalSupply'
      }),
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'name'
      }),
      publicClient.readContract({
        address: address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'symbol'
      })
    ]);

    return {
      decimals,
      totalSupply: formatEther(totalSupply),
      name,
      symbol
    };
  } catch (error) {
    console.error('Error fetching metrics:', error);
    throw error;
  }
};

export const getLiquidity = async (tokenAddress: string) => {
  try {
    const pairAddress = await publicClient.readContract({
      address: config.contracts.uniswapV2Factory as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'getPair',
      args: [tokenAddress, config.contracts.weth]
    });

    if (pairAddress === '0x0000000000000000000000000000000000000000') {
      return { hasLiquidity: false, liquidityAmount: '0' };
    }

    const balance = await publicClient.readContract({
      address: config.contracts.weth as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [pairAddress]
    });

    return {
      hasLiquidity: true,
      liquidityAmount: formatEther(balance)
    };
  } catch (error) {
    console.error('Error fetching liquidity:', error);
    throw error;
  }
};