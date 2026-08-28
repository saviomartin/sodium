import Link from "next/link";
import { store } from "../../lib/store";

export const dynamic = "force-dynamic";

export default function ProductsPage() {
  const products = store().products;
  const cartSize = [...store().cart.values()].reduce((a, b) => a + b, 0);
  return (
    <main>
      <h1>Products</h1>
      <p data-cart-size={cartSize}>Cart: {cartSize} item(s)</p>
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td data-product-name={product.name}>
                <Link href={`/products/${product.id}`}>{product.name}</Link>
              </td>
              <td data-product-price={product.price.toFixed(2)}>
                ${product.price.toFixed(2)}
              </td>
              <td data-product-stock={product.stock}>{product.stock}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
