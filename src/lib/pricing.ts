// pricing.ts — drink price math shared by the menu, order creation and the
// profit figures in the Inventur.
//
// `drink.price` is always the purchase price. With the `drinks.markup`
// feature, personal orders are charged purchase price + markup, rounded to
// whole cents per unit. Group bookings (CC, AKN, …) never carry a markup.

export const MAX_MARKUP_PERCENT = 500;

/** Rounds a euro amount to whole cents, half up, without float drift. */
export function roundToCent(amount: number): number {
	return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function isValidMarkupPercent(value: number): boolean {
	return Number.isFinite(value) && value >= 0 && value <= MAX_MARKUP_PERCENT;
}

/** Purchase price plus markup, rounded to whole cents. */
export function applyMarkup(price: number, markupPercent: number): number {
	if (!isValidMarkupPercent(markupPercent) || markupPercent === 0) {
		return price;
	}
	return roundToCent(price * (1 + markupPercent / 100));
}

/**
 * What one unit costs the buyer. `bookingFor` set means a group booking,
 * which is always charged the purchase price.
 */
export function unitPriceFor(
	price: number,
	markupPercent: number,
	bookingFor: string | null | undefined,
): number {
	return bookingFor ? price : applyMarkup(price, markupPercent);
}

/** Order total; rounded to cents only when a markup is in play. */
export function orderTotal(
	unitPrice: number,
	amount: number,
	markupPercent: number,
): number {
	const total = unitPrice * amount;
	return markupPercent > 0 ? roundToCent(total) : total;
}
