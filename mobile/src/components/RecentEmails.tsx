import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Browser } from "@capacitor/browser";

const WEB_URL = import.meta.env.VITE_WEB_URL ?? "http://localhost:3000";

interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}

function senderName(from: string): string {
  const match = from.match(/^"?([^"<]+)"?\s*</) ?? from.match(/^([^@<]+)/);
  return match ? match[1].trim() : from;
}

function relativeDate(raw: string): string {
  try {
    const d = new Date(raw);
    const diffH = (Date.now() - d.getTime()) / 3_600_000;
    if (diffH < 1) return "Hace menos de 1h";
    if (diffH < 24) return `Hace ${Math.floor(diffH)}h`;
    if (diffH < 48) return "Ayer";
    return d.toLocaleDateString("es-MX", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function RecentEmails() {
  const [emails, setEmails] = useState<GmailMessage[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("no session");
        const res = await fetch(`${WEB_URL}/api/gmail`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled) setEmails(json.emails ?? []);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (error || (emails !== null && emails.length === 0)) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">Correos recientes</h2>
        <button
          type="button"
          onClick={() => Browser.open({ url: "https://mail.google.com" })}
          className="text-xs text-muted hover:text-foreground"
        >
          Abrir Gmail →
        </button>
      </div>

      <div className="space-y-2">
        {emails === null
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl border border-border-soft bg-surface animate-pulse" />
            ))
          : emails.map((email) => (
              <button
                key={email.id}
                type="button"
                onClick={() => Browser.open({ url: `https://mail.google.com/mail/u/0/#inbox/${email.id}` })}
                className={`w-full flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${
                  email.unread ? "border-foreground/30 bg-surface" : "border-border-soft bg-surface opacity-70"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${email.unread ? "font-semibold" : "font-medium"}`}>
                      {senderName(email.from)}
                    </p>
                    <p className="text-[10px] text-muted shrink-0">{relativeDate(email.date)}</p>
                  </div>
                  <p className={`text-xs truncate ${email.unread ? "text-foreground/80" : "text-muted"}`}>
                    {email.subject}
                  </p>
                  <p className="text-[11px] text-muted truncate mt-0.5">{email.snippet}</p>
                </div>
                {email.unread && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
              </button>
            ))}
      </div>
    </section>
  );
}
