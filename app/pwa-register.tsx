"use client";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${basePath}/sw.js`, {
          scope: `${basePath}/`,
          updateViaCache: "none",
        })
        .then(async (registration) => {
          await registration.update();
          await navigator.serviceWorker.ready;
        })
        .catch((error) =>
          console.error("Service worker non enregistré", error),
        );
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    if (!standalone) setShowInstall(true);

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setInstalling(false);
      setShowInstall(true);
    };
    const installed = () => {
      setInstalling(false);
      setInstallPrompt(null);
      setShowInstall(false);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!showInstall) return null;

  return (
    <button
      type="button"
      className="pwa-install"
      disabled={installing}
      onClick={async () => {
        if (installPrompt) {
          setInstalling(true);
          await installPrompt.prompt();
          const choice = await installPrompt.userChoice;
          setInstallPrompt(null);
          if (choice.outcome === "dismissed") setInstalling(false);
          else {
            window.setTimeout(() => {
              const standalone =
                window.matchMedia("(display-mode: standalone)").matches;
              if (!standalone) setInstalling(false);
            }, 15000);
          }
          return;
        }
        const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        window.alert(
          isApple
            ? "Dans Safari, touchez Partager puis « Sur l’écran d’accueil »."
            : "Chrome ne permet pas encore l’installation automatique. Actualisez la page, puis ouvrez le menu ⋮ et choisissez « Installer l’application ».",
        );
      }}
    >
      <span>↓</span>{" "}
      {installing ? "Installation en cours…" : "Installer l’application"}
    </button>
  );
}
