// Checks the colour tokens in globals.css against WCAG 2.2 AA, in light and
// dark: text pairs need 4.5:1, the focus ring 3:1 against the surfaces it is
// drawn on (#76).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const css = readFileSync(
	path.resolve(__dirname, "../src/styles/globals.css"),
	"utf8",
);

function block(selector: string): Record<string, string> {
	const start = css.indexOf(`${selector} {`);
	if (start < 0) {
		throw new Error(`No ${selector} block in globals.css`);
	}
	const body = css.slice(start, css.indexOf("}", start));
	const vars: Record<string, string> = {};
	for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
		vars[m[1] as string] = (m[2] as string).trim();
	}
	return vars;
}

type Rgba = { r: number; g: number; b: number; a: number };

/** oklch(L C H [/ A%]) → linear sRGB (clamped) plus alpha. */
function parseOklch(value: string): Rgba {
	const m =
		/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)/.exec(
			value,
		);
	if (!m) {
		throw new Error(`Not an oklch() colour: ${value}`);
	}
	const L = Number(m[1]);
	const C = Number(m[2]);
	const h = (Number(m[3]) * Math.PI) / 180;
	const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
	const a = C * Math.cos(h);
	const b = C * Math.sin(h);
	const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const clamp = (x: number) => Math.min(1, Math.max(0, x));
	return {
		r: clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
		g: clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
		b: clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
		a: alpha,
	};
}

// Alpha blending happens in gamma-encoded sRGB in browsers.
const encode = (x: number) =>
	x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
const decode = (x: number) =>
	x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;

function over(top: Rgba, bottom: Rgba): Rgba {
	const mix = (t: number, u: number) =>
		decode(encode(t) * top.a + encode(u) * (1 - top.a));
	return {
		r: mix(top.r, bottom.r),
		g: mix(top.g, bottom.g),
		b: mix(top.b, bottom.b),
		a: 1,
	};
}

const luminance = (c: Rgba) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

function contrast(a: Rgba, b: Rgba): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
		number,
		number,
	];
	return (hi + 0.05) / (lo + 0.05);
}

const light = block(":root");
const themes = { light, dark: { ...light, ...block(".dark") } };

describe.each(Object.entries(themes))("%s theme", (_name, vars) => {
	const color = (name: string) => {
		const v = vars[name];
		if (!v) {
			throw new Error(`--${name} is not defined`);
		}
		return parseOklch(v);
	};
	const surfaces = ["background", "card", "popover", "muted"].map((s) =>
		over(color(s), color("background")),
	);

	test.each([
		"success",
		"warning",
		"info",
		"destructive",
		"primary",
	])("text on solid %s reads at 4.5:1", (status) => {
		expect(
			contrast(color(`${status}-foreground`), color(status)),
		).toBeGreaterThanOrEqual(4.5);
	});

	test.each([
		"success",
		"warning",
		"info",
		"danger",
	])("%s status text reads at 4.5:1 on its tint and on every surface", (status) => {
		const text = color(`${status}-muted-foreground`);
		const tints = ["background", "card"].map((s) =>
			over(color(`${status}-muted`), over(color(s), color("background"))),
		);
		for (const bg of [...tints, ...surfaces]) {
			expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
		}
	});

	test.each([
		"success",
		"info",
		"destructive",
		"primary",
	])("solid %s doubles as text colour on page, card and popover", (status) => {
		for (const s of ["background", "card", "popover"]) {
			const bg = over(color(s), color("background"));
			expect(contrast(color(status), bg)).toBeGreaterThanOrEqual(4.5);
		}
	});

	test("secondary text reads at 4.5:1 on every surface, including muted", () => {
		for (const bg of surfaces) {
			expect(contrast(color("muted-foreground"), bg)).toBeGreaterThanOrEqual(
				4.5,
			);
		}
	});

	test("the focus ring stands out at 3:1 from every surface", () => {
		for (const ring of ["ring", "sidebar-ring"]) {
			for (const bg of [...surfaces, color("sidebar")]) {
				expect(contrast(color(ring), bg)).toBeGreaterThanOrEqual(3);
			}
		}
	});
});
