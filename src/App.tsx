import React from 'react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import { Scanner } from './components/Scanner';
import Tokenomics from './components/Tokenomics';
import Roadmap from './components/Roadmap';
import Footer from './components/Footer';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <Navbar />
      <Hero />
      <Features />
      <div id="scanner" className="py-20 bg-black/50">
        <Scanner />
      </div>
      <Tokenomics />
      <Roadmap />
      <Footer />
    </div>
  );
}

export default App;