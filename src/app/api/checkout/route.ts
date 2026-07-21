import { NextResponse } from "next/server";
import { z } from "zod";
import { LOGIN_RE } from "@/lib/github";
import { VARIANTS } from "@/lib/build";
import { FINISHES, productById } from "@/lib/products";
import { createOrder } from "@/lib/orders";

export const runtime = "nodejs";

const Body = z.object({
  login: z.string().regex(LOGIN_RE),
  year: z.number().int().min(2008).max(2100),
  variant: z.enum(VARIANTS.map((v) => v.id) as [string, ...string[]]),
  finish: z.enum(FINISHES.map((f) => f.id) as [string, ...string[]]),
  productId: z.string(),
  email: z.string().email().optional(),
});

async function stripeSession(params: Record<string, string>, key: string) {
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  if (!res.ok) return null;
  return (await res.json()) as { id: string; url: string };
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { login, year, variant, finish, productId, email } = parsed.data;
  const product = productById(productId);
  if (!product) return NextResponse.json({ error: "unknown_product" }, { status: 400 });

  const key = process.env.STRIPE_SECRET_KEY;
  const origin = new URL(request.url).origin;

  const order = await createOrder({
    login,
    year,
    variant,
    finish,
    productId,
    sizeMm: product.sizeMm,
    price: product.price,
    status: key ? "pending" : "demo",
    email,
  });

  if (!key) {
    // Demo mode: the whole flow works, nobody is charged, and the UI says so.
    return NextResponse.json({ demo: true, orderId: order.id, url: `/order/${order.token}` });
  }

  const session = await stripeSession(
    {
      mode: "payment",
      success_url: `${origin}/order/${order.token}?paid=1`,
      cancel_url: `${origin}/s/${login}?year=${year}`,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(product.price),
      "line_items[0][price_data][product_data][name]": `MONOLITH ${product.name} — ${login} ${year}`,
      "line_items[0][price_data][product_data][description]": `${variant} · ${finish} · ${product.sizeMm}mm · ${product.material}`,
      "metadata[orderId]": order.id,
      "metadata[orderToken]": order.token,
      ...(email ? { customer_email: email } : {}),
    },
    key,
  );

  if (!session) return NextResponse.json({ error: "stripe_failed" }, { status: 502 });
  return NextResponse.json({ demo: false, orderId: order.id, url: session.url });
}
