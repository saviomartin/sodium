import { notFound } from "next/navigation";
import { store } from "../../../lib/store";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = store().products.find((candidate) => candidate.id === id);
  if (!product) notFound();
  return (
    <main>
      <h1 data-product-name={product.name}>{product.name}</h1>
      <p data-product-price={product.price.toFixed(2)}>
        ${product.price.toFixed(2)}
      </p>
      <p data-product-stock={product.stock}>{product.stock} in stock</p>
    </main>
  );
}
