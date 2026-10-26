// Sidebar open/collapsed state cookie. The client sidebar provider writes it;
// the protected layout reads it on the server so the first paint matches what
// the member chose last time. No imports, so both sides can use it.

export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Whether the desktop sidebar starts expanded. Collapsed unless chosen. */
export function isSidebarOpen(cookieValue: string | undefined): boolean {
	return cookieValue === "true";
}
