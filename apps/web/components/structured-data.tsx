import { FAQ } from "@/lib/faq";
import {
  absoluteUrl,
  PUBLISHER,
  SITE_DESCRIPTION,
  SITE_NAME,
} from "@/lib/seo";

/**
 * The home page, described for machines that read pages rather than render
 * them: search crawlers, link unfurlers, and the agents this product exists to
 * be legible to.
 *
 * Everything here restates something the page actually shows. The questions
 * come from `lib/faq`, the same list the FAQ section renders. Nothing is
 * asserted that a visitor could not read for themselves, which is both the
 * rule for structured data and the only way this can stay true as the page
 * changes.
 *
 * One `@graph` rather than four scripts, so a parser reads one block and the
 * nodes can reference each other by id.
 */
export function StructuredData() {
  const site = absoluteUrl("/");
  const organization = `${site}#organization`;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organization,
        name: SITE_NAME,
        url: site,
        logo: absoluteUrl("/icons/icon-512.png"),
        parentOrganization: { "@type": "Organization", name: PUBLISHER },
      },
      {
        "@type": "WebSite",
        "@id": `${site}#website`,
        url: site,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en-US",
        publisher: { "@id": organization },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${site}#application`,
        name: SITE_NAME,
        url: site,
        description: SITE_DESCRIPTION,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        publisher: { "@id": organization },
      },
      {
        "@type": "FAQPage",
        "@id": `${site}#faq`,
        mainEntity: FAQ.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // JSON is inert until a parser reads it, but the browser sees raw markup
      // first: an unescaped "<" is how a string ends the script element early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
