import { NextResponse } from "next/server";
import { z } from "zod";
import { LOGIN_RE, fetchContributionYear } from "@/lib/github";
import { VARIANTS, buildMonolith } from "@/lib/build";
import { splitByLevel } from "@/lib/parts";
import { MATERIALS, QUALITIES, estimate, materialById, qualityById } from "@/lib/print";
import { PALETTES, SHIPPING, formatPrice, quote, type ShippingId } from "@/lib/products";
import { createOrder } from "@/lib/orders";
import type { Variant } from "@/lib/types";

export const runtime = "nodejs";

const Body = z.object({
  login: z.string().regex(LOGIN_RE),
  year: z.number().int().min(2008).max(2100),
  variant: z.enum(VARIANTS.map((v) => v.id) as [string, ...string[]]),
  palette: z.enum(PALETTES.map((p) => p.id) as [string, ...string[]]),
  sizeMm: z.number().int().min(60).max(400),
  material: z.enum(MATERIALS.map((m) => m.id) as [string, ...string[]]),
  quality: z.enum(QUALITIES.map((q) => q.id) as [string, ...string[]]),
  slots: z.union([z.literal(1), z.literal(2), z.literal(4)]),
  shipping: z.enum(SHIPPING.map((s) => s.id) as [string, ...string[]]),
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
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const input = parsed.data;

  // The price is recomputed here from the same geometry the browser saw. A
  // client that posts a cheaper total simply does not get one.
  const data = await fetchContributionYear(input.login, input.year);
  const mesh = buildMonolith(data, {
    variant: input.variant as Variant,
    sizeMm: input.sizeMm,
    label: true,
  });
  const material = materialById(input.material);
  const est = estimate(splitByLevel(mesh), material, qualityById(input.quality));
  const bill = quote(
    { grams: est.grams, hours: (est.hoursLow + est.hoursHigh) / 2, slots: input.slots },
    input.shipping as ShippingId,
  );
  const priceCents = Math.round(bill.total * 100);

  const key = process.env.STRIPE_SECRET_KEY;
  const origin = new URL(request.url).origin;

  const order = await createOrder({
    login: data.login,
    year: input.year,
    variant: input.variant,
    palette: input.palette,
    sizeMm: input.sizeMm,
    material: input.material,
    quality: input.quality,
    slots: input.slots,
    shipping: input.shipping,
    priceCents,
    status: key ? "pending" : "demo",
    email: input.email,
  });

  if (!key) {
    // Demo mode: the whole flow works, nobody is charged, and the UI says so.
    return NextResponse.json({ demo: true, orderId: order.id, url: `/order/${order.token}` });
  }

  const session = await stripeSession(
    {
      mode: "payment",
      success_url: `${origin}/order/${order.token}?paid=1`,
      cancel_url: `${origin}/s/${data.login}?year=${input.year}`,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(priceCents),
      "line_items[0][price_data][product_data][name]": `MONOLITH — ${data.login} ${input.year}`,
      "line_items[0][price_data][product_data][description]":
        `${input.variant} · ${input.sizeMm}mm · ${material.name} · ${input.slots} colour · ` +
        `printed at cost (${formatPrice(bill.subtotal)} plus postage)`,
      "metadata[orderId]": order.id,
      ...(input.email ? { customer_email: input.email } : {}),
    },
    key,
  );

  if (!session) return NextResponse.json({ error: "stripe_failed" }, { status: 502 });
  return NextResponse.json({ demo: false, orderId: order.id, url: session.url });
}
