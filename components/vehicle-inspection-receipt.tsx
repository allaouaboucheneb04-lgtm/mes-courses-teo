"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  inspectionDefectLabels,
  inspectionIssues,
  type VehicleInspection,
} from "@/lib/vehicle-inspection";

type ReceiptWidth = "58" | "80";
type ReceiptLine = {
  text: string;
  kind?: "title" | "subtitle" | "heading" | "rule" | "bold" | "small";
};

function printableLines(record: VehicleInspection): ReceiptLine[] {
  const defects = record.defects.map((key) => inspectionDefectLabels[key] || key);
  const issueCount = inspectionIssues(record);
  const lines: ReceiptLine[] = [
    { text: "VÉRIFICATION SOMMAIRE", kind: "title" },
    { text: "Véhicule taxi · avant départ", kind: "subtitle" },
    { text: "", kind: "rule" },
    { text: "Date : " + record.date },
    { text: "Heure : " + record.time },
    { text: "Chauffeur : " + record.driverName },
    { text: "Permis taxi : " + record.permitNumber },
    { text: "Plaque : " + record.plate, kind: "bold" },
    { text: "Odomètre : " + record.odometer + " km" },
  ];
  if (record.governmentAccessory) {
    lines.push({ text: "Accessoire : " + record.governmentAccessory });
  }
  if (record.batteryPercent) {
    lines.push({ text: "Batterie : " + record.batteryPercent + " %" });
  }
  lines.push(
    { text: "", kind: "rule" },
    { text: "ÉTAT DE LA VÉRIFICATION", kind: "heading" },
    {
      text: issueCount
        ? issueCount + " point(s) à signaler"
        : "Aucune anomalie signalée",
      kind: "bold",
    },
    { text: "Anomalies cochées :", kind: "heading" },
  );
  if (defects.length) {
    defects.forEach((defect) => lines.push({ text: "• " + defect }));
  } else {
    lines.push({ text: "Aucune case cochée" });
  }
  if (record.defectDescription) {
    lines.push({ text: "Observations : " + record.defectDescription });
  }
  lines.push(
    { text: "", kind: "rule" },
    { text: "ÉTAT DU VÉHICULE", kind: "heading" },
    { text: "Extérieur : " + (record.exteriorCondition === "propre" ? "Propre" : "À nettoyer") },
    { text: "Intérieur : " + (record.interiorCondition === "propre" ? "Propre" : "À nettoyer") },
  );
  if (record.exteriorDamage) lines.push({ text: "Dommages ext. : " + record.exteriorDamage });
  if (record.interiorDamage) lines.push({ text: "Dommages int. : " + record.interiorDamage });
  if (record.missingEquipment) lines.push({ text: "Équipement absent/abîmé : " + record.missingEquipment });
  lines.push(
    { text: "", kind: "rule" },
    { text: "Confirmation : " + (record.confirmed ? "Vérification effectuée" : "Non confirmée") },
    { text: "Signature saisie : " + record.signature, kind: "bold" },
    { text: "", kind: "rule" },
    { text: "Mes Courses Téo · relevé numérique", kind: "small" },
    { text: "Ne remplace pas nécessairement le formulaire réglementaire.", kind: "small" },
  );
  return lines;
}

function ReceiptPaper({ lines }: { lines: ReceiptLine[] }) {
  return (
    <div className="inspection-receipt-paper">
      {lines.map((line, index) =>
        line.kind === "rule"
          ? <hr key={index} />
          : <p key={index} className={"inspection-receipt-line " + (line.kind || "text")}>{line.text}</p>,
      )}
    </div>
  );
}

function receiptImage(lines: ReceiptLine[], width: ReceiptWidth): string {
  // 203 dpi / 8 dots per mm. 58 mm rolls typically print within 48 mm.
  const pixels = width === "58" ? 384 : 576;
  const pad = 15;
  const usable = pixels - 2 * pad;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossible de créer l’image du reçu.");

  function fontFor(kind?: ReceiptLine["kind"]) {
    if (kind === "title") return "bold 25px Arial, sans-serif";
    if (kind === "heading") return "bold 23px Arial, sans-serif";
    if (kind === "bold") return "bold 22px Arial, sans-serif";
    if (kind === "subtitle" || kind === "small") return "18px Arial, sans-serif";
    return "21px Arial, sans-serif";
  }
  function wrappedText(text: string, font: string) {
    context!.font = font;
    const result: string[] = [];
    const words = text.split(/\s+/).filter(Boolean);
    let current = "";
    const addWord = (word: string) => {
      // Long plates/identifiers must not be cut off on narrow rolls.
      let remainder = word;
      while (remainder && context!.measureText(remainder).width > usable) {
        let count = 1;
        while (count < remainder.length && context!.measureText(remainder.slice(0, count + 1)).width <= usable) count++;
        const part = remainder.slice(0, count);
        result.push(part);
        remainder = remainder.slice(count);
      }
      return remainder;
    };
    for (const word of words) {
      const next = current ? current + " " + word : word;
      if (context!.measureText(next).width <= usable) {
        current = next;
      } else {
        if (current) result.push(current);
        current = addWord(word);
      }
    }
    if (current) result.push(current);
    return result.length ? result : [""];
  }
  const blocks = lines.map((line) => {
    const font = fontFor(line.kind);
    return {
      ...line,
      font,
      wrapped: line.kind === "rule" ? [] : wrappedText(line.text, font),
      lineHeight: line.kind === "title" ? 34 : line.kind === "small" ? 25 : 30,
      gap: line.kind === "heading" ? 11 : line.kind === "rule" ? 13 : 6,
    };
  });
  const height = Math.max(100, Math.ceil(
    pad * 2 + blocks.reduce((sum, block) =>
      sum + (block.kind === "rule" ? 16 : block.wrapped.length * block.lineHeight) + block.gap, 0),
  ));
  // Keep the image within mobile browser canvas size limits.
  if (height > 12000) throw new Error("Le ticket est trop long. Raccourcissez les remarques.");
  canvas.width = pixels;
  canvas.height = height;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, pixels, height);
  context.fillStyle = "#000";
  context.textBaseline = "top";
  let y = pad;
  for (const block of blocks) {
    if (block.kind === "rule") {
      y += 4;
      context.strokeStyle = "#000";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(pad, y);
      context.lineTo(pixels - pad, y);
      context.stroke();
      y += 12 + block.gap;
      continue;
    }
    context.font = block.font;
    context.fillStyle = "#000";
    for (const row of block.wrapped) {
      if (block.kind === "title" || block.kind === "subtitle") {
        context.textAlign = "center";
        context.fillText(row, pixels / 2, y);
      } else {
        context.textAlign = "left";
        context.fillText(row, pad, y);
      }
      y += block.lineHeight;
    }
    y += block.gap;
  }
  return canvas.toDataURL("image/png");
}

function dataUrlToFile(dataUrl: string, name: string) {
  const encoded = dataUrl.split(",")[1];
  const binary = atob(encoded);
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index);
  return new File([data], name, { type: "image/png" });
}

export default function VehicleInspectionReceipt({
  record,
  onClose,
}: {
  record: VehicleInspection;
  onClose: () => void;
}) {
  const [paper, setPaper] = useState<ReceiptWidth>("58");
  const [message, setMessage] = useState("");
  const lines = useMemo(() => printableLines(record), [record]);
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [close]);

  const shareImage = () => {
    setMessage("");
    try {
      const dataUrl = receiptImage(lines, paper);
      const file = dataUrlToFile(
        dataUrl,
        "verification-" + record.date + "-" + record.plate.replace(/[^a-zA-Z0-9-]/g, "") + ".png",
      );
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        void navigator.share({
          title: "Vérification sommaire du véhicule",
          files: [file],
        }).catch((error) => {
          if (error?.name !== "AbortError") setMessage("Le partage a échoué. Essayez de sauvegarder l’image.");
        });
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setMessage("Image créée. Ouvrez-la avec l’application d’impression Bluetooth de votre imprimante.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de générer le ticket.");
    }
  };

  return (
    <>
      <div className="inspection-receipt-modal" role="presentation">
        <div className="inspection-receipt-backdrop" onClick={close} />
        <section className="inspection-receipt-panel" role="dialog" aria-modal="true" aria-labelledby="inspection-receipt-title">
          <header className="inspection-receipt-header">
            <div>
              <h3 id="inspection-receipt-title">Imprimer la vérification</h3>
              <p>Ticket thermique Bisofice · format reçu</p>
            </div>
            <button type="button" onClick={close} aria-label="Fermer l’aperçu" className="inspection-receipt-close">×</button>
          </header>
          <div className="inspection-receipt-controls">
            <label>
              Largeur du rouleau
              <select value={paper} onChange={(event) => setPaper(event.target.value as ReceiptWidth)}>
                <option value="58">58 mm — Bisofice (recommandé)</option>
                <option value="80">80 mm — autre imprimante</option>
              </select>
            </label>
            <p>Sur iPhone, « Imprimer » utilise les imprimantes reconnues par iOS (AirPrint). Pour une Bisofice Bluetooth non AirPrint, partagez l’image vers une application d’impression compatible.</p>
          </div>
          <div className={"inspection-receipt-preview receipt-width-" + paper}>
            <ReceiptPaper lines={lines} />
          </div>
          {message && <p className="inspection-receipt-message" role="status">{message}</p>}
          <div className="inspection-receipt-buttons">
            <button type="button" className="inspection-receipt-native" onClick={() => window.print()}>
              Imprimer (AirPrint)
            </button>
            <button type="button" className="inspection-receipt-share" onClick={shareImage}>
              Partager le ticket en image
            </button>
          </div>
        </section>
      </div>
      <div className={"inspection-receipt-print-area receipt-width-" + paper}>
        <ReceiptPaper lines={lines} />
      </div>
    </>
  );
}
