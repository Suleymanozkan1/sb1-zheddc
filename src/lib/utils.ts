export const formatNumber = (num: number | undefined): string => {
  if (num === undefined) return '0';
  return num.toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
};

export const formatAddress = (address: string): string => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export const calculateScore = (tokenInfo: TokenInfo): number => {
  let score = 0;
  
  if (tokenInfo.isVerified) score += 30;
  if (!tokenInfo.isHoneypot) score += 30;
  if (tokenInfo.liquidity > 50000) score += 20;
  if (tokenInfo.holders > 100) score += 10;
  if (Object.values(tokenInfo.socialLinks).some(link => link)) score += 10;

  return score;
};