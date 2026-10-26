// scripts/dev/run.ts — run a command with the local-only environment.
//
//   tsx scripts/dev/run.ts next dev --turbo
//
// See `local-env.ts`: production credentials from `.env` are blanked and the
// app talks to the libSQL files in `.data/` (create them with
// `pnpm db:local:reset`).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import { LOCAL_DB, localEnv } from "./local-env";

const [command, ...args] = process.argv.slice(2);
if (!command) {
	console.error("Usage: tsx scripts/dev/run.ts <command> [...args]");
	process.exit(2);
}
if (!existsSync(LOCAL_DB.control)) {
	console.error("No local databases yet. Run `pnpm db:local:reset` first.");
	process.exit(1);
}

const child = spawn(command, args, { stdio: "inherit", env: localEnv() });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
	}
	process.exit(code ?? 1);
});
