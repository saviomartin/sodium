/**
 * In-memory demo store. Survives HMR via globalThis; resets on restart.
 * This is deliberately trivial — the fixture exists to prove the analysis →
 * review → publish → runtime path, not to be a real shop.
 */

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  status: "pending" | "shipped" | "canceled";
}

export interface ContactMessage {
  name: string;
  email: string;
  topic: string;
  message: string;
  at: string;
}

interface FixtureState {
  products: Product[];
  cart: Map<string, number>;
  orders: Order[];
  messages: ContactMessage[];
}

const globalStore = globalThis as unknown as { __fixtureState?: FixtureState };

function initialState(): FixtureState {
  return {
    products: [
      { id: "widget", name: "Widget", price: 9.99, stock: 42 },
      { id: "gadget", name: "Gadget", price: 19.99, stock: 7 },
      { id: "doohickey", name: "Doohickey", price: 4.5, stock: 130 },
    ],
    cart: new Map(),
    orders: [
      { id: "ord_1001", productId: "widget", quantity: 2, status: "pending" },
      { id: "ord_1002", productId: "gadget", quantity: 1, status: "shipped" },
    ],
    messages: [],
  };
}

export function store(): FixtureState {
  globalStore.__fixtureState ??= initialState();
  return globalStore.__fixtureState;
}

/** Fixture-only: restores the pristine demo data (used by the e2e suite). */
export function resetStore(): void {
  globalStore.__fixtureState = initialState();
}
