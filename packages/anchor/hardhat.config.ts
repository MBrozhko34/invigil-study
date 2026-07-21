import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const key = process.env.ANCHOR_PRIVATE_KEY ? [process.env.ANCHOR_PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    base:        { url: process.env.ANCHOR_RPC_URL ?? "https://mainnet.base.org", accounts: key },
    baseSepolia: { url: process.env.ANCHOR_RPC_URL ?? "https://sepolia.base.org",  accounts: key },
    localhost:   { url: "http://127.0.0.1:8545" },
  },
};
export default config;
