#!/usr/bin/env node
import { Command } from "commander";
import { verifyEvidenceDir, verifyAnchors } from "./verify.js";

const program = new Command()
  .name("invigil-verify")
  .description("Independently verify a Invigil evidence bundle")
  .argument("<dataDir>", "directory containing evidence/, receipts/, roots.json")
  .option("--rpc <url>", "EVM RPC endpoint for on-chain anchor checks")
  .option("--contract <address>", "StudyAnchor contract address")
  .action(async (dataDir: string, opts: { rpc?: string; contract?: string }) => {
    let results = verifyEvidenceDir(dataDir);
    if (opts.rpc && opts.contract) results = results.concat(await verifyAnchors(dataDir, opts.rpc, opts.contract));
    let failed = 0;
    for (const r of results) {
      console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail}`);
      if (!r.ok) failed++;
    }
    console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} CHECK(S) FAILED -- this bundle is not trustworthy.`);
    process.exit(failed === 0 ? 0 : 1);
  });

program.parseAsync();
