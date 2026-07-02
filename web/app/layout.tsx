import type { Metadata } from "next";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { createClient } from "@/lib/supabase/server";
import { Toaster } from "sileo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mi Agenda",
  description: "Asistente de agenda con Google Calendar y Notion",
};

function themeInitScript(serverTheme: string | null): string {
  return `(function () {
  try {
    var server = ${serverTheme ? `"${serverTheme}"` : "null"};
    var stored = localStorage.getItem("theme");
    var theme = server || (stored === "dark" || stored === "light" ? stored : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
    if (theme === "dark") document.documentElement.classList.add("dark");
    localStorage.setItem("theme", theme);
  } catch (e) {}
})();`;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let serverTheme: "light" | "dark" | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("theme")
      .eq("id", user.id)
      .single<{ theme: "light" | "dark" | null }>();
    serverTheme = profile?.theme ?? null;
  }

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Script de tema: debe correr antes del primer paint para evitar flash */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(serverTheme) }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NavBar />
        <div className={`flex-1 ${user ? "pb-20 md:pb-0" : ""}`}>{children}</div>
        {user && <MobileBottomNav />}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
