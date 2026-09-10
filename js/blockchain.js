const blockchainConfig = {
  bnb: {
    chainId: "0x38",
    chainIdDecimal: "56",
    chainName: "BNB Chain",
    rpcUrl: "https://bsc-dataseed1.binance.org",
    factoryAddress: "0xdF00e8DA4c9AD121126926aCeE9E4FbEb20dBCBE",
    nativeCurrency: "BNB",
    blockExplorer: "https://bscscan.com",
    symbol: "BNB",
  },
  ric: {
    chainId: "0x203BA",
    chainIdDecimal: "132026",
    chainName: "Riche Chain",
    rpcUrl: "https://seed-richechain.com",
    factoryAddress: "0xc4e069214b835847228aDa775137Dc05F25963b2",
    nativeCurrency: "RIC",
    blockExplorer: "https://richescan.com",
    symbol: "RIC",
  },
};

const factoryABI = [
  "event TokenCreated(address indexed tokenAddress, address indexed creator, string name, string symbol, uint8 decimals, uint256 totalSupply)",
  "function createToken(string memory name, string memory symbol, uint8 decimals, uint256 totalSupply) returns (address)",
  "function creationFee() view returns (uint256)",
  "function owner() view returns (address)",
  "function setCreationFee(uint256 _fee) external",
  "function withdraw() external",
];
