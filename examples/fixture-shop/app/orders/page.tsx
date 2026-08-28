import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { store } from "../../lib/store";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const cookieStore = await cookies();
  if (!cookieStore.get("fixture_session")) redirect("/login");
  const orders = store().orders;
  const products = new Map(
    store().products.map((product) => [product.id, product]),
  );

  return (
    <main>
      <h1>Your orders</h1>
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Product</th>
            <th>Qty</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td data-order-id={order.id}>{order.id}</td>
              <td>{products.get(order.productId)?.name ?? order.productId}</td>
              <td data-order-quantity={order.quantity}>{order.quantity}</td>
              <td data-order-status={order.status}>{order.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-neutral-500">
        Cancelling an order is a destructive action: the backend requires an
        explicit confirmation flag regardless of how the request arrives.
      </p>
    </main>
  );
}
