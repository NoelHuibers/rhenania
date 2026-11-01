import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
	acquireDeployLock,
	deployMode,
	releaseDeployLock,
} from "./deploy-migrations";

describe("deployMode", () => {
	test("local builds skip", () => {
		expect(deployMode({})).toEqual({
			run: false,
			reason: "not a Vercel build",
		});
	});

	test("preview builds skip", () => {
		expect(deployMode({ VERCEL: "1", VERCEL_ENV: "preview" })).toEqual({
			run: false,
			reason: "VERCEL_ENV=preview",
		});
	});

	test("production builds migrate", () => {
		expect(deployMode({ VERCEL: "1", VERCEL_ENV: "production" })).toEqual({
			run: true,
		});
	});

	test("a Vercel build without VERCEL_ENV fails instead of skipping", () => {
		expect(() => deployMode({ VERCEL: "1" })).toThrow(/VERCEL_ENV/);
	});
});

describe("deploy lock", () => {
	let dir: string;
	let client: Client;
	let clock: number;
	const now = () => clock;
	// Advances the fake clock instead of waiting.
	const sleep = async (ms: number) => {
		clock += ms;
	};
	const quiet = () => {};

	beforeEach(() => {
		dir = mkdtempSync(path.join(os.tmpdir(), "rhenania-lock-"));
		client = createClient({ url: `file:${path.join(dir, "control.db")}` });
		clock = 1_000_000;
	});
	afterEach(() => {
		client.close();
		rmSync(dir, { recursive: true, force: true });
	});

	const opts = { leaseMs: 60_000, waitMs: 30_000, pollMs: 5_000, now, sleep };

	test("a free lock is taken and released", async () => {
		await acquireDeployLock(client, "build-a", { ...opts, log: quiet });
		await releaseDeployLock(client, "build-a");
		await acquireDeployLock(client, "build-b", { ...opts, log: quiet });
		const rs = await client.execute("SELECT holder FROM __deploy_lock");
		expect(rs.rows.map((r) => r.holder)).toEqual(["build-b"]);
	});

	test("a second build waits, then gives up while the lease is held", async () => {
		await acquireDeployLock(client, "build-a", { ...opts, log: quiet });
		const waits: string[] = [];
		await expect(
			acquireDeployLock(client, "build-b", {
				...opts,
				log: (line) => waits.push(line),
			}),
		).rejects.toThrow(/held by build-a/);
		expect(waits.length).toBeGreaterThan(0);
	});

	test("a second build gets the lock once the first releases it", async () => {
		await acquireDeployLock(client, "build-a", { ...opts, log: quiet });
		let polls = 0;
		await acquireDeployLock(client, "build-b", {
			...opts,
			log: quiet,
			sleep: async (ms) => {
				clock += ms;
				polls += 1;
				if (polls === 2) {
					await releaseDeployLock(client, "build-a");
				}
			},
		});
		const rs = await client.execute("SELECT holder FROM __deploy_lock");
		expect(rs.rows[0]?.holder).toBe("build-b");
	});

	test("an expired lease (crashed build) is taken over", async () => {
		await acquireDeployLock(client, "crashed", { ...opts, log: quiet });
		clock += 61_000;
		await acquireDeployLock(client, "build-b", { ...opts, log: quiet });
		const rs = await client.execute("SELECT holder FROM __deploy_lock");
		expect(rs.rows[0]?.holder).toBe("build-b");
	});

	test("releasing only removes the caller's own lease", async () => {
		await acquireDeployLock(client, "build-a", { ...opts, log: quiet });
		await releaseDeployLock(client, "build-b");
		const rs = await client.execute("SELECT holder FROM __deploy_lock");
		expect(rs.rows[0]?.holder).toBe("build-a");
	});
});
