import React from 'react';
import { TwitterIcon } from 'lucide-react';

const TelegramIcon = () => (
  <img 
    src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/1200px-Telegram_logo.svg.png" 
    className="w-6 h-6" 
    alt="Telegram"
  />
);

export default function Footer() {
  return (
    <footer className="bg-black/50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <i className="fas fa-hat-wizard text-purple-500 text-2xl" aria-hidden="true"></i>
              <span className="text-xl font-bold">Giggly The Wizard</span>
            </div>
            <p className="text-gray-400 mb-4">
              Advanced token analysis platform for the Ethereum network.
              Stay safe while discovering new opportunities.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-purple-500">
                <TwitterIcon className="h-6 w-6" />
              </a>
              <a href="#" className="text-gray-400 hover:text-purple-500">
                <TelegramIcon />
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><a href="#features" className="text-gray-400 hover:text-purple-500">Features</a></li>
              <li><a href="#scanner" className="text-gray-400 hover:text-purple-500">Scanner</a></li>
              <li><a href="#tokenomics" className="text-gray-400 hover:text-purple-500">Tokenomics</a></li>
              <li><a href="#roadmap" className="text-gray-400 hover:text-purple-500">Roadmap</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-800">
          <p className="text-center text-gray-400">
            © {new Date().getFullYear()} Giggly The Wizard. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}