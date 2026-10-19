/**
 * Board ordering uses fractional `board_order` values so a move only rewrites
 * the moved card. Given the orders of the cards that will sit directly above
 * and below the dropped card, return an order that sorts between them.
 */
export function orderBetween(before: number | null | undefined, after: number | null | undefined): number {
  const hasBefore = typeof before === 'number' && Number.isFinite(before);
  const hasAfter = typeof after === 'number' && Number.isFinite(after);

  if (hasBefore && hasAfter) return (before! + after!) / 2;
  if (hasBefore) return before! + 1;
  if (hasAfter) return after! - 1;
  return 1;
}

/** Order for a card dropped at `index` in a column whose current orders are `orders` (sorted, excluding the moved card). */
export function orderForIndex(orders: number[], index: number): number {
  const i = Math.max(0, Math.min(index, orders.length));
  return orderBetween(orders[i - 1], orders[i]);
}
