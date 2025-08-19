import type {
  InventoryCount,
  OpeningStock,
  Product,
  Purchase,
  Sale,
  StockAdjustment,
} from "./types";

// Generic localStorage utilities
export class LocalStorage {
  static get<T>(key: string): T[] {
    if (typeof window === "undefined") return [];
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  static set<T>(key: string, data: T[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify(data));
  }

  static add<T extends { id: string }>(
    key: string,
    item: Omit<T, "id" | "created_at">
  ): T {
    const items = this.get<T>(key);
    const newItem = {
      ...item,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    } as unknown as T;
    items.push(newItem);
    this.set(key, items);
    return newItem;
  }

  static update<T extends { id: string }>(
    key: string,
    id: string,
    updates: Partial<T>
  ): T | null {
    const items = this.get<T>(key);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return null;

    items[index] = {
      ...items[index],
      ...updates,
      updated_at: new Date().toISOString(),
    } as unknown as T;
    this.set(key, items);
    return items[index];
  }

  static delete<T extends { id: string }>(key: string, id: string): boolean {
    const items = this.get<T>(key);
    const filteredItems = items.filter((item) => item.id !== id);
    if (filteredItems.length === items.length) return false;

    this.set(key, filteredItems);
    return true;
  }
}

// Specific data access functions
export const ProductStorage = {
  getAll: () => LocalStorage.get<Product>("products"),
  add: (product: Omit<Product, "id" | "created_at" | "updated_at">) =>
    LocalStorage.add<Product>("products", {
      ...product,
      updated_at: new Date().toISOString(),
    }),
  update: (id: string, updates: Partial<Product>) =>
    LocalStorage.update<Product>("products", id, updates),
  delete: (id: string) => LocalStorage.delete<Product>("products", id),
};

export const OpeningStockStorage = {
  getAll: () => LocalStorage.get<OpeningStock>("opening_stock"),
  add: (stock: Omit<OpeningStock, "id" | "created_at">) =>
    LocalStorage.add<OpeningStock>("opening_stock", stock),
  getByProduct: (productId: string) =>
    LocalStorage.get<OpeningStock>("opening_stock").filter(
      (s) => s.product_id === productId
    ),
};

export const PurchaseStorage = {
  getAll: () => LocalStorage.get<Purchase>("purchases"),
  add: (purchase: Omit<Purchase, "id" | "created_at">) =>
    LocalStorage.add<Purchase>("purchases", purchase),
  getByProduct: (productId: string) =>
    LocalStorage.get<Purchase>("purchases").filter(
      (p) => p.product_id === productId
    ),
};

export const SaleStorage = {
  getAll: () => LocalStorage.get<Sale>("sales"),
  add: (sale: Omit<Sale, "id" | "created_at">) =>
    LocalStorage.add<Sale>("sales", sale),
  getByProduct: (productId: string) =>
    LocalStorage.get<Sale>("sales").filter((s) => s.product_id === productId),
};

export const InventoryCountStorage = {
  getAll: () => LocalStorage.get<InventoryCount>("inventory_counts"),
  add: (count: Omit<InventoryCount, "id" | "created_at">) =>
    LocalStorage.add<InventoryCount>("inventory_counts", count),
  getByProduct: (productId: string) =>
    LocalStorage.get<InventoryCount>("inventory_counts").filter(
      (c) => c.product_id === productId
    ),
  getLatestByProduct: (productId: string) => {
    const counts = LocalStorage.get<InventoryCount>("inventory_counts")
      .filter((c) => c.product_id === productId)
      .sort(
        (a, b) =>
          new Date(b.count_date).getTime() - new Date(a.count_date).getTime()
      );
    return counts[0] || null;
  },
};

export const StockAdjustmentStorage = {
  getAll: () => LocalStorage.get<StockAdjustment>("stock_adjustments"),
  add: (adjustment: Omit<StockAdjustment, "id" | "created_at">) =>
    LocalStorage.add<StockAdjustment>("stock_adjustments", adjustment),
  getByProduct: (productId: string) =>
    LocalStorage.get<StockAdjustment>("stock_adjustments").filter(
      (a) => a.product_id === productId
    ),
};
