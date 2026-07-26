import FaceCheck from "./FaceCheck";
import { useState, type FormEvent } from "react";
import "./LoginPage.css";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  language: string;
};

type Props = {
  onAuthenticated: (user: AuthUser) => void;
};

type Mode = "login" | "register";

export default function LoginPage({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setMessage("");
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(
          isRegister
            ? { name, email, password }
            : { email, password }
        ),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Authentication failed");
      }

      onAuthenticated(result.user);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to connect to server"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <div className="brand-mark">⌂</div>
          <div>
            <p className="eyebrow">Secure intelligence workspace</p>
            <h1>CrimeLens</h1>
          </div>
        </div>

        <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "auth-tab active" : "auth-tab"}
            onClick={() => switchMode("login")}
          >
            Sign in
          </button>

          <button
            type="button"
            className={mode === "register" ? "auth-tab active" : "auth-tab"}
            onClick={() => switchMode("register")}
          >
            Register
          </button>
        </div>
        {!isRegister && <FaceCheck />}
        <form className="auth-form" onSubmit={submitForm}>
          {isRegister && (
            <label>
              Full name
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
              />
            </label>
          )}

          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
            />
          </label>

          {message && <p className="auth-message">{message}</p>}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : isRegister
                ? "Create account →"
                : "Sign in →"}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister
            ? "Already have an account?"
            : "New to CrimeLens?"}{" "}
          <button
            type="button"
            onClick={() => switchMode(isRegister ? "login" : "register")}
          >
            {isRegister ? "Sign in" : "Create account"}
          </button>
        </p>
      </section>
    </main>
  );
}