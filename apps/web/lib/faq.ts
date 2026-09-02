/**
 * The questions the home page answers, in the order it answers them.
 *
 * They live here rather than beside the markup because two things render
 * them: the FAQ section on the page, and the FAQPage block in the page's
 * structured data. Structured data has to describe what a reader actually
 * sees, so both have to come from one list.
 */
export const FAQ = [
  {
    question: "What is WebMCP?",
    answer:
      "A way for a website to hand AI agents a set of typed tools instead of making them guess at your buttons. The agent asks the page what it can do, and the page answers. It is being standardized at the W3C, and Sodium is how you ship it.",
  },
  {
    question: "What does Sodium actually add to my app?",
    answer:
      "A sodium.json file that declares your tools, and a small SDK that registers them with the browser. Both live in your repository. Your handlers stay in your own code.",
  },
  {
    question: "Does my code run on Sodium's servers?",
    answer:
      "No. Tools execute in your app, in the visitor's browser. Sodium stores the published contract and the aggregate telemetry your app reports, and nothing else.",
  },
  {
    question: "Which frameworks are supported?",
    answer:
      "Next.js App Router, and browser React apps built with Vite, Create React App, Rsbuild, Parcel, or Webpack. The CLI detects which one you have during init.",
  },
  {
    question: "How do I control what agents are allowed to do?",
    answer:
      "Every tool declares a risk level, and the risk level sets the floor for how much the browser must confirm with the user. A destructive or financial tool cannot be published without a required confirmation.",
  },
  {
    question: "Which agents can use the tools?",
    answer:
      "Any WebMCP-capable browser agent, while your app is open. That already includes ChatGPT's browser and Chrome, with others close behind.",
  },
  {
    question: "What happens when I change a tool?",
    answer:
      "Deploy again. The SDK will not register an undeployed or changed contract. Each deploy publishes a new immutable version and signs the exact tool behavior and origins, so you can see exactly which version was live when a call was made.",
  },
  {
    question: "What does Sodium record about my users?",
    answer:
      "Tool names, outcomes, and timing. Never prompts, tool inputs, tool outputs, page content, or anything that identifies a visitor.",
  },
  {
    question: "How do I remove Sodium?",
    answer:
      "Delete sodium.json, remove the SDK call, and delete the project from your dashboard. That removes the contract and every event with it.",
  },
] as const;
