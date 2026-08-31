import type { Metadata } from "next";
import { Geist, Geist_Mono, Caveat } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { createClient } from "@/lib/supabase/server";
import { ThemeAwareToaster } from "@/components/ThemeAwareToaster";
import { ThemeProvider } from "@/components/ThemeProvider";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let serverTheme: string = "light";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("theme")
      .eq("id", user.id)
      .single<{ theme: string | null }>();
    if (profile?.theme) {
      serverTheme = profile.theme;
    }
  }

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-300">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          themes={["light", "dark", "theme-ocean", "theme-forest"]}
        >
          <NavBar />
          <div className={`flex-1 ${user ? "pb-20 md:pb-0" : ""}`}>{children}</div>
          {user && <MobileBottomNav />}
          <ThemeAwareToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
