// tenant-provisioning.ts — create a tenant as a resumable, idempotent run.
//
// A run is one `control_tenant_provisioning` row keyed by slug. `step` is the
// last step that completed:
//
//   requested     row created; no Turso DB exists under the name yet
//   db_requested  about to create the Turso DB (a crash here may leave one)
//   db_created    Turso DB exists, URL recorded
//   token         auth token minted and recorded
//   migrated      tenant migrations applied
//   seeded        default roles, singletons and enums inserted
//   control_rows  tenant (status `pending`) + auth config inserted in ONE
//                 batch together with this step, so there is never a
//                 half-created tenant row
//   domain        primary hostname attached (optional input)
//   first_admin   first admin: membership, user mirror, Admin role (optional)
//   active        tenant switched to `active`
//
// Every step is safe to repeat. When a step fails the run keeps its state
// and records the error; running `provisionTenant` again with the same slug
// continues with the failed step (nothing is rolled back, so a slow Turso
// call or a function timeout costs no work). `abandonTenantProvisioning`
// throws a run away: it deletes the Turso DB and any control rows.
// A lease on the row keeps two runs for the same slug from overlapping.

import path from "node:path";
import { and, eq, isNull, lt, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { controlDb } from "~/server/db/control";
import {
	users as controlUsers,
	PROVISIONING_STEPS,
	type ProvisioningStep,
	tenantAuthConfig,
	tenantDomains,
	tenantFeatures,
	tenantMemberships,
	tenantProvisioning,
	tenants,
} from "~/server/db/control-schema";
import { createClient } from "~/server/db/libsql";
import * as tenantSchema from "~/server/db/schema";
import { log } from "~/server/lib/log";
import {
	commitTenantConfigChange,
	invalidateTenantConfig,
} from "~/server/lib/tenant-config";
import { seedTenantDefaults } from "~/server/lib/tenant-seed";
import {
	createDatabase,
	createDatabaseToken,
	deleteDatabase,
	getDatabase,
	tursoDatabaseNameForSlug,
} from "~/server/lib/turso-platform";
import { upsertUserMirror } from "~/server/lib/user-mirror";

/** Longer than any function run, so a crashed run's lease runs out. */
const LEASE_MS = 15 * 60_000;

type ProvisioningRun = typeof tenantProvisioning.$inferSelect;

function validateSlug(slug: string): void {
	if (!/^[a-z][a-z0-9-]{2,30}$/.test(slug)) {
		throw new Error(
			"Slug must be 3-31 chars, lowercase letters/digits/dashes, starting with a letter.",
		);
	}
}

function normalizeHostname(raw: string | null | undefined): string | null {
	const host = raw?.trim().toLowerCase();
	if (!host) {
		return null;
	}
	if (!/^[a-z0-9.-]+$/.test(host)) {
		throw new Error("Invalid hostname characters");
	}
	return host;
}

function normalizeEmail(raw: string | null | undefined): string | null {
	const email = raw?.trim().toLowerCase();
	return email ? email : null;
}

const stepIndex = (step: ProvisioningStep) => PROVISIONING_STEPS.indexOf(step);
const isPast = (run: ProvisioningRun, step: ProvisioningStep) =>
	stepIndex(run.step) >= stepIndex(step);

export type ProvisionTenantInput = {
	slug: string;
	displayName: string;
	/** Attached as the tenant's primary domain. */
	primaryHostname?: string | null;
	/** Existing account that becomes the tenant's first Admin. */
	firstAdminEmail?: string | null;
};

export type ProvisionTenantResult = {
	tenantId: string;
	dbName: string;
	dbUrl: string;
};

/** A run stopped at `step`; running it again resumes there. */
export class ProvisioningStepError extends Error {
	constructor(
		readonly slug: string,
		readonly step: ProvisioningStep,
		cause: unknown,
	) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		super(
			`Provisioning '${slug}' stopped at step '${step}': ${reason}. Run it again to resume.`,
			{ cause },
		);
		this.name = "ProvisioningStepError";
	}
}

async function findUserByEmail(email: string) {
	const [user] = await controlDb
		.select()
		.from(controlUsers)
		.where(eq(controlUsers.email, email))
		.limit(1);
	return user ?? null;
}

async function hostnameOwner(host: string): Promise<string | null> {
	const [row] = await controlDb
		.select({ tenantId: tenantDomains.tenantId })
		.from(tenantDomains)
		.where(eq(tenantDomains.hostname, host))
		.limit(1);
	return row?.tenantId ?? null;
}

async function loadRun(slug: string): Promise<ProvisioningRun | null> {
	const [run] = await controlDb
		.select()
		.from(tenantProvisioning)
		.where(eq(tenantProvisioning.slug, slug))
		.limit(1);
	return run ?? null;
}

async function claimLease(slug: string): Promise<ProvisioningRun> {
	const now = new Date();
	const [run] = await controlDb
		.update(tenantProvisioning)
		.set({ leaseUntil: new Date(now.getTime() + LEASE_MS) })
		.where(
			and(
				eq(tenantProvisioning.slug, slug),
				or(
					isNull(tenantProvisioning.leaseUntil),
					lt(tenantProvisioning.leaseUntil, now),
				),
			),
		)
		.returning();
	if (!run) {
		throw new Error(`Provisioning of '${slug}' is already running.`);
	}
	return run;
}

async function releaseLease(slug: string, lastError: string | null) {
	await controlDb
		.update(tenantProvisioning)
		.set({ leaseUntil: null, lastError })
		.where(eq(tenantProvisioning.slug, slug));
}

/** Validates the input and creates or updates the run, before any side effect. */
async function prepareRun(input: ProvisionTenantInput): Promise<string> {
	const slug = input.slug.trim().toLowerCase();
	const displayName = input.displayName.trim();
	validateSlug(slug);
	if (!displayName) {
		throw new Error("displayName is required.");
	}
	const dbName = tursoDatabaseNameForSlug(slug);
	const primaryHostname = normalizeHostname(input.primaryHostname);
	const firstAdminEmail = normalizeEmail(input.firstAdminEmail);

	const run = await loadRun(slug);
	const [existingTenant] = await controlDb
		.select({ id: tenants.id })
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);
	const resumable =
		run !== null &&
		run.step !== "active" &&
		run.tenantId === existingTenant?.id;
	if (existingTenant && !resumable) {
		throw new Error(`Tenant '${slug}' already exists in the control DB.`);
	}
	if (run?.step === "active") {
		throw new Error(`Tenant '${slug}' was already provisioned.`);
	}

	if (firstAdminEmail && !(await findUserByEmail(firstAdminEmail))) {
		throw new Error(
			`No account with email '${firstAdminEmail}'. The first admin must have signed in once before.`,
		);
	}
	if (primaryHostname) {
		const owner = await hostnameOwner(primaryHostname);
		if (owner && owner !== run?.tenantId) {
			throw new Error("Hostname already registered to another tenant");
		}
	}

	if (!run) {
		await controlDb
			.insert(tenantProvisioning)
			.values({ slug, displayName, dbName, primaryHostname, firstAdminEmail })
			.onConflictDoNothing();
		return slug;
	}

	// Resuming: new inputs apply to the steps that haven't run yet.
	const patch: Partial<ProvisioningRun> = {};
	if (!isPast(run, "control_rows")) {
		patch.displayName = displayName;
	}
	if (primaryHostname && !isPast(run, "domain")) {
		patch.primaryHostname = primaryHostname;
	}
	if (firstAdminEmail && !isPast(run, "first_admin")) {
		patch.firstAdminEmail = firstAdminEmail;
	}
	if (Object.keys(patch).length > 0) {
		await controlDb
			.update(tenantProvisioning)
			.set(patch)
			.where(eq(tenantProvisioning.slug, slug));
	}
	return slug;
}

type TenantConnection = ReturnType<typeof openTenantDb>;

function openTenantDb(run: ProvisioningRun) {
	if (!run.dbUrl) {
		throw new Error("Tenant DB URL missing.");
	}
	const client = createClient({
		url: run.dbUrl,
		authToken: run.dbAuthToken ?? undefined,
	});
	return { client, db: drizzle(client, { schema: tenantSchema }) };
}

class StepRunner {
	private connection: TenantConnection | null = null;

	constructor(private run: ProvisioningRun) {}

	get current() {
		return this.run;
	}

	private tenantDb() {
		this.connection ??= openTenantDb(this.run);
		return this.connection.db;
	}

	close() {
		this.connection?.client.close();
		this.connection = null;
	}

	private requireTenantId(): string {
		if (!this.run.tenantId) {
			throw new Error("Tenant row missing.");
		}
		return this.run.tenantId;
	}

	private async advance(
		step: ProvisioningStep,
		patch: Partial<ProvisioningRun> = {},
	) {
		const [run] = await controlDb
			.update(tenantProvisioning)
			.set({ ...patch, step })
			.where(eq(tenantProvisioning.slug, this.run.slug))
			.returning();
		if (!run) {
			throw new Error("Provisioning record disappeared.");
		}
		this.run = run;
	}

	/** Runs `step`, which must leave the run at `step` when it returns. */
	async perform(step: ProvisioningStep): Promise<void> {
		const run = this.run;
		switch (step) {
			case "requested":
				return;
			case "db_requested": {
				// Before anything exists under this name, refuse to adopt a DB
				// this run didn't create.
				if (await getDatabase(run.dbName)) {
					throw new Error(
						`Turso DB '${run.dbName}' already exists but was not created by this run. Delete it or pick another slug.`,
					);
				}
				return this.advance("db_requested");
			}
			case "db_created": {
				// A previous attempt may have created it and died before
				// recording the URL; pick that DB up instead of failing.
				const db =
					(await getDatabase(run.dbName)) ?? (await createDatabase(run.dbName));
				return this.advance("db_created", { dbUrl: db.url });
			}
			case "token": {
				const token = await createDatabaseToken(run.dbName);
				return this.advance("token", { dbAuthToken: token });
			}
			case "migrated": {
				await migrate(this.tenantDb(), {
					migrationsFolder: path.join(process.cwd(), "drizzle"),
				});
				return this.advance("migrated");
			}
			case "seeded": {
				await seedTenantDefaults(this.tenantDb());
				return this.advance("seeded");
			}
			case "control_rows": {
				if (!run.dbUrl) {
					throw new Error("Tenant DB URL missing.");
				}
				const tenantId = crypto.randomUUID();
				await controlDb.batch([
					controlDb.insert(tenants).values({
						id: tenantId,
						slug: run.slug,
						displayName: run.displayName,
						status: "pending",
						dbUrl: run.dbUrl,
						dbAuthToken: run.dbAuthToken,
					}),
					controlDb.insert(tenantAuthConfig).values({
						tenantId,
						emailPasswordEnabled: true,
						microsoftEnabled: false,
					}),
					controlDb
						.update(tenantProvisioning)
						.set({ tenantId, step: "control_rows" })
						.where(eq(tenantProvisioning.slug, run.slug)),
				]);
				invalidateTenantConfig(tenantId);
				const reloaded = await loadRun(run.slug);
				if (!reloaded) {
					throw new Error("Provisioning record disappeared.");
				}
				this.run = reloaded;
				return;
			}
			case "domain": {
				const tenantId = this.requireTenantId();
				const host = run.primaryHostname;
				if (host) {
					const owner = await hostnameOwner(host);
					if (owner && owner !== tenantId) {
						throw new Error(`Hostname '${host}' belongs to another tenant`);
					}
					if (!owner) {
						await commitTenantConfigChange(tenantId, [
							controlDb.insert(tenantDomains).values({
								tenantId,
								hostname: host,
								isPrimary: true,
								isCustom: !host.endsWith("localhost"),
								verifiedAt: new Date(),
							}),
						]);
					}
				}
				return this.advance("domain");
			}
			case "first_admin": {
				const tenantId = this.requireTenantId();
				if (run.firstAdminEmail) {
					await this.grantFirstAdmin(tenantId, run.firstAdminEmail);
				}
				return this.advance("first_admin");
			}
			case "active": {
				const tenantId = this.requireTenantId();
				await commitTenantConfigChange(tenantId, [
					controlDb
						.update(tenants)
						.set({ status: "active" })
						.where(eq(tenants.id, tenantId)),
					controlDb
						.update(tenantProvisioning)
						.set({
							step: "active",
							completedAt: new Date(),
							dbAuthToken: null,
							lastError: null,
							leaseUntil: null,
						})
						.where(eq(tenantProvisioning.slug, run.slug)),
				]);
				const reloaded = await loadRun(run.slug);
				if (reloaded) {
					this.run = reloaded;
				}
				return;
			}
		}
	}

	private async grantFirstAdmin(tenantId: string, email: string) {
		const user = await findUserByEmail(email);
		if (!user) {
			throw new Error(`No account with email '${email}'`);
		}
		await controlDb
			.insert(tenantMemberships)
			.values({ userId: user.id, tenantId, status: "active" })
			.onConflictDoUpdate({
				target: [tenantMemberships.userId, tenantMemberships.tenantId],
				set: { status: "active" },
			});

		const tdb = this.tenantDb();
		await upsertUserMirror(tdb, user);
		const [adminRole] = await tdb
			.select({ id: tenantSchema.roles.id })
			.from(tenantSchema.roles)
			.where(eq(tenantSchema.roles.name, "Admin"))
			.limit(1);
		if (!adminRole) {
			throw new Error("The tenant DB has no 'Admin' role");
		}
		await tdb
			.insert(tenantSchema.userRoles)
			.values({ userId: user.id, roleId: adminRole.id })
			.onConflictDoNothing();
	}
}

/**
 * Creates a tenant, or resumes the unfinished run for the same slug.
 * Throws `ProvisioningStepError` when a step fails; the run then keeps its
 * progress and the error until it is run again or abandoned.
 */
export async function provisionTenant(
	input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
	const slug = await prepareRun(input);
	const runner = new StepRunner(await claimLease(slug));
	let failedAt: ProvisioningStep | null = null;
	try {
		await controlDb
			.update(tenantProvisioning)
			.set({ attempts: runner.current.attempts + 1 })
			.where(eq(tenantProvisioning.slug, slug));
		for (const step of PROVISIONING_STEPS) {
			if (isPast(runner.current, step)) {
				continue;
			}
			failedAt = step;
			await runner.perform(step);
		}
		failedAt = null;
	} catch (err) {
		const error = new ProvisioningStepError(slug, failedAt ?? "requested", err);
		await releaseLease(slug, error.message).catch((releaseErr) =>
			log.error("provisioning error could not be recorded", {
				slug,
				err: releaseErr,
			}),
		);
		throw error;
	} finally {
		runner.close();
	}

	const run = runner.current;
	if (!run.tenantId || !run.dbUrl) {
		throw new Error(`Provisioning '${slug}' finished without a tenant.`);
	}
	return { tenantId: run.tenantId, dbName: run.dbName, dbUrl: run.dbUrl };
}

export type UnfinishedProvisioning = {
	slug: string;
	displayName: string;
	step: ProvisioningStep;
	tenantId: string | null;
	lastError: string | null;
	attempts: number;
	running: boolean;
	updatedAt: Date;
};

/** Runs that have not reached `active`, newest first. No secrets. */
export async function listUnfinishedProvisionings(): Promise<
	UnfinishedProvisioning[]
> {
	const rows = await controlDb
		.select()
		.from(tenantProvisioning)
		.where(ne(tenantProvisioning.step, "active"));
	const now = Date.now();
	return rows
		.map((r) => ({
			slug: r.slug,
			displayName: r.displayName,
			step: r.step,
			tenantId: r.tenantId,
			lastError: r.lastError,
			attempts: r.attempts,
			running: r.leaseUntil !== null && r.leaseUntil.getTime() > now,
			updatedAt: r.updatedAt,
		}))
		.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Throws an unfinished run away: deletes its Turso DB first, then its
 * control rows (the pending tenant with its domains, auth config,
 * memberships and flags) and the run itself, so the slug is free again.
 * If the DB can't be deleted nothing else is removed.
 */
export async function abandonTenantProvisioning(slug: string): Promise<void> {
	const existing = await loadRun(slug);
	if (!existing) {
		throw new Error(`No provisioning run for '${slug}'.`);
	}
	const [tenant] = existing.tenantId
		? await controlDb
				.select({ status: tenants.status })
				.from(tenants)
				.where(eq(tenants.id, existing.tenantId))
				.limit(1)
		: [];
	if (existing.step === "active" || tenant?.status === "active") {
		throw new Error(`Tenant '${slug}' is active; it can't be abandoned.`);
	}
	const run = await claimLease(slug);

	if (isPast(run, "db_requested")) {
		try {
			if (await getDatabase(run.dbName)) {
				await deleteDatabase(run.dbName);
			}
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			const message = `Could not delete Turso DB '${run.dbName}': ${reason}. Nothing else was removed; try again or delete it by hand.`;
			await releaseLease(slug, message);
			throw new Error(message);
		}
	}

	const tenantId = run.tenantId;
	if (tenantId) {
		await controlDb.batch([
			controlDb
				.delete(tenantDomains)
				.where(eq(tenantDomains.tenantId, tenantId)),
			controlDb
				.delete(tenantAuthConfig)
				.where(eq(tenantAuthConfig.tenantId, tenantId)),
			controlDb
				.delete(tenantMemberships)
				.where(eq(tenantMemberships.tenantId, tenantId)),
			controlDb
				.delete(tenantFeatures)
				.where(eq(tenantFeatures.tenantId, tenantId)),
			controlDb.delete(tenants).where(eq(tenants.id, tenantId)),
			controlDb
				.delete(tenantProvisioning)
				.where(eq(tenantProvisioning.slug, slug)),
		]);
		invalidateTenantConfig(tenantId);
		return;
	}
	await controlDb
		.delete(tenantProvisioning)
		.where(eq(tenantProvisioning.slug, slug));
}
