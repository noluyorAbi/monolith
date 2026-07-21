import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { STUDIO_COOKIE, studioEnv, verifyStudioSession } from "@/lib/admin";
import { listOrders } from "@/lib/orders";
import { formatPrice, productById } from "@/lib/products";
import { ProductionTool } from "@/components/ProductionTool";

export const dynamic = "force-dynamic";

export default async function Studio() {
  // Middleware already gated this route. Checking again here means a bad
  // matcher or a direct render can never expose the queue on its own.
  const cookie = (await cookies()).get(STUDIO_COOKIE)?.value;
  if (!(await verifyStudioSession(cookie, studioEnv(), Date.now()))) notFound();

  const orders = await listOrders();
  const revenue = orders.filter((o) => o.status !== "demo").reduce((a, o) => a + o.price, 0);

  return (
    <main className="min-h-svh bg-void px-6 py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="flex flex-wrap items-baseline justify-between gap-4">
          <Link
            href="/"
            className="text-[0.62rem] tracking-[0.34em] uppercase text-mute transition-colors duration-150 hover:text-fog"
          >
            Monolith / Studio
          </Link>
          <div className="flex gap-6 text-[0.62rem] tracking-[0.16em] uppercase text-dim">
            <span>
              <span className="text-fog tabular-nums">{orders.length}</span> orders
            </span>
            <span>
              <span className="text-fog tabular-nums">{formatPrice(revenue)}</span> booked
            </span>
          </div>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-[0.6rem] tracking-[0.22em] uppercase text-dim">Production bench</h2>
          <ProductionTool />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[0.6rem] tracking-[0.22em] uppercase text-dim">Queue</h2>
          {orders.length === 0 ? (
            <div className="flex flex-col items-start gap-2 border border-line p-6">
              <p className="text-[0.8rem] text-mute">Nothing in the queue yet.</p>
              <p className="text-[0.7rem] text-dim">
                Orders land here the moment someone checks out, demo or paid.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-line">
              <table className="w-full min-w-[54rem] text-left text-[0.72rem]">
                <thead className="text-[0.55rem] tracking-[0.2em] uppercase text-dim">
                  <tr className="border-b border-line">
                    {["Order", "Handle", "Year", "Form", "Finish", "Edition", "Size", "Total", "Status", ""].map(
                      (h) => (
                        <th key={h} className="px-3 py-2.5 font-normal">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-line/70 last:border-0">
                      <td className="px-3 py-2.5">
                        <Link href={`/order/${o.token}`} className="text-accent transition-opacity duration-150 hover:opacity-70">
                          {o.id}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-fog">{o.login}</td>
                      <td className="px-3 py-2.5 tabular-nums text-mute">{o.year}</td>
                      <td className="px-3 py-2.5 text-mute">{o.variant}</td>
                      <td className="px-3 py-2.5 text-mute">{o.finish}</td>
                      <td className="px-3 py-2.5 text-mute">{productById(o.productId)?.name ?? o.productId}</td>
                      <td className="px-3 py-2.5 tabular-nums text-mute">{o.sizeMm}mm</td>
                      <td className="px-3 py-2.5 tabular-nums text-fog">{formatPrice(o.price)}</td>
                      <td className="px-3 py-2.5 text-mute">{o.status.replace("_", " ")}</td>
                      <td className="px-3 py-2.5">
                        <a
                          href={`/api/stl?login=${encodeURIComponent(o.login)}&year=${o.year}&variant=${o.variant}&mm=${o.sizeMm}`}
                          download
                          className="text-accent transition-opacity duration-150 hover:opacity-70"
                        >
                          stl ↓
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
