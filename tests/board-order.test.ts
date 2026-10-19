import { describe, it, expect } from 'vitest';
import { orderBetween, orderForIndex } from '../src/lib/board/order';

describe('board ordering', () => {
  it('places a card between neighbors', () => {
    expect(orderBetween(1, 2)).toBe(1.5);
    expect(orderBetween(null, 3)).toBe(2);
    expect(orderBetween(3, undefined)).toBe(4);
    expect(orderBetween(null, null)).toBe(1);
  });

  it('computes order for a drop index', () => {
    const orders = [1, 2, 3];
    expect(orderForIndex(orders, 0)).toBe(0);
    expect(orderForIndex(orders, 1)).toBe(1.5);
    expect(orderForIndex(orders, 3)).toBe(4);
    expect(orderForIndex(orders, 99)).toBe(4);
    expect(orderForIndex([], 0)).toBe(1);
  });

  it('keeps a strict order after many inserts at the same slot', () => {
    let orders = [1, 2];
    for (let i = 0; i < 40; i++) {
      const o = orderForIndex(orders, 1);
      orders = [orders[0], o, ...orders.slice(1)];
    }
    for (let i = 1; i < orders.length; i++) expect(orders[i]).toBeGreaterThan(orders[i - 1]);
  });
});
