import { useEffect, useState } from "react";
import { decryptClient } from "@/lib/crypto";

// item.description/location llegan encriptados (AES-256-GCM) desde Supabase;
// este componente los desencripta en el cliente antes de mostrarlos.
export function DecryptedText({ value, className }: { value: string | null; className?: string }) {
  const [plain, setPlain] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    decryptClient(value).then((v) => { if (!cancelled) setPlain(v); });
    return () => { cancelled = true; };
  }, [value]);

  if (!plain) return null;
  return <p className={className}>{plain}</p>;
}
