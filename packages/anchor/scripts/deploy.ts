import hre from "hardhat";

async function main() {
  const f = await hre.ethers.getContractFactory("StudyAnchor");
  const c = await f.deploy();
  await c.waitForDeployment();
  console.log("StudyAnchor deployed:", await c.getAddress());
  console.log("Set ANCHOR_CONTRACT_ADDRESS in .env");
}
main().catch((e) => { console.error(e); process.exit(1); });
