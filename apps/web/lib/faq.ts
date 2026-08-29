import { REPOSITORY_PRICE_USD } from "./plan";

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
    question: "Which websites does Sodium support?",
    answer: "Sodium supports almost all tech stacks.",
  },
  {
    question: "What happens after I connect my repository?",
    answer:
      "Sodium finds useful actions in your website and turns them into tools any AI agent can use.",
  },
  {
    question: "Does Sodium run or change my code?",
    answer:
      "No. Sodium only analyzes your selected repository. It never runs your code or pushes changes.",
  },
  {
    question: "Can I control what agents can do?",
    answer:
      "Yes. You choose which tools to publish and which actions require confirmation.",
  },
  {
    question: "Which AI agents can use the tools?",
    answer:
      "Any WebMCP browser agent, while your website is open. That already includes ChatGPT's browser and Chrome, with Edge and others close behind. WebMCP is being standardized at the W3C, so websites that talk to agents are quickly becoming the norm rather than the exception.",
  },
  {
    question: "What happens when my website changes?",
    answer:
      "Sodium analyzes new commits and drafts updated tools for your review. Nothing is published automatically.",
  },
  {
    question: "How much does Sodium cost?",
    answer: `$${REPOSITORY_PRICE_USD} per month for each connected repository.`,
  },
  {
    question: "Can I remove Sodium?",
    answer: "Yes. Disable your tools or remove the script tag.",
  },
] as const;
