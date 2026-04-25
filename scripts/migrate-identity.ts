// scripts/migrate-identity.ts
//
// One-shot data copy: pulls identity rows from the Rhenania DB into the
// control DB. Run AFTER `pnpm db:control:migrate` (so the destination tables
// exist) and BEFORE `pnpm db:migrate` (which drops the source tables).
//
// Idempotent: re-running is safe — uses ON CONFLICT DO NOTHING on PKs and
// unique tokens. Existing control-DB rows are not overwritten.
//
// Source side uses raw libSQL queries (the drizzle definitions for these
// tables have already been removed from `~/server/db/schema.ts`).
//
//   pnpm tsx scripts/migrate-identity.ts

import "dotenv/config";

import { createClient } from "@libsql/client";

import { env } from "~/env";
import { controlDb } from "~/server/db/control";
import {
	accounts as controlAccounts,
	passwordResetTokens as controlPasswordResetTokens,
	sessions as controlSessions,
	users as controlUsers,
	verifications as controlVerifications,
} from "~/server/db/control-schema";

const source = createClient({
	url: env.DATABASE_URL,
	authToken: env.DATABASE_AUTH_TOKEN,
});

function toDate(v: unknown): Date | null {
	if (v == null) return null;
	if (typeof v === "number") return new Date(v * 1000);
	if (typeof v === "string") {
		const n = Number(v);
		if (!Number.isNaN(n)) return new Date(n * 1000);
		return new Date(v);
	}
	if (v instanceof Date) return v;
	return null;
}

function reqDate(v: unknown, fallback: Date): Date {
	return toDate(v) ?? fallback;
}

function asString(v: unknown): string | null {
	return v == null ? null : String(v);
}

function asBool(v: unknown): boolean {
	if (typeof v === "boolean") return v;
	if (typeof v === "number") return v !== 0;
	if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
	return false;
}

async function copyUsers() {
	const rs = await source.execute("SELECT * FROM rhenania_user");
	console.log(`  users: ${rs.rows.length} source rows`);
	if (rs.rows.length === 0) return;

	const now = new Date();
	const rows = rs.rows.map((r) => ({
		id: String(r.id),
		name: asString(r.name),
		email: String(r.email),
		emailVerified: asBool(r.emailVerified),
		image: asString(r.image),
		createdAt: reqDate(r.createdAt, now),
		updatedAt: reqDate(r.updatedAt, now),
	}));

	await controlDb
		.insert(controlUsers)
		.values(rows)
		.onConflictDoNothing({ target: controlUsers.id });
	console.log(`  users: copied`);
}

async function copyAccounts() {
	const rs = await source.execute("SELECT * FROM rhenania_account");
	console.log(`  accounts: ${rs.rows.length} source rows`);
	if (rs.rows.length === 0) return;

	const now = new Date();
	const rows = rs.rows.map((r) => ({
		id: String(r.id),
		accountId: String(r.accountId),
		providerId: String(r.providerId),
		userId: String(r.userId),
		accessToken: asString(r.accessToken),
		refreshToken: asString(r.refreshToken),
		idToken: asString(r.idToken),
		accessTokenExpiresAt: toDate(r.accessTokenExpiresAt),
		refreshTokenExpiresAt: toDate(r.refreshTokenExpiresAt),
		scope: asString(r.scope),
		password: asString(r.password),
		createdAt: reqDate(r.createdAt, now),
		updatedAt: reqDate(r.updatedAt, now),
	}));

	await controlDb
		.insert(controlAccounts)
		.values(rows)
		.onConflictDoNothing({ target: controlAccounts.id });
	console.log(`  accounts: copied`);
}

async function copySessions() {
	const rs = await source.execute("SELECT * FROM rhenania_session");
	console.log(`  sessions: ${rs.rows.length} source rows`);
	if (rs.rows.length === 0) return;

	const now = new Date();
	const rows = rs.rows.map((r) => ({
		id: String(r.id),
		expiresAt: reqDate(r.expiresAt, now),
		token: String(r.token),
		createdAt: reqDate(r.createdAt, now),
		updatedAt: reqDate(r.updatedAt, now),
		ipAddress: asString(r.ipAddress),
		userAgent: asString(r.userAgent),
		userId: String(r.userId),
	}));

	await controlDb
		.insert(controlSessions)
		.values(rows)
		.onConflictDoNothing({ target: controlSessions.id });
	console.log(`  sessions: copied`);
}

async function copyVerifications() {
	const rs = await source.execute("SELECT * FROM rhenania_verification");
	console.log(`  verifications: ${rs.rows.length} source rows`);
	if (rs.rows.length === 0) return;

	const rows = rs.rows.map((r) => ({
		id: String(r.id),
		identifier: String(r.identifier),
		value: String(r.value),
		expiresAt: reqDate(r.expiresAt, new Date()),
		createdAt: toDate(r.createdAt),
		updatedAt: toDate(r.updatedAt),
	}));

	await controlDb
		.insert(controlVerifications)
		.values(rows)
		.onConflictDoNothing({ target: controlVerifications.id });
	console.log(`  verifications: copied`);
}

async function copyPasswordResetTokens() {
	const rs = await source.execute(
		"SELECT * FROM rhenania_password_reset_token",
	);
	console.log(`  passwordResetTokens: ${rs.rows.length} source rows`);
	if (rs.rows.length === 0) return;

	const rows = rs.rows.map((r) => ({
		id: String(r.id),
		email: String(r.email),
		token: String(r.token),
		expires: reqDate(r.expires, new Date()),
		createdAt: toDate(r.createdAt),
	}));

	await controlDb
		.insert(controlPasswordResetTokens)
		.values(rows)
		.onConflictDoNothing({ target: controlPasswordResetTokens.id });
	console.log(`  passwordResetTokens: copied`);
}

async function main() {
	console.log("Copying identity data: Rhenania DB → control DB");
	await copyUsers();
	await copyAccounts();
	await copySessions();
	await copyVerifications();
	await copyPasswordResetTokens();
	console.log("✅ Done");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
