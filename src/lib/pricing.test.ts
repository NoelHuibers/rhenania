import assert from "node:assert/strict";
import test from "node:test";
import {
	applyMarkup,
	isValidMarkupPercent,
	orderTotal,
	roundToCent,
	unitPriceFor,
} from "./pricing";

test("rounds to whole cents, half up", () => {
	assert.equal(roundToCent(0.759), 0.76);
	assert.equal(roundToCent(1.005), 1.01);
	assert.equal(roundToCent(0.7245), 0.72);
});

test("adds the markup and rounds per unit", () => {
	assert.equal(applyMarkup(0.69, 10), 0.76);
	assert.equal(applyMarkup(1, 15), 1.15);
	assert.equal(applyMarkup(0.67, 12.5), 0.75);
});

test("no markup leaves the price untouched", () => {
	assert.equal(applyMarkup(0.69, 0), 0.69);
});

test("an invalid markup is ignored", () => {
	assert.equal(applyMarkup(0.69, -5), 0.69);
	assert.equal(applyMarkup(0.69, Number.NaN), 0.69);
	assert.equal(isValidMarkupPercent(501), false);
	assert.equal(isValidMarkupPercent(20), true);
});

test("group bookings never carry a markup", () => {
	assert.equal(unitPriceFor(0.69, 10, "CC"), 0.69);
	assert.equal(unitPriceFor(0.69, 10, null), 0.76);
});

test("order total is rounded when a markup applies", () => {
	assert.equal(orderTotal(0.76, 3, 10), 2.28);
	// Without markup the total stays exactly what it was before the feature.
	assert.equal(orderTotal(0.69, 3, 0), 0.69 * 3);
});
