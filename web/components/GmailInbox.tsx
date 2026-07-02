"use client";

import { useEffect, useState } from "react";

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
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / 3_600_000;
    if (diffH < 1) return "Hace menos de 1h";
    if (diffH < 24) return `Hace ${Math.floor(diffH)}h`;
    if (diffH < 48) return "Ayer";
    return d.toLocaleDateString("es-MX", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function GmailInbox() {
  const [emails, setEmails] = useState<GmailMessage[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/gmail")
      .then((r) => r.json())
      .then((d) => setEmails(d.emails ?? []))
      .catch(() => setError(true));
  }, []);

  if (error || (emails !== null && emails.length === 0)) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-medium">Correos recientes</h2>
        <a
          href="https://mail.google.com"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted hover:text-foreground"
        >
          Abrir Gmail →
        </a>
      </div>

      <div className="space-y-1">
        {emails === null
          ? Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-lg border border-border-soft bg-surface animate-pulse"
              />
            ))
          : emails.map((email) => (
              <a
                key={email.id}
                href={`https://mail.google.com/mail/u/0/#inbox/${email.id}`}
                target="_blank"
                rel="noreferrer"
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 hover:bg-background transition-colors ${
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
                {email.unread && (
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                )}
              </a>
            ))}
      </div>
    </section>
  );
}
