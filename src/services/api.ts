import axios from 'axios';
import { config } from '../config';

export const etherscanApi = axios.create({
  baseURL: config.etherscan.endpoint,
  params: {
    apikey: config.etherscan.apiKey
  }
});

export const coingeckoApi = axios.create({
  baseURL: config.coingecko.endpoint
});

export const getTokenInfo = async (address: string) => {
  try {
    const response = await etherscanApi.get('', {
      params: {
        module: 'token',
        action: 'tokeninfo',
        contractaddress: address
      }
    });
    return response.data.result;
  } catch (error) {
    console.error('Error fetching token info:', error);
    throw error;
  }
};

export const getContractSource = async (address: string) => {
  try {
    const response = await etherscanApi.get('', {
      params: {
        module: 'contract',
        action: 'getsourcecode',
        address: address
      }
    });
    return response.data.result[0];
  } catch (error) {
    console.error('Error fetching contract source:', error);
    throw error;
  }
};