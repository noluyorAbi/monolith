import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface Order {
  id: string;
  createdAt: string;
  login: string;
  year: number;
  variant: string;
  finish: string;
  productId: string;
  sizeMm: number;
  price: number;
  status: "pending" | "paid" | "in_production" | "shipped" | "demo";
  email?: string;
  checkoutUrl?: string;
}

/**
 * Flat-file store. Enough to run the shop end to end and to drive the
 * production queue; swap the two functions below for a database when the
 * volume justifies one.
 */
const DIR = process.env.MONOLITH_DATA_DIR ?? path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "orders.json");

async function readAll(): Promise<Order[]> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as Order[];
  } catch {
    return [];
  }
}

async function writeAll(orders: Order[]): Promise<void> {
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, JSON.stringify(orders, null, 2), "utf8");
}

export async function listOrders(): Promise<Order[]> {
  const orders = await readAll();
  return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createOrder(input: Omit<Order, "id" | "createdAt">): Promise<Order> {
  const order: Order = { ...input, id: randomUUID().slice(0, 8).toUpperCase(), createdAt: new Date().toISOString() };
  const orders = await readAll();
  orders.push(order);
  await writeAll(orders);
  return order;
}
