#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { planUnits, runCampaign, merkleizeAll, writeManifest, type CampaignOptions } from "./campaign.js";

const program = new Command().name("invigil").description("Invigil Study 001 campaign runner");

function opts(cmd: any): CampaignOptions {
  const o = cmd.optsWithGlobals();
  const repoRoot = resolve(o.root);
  return {
    repoRoot,
    dataDir: resolve(o.data),
    studyConfigPath: resolve(repoRoot, "configs/study.yaml"),
    probesConfigPath: resolve(repoRoot, "configs/probes.yaml"),
    providersDir: resolve(repoRoot, "configs/providers"),
    families: o.family ? [o.family] : undefined,
    maxUnits: o.max ? parseInt(o.max, 10) : undefined,
  };
}

program
  .option("--root <dir>", "repo root", ".")
  .option("--data <dir>", "data directory", "./data");

program.command("plan").description("expand configs into work units; write manifest").action(function (this: any) {
  const o = opts(this);
  const units = planUnits(o);
  const manifest = writeManifest(o);
  console.log(`planned ${units.length} units; manifest: ${manifest}`);
});

program.command("run").description("execute all currently eligible units, then exit (cron-friendly)")
  .option("--family <family>", "bench|greedy|logprob|context")
  .option("--max <n>", "cap units this invocation")
  .action(async function (this: any) {
    const report = await runCampaign(opts(this));
    console.log(JSON.stringify(report, null, 2));
    if (report.nextWake) console.log(`next eligible work at ${report.nextWake}`);
  });

program.command("merkleize").description("compute daily Merkle roots over the evidence log").action(function (this: any) {
  const roots = merkleizeAll(opts(this).dataDir);
  console.log(JSON.stringify(roots, null, 2));
});

program.command("status").description("checkpoint progress").action(async function (this: any) {
  const o = opts(this);
  const { Checkpoint } = await import("./checkpoint.js");
  const cp = new Checkpoint(resolve(o.dataDir, "checkpoint.json"));
  const total = planUnits(o).length;
  console.log(`${cp.doneCount()}/${total} units complete`);
});

program.parseAsync();
