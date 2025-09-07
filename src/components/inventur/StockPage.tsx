"use server";

import { Suspense } from "react";
import {
  getInventoryHistory,
  getStockData,
} from "~/server/actions/inventur/inventur";
import StockTracker from "./StockTracker";

export default async function StockPage() {
  const initialData = await getStockData();
  const history = await getInventoryHistory();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <StockTracker initialData={initialData} initialHistory={history} />
    </Suspense>
  );
}
