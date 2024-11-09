const VITE_ALCHEMY_ENDPOINT = import.meta.env.VITE_ALCHEMY_ENDPOINT;
const VITE_ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
const VITE_ETHERSCAN_API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY;

export const config = {
  alchemy: {
    endpoint: VITE_ALCHEMY_ENDPOINT,
    apiKey: VITE_ALCHEMY_API_KEY
  },
  etherscan: {
    endpoint: 'https://api.etherscan.io/api',
    apiKey: VITE_ETHERSCAN_API_KEY
  },
  contracts: {
    uniswapV2Factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  }
};