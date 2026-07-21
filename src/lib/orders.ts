import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export interface Order {
  /** Short serial. Printed on the object and shown to the buyer. Not a secret. */
  id: string;
  /**
   * 128-bit capability token. The only thing that opens the receipt, because a
   * short serial is guessable and the receipt names a real person's account.
   */
  token: string;
  createdAt: string;
  login: string;
  year: number;
  variant: string;
  palette: string;
  sizeMm: number;
  material: string;
  quality: string;
  slots: number;
  shipping: string;
  /** Spool colour ids, one per filament slot. */
  colours: string[];
  /** Cents, so money never touches a float. */
  priceCents: number;
  status: "pending" | "paid" | "printing" | "shipped" | "demo";
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

export async function findOrderByToken(token: string): Promise<Order | null> {
  if (!token) return null;
  const orders = await readAll();
  return orders.find((o) => o.token === token) ?? null;
}

export async function createOrder(
  input: Omit<Order, "id" | "token" | "createdAt">,
): Promise<Order> {
  const order: Order = {
    ...input,
    id: randomBytes(4).toString("hex").toUpperCase(),
    token: randomBytes(16).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
  const orders = await readAll();
  orders.push(order);
  await writeAll(orders);
  return order;
}
