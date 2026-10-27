// Server-rendered markup of the shared loading, error and empty states and
// the route files built from them (#85). Effects do not run here; reporting
// is covered by src/lib/error-reporting.test.ts.

import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import ProtectedError from "~/app/(protected)/error";
import ProtectedLoading from "~/app/(protected)/loading";
import ProtectedNotFound from "~/app/(protected)/not-found";
import PublicError from "~/app/(public)/error";
import AuthError from "~/app/auth/error";
import RootError from "~/app/error";
import GlobalError from "~/app/global-error";
import NotFound from "~/app/not-found";
import SuperadminError from "~/app/superadmin/error";
import SuperadminLoading from "~/app/superadmin/loading";
import { RouteError } from "~/components/errors/RouteError";
import { TenantProvider } from "~/components/TenantProvider";
import { defaultFeatureFlags } from "~/lib/features";
import { EmptyState } from "./empty-state";
import { ERROR_STATE_DEFAULT_TITLE, ErrorState } from "./error-state";
import {
	CardGridSkeleton,
	LOADING_LABEL,
	PageSkeleton,
	TableSkeleton,
} from "./page-skeleton";
import { SidebarProvider } from "./sidebar";

vi.mock("~/styles/globals.css", () => ({}));

const render = (el: ReactElement) => renderToStaticMarkup(el);
const count = (html: string, needle: string) => html.split(needle).length - 1;

/** What a Server Component error looks like in the browser in production. */
function serverError() {
	return Object.assign(
		new Error("SQLITE_CONSTRAINT: users.email = max@example.de"),
		{ digest: "3141592653" },
	);
}

describe("EmptyState", () => {
	test("shows title, explanation, icon and action", () => {
		const html = render(
			h(
				EmptyState,
				{
					icon: h("svg", { "data-icon": "x" }),
					title: "Keine Rechnungen",
					action: h("button", { type: "button" }, "Neu"),
				},
				"Erstelle die erste Rechnung.",
			),
		);
		expect(html).toContain("Keine Rechnungen");
		expect(html).toContain("Erstelle die erste Rechnung.");
		expect(html).toContain('<button type="button">Neu</button>');
		expect(html).toMatch(/aria-hidden="true"[^>]*><svg data-icon="x"/);
		expect(html).toContain("border-dashed");
	});

	test("plain variant has no frame, and optional parts are left out", () => {
		const html = render(h(EmptyState, { title: "Leer", variant: "plain" }));
		expect(html).not.toContain("border-dashed");
		expect(html).not.toContain("aria-hidden");
		expect(count(html, "<div")).toBe(1);
	});
});

describe("ErrorState", () => {
	test("German default text, retry button and digest", () => {
		const html = render(h(ErrorState, { digest: "abc123", onRetry: () => {} }));
		expect(html).toContain('role="alert"');
		expect(html).toContain(ERROR_STATE_DEFAULT_TITLE);
		expect(html).toContain("Erneut versuchen");
		expect(html).toContain("Fehlercode:");
		expect(html).toContain("abc123");
	});

	test("without digest or retry there is no code and no button", () => {
		const html = render(h(ErrorState, { title: "Kaputt" }, "Erklärung"));
		expect(html).toContain("Kaputt");
		expect(html).toContain("Erklärung");
		expect(html).not.toContain("Fehlercode");
		expect(html).not.toContain("<button");
	});

	test("custom retry label and a secondary action", () => {
		const html = render(
			h(ErrorState, {
				onRetry: () => {},
				retryLabel: "Neu laden",
				action: h("a", { href: "/" }, "Start"),
			}),
		);
		expect(html).toContain("Neu laden");
		expect(html).toContain('<a href="/">Start</a>');
	});
});

describe("skeletons", () => {
	test("announce one German label and hide the shapes", () => {
		for (const Skeleton of [TableSkeleton, CardGridSkeleton, PageSkeleton]) {
			const html = render(h(Skeleton));
			expect(count(html, 'role="status"')).toBe(1);
			expect(html).toContain(`<span class="sr-only">${LOADING_LABEL}</span>`);
			expect(html).toContain('aria-hidden="true"');
		}
	});

	test("rows, columns and cards follow the props", () => {
		const table = render(h(TableSkeleton, { rows: 3, columns: 2 }));
		// a header row plus three rows, two cells each
		expect(count(table, 'data-slot="skeleton"')).toBe(8);
		const grid = render(h(CardGridSkeleton, { cards: 2 }));
		expect(count(grid, 'data-slot="skeleton"')).toBe(6);
	});

	test("label null renders shapes only, for nesting", () => {
		const html = render(h(TableSkeleton, { label: null }));
		expect(html).not.toContain('role="status"');
		expect(html).not.toContain("sr-only");
	});

	test("a custom label replaces the default", () => {
		const html = render(h(TableSkeleton, { label: "Tab wird geladen…" }));
		expect(html).toContain("Tab wird geladen…");
		expect(html).not.toContain(LOADING_LABEL);
	});
});

describe("RouteError", () => {
	test("shows the digest but never the message", () => {
		const html = render(
			h(RouteError, {
				error: serverError(),
				retry: () => {},
				boundary: "test",
			}),
		);
		expect(html).toContain("3141592653");
		expect(html).toContain("Erneut versuchen");
		expect(html).toContain('href="/"');
		expect(html).toContain("Zur Startseite");
		expect(html).not.toContain("max@example.de");
		expect(html).not.toContain("SQLITE");
	});

	test("a client error without digest shows no code", () => {
		const html = render(
			h(RouteError, { error: "oops", retry: () => {}, boundary: "test" }),
		);
		expect(html).not.toContain("Fehlercode");
		expect(html).toContain("melde dich beim Admin");
		expect(html).not.toContain("oops");
	});

	test("custom and hidden home links", () => {
		const custom = render(
			h(RouteError, {
				error: null,
				retry: () => {},
				boundary: "t",
				home: { href: "/trinken", label: "Zur Getränkekarte" },
			}),
		);
		expect(custom).toContain('href="/trinken"');
		const none = render(
			h(RouteError, {
				error: null,
				retry: () => {},
				boundary: "t",
				home: null,
			}),
		);
		expect(none).not.toContain("<a");
	});

	test("works inside the tenant provider too", () => {
		const html = render(
			h(
				TenantProvider,
				// createElement passes children as the third argument.
				{
					value: {
						slug: "hassia",
						displayName: "Hassia",
						features: defaultFeatureFlags(),
					},
				} as Parameters<typeof TenantProvider>[0],
				h(RouteError, { error: null, retry: () => {}, boundary: "t" }),
			),
		);
		expect(html).toContain(ERROR_STATE_DEFAULT_TITLE);
	});
});

describe("route files", () => {
	const props = { error: serverError(), retry: () => {}, reset: () => {} };

	test.each([
		["root", RootError],
		["protected", ProtectedError],
		["public", PublicError],
		["auth", AuthError],
		["superadmin", SuperadminError],
		["global", GlobalError],
	] as const)("%s error.tsx: German, retry, digest, no message", (_, Boundary) => {
		const html = render(h(Boundary, props));
		expect(html).toContain(ERROR_STATE_DEFAULT_TITLE);
		expect(html).toContain("Erneut versuchen");
		expect(html).toContain("3141592653");
		expect(html).not.toContain("max@example.de");
	});

	test("global-error brings its own German document", () => {
		const html = render(h(GlobalError, props));
		expect(html).toMatch(/^<html lang="de">/);
		expect(html).toContain("<body><main");
		expect(html).toContain("<title>Fehler</title>");
	});

	test("the 404 pages are German", () => {
		expect(render(h(NotFound))).toContain("Seite nicht gefunden");
		const inApp = render(h(SidebarProvider, null, h(ProtectedNotFound)));
		expect(inApp).toContain("Seite nicht gefunden");
		expect(inApp).toContain('href="/trinken"');
	});

	test("loading.tsx files render a labelled skeleton", () => {
		const app = render(h(SidebarProvider, null, h(ProtectedLoading)));
		expect(app).toContain("Seite wird geladen…");
		expect(app).toContain('role="status"');
		expect(render(h(SuperadminLoading))).toContain('role="status"');
	});
});
