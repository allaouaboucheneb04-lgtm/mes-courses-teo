"use client";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${basePath}/sw.js`, { scope: `${basePath}/` }).catch((error) => console.error("Service worker non enregistré", error));
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (!standalone) setShowInstall(true);
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", () => setShowInstall(false));
    return () => window.removeEventListener("beforeinstallprompt", capturePrompt);
  }, []);

  if (!showInstall) return null;
  return (
    <button
      type="button"
      className="pwa-install"
      onClick={async () => {
        if (installPrompt) {
          await installPrompt.prompt();
          const choice = await installPrompt.userChoice;
          if (choice.outcome === "accepted") setShowInstall(false);
          return;
        }
        const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        window.alert(isApple ? "Dans Safari, touchez Partager puis « Sur l’écran d’accueil »." : "Ouvrez le menu du navigateur puis choisissez « Installer l’application ». ");
      }}
    >
      <span>↓</span> Installer l’application
    </button>
  );
}
