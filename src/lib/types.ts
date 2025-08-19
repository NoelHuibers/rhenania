export interface Product {
  id: string;
  name: string;
  category: string;
  unit: string; // e.g., "bottles", "cases", "liters"
  cost_per_unit: number;
  created_at: string;
  updated_at: string;
}

export interface OpeningStock {
  id: string;
  product_id: string;
  quantity: number;
  date: string;
  created_at: string;
}

export interface Purchase {
  id: string;
  product_id: string;
  quantity: number;
  cost_per_unit: number;
  total_cost: number;
  supplier: string;
  purchase_date: string;
  created_at: string;
}

export interface Sale {
  id: string;
  product_id: string;
  quantity: number;
  price_per_unit: number;
  total_revenue: number;
  sale_date: string;
  created_at: string;
}

export interface InventoryCount {
  id: string;
  product_id: string;
  actual_quantity: number;
  count_date: string;
  notes?: string;
  created_at: string;
}

export interface StockAdjustment {
  id: string;
  product_id: string;
  adjustment_quantity: number;
  reason: string;
  adjustment_date: string;
  created_at: string;
}

// Calculated inventory data for display
export interface InventoryItem {
  product: Product;
  opening_stock: number;
  total_purchased: number;
  total_sold: number;
  theoretical_stock: number;
  last_count_quantity: number | null;
  last_count_date: string | null;
  loss_quantity: number;
  loss_percentage: number;
}

// Filter and sort options
export interface InventoryFilters {
  category?: string;
  search?: string;
  sortBy: "name" | "category" | "theoretical_stock" | "loss_percentage";
  sortOrder: "asc" | "desc";
}
