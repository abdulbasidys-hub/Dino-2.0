// Central place to edit branding / on-chain details for the project.
export const SITE_CONFIG = {
  tokenName: "DINO",
  tokenTicker: "$DINO",
  // Contract address — replace with the real deployed mint address
  contractAddress: "Cn4PUMPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxBONK",
  // Percentage of the pot shown/distributed to the high-score winner.
  // The remaining percentage is sent to a second wallet silently by the
  // backend (see server/server.js) and is never shown on the frontend.
  potSharePercent: 80,
  solscanBase: "https://solscan.io",
};

export const solscanAddress = (address) =>
  `${SITE_CONFIG.solscanBase}/account/${address}`;

export const solscanTx = (sig) => `${SITE_CONFIG.solscanBase}/tx/${sig}`;

export const shortenAddress = (address, chars = 4) => {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};
