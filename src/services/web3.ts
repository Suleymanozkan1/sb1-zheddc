import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { config } from '../config';

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(config.alchemy.endpoint)
});