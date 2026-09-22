"use client";
import { useState } from "react";
import { isCardPayment } from "@/lib/teo-payment";
import { feePeriods, sevBreakdown, sevTotals } from "@/lib/sev";

type Ride = {
  id: string; type: string; date: string; amount: number; tip: number;
  payment: string; hob?: string; teoId?: string; sevAdded?: boolean;
  taxiCategory?: string; tipPending?: boolean; duration?: number;
  billedDuration?: number; start?: string; end?: string; perception?: number;
  verified?: boolean; verifiedBillId?: string; verifiedAt?: string;
  serviceFee?: number; airportFee?: number;
  sevTaxExempt?: boolean; sevLevyCount?: number;
};
export const sevEligible = (ride: Ride) => ride.type === "adapte" || (ride.type === "taxi" && isCardPayment(ride.payment));
export function SevCheckbox({ ride, onChange }: { ride: Ride; onChange: (id: string, added: boolean) => void }) {
  if (!sevEligible(ride)) return null;
  return <label className="sev-check"><input type="checkbox" checked={!!ride.sevAdded} onChange={(event) => onChange(ride.id, event.target.checked)} />{ride.sevAdded ? "Ajouté au SEV" : "À ajouter au SEV"}</label>;
}

export default function SevPage({ courses, expenses, companyFee, onFiscalChange, onChange, onEdit, today, week }: { courses: Ride[]; expenses: {date: string; amount: number}[]; companyFee: number; onFiscalChange: (id: string, patch: {sevTaxExempt?: boolean; sevLevyCount?: number}) => void; onChange: (id: string, added: boolean) => void; onEdit: (id: string) => void; today: string; week: { start: string; end: string } }) {
  const [page, setPage] = useState("courses");
  const [feePeriod, setFeePeriod] = useState("month");
  const [feeYear, setFeeYear] = useState(today.slice(0,4));
  const [period, setPeriod] = useState("week");
  const [status, setStatus] = useState("all");
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
  const feeRows = feePeriods(courses, expenses, feePeriod === "year", companyFee).filter(row => feeYear === "all" || row.period.startsWith(feeYear));
  const years = [...new Set([today.slice(0,4), ...courses.map(r=>r.date.slice(0,4)), ...expenses.map(e=>e.date.slice(0,4)), ...feePeriods(courses, expenses, true, companyFee).map(r=>r.period)])].sort().reverse();
  return <section className="sev-page">
    <header><span className="sev-kicker">SUIVI DES COURSES</span><h2>SEV</h2><p>Cochez les courses après les avoir ajoutées au SEV. Ce suivi n’envoie aucune donnée au SEV et reste indépendant de la vérification de paie.</p></header>
    <nav className="sev-tabs" aria-label="Sous-pages SEV">{[["courses","Courses"],["taxes","Taxes et redevances"],["fees","Frais"]].map(([id,label])=><button key={id} type="button" aria-current={page === id ? "page" : undefined} onClick={()=>setPage(id)}>{label}</button>)}</nav>
    {page === "fees" ? <>
      <h3>Frais par mois et par année</h3>
      <p>Toutes les courses et dépenses enregistrées, ajoutées au SEV ou non.</p>
      <div className="sev-filters"><label>Regrouper par<select value={feePeriod} onChange={e=>setFeePeriod(e.target.value)}><option value="month">Mois</option><option value="year">Année</option></select></label><label>Année<select value={feeYear} onChange={e=>setFeeYear(e.target.value)}><option value="all">Toutes les années</option>{years.map(year=><option key={year}>{year}</option>)}</select></label></div>
      <div className="sev-list-head"><b>Total des frais</b><strong>{money(feeRows.reduce((sum,row)=>sum+row.total,0))}</strong></div>
      <div className="sev-list">{feeRows.map(row=><article key={row.period}><b>{row.period.length === 4 ? row.period : new Date(`${row.period}-15T12:00:00`).toLocaleDateString("fr-CA",{month:"long",year:"numeric"})}</b><strong>{money(row.total)}</strong><dl className="sev-ride-details"><div><dt>Frais Téo</dt><dd>{money(row.service)}</dd></div><div><dt>Redevances aéroport</dt><dd>{money(row.airport)}</dd></div><div><dt>Frais de compagnie</dt><dd>{money(row.company)}</dd></div><div><dt>Dépenses taxi</dt><dd>{money(row.expenses)}</dd></div></dl></article>)}</div>
      {!feeRows.length && <p className="sev-empty">Aucun frais enregistré pour cette période.</p>}
      <p className="sev-net-note">Les frais de compagnie sont comptés une fois par semaine avec des courses, au mardi de cette semaine. Les frais sont calculés selon les réglages actuels. Les perceptions STM et la redevance taxi comprise dans le prix client ne sont pas des frais ajoutés ici. Ne saisissez pas une seconde fois ces frais automatiques dans Dépenses.</p>
    </> : <>
    <div className="sev-stats"><div><b>{rows.length - added}</b><span>À ajouter</span></div><div><b>{added}</b><span>Ajoutées</span></div><div><b>{rows.length}</b><span>Total de la sélection</span></div></div>
    <div className="sev-filters">
      <label>Période<select value={period} onChange={(e)=>setPeriod(e.target.value)}><option value="week">Cette semaine</option><option value="previous">Semaine précédente</option><option value="month">Ce mois-ci</option><option value="custom">Dates personnalisées</option><option value="all">Toutes les dates</option></select></label>
      {page === "courses" && <label>Statut<select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="pending">À ajouter au SEV</option><option value="added">Ajoutées au SEV</option><option value="all">Tous les statuts</option></select></label>}
      <label>Type<select value={type} onChange={(e)=>setType(e.target.value)}><option value="all">Tous les types</option><option value="taxi">Carte / Compte</option><option value="adapte">Transport adapté</option></select></label>
      <label>Rechercher<input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Numéro HOB ou identifiant Téo" /></label>
      {period === "custom" && <><label>Du<input type="date" value={start} onChange={(e)=>setStart(e.target.value)} /></label><label>Au<input type="date" min={start} value={end} onChange={(e)=>setEnd(e.target.value)} /></label></>}
    </div>
    {period === "week" && <p>Du {week.start} au {week.end} · semaine du mardi au lundi</p>}
    {period === "custom" && start > end && <p role="alert">La date de fin doit être après la date de début.</p>}
    {page === "taxes" ? <>
      <h3>Taxes et redevances de la sélection</h3>
      <div className="sev-tax-panels">{[true,false].map(declared=>{
        const selected = rows.filter(ride=>!!ride.sevAdded === declared);
        const totals = sevTotals(selected);
        return <article key={String(declared)}><h3>{declared ? "Ajouté au SEV" : "Reste à ajouter au SEV"}</h3><p>{selected.filter(r=>r.type === "taxi").length} courses taxi · {selected.filter(r=>r.type === "adapte").length} tournées</p><dl className="sev-ride-details"><div><dt>TPS</dt><dd>{money(totals.gst)}</dd></div><div><dt>TVQ</dt><dd>{money(totals.qst)}</dd></div><div className="sev-net"><dt>Total des taxes{totals.unknown ? " connu" : ""}</dt><dd>{money(totals.taxes)}</dd></div><div><dt>Redevances taxi hors taxes</dt><dd>{money(totals.levy)}</dd></div><div><dt>Sous-total hors taxes et redevances{totals.unknown ? " connu" : ""}</dt><dd>{money(totals.subtotal)}</dd></div></dl>{!!totals.unknown && <p role="status">{totals.unknown} capture(s) en attente de pourboire : leurs taxes et sous-totaux sont exclus de ce bilan provisoire.</p>}</article>;
      })}</div>
      <p className="sev-net-note">Les taxes sur la redevance sont déjà comprises dans le total des taxes. Une tournée représente un enregistrement, pas le nombre de passagers ou de courses qu’elle contient. Pour les tournées, aucune redevance n’est comptée par défaut : renseignez les courses assujetties dans leurs paramètres.</p>
    </> : <>
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
          <div><dt>Total avant frais</dt><dd>{money(ride.amount + ride.tip)}</dd></div>
          <div><dt>Montant après frais Téo</dt><dd>{money(ride.amount + ride.tip - (ride.serviceFee || 0))}</dd></div>
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
      <details className="sev-fiscal-options"><summary>Paramètres de taxes et redevance</summary><div className="sev-filters"><label>Taxes sur le montant saisi<select value={ride.sevTaxExempt ? "exempt" : "included"} onChange={e=>onFiscalChange(ride.id,{sevTaxExempt:e.target.value === "exempt"})}><option value="included">TPS et TVQ incluses</option><option value="exempt">Exonéré de TPS et TVQ</option></select></label><label>Nombre de courses avec redevance<input type="number" min="0" step="1" max="999" value={ride.sevLevyCount ?? (ride.type === "taxi" ? 1 : 0)} onChange={e=>{const count=Number(e.target.value); if(Number.isInteger(count) && count>=0 && count<=999) onFiscalChange(ride.id,{sevLevyCount:count});}} /></label></div><p>Redevance déjà comprise dans le montant saisi : 0,90 $ par course assujettie. Pour une tournée, renseignez le nombre réel de courses assujetties (0 si exemptées).</p></details>
      {ride.sevAdded && <DeclarationDetails ride={ride} money={money} />}
    </article>)}</div>}
    </>}
    <p className="sev-calculation-note">Calcul estimatif à partir des montants taxes comprises : TPS 5 % et TVQ 9,975 %, hors pourboire volontaire. Les frais Téo et perceptions ne diminuent pas automatiquement le prix de vente déclaré. Vérifiez les arrondis avec le reçu SEV. <a href="https://www.revenuquebec.ca/fr/entreprises/taxes/tpstvh-et-tvq/regles-de-base-relatives-a-lapplication-de-la-tpstvh-et-de-la-tvq/" target="_blank" rel="noreferrer">Taux Revenu Québec</a></p>
    </>}
  </section>;
}

function DeclarationDetails({ride,money}: {ride: Ride; money: (n:number)=>string}) {
  const value = sevBreakdown(ride);
  return <section className="sev-declaration"><h4>Détail après ajout au SEV</h4>{!value.known ? <p>Pourboire à confirmer avec la paie : les taxes et le sous-total seront calculés dès que le montant avant pourboire sera connu.</p> : <dl className="sev-ride-details">
    <div><dt>Sous-total avant taxes et redevance</dt><dd>{money(value.fareSubtotal)}</dd></div>
    <div><dt>Sous-total avant taxes, redevance incluse</dt><dd>{money(value.subtotal)}</dd></div>
    <div><dt>TPS {ride.sevTaxExempt ? "(exonéré)" : "5 %"}</dt><dd>{money(value.gst)}</dd></div>
    <div><dt>TVQ {ride.sevTaxExempt ? "(exonéré)" : "9,975 %"}</dt><dd>{money(value.qst)}</dd></div>
    <div><dt>Total des taxes</dt><dd>{money(value.taxes)}</dd></div>
    <div><dt>Redevance taxi hors taxes</dt><dd>{money(value.levy)}</dd></div>
    <div><dt>Taxes sur la redevance (déjà incluses)</dt><dd>{money(value.levyTaxes)}</dd></div>
    <div><dt>Redevance plus taxes (estimée séparément)</dt><dd>{money(value.levyTotal)}</dd></div>
    {ride.type === "adapte" && <div className="sev-net"><dt>Après frais Téo, hors taxes — simulation</dt><dd>{money(value.afterFeesSubtotal)}</dd></div>}
  </dl>}{ride.type === "adapte" && <p>Le sous-total déclaré est calculé sur le brut. La simulation après frais retire les mêmes taxes du montant après frais, avant perception STM ; elle ne remplace pas le montant du reçu SEV.</p>}</section>;
}
