import { submitContact } from "../actions";

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  return (
    <main>
      <h1>Contact us</h1>
      {sent && (
        <p data-contact-sent="true">Thanks — your message was received.</p>
      )}
      <form action={submitContact} id="contact-form">
        <label>
          Name
          <input
            name="name"
            type="text"
            required
            minLength={2}
            placeholder="Your name"
          />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Topic
          <select name="topic" defaultValue="support">
            <option value="support">Support</option>
            <option value="sales">Sales</option>
            <option value="feedback">Feedback</option>
          </select>
        </label>
        <label>
          Message
          <textarea
            name="message"
            required
            minLength={10}
            aria-label="Message"
          />
        </label>
        <button type="submit">Send message</button>
      </form>
    </main>
  );
}
