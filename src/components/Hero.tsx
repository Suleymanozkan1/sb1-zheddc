import React from 'react';

export default function Hero() {
  const scrollToScanner = () => {
    const scanner = document.getElementById('scanner');
    scanner?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="pt-24 pb-8 md:pt-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="flex justify-center mb-8">
            <i className="fas fa-hat-wizard text-purple-500 text-6xl animate-bounce" aria-hidden="true"></i>
          </div>
          <h1 className="text-4xl tracking-tight font-extrabold sm:text-5xl md:text-6xl">
            <span className="block">Discover Safe Tokens</span>
            <span className="block text-purple-500">With Magical Analysis</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-300 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Advanced token scanner powered by ancient wizardry to help you find secure and promising tokens on the Ethereum network.
          </p>
          <div className="mt-10 flex justify-center space-x-6">
            <button 
              onClick={scrollToScanner}
              className="bg-purple-600 hover:bg-purple-700 px-8 py-3 rounded-lg flex items-center space-x-2"
            >
              <i className="fas fa-hat-wizard text-2xl" aria-hidden="true"></i>
              <span>Cast Scanning Spell</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}