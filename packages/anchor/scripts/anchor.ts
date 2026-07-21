/**
 * Anchor pending roots from data/roots.json (plus methodology + private-tasks
 * at freeze). Skips labels already on-chain; batches the rest.
 *
 *   ANCHOR_CONTRACT_ADDRESS=0x.. pnpm anchor
 */
import hre from "hardhat";
import { readFileSync, existsSync } from "node:fs";
import { keccak256, utf8, toHex } from "@invigil/core";

const lbl = (s: string) => toHex(keccak256(utf8(s)));

async function main() {
  const addr = process.env.ANCHOR_CONTRACT_ADDRESS;
  if (!addr) throw new Error("ANCHOR_CONTRACT_ADDRESS not set");
  const c = await hre.ethers.getContractAt("StudyAnchor", addr);

  const labels: string[] = [];
  const roots: string[] = [];

  const push = async (label: string, root: string) => {
    const existing: string = await c.anchoredRoot(lbl(label));
    if (existing !== "0x" + "00".repeat(32)) {
      console.log(`skip ${label} (already anchored: ${existing})`);
      return;
    }
    labels.push(lbl(label));
    roots.push(root);
    console.log(`queue ${label} -> ${root}`);
  };

  if (existsSync("../../METHODOLOGY.frozen.hash")) {
    await push("methodology", readFileSync("../../METHODOLOGY.frozen.hash", "utf8").trim());
  }
  if (existsSync("../../data/private-tasks.root")) {
    await push("private-tasks", readFileSync("../../data/private-tasks.root", "utf8").trim());
  }
  if (existsSync("../../data/roots.json")) {
    const daily = JSON.parse(readFileSync("../../data/roots.json", "utf8"));
    for (const [date, v] of Object.entries<any>(daily)) await push(`day:${date}`, v.root);
  }

  if (labels.length === 0) { console.log("nothing to anchor"); return; }
  const tx = await c.anchorBatch(labels, roots);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log(`anchored ${labels.length} roots`);
}
main().catch((e) => { console.error(e); process.exit(1); });
