import type { Metadata } from "next";
import { Blinker, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const blinker = Blinker({ variable: "--font-blinker", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "Prosper Guías", template: "%s · Prosper Guías" },
  description: "Documentación de procesos paso a paso de Prosper Manufacturing.",
};

// Aplica el tema elegido antes de pintar para no parpadear. Sólo lee una preferencia local.
const themeScript = `try{var t=localStorage.getItem("pg-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} ${blinker.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
