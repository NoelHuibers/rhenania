import { describe, expect, test } from "vitest";

import { escapeHtml } from "./html";

describe("escapeHtml", () => {
	test("neutralises markup and attribute breakouts", () => {
		expect(escapeHtml('<script>alert("x")</script>')).toBe(
			"&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
		);
		expect(escapeHtml(`"><a href='evil'>`)).toBe(
			"&quot;&gt;&lt;a href=&#39;evil&#39;&gt;",
		);
		expect(escapeHtml("Müller & Söhne")).toBe("Müller &amp; Söhne");
	});

	test("handles numbers and empty values", () => {
		expect(escapeHtml(3)).toBe("3");
		expect(escapeHtml(null)).toBe("");
		expect(escapeHtml(undefined)).toBe("");
	});
});
