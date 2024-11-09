import React from 'react';
import { Shield, Search, Bot, AlertTriangle, Lock, Zap } from 'lucide-react';

export default function Features() {
  const features = [
    {
      icon: <Shield className="h-6 w-6 text-purple-500" />,
      title: 'Security Analysis',
      description: 'Deep contract scanning for vulnerabilities and common scam patterns'
    },
    {
      icon: <Bot className="h-6 w-6 text-purple-500" />,
      title: 'AI-Powered Detection',
      description: 'Machine learning algorithms to identify potential risks and opportunities'
    },
    {
      icon: <AlertTriangle className="h-6 w-6 text-purple-500" />,
      title: 'Risk Assessment',
      description: 'Comprehensive risk scoring based on multiple security parameters'
    },
    {
      icon: <Lock className="h-6 w-6 text-purple-500" />,
      title: 'Liquidity Analysis',
      description: 'Track liquidity locks and potential rug pull indicators'
    },
    {
      icon: <Search className="h-6 w-6 text-purple-500" />,
      title: 'Real-time Monitoring',
      description: 'Instant alerts for new token launches and security events'
    },
    {
      icon: <Zap className="h-6 w-6 text-purple-500" />,
      title: 'Fast Processing',
      description: 'Lightning-fast scanning and analysis of new tokens'
    }
  ];

  return (
    <section id="features" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">
            Advanced Token Analysis
          </h2>
          <p className="mt-4 text-xl text-gray-400">
            Cutting-edge features to keep you safe in the crypto space
          </p>
        </div>

        <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <div key={index} className="bg-gray-800/50 rounded-xl p-8 hover:bg-gray-800/80 transition-all">
              <div className="flex items-center space-x-4">
                {feature.icon}
                <h3 className="text-xl font-bold">{feature.title}</h3>
              </div>
              <p className="mt-4 text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}