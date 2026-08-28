import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

/** Writes a small but realistic Next.js App Router repo to `root`. */
export function writeFixtureRepo(root: string): void {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({
      name: "acme-shop",
      dependencies: { next: "16.0.0", zod: "4.0.0" },
    }),
    "next.config.ts": "const config = {};\nexport default config;\n",
    ".gitignore": "ignored-dir/\n*.log\n",
    ".sodiumignore": "generated/\n",
    ".env": "DATABASE_URL=postgres://user:hunter2@example.com/db\n",
    "secret.pem":
      "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----\n",
    "ignored-dir/skipme.ts": "export const x = 1;\n",
    "generated/skipme.ts": "export const y = 2;\n",
    "node_modules/zod/index.js": "module.exports = {};\n",

    "proxy.ts": `import { NextResponse, type NextRequest } from "next/server";
export async function proxy(request: NextRequest) {
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}
`,

    "lib/schemas.ts": `import { z } from "zod";
export const contactSchema = z.object({
  name: z.string().min(2).max(80).describe("Full name"),
  email: z.string().email(),
  topic: z.enum(["support", "sales", "feedback"]).default("support"),
  message: z.string().min(10).max(2000),
});
export const orderSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(10),
  giftWrap: z.boolean().optional(),
});
`,

    "app/layout.tsx": `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`,
    "app/page.tsx": `export default function Home() {
  return <main><h1>Acme Shop</h1></main>;
}
`,
    "app/products/page.tsx": `export default async function ProductsPage() {
  return (
    <ul>
      <li data-product-name="Widget" data-product-price="9.99">Widget</li>
    </ul>
  );
}
`,
    "app/products/[id]/page.tsx": `export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div data-product-id={id} />;
}
`,
    "app/(marketing)/about/page.tsx": `export default function About() {
  return <p>About us</p>;
}
`,
    "app/_components/button.tsx": `export function Button() { return <button>hi</button>; }
`,
    "app/contact/page.tsx": `import { submitContact } from "../actions";
export default function ContactPage() {
  return (
    <form action={submitContact}>
      <input name="name" type="text" required placeholder="Your name" />
      <input name="email" type="email" required />
      <select name="topic">
        <option value="support">Support</option>
        <option value="sales">Sales</option>
      </select>
      <textarea name="message" required aria-label="Message" />
      <button type="submit">Send</button>
    </form>
  );
}
`,
    "app/actions.ts": `"use server";
import { contactSchema, orderSchema } from "../lib/schemas";
import { redirect } from "next/navigation";

export async function submitContact(formData: FormData) {
  const parsed = contactSchema.parse(Object.fromEntries(formData));
  await saveMessage(parsed);
}

export async function cancelOrder(input: { orderId: string }) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  await db.orders.cancel(input.orderId);
}
`,
    "app/api/orders/route.ts": `import { orderSchema } from "../../../lib/schemas";

export async function GET(request: Request) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await db.orders.list(data.user.id));
}

export const POST = async (request: Request) => {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = orderSchema.parse(await request.json());
  return Response.json(await db.orders.create(body), { status: 201 });
};
`,
  };

  for (const [relPath, content] of Object.entries(files)) {
    const absolute = join(root, relPath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  try {
    symlinkSync("/etc/hosts", join(root, "sneaky-link.ts"));
  } catch {
    // Symlink creation can fail on restricted filesystems; tests tolerate it.
  }
}
