// orders.ts — the Fuchsenladen orders moved to modules/fuchsenladen (#33).
//
// Not a "use server" module: it only passes on the profile's two reads, for
// the profile code that still imports them from here
// (actions/profile/page-queries.test.ts, components/profile). Delete it
// once those import ~/server/modules/fuchsenladen/actions.

export {
	getMyFuchsenOrders,
	getMyFuchsenSummary,
} from "~/server/modules/fuchsenladen/actions";
