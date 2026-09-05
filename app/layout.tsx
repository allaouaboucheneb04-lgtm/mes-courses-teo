import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "./pwa-register";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Mes courses Téo",
  description: "Calcul des revenus de taxi et de transport adapté.",
  manifest: `${basePath}/manifest.webmanifest`,
  applicationName: "Mes courses Téo",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Mes courses" },
  formatDetection: { telephone: false },
  icons: {
    icon: `${basePath}/favicon.svg`,
    shortcut: `${basePath}/favicon.svg`,
    apple: `${basePath}/icons/apple-touch-icon.png`,
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
