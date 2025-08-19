import type { InventoryItem } from "./types";

export function exportToCSV(
  data: InventoryItem[],
  filename = "inventory-report"
) {
  // Define CSV headers
  const headers = [
    "Product Name",
    "Category",
    "Unit",
    "Cost Per Unit",
    "Opening Stock",
    "Total Purchased",
    "Total Sold",
    "Theoretical Stock",
    "Last Count Quantity",
    "Last Count Date",
    "Loss Quantity",
    "Loss Percentage",
    "Stock Value",
    "Loss Value",
  ];

  // Convert data to CSV rows
  const rows = data.map((item) => [
    item.product.name,
    item.product.category,
    item.product.unit,
    item.product.cost_per_unit.toFixed(2),
    item.opening_stock.toString(),
    item.total_purchased.toString(),
    item.total_sold.toString(),
    item.theoretical_stock.toString(),
    item.last_count_quantity?.toString() || "",
    item.last_count_date || "",
    item.loss_quantity.toString(),
    item.loss_percentage.toFixed(2),
    (item.theoretical_stock * item.product.cost_per_unit).toFixed(2),
    (item.loss_quantity * item.product.cost_per_unit).toFixed(2),
  ]);

  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map((row) => row.map((field) => `"${field}"`).join(","))
    .join("\n");

  // Create and download file
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `${filename}-${new Date().toISOString().split("T")[0]}.csv`
  );
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function printInventoryReport(data: InventoryItem[]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const totalStockValue = data.reduce(
    (sum, item) => sum + item.theoretical_stock * item.product.cost_per_unit,
    0
  );
  const totalLossValue = data.reduce(
    (sum, item) => sum + item.loss_quantity * item.product.cost_per_unit,
    0
  );

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Inventory Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .summary { display: flex; justify-content: space-around; margin-bottom: 30px; }
          .summary-item { text-align: center; }
          .summary-value { font-size: 24px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; font-weight: bold; }
          .text-right { text-align: right; }
          .text-red { color: #dc2626; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Beverage Inventory Report</h1>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
        </div>
        
        <div class="summary">
          <div class="summary-item">
            <div class="summary-value">${data.length}</div>
            <div>Total Products</div>
          </div>
          <div class="summary-item">
            <div class="summary-value">$${totalStockValue.toFixed(2)}</div>
            <div>Stock Value</div>
          </div>
          <div class="summary-item">
            <div class="summary-value text-red">$${totalLossValue.toFixed(
              2
            )}</div>
            <div>Loss Value</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th class="text-right">Theoretical</th>
              <th class="text-right">Last Count</th>
              <th class="text-right">Loss Qty</th>
              <th class="text-right">Loss %</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (item) => `
              <tr>
                <td>${item.product.name}</td>
                <td>${item.product.category}</td>
                <td class="text-right">${item.theoretical_stock}</td>
                <td class="text-right">${item.last_count_quantity || "-"}</td>
                <td class="text-right ${
                  item.loss_quantity > 0 ? "text-red" : ""
                }">${item.loss_quantity || "-"}</td>
                <td class="text-right ${
                  item.loss_percentage > 0 ? "text-red" : ""
                }">${item.loss_percentage.toFixed(1)}%</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
