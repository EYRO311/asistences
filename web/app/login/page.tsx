"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "recover";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        sessionStorage.removeItem("syncedThisSession");
        router.push("/");
        router.refresh();
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Cuenta creada. Revisa tu correo para confirmar tu registro.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/actualizar-password`,
        });
        if (error) throw error;
        setMessage("Si ese correo está registrado, te enviamos un enlace para restablecer tu contraseña.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const titleByMode: Record<Mode, string> = {
    signin: "Inicia sesión para continuar",
    signup: "Crea una cuenta nueva",
    recover: "Recupera el acceso a tu cuenta",
  };

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-handwriting text-4xl">Mi Agenda</h1>
          <p className="text-sm text-muted">{titleByMode[mode]}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="email">
              Correo
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
            />
          </div>

          {mode !== "recover" && (
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border-soft bg-transparent px-3 py-2 text-sm"
              />
            </div>
          )}

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => {
                setMode("recover");
                setError(null);
                setMessage(null);
              }}
              className="text-xs text-muted underline hover:text-foreground"
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-foreground text-background py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading
              ? "Cargando..."
              : mode === "signin"
                ? "Iniciar sesión"
                : mode === "signup"
                  ? "Registrarme"
                  : "Enviar enlace de recuperación"}
          </button>
        </form>

        {mode === "recover" ? (
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
              setMessage(null);
            }}
            className="w-full text-center text-sm text-muted hover:text-foreground"
          >
            Volver a iniciar sesión
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="w-full text-center text-sm text-muted hover:text-foreground"
          >
            {mode === "signin" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
          </button>
        )}
      </div>
    </main>
  );
}
