import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { fail, ok } from "~/lib/action-result";
import {
	createTenant,
	createUser,
	setFeature,
	setupTestDatabases,
	signInAs,
	signOut,
} from "../../../test/harness";
import {
	ActionError,
	defineAction,
	INVALID_INPUT,
	UNEXPECTED_ERROR,
} from "./define-action";
import { log } from "./log";

setupTestDatabases();

let logError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	logError = vi.spyOn(log, "error").mockResolvedValue(undefined);
});
afterEach(() => {
	vi.restoreAllMocks();
});

async function signInWith(roles: string[] = []) {
	await createTenant();
	const user = await createUser({ roles });
	signInAs(user);
	return user;
}

const greet = defineAction(
	{
		roles: ["Getränkewart", "Admin"],
		feature: "drinks.markup",
		schema: z.tuple([
			z.string().min(1, "Bitte einen Namen eingeben"),
			z.object({ loud: z.boolean() }).optional(),
		]),
	},
	async ([name, opts], { user }) => {
		if (name === "nobody") {
			throw new ActionError("Niemand ist da", "NOBODY");
		}
		if (name === "crash") {
			throw new Error("SQLITE_BUSY: database is locked at /srv/db");
		}
		const text = `Hallo ${name}, ich bin ${user.name}`;
		return opts?.loud ? text.toUpperCase() : text;
	},
);

describe("ActionResult helpers", () => {
	test("ok and fail build both sides of the union", () => {
		expect(ok()).toEqual({ ok: true, data: undefined });
		expect(ok(3)).toEqual({ ok: true, data: 3 });
		expect(fail("Nein")).toEqual({ ok: false, error: "Nein" });
		expect(fail("Nein", "NO")).toEqual({
			ok: false,
			error: "Nein",
			code: "NO",
		});
	});
});

describe("defineAction", () => {
	test("refuses callers who are not signed in", async () => {
		await createTenant({ features: ["drinks.markup"] });
		signOut();

		expect(await greet("Max")).toEqual({
			ok: false,
			error: "Nicht angemeldet",
			code: "UNAUTHENTICATED",
		});
	});

	test("refuses members without one of the roles", async () => {
		await signInWith(["Fuchs"]);
		await setFeature("drinks.markup", true);

		expect(await greet("Max")).toEqual({
			ok: false,
			error: "Keine Berechtigung",
			code: "FORBIDDEN",
		});
	});

	test("without roles, any active member may call it", async () => {
		const whoAmI = defineAction({}, async ({ user }) => user.id);
		const user = await signInWith();

		expect(await whoAmI()).toEqual({ ok: true, data: user.id });
	});

	test("refuses when the feature is off, before reading the input", async () => {
		await signInWith(["Getränkewart"]);

		expect(await greet("")).toEqual({
			ok: false,
			error: 'Die Funktion „Preisaufschlag" ist nicht freigeschaltet.',
			code: "FEATURE_DISABLED",
		});
	});

	test("rejects invalid input with a German message", async () => {
		await signInWith(["Getränkewart"]);
		await setFeature("drinks.markup", true);
		const call = greet as (...args: unknown[]) => ReturnType<typeof greet>;

		// The schema's own message wins.
		expect(await greet("")).toEqual({
			ok: false,
			error: "Bitte einen Namen eingeben",
			code: "INVALID_INPUT",
		});
		// Otherwise zod's German one.
		const wrongType = await call(42);
		expect(wrongType).toMatchObject({ ok: false, code: "INVALID_INPUT" });
		expect(!wrongType.ok && wrongType.error).toMatch(/^Ungültige Eingabe/);
		expect(await call("Max", { loud: "ja" })).toMatchObject({
			ok: false,
			code: "INVALID_INPUT",
		});
		expect(INVALID_INPUT).toBe("Ungültige Eingabe");
	});

	test("answers a thrown ActionError with its message and code", async () => {
		await signInWith(["Admin"]);
		await setFeature("drinks.markup", true);

		expect(await greet("nobody")).toEqual({
			ok: false,
			error: "Niemand ist da",
			code: "NOBODY",
		});
		expect(logError).not.toHaveBeenCalled();
	});

	test("logs an unexpected error and answers without its details", async () => {
		await signInWith(["Admin"]);
		await setFeature("drinks.markup", true);

		const result = await greet("crash");

		expect(result).toEqual({
			ok: false,
			error: UNEXPECTED_ERROR,
			code: "INTERNAL",
		});
		expect(JSON.stringify(result)).not.toMatch(/SQLITE|srv/);
		expect(logError).toHaveBeenCalledWith("server action failed", {
			err: expect.objectContaining({ message: expect.stringMatching(/BUSY/) }),
		});
	});

	test("an action can name its own message for unexpected errors", async () => {
		const broken = defineAction(
			{ errorMessage: "Fehler beim Speichern" },
			async () => {
				throw new Error("boom");
			},
		);
		await signInWith();

		expect(await broken()).toEqual({
			ok: false,
			error: "Fehler beim Speichern",
			code: "INTERNAL",
		});
		expect(logError).toHaveBeenCalledOnce();
	});

	test("succeeds with the body's data and the parsed arguments", async () => {
		await signInWith(["Getränkewart"]);
		await setFeature("drinks.markup", true);

		expect(await greet("Max")).toEqual({
			ok: true,
			data: expect.stringMatching(/^Hallo Max, ich bin Test User/),
		});
		expect(await greet("Max", { loud: true })).toEqual({
			ok: true,
			data: expect.stringMatching(/^HALLO MAX/),
		});
	});

	test("revalidates the given paths only after success", async () => {
		const save = defineAction(
			{ revalidate: ["/getraenkewart"], schema: z.tuple([z.boolean()]) },
			async ([works]) => {
				if (!works) {
					throw new ActionError("Nein");
				}
			},
		);
		await signInWith();

		expect(await save(false)).toMatchObject({ ok: false });
		expect(revalidatePath).not.toHaveBeenCalled();
		expect(await save(true)).toEqual({ ok: true, data: undefined });
		expect(revalidatePath).toHaveBeenCalledWith("/getraenkewart");
	});

	test("lets Next's redirect through", async () => {
		const leave = defineAction({}, async () => redirect("/login"));
		await signInWith();

		await expect(leave()).rejects.toThrow("NEXT_REDIRECT");
		expect(logError).not.toHaveBeenCalled();
	});
});
