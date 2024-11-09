import React, { useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Search, Shield } from 'lucide-react';
import axios from 'axios';

interface HoneypotData {
  Token?: {
    Name: string;
    Symbol: string;
    Decimals: number;
    TotalSupply: string;
  };
  IsHoneypot: boolean;
  BuyTax: number;
  SellTax: number;
  BuyGas: number;
  SellGas: number;
  Holders: number;
  Liquidity: {
    USD: number;
    ETH: number;
  };
  CreatorHoldings: number;
  Flags: string[];
}

export function Scanner() {
  const [address, setAddress] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<HoneypotData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    if (!address) return;
    
    setScanning(true);
    setResult(null);
    setError(null);

    try {
      const response = await axios.get(`https://api.honeypot.is/v2/IsHoneypot?address=${address}`);
      setResult(response.data);
    } catch (err) {
      setError('Failed to scan token. Please verify the address and try again.');
    } finally {
      setScanning(false);
    }
  };

  const calculateScore = (data: HoneypotData): number => {
    let score = 100;
    
    if (data.IsHoneypot) score -= 70;
    if (data.BuyTax > 5) score -= (data.BuyTax - 5) * 2;
    if (data.SellTax > 5) score -= (data.SellTax - 5) * 2;
    if (data.CreatorHoldings > 20) score -= 20;
    if (data.Liquidity?.USD < 50000) score -= 20;
    if (data.Flags?.length) score -= data.Flags.length * 5;
    
    return Math.max(0, Math.min(100, score));
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-extrabold sm:text-4xl mb-4">
          Token Scanner
        </h2>
        <p className="mt-4 text-xl text-gray-400">
          Enter any ERC20 token address to analyze its security and metrics
        </p>
      </div>

      <div className="glass rounded-xl p-8 mb-8">
        <div className="flex gap-4">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter token address (0x...)"
            className="flex-1 bg-black/20 text-white border border-purple-500/30 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <button
            onClick={handleScan}
            disabled={scanning || !address}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:hover:bg-purple-600 px-8 py-3 rounded-lg flex items-center space-x-2 transition-colors"
          >
            <Search className="h-5 w-5" />
            <span>{scanning ? 'Scanning...' : 'Scan Token'}</span>
          </button>
        </div>
      </div>

      {(result || error) && (
        <div className="glass rounded-xl p-8">
          {error ? (
            <div className="flex items-center justify-center space-x-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          ) : result && (
            <div className="space-y-8">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold mb-2">{result.Token?.Name || 'Unknown Token'}</h3>
                  <p className="text-purple-400">{result.Token?.Symbol}</p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold mb-2">
                    <span className="text-purple-400">Score: </span>
                    {calculateScore(result)}/100
                  </div>
                  <p className="text-gray-400">
                    {address.slice(0, 6)}...{address.slice(-4)}
                    <a 
                      href={`https://etherscan.io/token/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 inline-flex items-center text-purple-400 hover:text-purple-300"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl p-6">
                  <h4 className="text-lg font-semibold mb-4">Security</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Honeypot</span>
                      <span className={result.IsHoneypot ? 'text-red-400' : 'text-green-400'}>
                        {result.IsHoneypot ? '⚠️ Yes' : '✅ No'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Buy Tax</span>
                      <span>{result.BuyTax}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Sell Tax</span>
                      <span>{result.SellTax}%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl p-6">
                  <h4 className="text-lg font-semibold mb-4">Liquidity</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">USD Value</span>
                      <span>${result.Liquidity?.USD.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">ETH Value</span>
                      <span>{result.Liquidity?.ETH.toFixed(2)} ETH</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Creator Holdings</span>
                      <span>{result.CreatorHoldings}%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-500/20 to-blue-500/20 rounded-xl p-6">
                  <h4 className="text-lg font-semibold mb-4">Metrics</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Holders</span>
                      <span>{result.Holders?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Buy Gas</span>
                      <span>{result.BuyGas?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Sell Gas</span>
                      <span>{result.SellGas?.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {result.Flags && result.Flags.length > 0 && (
                <div className="mt-6 bg-red-900/20 rounded-xl p-6 border border-red-500/20">
                  <h4 className="text-xl font-bold mb-4 text-red-400">Warning Flags</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result.Flags.map((flag, index) => (
                      <div key={index} className="flex items-center space-x-3 bg-red-500/10 rounded-lg p-4">
                        <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
                        <span className="text-red-300">{flag}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}