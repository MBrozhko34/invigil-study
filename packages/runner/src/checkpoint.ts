/** Resumable campaign state. Atomic write (tmp+rename) -- a 13k-request campaign WILL be interrupted. */
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface CheckpointState {
  completed: Record<string, string>; // unitKey -> ISO completion time
}

export class Checkpoint {
  private state: CheckpointState;
  constructor(private path: string) {
    this.state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { completed: {} };
  }
  isDone(key: string): boolean { return key in this.state.completed; }
  completedAt(key: string): Date | null {
    return key in this.state.completed ? new Date(this.state.completed[key]) : null;
  }
  markDone(key: string, at: Date): void {
    this.state.completed[key] = at.toISOString();
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.path);
  }
  doneCount(): number { return Object.keys(this.state.completed).length; }
}
