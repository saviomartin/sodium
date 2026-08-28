import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Acme Shop</h1>
      <p>
        A deliberately small Next.js App Router application used as the sodium
        end-to-end fixture. It demonstrates read-only content, a contact form, a
        reversible cart action, and a confirmation-required order cancellation.
      </p>
      <p>
        Start with the <Link href="/products">product catalog</Link>.
      </p>
    </main>
  );
}
