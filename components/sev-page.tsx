"use client";
import { useState } from "react";
import { isCardPayment } from "@/lib/teo-payment";

type Ride = {
  id: string; type: string; date: string; amount: number; tip: number;
  payment: string; hob?: string; teoId?: string; sevAdded?: boolean;
  taxiCategory?: string; tipPending?: boolean; duration?: number;
  billedDuration?: number; start?: string; end?: string; perception?: number;
  verified?: boolean; verifiedBillId?: string; verifiedAt?: string;
  serviceFee?: number; airportFee?: number;
};
export const sevEligible = (ride: Ride) => ride.type === "adapte" || (ride.type === "taxi" && isCardPayment(ride.payment));
export function SevCheckbox({ ride, onChange }: { ride: Ride; onChange: (id: string, added: boolean) => void }) {
  if (!sevEligible(ride)) return null;
  return <label className="sev-check"><input type="checkbox" checked={!!ride.sevAdded} onChange={(event) => onChange(ride.id, event.target.checked)} />{ride.sevAdded ? "Ajouté au SEV" : "À ajouter au SEV"}</label>;
}

export default function SevPage({ courses, onChange, onEdit, today, week }: { courses: Ride[]; onChange: (id: string, added: boolean) => void; onEdit: (id: string) => void; today: string; week: { start: string; end: string } }) {
  const [period, setPeriod] = useState("week");
  const [status, setStatus] = useState("pending");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [start, setStart] = useState(week.start);
  const [end, setEnd] = useState(week.end);
  const lastStart = new Date(`${week.start}T12:00:00`); lastStart.setDate(lastStart.getDate() - 7);
  const lastEnd = new Date(`${week.end}T12:00:00`); lastEnd.setDate(lastEnd.getDate() - 7);
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const rows = courses.filter(sevEligible).filter((ride) =>
    (type === "all" || ride.type === type) &&
    (!search.trim() || `${ride.hob || ""} ${ride.teoId || ""}`.toLowerCase().includes(search.trim().toLowerCase())) &&
    (period === "all" || (period === "week" && ride.date >= week.start && ride.date <= week.end) ||
      (period === "previous" && ride.date >= key(lastStart) && ride.date <= key(lastEnd)) ||
      (period === "month" && ride.date.startsWith(today.slice(0,7))) ||
      (period === "custom" && ride.date >= start && ride.date <= end))
  ).sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const added = rows.filter((ride) => ride.sevAdded).length;
  const visible = rows.filter((ride) => status === "all" || (status === "added" ? ride.sevAdded : !ride.sevAdded));
  const money = (amount: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(amount);
  return <section className="sev-page">
    <header><span className="sev-kicker">SUIVI DES COURSES</span><h2>SEV</h2><p>Cochez les courses après les avoir ajoutées au SEV. Ce suivi n’envoie aucune donnée au SEV et reste indépendant de la vérification de paie.</p></header>
    <div className="sev-stats"><div><b>{rows.length - added}</b><span>À ajouter</span></div><div><b>{added}</b><span>Ajoutées</span></div><div><b>{rows.length}</b><span>Total de la sélection</span></div></div>
    <div className="sev-filters">
      <label>Période<select value={period} onChange={(e)=>setPeriod(e.target.value)}><option value="week">Cette semaine</option><option value="previous">Semaine précédente</option><option value="month">Ce mois-ci</option><option value="custom">Dates personnalisées</option><option value="all">Toutes les dates</option></select></label>
      <label>Statut<select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="pending">À ajouter au SEV</option><option value="added">Ajoutées au SEV</option><option value="all">Tous les statuts</option></select></label>
      <label>Type<select value={type} onChange={(e)=>setType(e.target.value)}><option value="all">Tous les types</option><option value="taxi">Carte / Compte</option><option value="adapte">Transport adapté</option></select></label>
      <label>Rechercher<input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Numéro HOB ou identifiant Téo" /></label>
      {period === "custom" && <><label>Du<input type="date" value={start} onChange={(e)=>setStart(e.target.value)} /></label><label>Au<input type="date" min={start} value={end} onChange={(e)=>setEnd(e.target.value)} /></label></>}
    </div>
    {period === "week" && <p>Du {week.start} au {week.end} · semaine du mardi au lundi</p>}
    {period === "custom" && start > end && <p role="alert">La date de fin doit être après la date de début.</p>}
    <div className="sev-list-head"><b>{visible.length} élément{visible.length > 1 ? "s" : ""} affiché{visible.length > 1 ? "s" : ""}</b><span>{money(visible.reduce((sum, ride) => sum + ride.amount + ride.tip, 0))}</span></div>
    {!visible.length ? <p className="sev-empty">Aucune course pour ces filtres.</p> : <div className="sev-list">{visible.map((ride) => <article key={ride.id}>
      <div><b>{ride.type === "adapte" ? ride.hob || "Tournée adaptée" : ride.taxiCategory === "aeroport" ? "Course aéroport" : "Course centre-ville"}</b><small>{new Date(`${ride.date}T12:00:00`).toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</small></div><strong>{money(ride.amount + ride.tip)}</strong>
      <dl className="sev-ride-details">
        <div><dt>Paiement</dt><dd>{ride.type === "adapte" ? "Transport adapté" : "Téo · Carte / Compte"}</dd></div>
        <div><dt>{ride.type === "adapte" ? "Numéro HOB" : "Identifiant Téo"}</dt><dd>{(ride.type === "adapte" ? ride.hob : ride.teoId) || "Non renseigné"}</dd></div>
        {ride.type === "taxi" ? <>
          <div><dt>Avant pourboire</dt><dd>{ride.tipPending ? "À confirmer avec la paie" : money(ride.amount)}</dd></div>
          <div><dt>Pourboire</dt><dd>{ride.tipPending ? "À récupérer depuis la fiche Téo" : money(ride.tip)}</dd></div>
          <div><dt>Total avec pourboire</dt><dd>{money(ride.amount + ride.tip)}</dd></div>
        </> : <>
          <div><dt>Début</dt><dd>{ride.start || "Non renseigné"}</dd></div>
          <div><dt>Fin</dt><dd>{ride.end || "Non renseignée"}{ride.start && ride.end && ride.end <= ride.start ? " (lendemain)" : ""}</dd></div>
          <div><dt>Durée réelle</dt><dd>{ride.duration === undefined ? "Non renseignée" : `${ride.duration.toLocaleString("fr-CA", {maximumFractionDigits: 2})} h`}</dd></div>
          <div><dt>Heures payées</dt><dd>{ride.billedDuration === undefined ? "Non renseignées" : `${ride.billedDuration.toLocaleString("fr-CA", {maximumFractionDigits: 2})} h`}</dd></div>
          <div><dt>Montant brut</dt><dd>{money(ride.amount + ride.tip)}</dd></div>
          <div><dt>Perception STM</dt><dd>− {money(ride.perception || 0)}</dd></div>
        </>}
        <div><dt>Frais Téo</dt><dd>− {money(ride.serviceFee || 0)}</dd></div>
        <div className="sev-net"><dt>Net après frais et perceptions</dt><dd>{money(ride.amount + ride.tip - (ride.serviceFee || 0) - (ride.perception || 0))}</dd></div>
        {!!ride.airportFee && <div><dt>Redevance aéroport (déduite au résumé)</dt><dd>{money(ride.airportFee)}</dd></div>}
        <div><dt>Vérification de paie</dt><dd>{ride.verified ? "✓ Vérifiée" : "Non vérifiée"}</dd></div>
        {ride.verifiedBillId && <div><dt>Fiche Téo</dt><dd>{ride.verifiedBillId}</dd></div>}
        {ride.verifiedAt && Number.isFinite(Date.parse(ride.verifiedAt)) && <div><dt>Vérifiée le</dt><dd>{new Date(ride.verifiedAt).toLocaleDateString("fr-CA")}</dd></div>}
      </dl>
      <p className="sev-net-note">Net hors frais de compagnie, dépenses taxi et redevance aéroport.</p>
      <div className="sev-ride-actions"><SevCheckbox ride={ride} onChange={onChange} /><button type="button" onClick={() => onEdit(ride.id)}>Modifier {ride.type === "adapte" ? "la tournée" : "la course"}</button></div>
    </article>)}</div>}
  </section>;
}
