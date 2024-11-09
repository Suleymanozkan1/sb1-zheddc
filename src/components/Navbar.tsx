import React, { useState } from 'react';
import { Menu, X, Scan } from 'lucide-react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-black/50 backdrop-blur-md fixed w-full z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="flex items-center space-x-2">
                <i className="fas fa-hat-wizard text-purple-500 text-2xl" aria-hidden="true"></i>
                <span className="text-xl font-bold">Giggly The Wizard</span>
              </div>
            </div>
          </div>
          
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              <a href="#features" className="hover:text-purple-500 px-3 py-2">Features</a>
              <a href="#scanner" className="hover:text-purple-500 px-3 py-2">Scanner</a>
              <a href="#tokenomics" className="hover:text-purple-500 px-3 py-2">Tokenomics</a>
              <a href="#roadmap" className="hover:text-purple-500 px-3 py-2">Roadmap</a>
              <button className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg flex items-center space-x-2">
                <Scan className="h-4 w-4" />
                <span>Launch App</span>
              </button>
            </div>
          </div>
          
          <div className="md:hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="p-2">
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <a href="#features" className="hover:text-purple-500 block px-3 py-2">Features</a>
            <a href="#scanner" className="hover:text-purple-500 block px-3 py-2">Scanner</a>
            <a href="#tokenomics" className="hover:text-purple-500 block px-3 py-2">Tokenomics</a>
            <a href="#roadmap" className="hover:text-purple-500 block px-3 py-2">Roadmap</a>
            <button className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg w-full flex items-center justify-center space-x-2">
              <Scan className="h-4 w-4" />
              <span>Launch App</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}