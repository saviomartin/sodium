import { signIn } from "../actions";

export default function LoginPage() {
  return (
    <main>
      <h1>Sign in</h1>
      <p>
        Demo authentication: any name works. Sets an httpOnly session cookie.
      </p>
      <form action={signIn} id="login-form">
        <label>
          Name
          <input
            name="user"
            type="text"
            required
            minLength={1}
            defaultValue="demo"
          />
        </label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
