import { parseAbi } from 'viem';

export const FACTORY_ABI = parseAbi([
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
]);

export const PAIR_ABI = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
]);

export const TOKEN_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)'
]);