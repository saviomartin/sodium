/**
 * The questions the home page answers, in the order it answers them.
 *
 * They live here rather than beside the markup because two things render
 * them: the FAQ section on the page, and the FAQPage block in the page's
 * structured data. Structured data has to describe what a reader actually
 * sees, so both have to come from one list.
 *
 * Keep answers to one or two short sentences. This is the page's reference
 * section, not its documentation, and a reader scanning the list will not
 * read a paragraph of any of them.
 */
export const FAQ = [
  {
    question: "What is WebMCP?",
    answer:
      "A way for your site to hand AI agents typed tools instead of making them guess at your buttons. It is being standardized at the W3C.",
  },
  {
    question: "What does Sodium add to my app?",
    answer:
      "A sodium.json that declares your tools, and a small SDK that registers them with the browser. Both live in your repo.",
  },
  {
    question: "Does my code run on Sodium's servers?",
    answer:
      "No. Your tools run in your app, in the visitor's browser. Sodium stores the published contract and aggregate telemetry.",
  },
  {
    question: "Which frameworks are supported?",
    answer:
      "All of them. Next.js, Nuxt, SvelteKit, Astro, Angular, Vite, or anything else that runs in a browser.",
  },
  {
    question: "How do I control what agents can do?",
    answer:
      "Every tool declares a risk level, and risk sets the confirmation the browser must ask for. Destructive and financial tools always prompt.",
  },
  {
    question: "Which AI agents can use the tools?",
    answer:
      "Any WebMCP-capable browser agent, while your app is open. That already includes ChatGPT's browser and Chrome.",
  },
  {
    question: "What happens when my website changes?",
    answer:
      "Ask your AI to update sodium.json. It reads your app and edits the file, the same way it wrote it.",
  },
  {
    question: "What happens when I change a tool?",
    answer:
      "Deploy again. Each deploy publishes a signed, immutable version, and the SDK will not register a contract you have not deployed.",
  },
  {
    question: "How much does Sodium cost?",
    answer: "Nothing. Sodium is free during beta.",
  },
] as const;
