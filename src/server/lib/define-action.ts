// define-action.ts — one way to write a server action (#59).
//
//   export const deleteBankEntry = defineAction(
//     { roles: ROLES.getraenke, schema: z.tuple([z.string()]) },
//     async ([id], { tenant, user }) => { … },
//   );
//
// The wrapper checks the caller (any active member, or one of `roles`), the
// feature flag and the arguments (`schema` describes the argument list as a
// zod tuple), builds the request's TenantScope (#33) and runs the body with
// it and the caller, then answers with an ActionResult. The body (or the
// service it calls) throws a DomainError, e.g. ActionError, for a failure
// the user should read; anything else is logged and answered with a generic
// German message, so no internals reach the browser. Next's own
// control-flow errors (redirect, notFound) pass through.

import "server-only";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { type ActionResult, fail, ok } from "~/lib/action-result";
import type { FeatureKey } from "~/lib/features";
import { AuthzError, type Member, requireCaller } from "~/server/lib/authz";
import { DomainError } from "~/server/lib/domain-error";
import { FeatureDisabledError, requireFeature } from "~/server/lib/features";
import { log } from "~/server/lib/log";
import { scopeOf, type TenantScope } from "~/server/lib/tenant-scope";

/** A failure the user should read, e.g. "Rechnung nicht gefunden". */
export class ActionError extends DomainError {
	constructor(message: string, code = "ACTION_FAILED") {
		super(message, code);
	}
}

export const UNEXPECTED_ERROR =
	"Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.";
export const INVALID_INPUT = "Ungültige Eingabe";

const germanErrors = z.locales.de().localeError;

type ActionOptions = {
	/** Who may call it; any active member of the Corps when omitted. */
	roles?: readonly string[];
	/** The feature flag the action belongs to. */
	feature?: FeatureKey;
	/** Paths to revalidate after the action succeeded. */
	revalidate?: readonly string[];
	/** Shown instead of UNEXPECTED_ERROR when the body fails unexpectedly. */
	errorMessage?: string;
};

export type ActionContext = {
	/** The caller's tenant: its database and the clock. */
	tenant: TenantScope;
	user: Member;
};

type ArgsSchema = z.ZodType<unknown[], unknown[]>;

export function defineAction<S extends ArgsSchema, T>(
	options: ActionOptions & { schema: S },
	handler: (args: z.output<S>, ctx: ActionContext) => Promise<T>,
): (...args: z.input<S>) => Promise<ActionResult<T>>;
export function defineAction<T>(
	options: ActionOptions & { schema?: undefined },
	handler: (ctx: ActionContext) => Promise<T>,
): () => Promise<ActionResult<T>>;
export function defineAction(
	options: ActionOptions & { schema?: ArgsSchema },
	handler:
		| ((args: unknown[], ctx: ActionContext) => Promise<unknown>)
		| ((ctx: ActionContext) => Promise<unknown>),
) {
	return async (...args: unknown[]): Promise<ActionResult<unknown>> => {
		try {
			const { member: user, tenantId } = await requireCaller(options.roles);
			if (options.feature) {
				await requireFeature(options.feature);
			}

			let parsedArgs: unknown[] | undefined;
			if (options.schema) {
				const parsed = options.schema.safeParse(args, {
					error: germanErrors,
				});
				if (!parsed.success) {
					return fail(
						parsed.error.issues[0]?.message ?? INVALID_INPUT,
						"INVALID_INPUT",
					);
				}
				parsedArgs = parsed.data;
			}

			// The tenant the guard checked the membership in.
			const ctx: ActionContext = { tenant: await scopeOf(tenantId), user };
			const data = await (parsedArgs
				? (
						handler as (args: unknown[], ctx: ActionContext) => Promise<unknown>
					)(parsedArgs, ctx)
				: (handler as (ctx: ActionContext) => Promise<unknown>)(ctx));

			for (const path of options.revalidate ?? []) {
				revalidatePath(path);
			}
			return ok(data);
		} catch (error) {
			unstable_rethrow(error);
			if (error instanceof DomainError || error instanceof AuthzError) {
				return fail(error.message, error.code);
			}
			if (error instanceof FeatureDisabledError) {
				return fail(error.message, "FEATURE_DISABLED");
			}
			await log.error("server action failed", { err: error });
			return fail(options.errorMessage ?? UNEXPECTED_ERROR, "INTERNAL");
		}
	};
}
