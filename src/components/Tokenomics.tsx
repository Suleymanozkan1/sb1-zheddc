import React from 'react';

export default function Tokenomics() {
  const tokenomics = [
    {
      icon: <i className="fas fa-hat-wizard text-purple-500 text-2xl" aria-hidden="true"></i>,
      label: "Wizard's Share",
      percentage: 95,
      description: 'Magical power distribution'
    },
    {
      icon: <i className="fas fa-scroll text-purple-500 text-2xl" aria-hidden="true"></i>,
      label: 'Sealed Scrolls',
      percentage: 95,
      description: 'Ancient knowledge locked away'
    },
    {
      icon: <i className="fas fa-coins text-purple-500 text-2xl" aria-hidden="true"></i>,
      label: 'Magic Treasury',
      percentage: 5,
      description: 'Arcane resources vault'
    },
    {
      icon: <i className="fas fa-users text-purple-500 text-2xl" aria-hidden="true"></i>,
      label: 'Council of Wizards',
      percentage: 5,
      description: 'Wise council allocation'
    }
  ];

  return (
    <section id="tokenomics" className="py-20 bg-black/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl">
            Magical Distribution
          </h2>
          <p className="mt-4 text-xl text-gray-400">
            Ancient scrolls of token allocation
          </p>
        </div>

        <div className="mt-20">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {tokenomics.map((item, index) => (
              <div key={index} className="bg-gray-800/50 rounded-xl p-8 hover:bg-gray-800/80 transition-all">
                <div className="flex items-center space-x-4 mb-4">
                  {item.icon}
                  <h3 className="text-xl font-bold">{item.label}</h3>
                </div>
                <div className="mb-4">
                  <div className="text-3xl font-bold text-purple-500">
                    {item.percentage}%
                  </div>
                </div>
                <div className="h-2 bg-gray-700 rounded-full mb-4">
                  <div 
                    className="h-2 bg-purple-500 rounded-full" 
                    style={{ width: `${item.percentage}%` }}
                  ></div>
                </div>
                <p className="text-gray-400">
                  {item.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-16 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl p-8">
            <h3 className="text-xl font-bold mb-6">Magical Essence Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h4 className="text-purple-500 font-semibold mb-2">Token Name</h4>
                <p className="text-gray-400">Giggly (GIGGLY)</p>
              </div>
              <div>
                <h4 className="text-purple-500 font-semibold mb-2">Total Supply</h4>
                <p className="text-gray-400">420,690,777 GIGGLY</p>
              </div>
              <div>
                <h4 className="text-purple-500 font-semibold mb-2">Realm</h4>
                <p className="text-gray-400">Ethereum (ERC-20)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}