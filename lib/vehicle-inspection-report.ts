import {
  INSPECTION_GROUPS,
  inspectionIssues,
  type VehicleInspection,
} from "./vehicle-inspection";

export type InspectionReceiptLine = {
  text: string;
  kind?: "title" | "subtitle" | "heading" | "rule" | "bold" | "small";
};

/**
 * A faithful report of the saved inspection. An unchecked box means that no
 * defect was reported for that item; it must not be presented as a certified
 * roadworthiness result.
 */
export function printableLines(record: VehicleInspection): InspectionReceiptLine[] {
  const defects = new Set(record.defects ?? []);
  const issueCount = inspectionIssues({
    ...record,
    defects: record.defects ?? [],
    exteriorDamage: record.exteriorDamage ?? "",
    interiorDamage: record.interiorDamage ?? "",
    missingEquipment: record.missingEquipment ?? "",
  });
  const condition = (value: string) =>
    value === "propre" ? "Propre" : value === "a-nettoyer" ? "À nettoyer" : "Non précisé";
  const details = (value: string | undefined) => value?.trim() || "Non mentionné";
  const lines: InspectionReceiptLine[] = [
    { text: "RAPPORT DE VÉRIFICATION SOMMAIRE", kind: "title" },
    { text: "Taxi · vérification avant départ", kind: "subtitle" },
    { text: "", kind: "rule" },
    { text: "Date : " + record.date },
    { text: "Heure : " + record.time },
    { text: "Chauffeur : " + record.driverName },
    { text: "Permis taxi : " + record.permitNumber },
    { text: "Plaque : " + record.plate, kind: "bold" },
    { text: "Odomètre : " + record.odometer + " km" },
    { text: "Accessoire gouvernemental : " + details(record.governmentAccessory) },
  ];
  if (record.batteryPercent) lines.push({ text: "Batterie : " + record.batteryPercent + " %" });

  lines.push(
    { text: "", kind: "rule" },
    { text: "RÉSULTAT ET DÉTAILS", kind: "heading" },
    { text: issueCount ? issueCount + " élément(s) à signaler" : "Aucune anomalie signalée", kind: "bold" },
    { text: "X = anomalie cochée ; - = aucune anomalie cochée", kind: "small" },
  );

  // Print every checkpoint, not only the flagged ones. Group names and labels
  // come from the exact inspection form the driver completed.
  for (const group of INSPECTION_GROUPS) {
    lines.push({ text: group.title.toUpperCase(), kind: "heading" });
    for (const check of group.checks) {
      lines.push({
        text: (defects.has(check.key) ? "[X] " : "[-] ") + check.label,
        kind: defects.has(check.key) ? "bold" : undefined,
      });
    }
  }
  const unknownDefects = [...defects].filter(
    key => !INSPECTION_GROUPS.some(group => group.checks.some(check => check.key === key)),
  );
  if (unknownDefects.length) {
    lines.push({ text: "AUTRES ANOMALIES ENREGISTRÉES", kind: "heading" });
    unknownDefects.forEach(key => lines.push({ text: "[X] " + key, kind: "bold" }));
  }

  lines.push(
    { text: "", kind: "rule" },
    { text: "OBSERVATIONS ET ÉTAT DU VÉHICULE", kind: "heading" },
    { text: "Description des défectuosités : " + details(record.defectDescription) },
    { text: "Propreté extérieure : " + condition(record.exteriorCondition) },
    { text: "Dommages extérieurs : " + details(record.exteriorDamage) },
    { text: "Propreté intérieure : " + condition(record.interiorCondition) },
    { text: "Dommages intérieurs : " + details(record.interiorDamage) },
    { text: "Équipement absent ou endommagé : " + details(record.missingEquipment) },
    { text: "", kind: "rule" },
    { text: "Vérification confirmée : " + (record.confirmed ? "Oui" : "Non") },
    { text: "Signature saisie : " + details(record.signature), kind: "bold" },
    { text: "", kind: "rule" },
    { text: "Mes Courses Téo · rapport numérique", kind: "small" },
    { text: "Une case non cochée ne constitue pas une certification d'état mécanique.", kind: "small" },
    { text: "Ce rapport ne remplace pas nécessairement le formulaire officiel.", kind: "small" },
  );
  return lines;
}
