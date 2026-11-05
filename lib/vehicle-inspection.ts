export type VehicleCondition = "" | "propre" | "a-nettoyer";
export type VehicleInspection = {
  id: string;
  date: string;
  time: string;
  driverName: string;
  permitNumber: string;
  plate: string;
  odometer: string;
  governmentAccessory: string;
  batteryPercent: string;
  defects: string[];
  defectDescription: string;
  exteriorDamage: string;
  interiorDamage: string;
  exteriorCondition: VehicleCondition;
  interiorCondition: VehicleCondition;
  missingEquipment: string;
  signature: string;
  confirmed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InspectionDraft = Omit<VehicleInspection, "id" | "createdAt" | "updatedAt">;

export type InspectionGroup = {
  title: string;
  checks: { key: string; label: string }[];
};

// Les cases cochées signalent une anomalie constatée, comme sur la feuille papier.
export const INSPECTION_GROUPS: InspectionGroup[] = [
  {
    title: "Éclairage et visibilité",
    checks: [
      { key: "headlight-left", label: "Phare avant gauche" },
      { key: "headlight-right", label: "Phare avant droit" },
      { key: "lights-front-left", label: "Feux avant gauches" },
      { key: "lights-front-right", label: "Feux avant droits" },
      { key: "lights-rear-left", label: "Feux arrière gauches" },
      { key: "lights-rear-right", label: "Feux arrière droits" },
      { key: "brake-lights-left", label: "Feux de freinage / arrière gauches" },
      { key: "brake-lights-right", label: "Feux de freinage / arrière droits" },
      { key: "license-light", label: "Éclairage de la plaque d’immatriculation" },
      { key: "wipers", label: "Essuie-glaces" },
      { key: "washer-fluid", label: "Niveau du liquide lave-glaces" },
      { key: "mirror-left", label: "Rétroviseur gauche" },
      { key: "mirror-right", label: "Rétroviseur droit" },
      { key: "dashboard-lamps", label: "Voyants lumineux au tableau de bord" },
    ],
  },
  {
    title: "Pneus et freinage",
    checks: [
      { key: "front-tire-left", label: "Pneu avant gauche" },
      { key: "front-tire-right", label: "Pneu avant droit" },
      { key: "rear-tire-left", label: "Pneu arrière gauche" },
      { key: "rear-tire-right", label: "Pneu arrière droit" },
      { key: "valve-front-left", label: "Valve du pneu avant gauche" },
      { key: "valve-front-right", label: "Valve du pneu avant droit" },
      { key: "valve-rear-left", label: "Valve du pneu arrière gauche" },
      { key: "valve-rear-right", label: "Valve du pneu arrière droit" },
      { key: "brake-fluid", label: "Niveau du liquide de frein" },
      { key: "parking-brake", label: "Frein de stationnement" },
    ],
  },
  {
    title: "Sécurité et équipements",
    checks: [
      { key: "horn", label: "Klaxon" },
      { key: "seatbelt-extension", label: "Rallonge de ceinture" },
      { key: "taxi-roof-light", label: "Lanternon / enseigne taxi" },
      { key: "gps", label: "Système de géolocalisation (si vérification prévue)" },
      { key: "immobilizer", label: "Dispositif d’immobilisation" },
      { key: "accessible-ramp", label: "Rampe / plate-forme et ancrages (si applicable)" },
    ],
  },
];

export const inspectionDefectLabels = Object.fromEntries(
  INSPECTION_GROUPS.flatMap((group) =>
    group.checks.map((check) => [check.key, check.label] as const),
  ),
) as Record<string, string>;

export const inspectionIssues = (inspection: Pick<
  VehicleInspection,
  "defects" | "exteriorDamage" | "interiorDamage" | "exteriorCondition" | "interiorCondition" | "missingEquipment"
>) =>
  inspection.defects.length +
  Number(Boolean(inspection.exteriorDamage.trim())) +
  Number(Boolean(inspection.interiorDamage.trim())) +
  Number(inspection.exteriorCondition === "a-nettoyer") +
  Number(inspection.interiorCondition === "a-nettoyer") +
  Number(Boolean(inspection.missingEquipment.trim()));

export function newInspectionDraft(driverName = "", date = "", time = ""): InspectionDraft {
  return {
    date, time, driverName, permitNumber: "", plate: "", odometer: "",
    governmentAccessory: "", batteryPercent: "", defects: [],
    defectDescription: "", exteriorDamage: "", interiorDamage: "",
    exteriorCondition: "", interiorCondition: "", missingEquipment: "",
    signature: "", confirmed: false,
  };
}

export function validateInspection(draft: InspectionDraft): string | null {
  if (!draft.driverName.trim()) return "Indiquez le nom du chauffeur.";
  if (!draft.permitNumber.trim()) return "Indiquez le numéro de permis du chauffeur de taxi.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !Number.isFinite(Date.parse(draft.date + "T12:00:00"))) return "Indiquez une date valide.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return "Indiquez l’heure de vérification.";
  if (!draft.plate.trim()) return "Indiquez l’immatriculation du véhicule.";
  if (!/^\d{1,7}$/.test(draft.odometer) || Number(draft.odometer) < 0) return "Indiquez un odomètre valide en kilomètres.";
  if (draft.batteryPercent && (!/^\d{1,3}$/.test(draft.batteryPercent) || Number(draft.batteryPercent) > 100)) return "La batterie doit être entre 0 et 100 %.";
  if (draft.defects.length > 0 && !draft.defectDescription.trim()) return "Décrivez les défectuosités cochées.";
  if (!draft.exteriorCondition || !draft.interiorCondition) return "Précisez la propreté intérieure et extérieure.";
  if (!draft.signature.trim()) return "Saisissez le nom du chauffeur en guise de signature.";
  if (!draft.confirmed) return "Confirmez avoir procédé à la vérification.";
  return null;
}