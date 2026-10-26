// Accessibility: axe-core scan of the main screens per role.
//
// The app has known violations today (see #76, #77). They're recorded per
// route in `a11y-baseline.json`; the test fails on any NEW rule violation
// or when a known rule hits more elements than before. Fixing issues and
// running `A11Y_UPDATE=1 pnpm test:e2e --grep @a11y` shrinks the baseline.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

import { HASSIA, RHENANIA, signIn, USERS } from "./support";

type Baseline = Record<string, Record<string, number>>;
const BASELINE_FILE = path.resolve("e2e/a11y-baseline.json");
const baseline: Baseline = existsSync(BASELINE_FILE)
	? JSON.parse(readFileSync(BASELINE_FILE, "utf8"))
	: {};
const updated: Baseline = {};

const SCREENS: Array<{
	name: string;
	url: string;
	user?: string;
	origin?: string;
}> = [
	{ name: "landing-rhenania", url: `${RHENANIA}/` },
	{ name: "landing-hassia", url: `${HASSIA}/` },
	{ name: "signin", url: `${RHENANIA}/auth/signin` },
	{ name: "forgot-password", url: `${RHENANIA}/auth/forgot-password` },
	{ name: "trinken", url: `${RHENANIA}/trinken`, user: USERS.rhMember },
	{ name: "profile", url: `${RHENANIA}/profile`, user: USERS.rhMember },
	{ name: "rechnungen", url: `${RHENANIA}/rechnungen`, user: USERS.rhMember },
	{
		name: "semesterprogramm",
		url: `${RHENANIA}/semesterprogramm`,
		user: USERS.rhMember,
	},
	{ name: "leaderboard", url: `${RHENANIA}/leaderboard`, user: USERS.rhMember },
	{
		name: "getraenkewart",
		url: `${RHENANIA}/getraenkewart`,
		user: USERS.rhWart,
	},
	{
		name: "getraenkewart-kasse",
		url: `${RHENANIA}/getraenkewart?tab=kasse`,
		user: USERS.rhWart,
	},
	{ name: "admin", url: `${RHENANIA}/admin`, user: USERS.rhAdmin },
	{ name: "cc-kasse", url: `${RHENANIA}/cc-kasse`, user: USERS.rhAdmin },
	{
		name: "trinken-hassia",
		url: `${HASSIA}/trinken`,
		user: USERS.haMember,
		origin: HASSIA,
	},
];

async function violationsFor(page: Page) {
	const result = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
		.analyze();
	const counts: Record<string, number> = {};
	for (const v of result.violations) {
		if (v.impact !== "serious" && v.impact !== "critical") continue;
		counts[v.id] = v.nodes.length;
	}
	return { counts, violations: result.violations };
}

test.describe("accessibility @a11y", () => {
	for (const screen of SCREENS) {
		test(`${screen.name} has no new serious axe violations`, async ({
			page,
		}) => {
			if (screen.user)
				await signIn(page, screen.user, screen.origin ?? RHENANIA);
			// Scan the settled page: no GSAP/framer intro animations mid-flight.
			await page.emulateMedia({ reducedMotion: "reduce" });
			await page.goto(screen.url, { waitUntil: "networkidle" });
			const { counts, violations } = await violationsFor(page);
			updated[screen.name] = counts;

			if (process.env.A11Y_UPDATE) return;
			const known = baseline[screen.name] ?? {};
			const regressions = Object.entries(counts)
				.filter(([rule, n]) => n > (known[rule] ?? 0))
				.map(([rule, n]) => {
					const v = violations.find((x) => x.id === rule);
					return `${rule} (${n} > ${known[rule] ?? 0}): ${v?.help} — e.g. ${v?.nodes[0]?.target.join(" ")}`;
				});
			expect(
				regressions,
				`new accessibility violations on ${screen.name}`,
			).toEqual([]);
		});
	}

	test.afterAll(() => {
		if (!process.env.A11Y_UPDATE) return;
		const merged = { ...baseline, ...updated };
		const sorted = Object.fromEntries(Object.entries(merged).sort());
		writeFileSync(BASELINE_FILE, `${JSON.stringify(sorted, null, "\t")}\n`);
	});
});
