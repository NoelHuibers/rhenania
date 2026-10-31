// domain-error.ts — failures a service reports to the user (#33).
//
// Services throw these instead of returning `null`, `[]` or `false`; the
// message is German and meant for the user, the code is for code that
// needs to tell failures apart. `defineAction` answers them with
// `fail(message, code)`. Anything that is not a DomainError is an
// unexpected failure: it is logged and the user sees a generic message.

export class DomainError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
		this.name = new.target.name;
	}
}

/** The thing the caller asked for does not exist (in this tenant). */
export class NotFoundError extends DomainError {
	constructor(message: string, code = "NOT_FOUND") {
		super(message, code);
	}
}

/** The request clashes with the current state, e.g. a carried bill. */
export class ConflictError extends DomainError {
	constructor(message: string, code = "CONFLICT") {
		super(message, code);
	}
}

/** The input passed the schema but breaks a domain rule. */
export class ValidationError extends DomainError {
	constructor(message: string, code = "INVALID_INPUT") {
		super(message, code);
	}
}
