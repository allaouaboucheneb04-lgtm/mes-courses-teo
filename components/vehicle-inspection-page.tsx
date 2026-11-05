"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import VehicleInspectionReceipt from "@/components/vehicle-inspection-receipt";
import {
  INSPECTION_GROUPS,
  inspectionDefectLabels,
  inspectionIssues,
  newInspectionDraft,
  validateInspection,
  type InspectionDraft,
  type VehicleCondition,
  type VehicleInspection,
} from "@/lib/vehicle-inspection";

type Props = {
  inspections: VehicleInspection[];
  accountName: string;
  onSave: (inspection: VehicleInspection) => void;
};

function localDateTime(): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]),
  );
  return {
    date: parts.year + "-" + parts.month + "-" + parts.day,
    time: parts.hour + ":" + parts.minute,
  };
}

function displayDate(date: string) {
  if (!date) return "Date non définie";
  return new Date(date + "T12:00:00").toLocaleDateString("fr-CA", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function VehicleInspectionPage({ inspections, accountName, onSave }: Props) {
  const [mode, setMode] = useState<"new" | "history">("new");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InspectionDraft>(() => newInspectionDraft());
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [printRecord, setPrintRecord] = useState<VehicleInspection | null>(null);

  const history = useMemo(() => [...inspections].sort(
    (a, b) => (b.date + b.time + b.createdAt).localeCompare(a.date + a.time + a.createdAt),
  ), [inspections]);

  // Fill date/time on the device so server rendering does not differ from Safari.
  useEffect(() => {
    const { date, time } = localDateTime();
    setDraft((current) => ({
      ...current,
      date: current.date || date,
      time: current.time || time,
      driverName: current.driverName || accountName,
    }));
  }, [accountName]);

  const update = <K extends keyof InspectionDraft>(key: K, value: InspectionDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (error) setError("");
  };

  const reset = () => {
    const { date, time } = localDateTime();
    const previous = history[0];
    const next = newInspectionDraft(previous?.driverName || accountName, date, time);
    next.permitNumber = previous?.permitNumber || "";
    next.plate = previous?.plate || "";
    next.governmentAccessory = previous?.governmentAccessory || "";
    setDraft(next);
    setEditingId(null);
    setError("");
    setMode("new");
  };

  const edit = (record: VehicleInspection) => {
    const { id, createdAt, updatedAt, ...values } = record;
    setDraft(values);
    setEditingId(id);
    setError("");
    setMode("new");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateInspection(draft);
    if (validation) {
      setError(validation);
      document.getElementById("vehicle-inspection-error")?.scrollIntoView({
        behavior: "smooth", block: "center",
      });
      return;
    }
    const existing = inspections.find((item) => item.id === editingId);
    const stamp = new Date().toISOString();
    const record: VehicleInspection = {
      ...draft,
      driverName: draft.driverName.trim(),
      permitNumber: draft.permitNumber.trim(),
      plate: draft.plate.trim().toUpperCase(),
      governmentAccessory: draft.governmentAccessory.trim(),
      defectDescription: draft.defectDescription.trim(),
      exteriorDamage: draft.exteriorDamage.trim(),
      interiorDamage: draft.interiorDamage.trim(),
      missingEquipment: draft.missingEquipment.trim(),
      signature: draft.signature.trim(),
      id: existing?.id || crypto.randomUUID(),
      createdAt: existing?.createdAt || stamp,
      updatedAt: stamp,
    };
    onSave(record);
    setEditingId(null);
    setError("");
    setMode("history");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filtered = history.filter((record) => {
    const q = search.trim().toLowerCase();
    return !q || [record.date, record.driverName, record.permitNumber, record.plate,
      record.odometer, record.defectDescription].some((value) => value.toLowerCase().includes(q));
  });

  return (
    <section className="vehicle-inspection-page">
      <header className="inspection-hero">
        <div className="inspection-hero-heading">
          <div>
            <span className="inspection-kicker">SÉCURITÉ DU VÉHICULE</span>
            <h2>Vérification sommaire</h2>
          </div>
          <span className="inspection-hero-icon" aria-hidden="true">✓</span>
        </div>
        <p>Remplissez la vérification avant le départ. Cochez uniquement les éléments présentant une défectuosité.</p>
        <small>Adaptation numérique de la feuille fournie — à comparer aux exigences applicables et au formulaire officiel.</small>
      </header>

      <nav className="inspection-tabs" aria-label="Vérifications du véhicule">
        <button type="button" className={mode === "new" ? "active" : ""}
          aria-current={mode === "new" ? "page" : undefined}
          onClick={() => setMode("new")}>{editingId ? "Corriger la fiche" : "Nouvelle vérification"}</button>
        <button type="button" className={mode === "history" ? "active" : ""}
          aria-current={mode === "history" ? "page" : undefined}
          onClick={() => setMode("history")}>Historique ({history.length})</button>
      </nav>

      {mode === "new" ? (
        <form className="inspection-form" onSubmit={save}>
          <div className="inspection-section-heading">
            <h3>{editingId ? "Corriger une vérification enregistrée" : "Informations avant le départ"}</h3>
            <p>Les champs marqués * sont nécessaires à l’enregistrement.</p>
          </div>
          <div className="inspection-grid">
            <label>Nom du chauffeur *
              <input value={draft.driverName} maxLength={100} autoComplete="name" required
                onChange={(e) => update("driverName", e.target.value)} />
            </label>
            <label>Permis de chauffeur de taxi *
              <input value={draft.permitNumber} maxLength={40} autoCapitalize="characters" required
                onChange={(e) => update("permitNumber", e.target.value)} />
            </label>
            <label>Date de vérification *
              <input type="date" value={draft.date} required
                onChange={(e) => update("date", e.target.value)} />
            </label>
            <label>Heure de vérification *
              <input type="time" value={draft.time} required
                onChange={(e) => update("time", e.target.value)} />
            </label>
            <label>Immatriculation *
              <input value={draft.plate} maxLength={20} required autoCapitalize="characters"
                onChange={(e) => update("plate", e.target.value)} />
            </label>
            <label>Odomètre (km) *
              <input type="number" min="0" max="9999999" step="1" inputMode="numeric"
                value={draft.odometer} required
                onChange={(e) => update("odometer", e.target.value)} />
            </label>
            <label>N° de l’accessoire gouvernemental
              <input value={draft.governmentAccessory} maxLength={50}
                onChange={(e) => update("governmentAccessory", e.target.value)} />
            </label>
            <label>Charge de la batterie (%) — si électrique
              <input type="number" min="0" max="100" step="1" inputMode="numeric"
                value={draft.batteryPercent} placeholder="Ex. 85"
                onChange={(e) => update("batteryPercent", e.target.value)} />
            </label>
          </div>

          <div className="inspection-section-heading">
            <h3>Points à vérifier</h3>
            <p><strong>Ne cochez que les éléments défectueux.</strong> Si aucun défaut n’est constaté, laissez les cases vides.</p>
          </div>
          <div className="inspection-defect-summary" role="status">
            <span className={draft.defects.length ? "with-defects" : "no-defects"}>
              {draft.defects.length ? draft.defects.length + " anomalie(s) cochée(s)" : "Aucune anomalie cochée"}
            </span>
          </div>
          <div className="inspection-groups">
            {INSPECTION_GROUPS.map((group) => (
              <fieldset key={group.title} className="inspection-check-group">
                <legend>{group.title}</legend>
                <div className="inspection-check-grid">
                  {group.checks.map((check) => (
                    <label key={check.key} className={"inspection-check " + (draft.defects.includes(check.key) ? "checked" : "")}>
                      <input type="checkbox" checked={draft.defects.includes(check.key)}
                        onChange={(e) => update("defects", e.target.checked
                          ? [...draft.defects, check.key]
                          : draft.defects.filter((item) => item !== check.key))} />
                      <span>{check.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="inspection-section-heading">
            <h3>État du véhicule et remarques</h3>
          </div>
          <div className="inspection-grid">
            <label className="inspection-full">Description des défectuosités {draft.defects.length > 0 ? "*" : ""}
              <textarea rows={3} maxLength={1500} value={draft.defectDescription}
                placeholder="Décrivez les défauts constatés, le moment et les mesures prises."
                onChange={(e) => update("defectDescription", e.target.value)} />
            </label>
            <label>Extérieur abîmé (précisez au besoin)
              <input value={draft.exteriorDamage} maxLength={300} placeholder="Aucun dommage signalé"
                onChange={(e) => update("exteriorDamage", e.target.value)} />
            </label>
            <label>Intérieur abîmé ou taché (précisez)
              <input value={draft.interiorDamage} maxLength={300} placeholder="Aucun dommage signalé"
                onChange={(e) => update("interiorDamage", e.target.value)} />
            </label>
            <label>Propreté extérieure *
              <select value={draft.exteriorCondition} required onChange={(e) => update("exteriorCondition", e.target.value as VehicleCondition)}>
                <option value="">Sélectionner</option>
                <option value="propre">Propre</option>
                <option value="a-nettoyer">À nettoyer</option>
              </select>
            </label>
            <label>Propreté intérieure *
              <select value={draft.interiorCondition} required onChange={(e) => update("interiorCondition", e.target.value as VehicleCondition)}>
                <option value="">Sélectionner</option>
                <option value="propre">Propre</option>
                <option value="a-nettoyer">À nettoyer</option>
              </select>
            </label>
            <label className="inspection-full">Équipement standard absent ou endommagé
              <textarea rows={2} maxLength={700} value={draft.missingEquipment}
                placeholder="Précisez le matériel manquant ou endommagé."
                onChange={(e) => update("missingEquipment", e.target.value)} />
            </label>
          </div>
          <div className="inspection-signature">
            <label>Nom du chauffeur (signature saisie) *
              <input value={draft.signature} maxLength={100}
                onChange={(e) => update("signature", e.target.value)} required
                placeholder="Votre nom complet" />
            </label>
            <label className="inspection-confirm">
              <input type="checkbox" checked={draft.confirmed}
                onChange={(e) => update("confirmed", e.target.checked)} />
              <span>Je confirme avoir effectué les vérifications des éléments ci-dessus avant le départ.</span>
            </label>
            <p>La signature saisie est un enregistrement textuel; elle ne constitue pas une signature manuscrite certifiée.</p>
            {inspectionIssues(draft) > 0 && (
              <p className="inspection-warning" role="status">
                Des anomalies sont signalées. Cette fiche ne détermine pas si le véhicule peut circuler :
                appliquez les consignes d’entretien et les règles de sécurité en vigueur.
              </p>
            )}
          </div>
          {error && <p className="inspection-error" id="vehicle-inspection-error" role="alert">{error}</p>}
          <div className="inspection-form-actions">
            <button type="submit">{editingId ? "Enregistrer les corrections" : "Enregistrer la vérification"}</button>
            <button type="button" onClick={reset}>Nouvelle fiche vierge</button>
          </div>
          <p className="inspection-save-note">Les fiches enregistrées sont synchronisées avec votre compte, comme les courses. Vérifiez l’indicateur de sauvegarde en haut de l’application.</p>
        </form>
      ) : (
        <section className="inspection-history">
          <div className="inspection-history-head">
            <div><h3>Vérifications enregistrées</h3><p>{history.length} fiche(s) dans votre compte</p></div>
            <button type="button" onClick={reset}>＋ Nouvelle</button>
          </div>
          <label className="inspection-search-label">Rechercher par date, véhicule ou chauffeur
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Plaque, date, nom, kilométrage…" />
          </label>
          {!filtered.length ? (
            <div className="inspection-empty">Aucune vérification trouvée pour cette recherche.</div>
          ) : (
            <div className="inspection-record-list">
              {filtered.map((record) => {
                const count = inspectionIssues(record);
                return (
                  <article className="inspection-record" key={record.id}>
                    <div className="inspection-record-top">
                      <div>
                        <b>{record.plate || "Véhicule"}</b>
                        <small>{displayDate(record.date)} à {record.time} · {record.driverName}</small>
                      </div>
                      <span className={"inspection-record-badge " + (count ? "attention" : "no-issue")}>
                        {count ? count + " élément(s) à signaler" : "Aucune anomalie signalée"}
                      </span>
                    </div>
                    <div className="inspection-record-meta">
                      <span>Odomètre : <strong>{Number(record.odometer).toLocaleString("fr-CA")} km</strong></span>
                      {record.batteryPercent && <span>Batterie : <strong>{record.batteryPercent} %</strong></span>}
                    </div>
                    <details className="inspection-record-details">
                      <summary>Voir la fiche</summary>
                      <dl>
                        <div><dt>Permis</dt><dd>{record.permitNumber}</dd></div>
                        <div><dt>Accessoire gouvernemental</dt><dd>{record.governmentAccessory || "Non indiqué"}</dd></div>
                        <div><dt>Extérieur</dt><dd>{record.exteriorCondition === "propre" ? "Propre" : "À nettoyer"}{record.exteriorDamage ? " · " + record.exteriorDamage : ""}</dd></div>
                        <div><dt>Intérieur</dt><dd>{record.interiorCondition === "propre" ? "Propre" : "À nettoyer"}{record.interiorDamage ? " · " + record.interiorDamage : ""}</dd></div>
                        <div><dt>Défectuosités cochées</dt><dd>{record.defects.map((key) => inspectionDefectLabels[key] || key).join(" · ") || "Aucune"}</dd></div>
                        <div><dt>Commentaires</dt><dd>{record.defectDescription || "Aucun"}</dd></div>
                        <div><dt>Équipement manquant / endommagé</dt><dd>{record.missingEquipment || "Aucun"}</dd></div>
                        <div><dt>Signataire</dt><dd>{record.signature}</dd></div>
                        <div><dt>Dernière mise à jour</dt><dd>{new Date(record.updatedAt).toLocaleString("fr-CA")}</dd></div>
                      </dl>
                    </details>
                    <div className="inspection-record-actions">
                      <button type="button" onClick={() => edit(record)}>Corriger</button>
                      <button type="button" onClick={() => setPrintRecord(record)}>Ticket 58 mm / Imprimer</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      {printRecord && (
        <VehicleInspectionReceipt
          record={printRecord}
          onClose={() => setPrintRecord(null)}
        />
      )}
    </section>
  );
}
