"use client";
import { useState } from "react";
import { isCardPayment } from "@/lib/teo-payment";

type Ride = { id: string; type: string; date: string; amount: number; tip: number; payment: string; hob?: string; teoId?: string; sevAdded?: boolean };
export const sevEligible = (ride: Ride) => ride.type === "adapte" || (ride.type === "taxi" && isCardPayment(ride.payment));
export function SevCheckbox({ ride, onChange }: { ride: Ride; onChange: (id: string, added: boolean) => void }) {
  if (!sevEligible(ride)) return null;
  return <label className="sev-check"><input type="checkbox" checked={!!ride.sevAdded} onChange={(event) => onChange(ride.id, event.target.checked)} />{ride.sevAdded ? "Ajouté au SEV" : "À ajouter au SEV"}</label>;
}

export default function SevPage({ courses, onChange, today, week }: { courses: Ride[]; onChange: (id: string, added: boolean) => void; today: string; week: { start: string; end: string } }) {
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
      <div><b>{ride.type === "adapte" ? ride.hob || "Tournée adaptée" : "Course Carte / Compte"}</b><small>{new Date(`${ride.date}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}{ride.teoId ? ` · ${ride.teoId}` : ""}</small></div><strong>{money(ride.amount + ride.tip)}</strong><SevCheckbox ride={ride} onChange={onChange} />
    </article>)}</div>}
  </section>;
}
