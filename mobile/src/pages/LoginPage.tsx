import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

interface Props {
  onLogin: (session: Session) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<"signin" | "recover">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
    } else if (data.session) {
      onLogin(data.session);
    }
    setLoading(false);
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${WEB_URL}/actualizar-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setInfo("Si ese correo está registrado, te enviamos un enlace para restablecer tu contraseña. Ábrelo desde tu navegador para completar el cambio.");
    }
    setLoading(false);
  }

  function switchMode(m: "signin" | "recover") {
    setMode(m);
    setError(null);
    setInfo(null);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 bg-background">
      <h1 className="font-handwriting text-4xl mb-2 text-foreground">Mi Agenda</h1>
      <p className="text-sm text-muted mb-8">
        {mode === "signin" ? "Inicia sesión para continuar" : "Recupera el acceso a tu cuenta"}
      </p>

      <form onSubmit={mode === "signin" ? handleLogin : handleRecover} className="w-full max-w-sm space-y-4">
        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />

        {mode === "signin" && (
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-xl border border-border-soft bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        )}

        {mode === "signin" && (
          <button
            type="button"
            onClick={() => switchMode("recover")}
            className="text-xs text-muted underline"
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
        {info && <p className="text-xs text-muted">{info}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-foreground py-3 text-sm font-medium text-background disabled:opacity-50"
        >
          {loading ? "Cargando..." : mode === "signin" ? "Entrar" : "Enviar enlace de recuperación"}
        </button>

        {mode === "recover" && (
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className="w-full text-center text-sm text-muted"
          >
            Volver a iniciar sesión
          </button>
        )}
      </form>
    </div>
  );
}
