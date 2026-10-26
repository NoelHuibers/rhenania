// log.ts — minimal structured server logging.
//
// One JSON object per line, so Vercel's log search can filter by field
// (`level`, `msg`, `tenant`, …). Never log secrets, tokens or personal data
// such as email addresses; pass ids or kinds instead.

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function write(level: Level, msg: string, fields?: Fields) {
	const line = JSON.stringify({
		level,
		msg,
		...fields,
		time: new Date().toISOString(),
	});
	if (level === "error") {
		console.error(line);
	} else if (level === "warn") {
		console.warn(line);
	} else {
		// biome-ignore lint/suspicious/noConsole: the logger is the one place that writes info lines
		console.info(line);
	}
}

export const log = {
	info: (msg: string, fields?: Fields) => write("info", msg, fields),
	warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
	error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
