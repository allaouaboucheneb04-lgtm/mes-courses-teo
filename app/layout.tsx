import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "./pwa-register";

export const metadata: Metadata = {
  title: "Mes courses Téo",
  description: "Calcul des revenus de taxi et de transport adapté.",
  manifest: "/manifest.webmanifest",
  applicationName: "Mes courses Téo",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Mes courses" },
  formatDetection: { telephone: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = { themeColor: "#006f74", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr-CA">
      <body className="antialiased"><PwaRegister />{children}</body>
    </html>
  );
}
