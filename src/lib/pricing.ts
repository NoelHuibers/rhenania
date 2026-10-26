// pricing.ts — drink price math shared by the menu, order creation and the
// profit figures in the Inventur.
//
// `drink.price` is always the purchase price. With the `drinks.markup`
// feature, personal orders are charged purchase price + markup, rounded to
// whole cents per unit. Group bookings (CC, AKN, …) never carry a markup.

import { addMoney, pctOf, roundToCent } from "./money";

export const MAX_MARKUP_PERCENT = 500;

export function isValidMarkupPercent(value: number): boolean {
	return Number.isFinite(value) && value >= 0 && value <= MAX_MARKUP_PERCENT;
}

/**
 * Purchase price plus markup, rounded half up to whole cents. Computed in
 * integer cents: 1.90 € + 15 % is exactly 2.185 € and becomes 2.19 €, where
 * `1.9 * 1.15` in floating point (2.18499…) would round down.
 */
export function applyMarkup(price: number, markupPercent: number): number {
	if (!isValidMarkupPercent(markupPercent) || markupPercent === 0) {
		return price;
	}
	return addMoney(price, pctOf(price, markupPercent));
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

/**
 * Order total in whole cents. `markupPercent` no longer changes the result;
 * the parameter stays so call sites keep reading naturally.
 */
export function orderTotal(
	unitPrice: number,
	amount: number,
	_markupPercent: number,
): number {
	return roundToCent(unitPrice * amount);
}
