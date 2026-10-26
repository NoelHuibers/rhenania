// scripts/grant-superadmin.ts
//
// Bootstrap a platform superadmin by email.
//
//   pnpm tsx scripts/grant-superadmin.ts <email> [--reason "bootstrap"]
//
// Idempotent: re-running for an already-granted user is a no-op.
// The user must already exist in the control DB (i.e. they've signed up
// to at least one tenant via the normal flow).

import "dotenv/config";

import { eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import { superAdmins, users } from "~/server/db/control-schema";

function parseArgs() {
	const args = process.argv.slice(2);
	const email = args.find((a) => !a.startsWith("--"));
	const reasonIdx = args.indexOf("--reason");
	const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : "bootstrap";
	if (!email) {
		console.error(
			'Usage: pnpm tsx scripts/grant-superadmin.ts <email> [--reason "..."]',
		);
		process.exit(1);
	}
	return { email: email.toLowerCase(), reason: reason ?? "bootstrap" };
}

async function main() {
	const { email, reason } = parseArgs();

	const [user] = await controlDb
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);

	if (!user) {
		console.error(`No control-DB user with email '${email}'.`);
		console.error(
			"User must sign up to at least one tenant via the normal flow first.",
		);
		process.exit(1);
	}

	const [existing] = await controlDb
		.select({ userId: superAdmins.userId })
		.from(superAdmins)
		.where(eq(superAdmins.userId, user.id))
		.limit(1);

	if (existing) {
		console.log(`✓ ${user.email} is already a superadmin (no-op)`);
		process.exit(0);
	}

	await controlDb.insert(superAdmins).values({
		userId: user.id,
		grantedBy: null,
		reason,
	});

	console.log(`✅ Granted superadmin to ${user.email} (reason: ${reason})`);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
