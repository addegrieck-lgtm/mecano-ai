import { buildDemoSnapshot } from "@/data/demo-data";
import { MemoryStore } from "@/lib/data/store";
import { servicesFor } from "@/lib/services";

export function demoStore() {
  return new MemoryStore(buildDemoSnapshot(new Date()));
}

export async function as(store: MemoryStore, userId: string, garageId = "g-dupont") {
  return servicesFor(store, userId, garageId);
}
