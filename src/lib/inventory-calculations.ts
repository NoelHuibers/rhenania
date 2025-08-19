import {
  InventoryCountStorage,
  OpeningStockStorage,
  ProductStorage,
  PurchaseStorage,
  SaleStorage,
  StockAdjustmentStorage,
} from "./storage";
import type { InventoryItem } from "./types";

export function calculateInventoryData(): InventoryItem[] {
  const products = ProductStorage.getAll();

  return products.map((product) => {
    // Get opening stock (sum of all opening stock entries for this product)
    const openingStockEntries = OpeningStockStorage.getByProduct(product.id);
    const opening_stock = openingStockEntries.reduce(
      (sum, entry) => sum + entry.quantity,
      0
    );

    // Get total purchases
    const purchases = PurchaseStorage.getByProduct(product.id);
    const total_purchased = purchases.reduce(
      (sum, purchase) => sum + purchase.quantity,
      0
    );

    // Get total sales
    const sales = SaleStorage.getByProduct(product.id);
    const total_sold = sales.reduce((sum, sale) => sum + sale.quantity, 0);

    // Get stock adjustments
    const adjustments = StockAdjustmentStorage.getByProduct(product.id);
    const total_adjustments = adjustments.reduce(
      (sum, adj) => sum + adj.adjustment_quantity,
      0
    );

    // Calculate theoretical stock
    const theoretical_stock =
      opening_stock + total_purchased - total_sold + total_adjustments;

    // Get latest inventory count
    const latestCount = InventoryCountStorage.getLatestByProduct(product.id);
    const last_count_quantity = latestCount?.actual_quantity || null;
    const last_count_date = latestCount?.count_date || null;

    // Calculate loss
    const loss_quantity =
      last_count_quantity !== null
        ? theoretical_stock - last_count_quantity
        : 0;

    const loss_percentage =
      theoretical_stock > 0 && last_count_quantity !== null
        ? (loss_quantity / theoretical_stock) * 100
        : 0;

    return {
      product,
      opening_stock,
      total_purchased,
      total_sold,
      theoretical_stock,
      last_count_quantity,
      last_count_date,
      loss_quantity,
      loss_percentage,
    };
  });
}

export function initializeSampleData(): void {
  // Only initialize if no products exist
  if (ProductStorage.getAll().length > 0) return;

  // Add sample products
  const beer = ProductStorage.add({
    name: "Premium Lager",
    category: "Beer",
    unit: "bottles",
    cost_per_unit: 2.5,
  });

  const wine = ProductStorage.add({
    name: "House Red Wine",
    category: "Wine",
    unit: "bottles",
    cost_per_unit: 12.0,
  });

  const spirits = ProductStorage.add({
    name: "Premium Vodka",
    category: "Spirits",
    unit: "bottles",
    cost_per_unit: 25.0,
  });

  // Add sample opening stock
  OpeningStockStorage.add({
    product_id: beer.id,
    quantity: 100,
    date: "2024-01-01",
  });

  OpeningStockStorage.add({
    product_id: wine.id,
    quantity: 50,
    date: "2024-01-01",
  });

  OpeningStockStorage.add({
    product_id: spirits.id,
    quantity: 25,
    date: "2024-01-01",
  });

  // Add sample purchases
  PurchaseStorage.add({
    product_id: beer.id,
    quantity: 200,
    cost_per_unit: 2.5,
    total_cost: 500,
    supplier: "Beer Distributor Co.",
    purchase_date: "2024-01-15",
  });

  // Add sample sales
  SaleStorage.add({
    product_id: beer.id,
    quantity: 150,
    price_per_unit: 5.0,
    total_revenue: 750,
    sale_date: "2024-01-20",
  });

  // Add sample inventory count
  InventoryCountStorage.add({
    product_id: beer.id,
    actual_quantity: 140,
    count_date: "2024-01-31",
    notes: "Monthly inventory count",
  });
}
