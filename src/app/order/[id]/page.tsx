import Link from "next/link";
import { notFound } from "next/navigation";
import { listOrders } from "@/lib/orders";
import { formatPrice, productById } from "@/lib/products";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = (await listOrders()).find((o) => o.id === id);
  if (!order) notFound();
  const product = productById(order.productId);

  const rows: [string, string][] = [
    ["Order", order.id],
    ["Object", `${order.login} ${order.year}`],
    ["Form", order.variant],
    ["Finish", order.finish],
    ["Edition", product?.name ?? order.productId],
    ["Size", `${order.sizeMm}mm`],
    ["Total", formatPrice(order.price)],
    ["Status", order.status.replace("_", " ")],
    ["Placed", new Date(order.createdAt).toISOString().slice(0, 16).replace("T", " ")],
  ];

  return (
    <main className="field min-h-svh bg-void px-6 py-16">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
        <Link
          href="/"
          className="text-[0.62rem] tracking-[0.34em] uppercase text-mute transition-colors duration-150 hover:text-fog"
        >
          Monolith
        </Link>

        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[2.4rem] leading-none tracking-[-0.04em] text-accent">
            {order.id}
          </h1>
          <p className="mt-3 max-w-[42ch] text-[0.8rem] leading-relaxed text-mute">
            {order.status === "demo"
              ? "Demo order. Recorded in full, charged for nothing. Add a Stripe key to switch the shop on."
              : `Locked in. ${product?.lead ?? "We will email you when it ships."}`}
          </p>
        </div>

        <dl className="flex flex-col divide-y divide-line border-y border-line text-[0.75rem]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-6 py-3">
              <dt className="tracking-[0.14em] uppercase text-dim">{k}</dt>
              <dd className="text-right text-fog">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap gap-3">
          <a
            href={`/api/stl?login=${encodeURIComponent(order.login)}&year=${order.year}&variant=${order.variant}&mm=${order.sizeMm}`}
            download
            className="hairline rounded-[5px] px-4 py-2.5 text-[0.66rem] tracking-[0.12em] uppercase text-fog transition-colors duration-150 hover:border-mute"
          >
            download stl
          </a>
          <Link
            href={`/s/${order.login}?year=${order.year}`}
            className="rounded-[5px] bg-accent px-4 py-2.5 text-[0.66rem] font-medium tracking-[0.12em] uppercase text-void transition-all duration-150 hover:brightness-110"
          >
            back to the object
          </Link>
        </div>
      </div>
    </main>
  );
}
