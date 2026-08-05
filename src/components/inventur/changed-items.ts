export function removeSavedItemIds(
	changedItems: ReadonlySet<string>,
	savedItemIds: Iterable<string>,
): Set<string> {
	const remainingItems = new Set(changedItems);
	for (const drinkId of savedItemIds) remainingItems.delete(drinkId);
	return remainingItems;
}
