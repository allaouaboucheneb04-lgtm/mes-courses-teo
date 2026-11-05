"use client";
import { useState } from "react";
import DateRangePicker, { DateRangeField } from "@/components/date-range-picker";
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
  const [rangeOpen, setRangeOpen] = useState(false);
  const lastStart = new Date(`${week.start}T12:00:00`); lastStart.setDate(lastStart.getDate() - 7);
  const lastEnd = new Date(`${week.end}T12:00:00`); lastEnd.setDate(lastEnd.getDate() - 7);
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const query = search.trim().toLowerCase();
  const amountQuery = query.replace(/[\s$\u00a0\u202f]/g, "").replace(",", ".");
  const rows = courses.filter(sevEligible).filter((ride) =>
    (type === "all" || ride.type === type) &&
    (!query ||
      `${ride.hob || ""} ${ride.teoId || ""} ${ride.taxiCategory || ""}`.toLowerCase().includes(query) ||
      (amountQuery.length > 0 && (ride.amount + ride.tip).toFixed(2).includes(amountQuery))) &&
    (period === "all" || (period === "week" && ride.date >= week.start && ride.date <= week.end) ||
      (period === "previous" && ride.date >= key(lastStart) && ride.date <= key(lastEnd)) ||
      (period === "month" && ride.date.startsWith(today.slice(0,7))) ||
      (period === "custom" && ride.date >= start && ride.date <= end))
  ).sort((a,b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const added = rows.filter((ride) => ride.sevAdded).length;
  const pending = rows.length - added;
  const grossTotal = rows.reduce((sum, ride) => sum + ride.amount + ride.tip, 0);
  const pendingGross = rows.filter((ride) => !ride.sevAdded).reduce((sum, ride) => sum + ride.amount + ride.tip, 0);
  const addedGross = grossTotal - pendingGross;
  const visible = rows.filter((ride) => status === "all" || (status === "added" ? ride.sevAdded : !ride.sevAdded));
  const money = (amount: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(amount);
  const feeRows = feePeriods(courses, expenses, feePeriod === "year", companyFee).filter(row => feeYear === "all" || row.period.startsWith(feeYear));
  const years = [...new Set([today.slice(0,4), ...courses.map(r=>r.date.slice(0,4)), ...expenses.map(e=>e.date.slice(0,4)), ...feePeriods(courses, expenses, true, companyFee).map(r=>r.period)])].sort().reverse();
  return <section className="sev-page">
    <header className="sev-hero">
      <div className="sev-hero-title">
        <div><span className="sev-kicker">SUIVI DES COURSES</span><h2>SEV</h2></div>
        <span className="sev-hero-mark" aria-hidden="true">✓</span>
      </div>
      <p>Suivez les courses déclarées et celles qui restent à ajouter. Cochez une course après l’avoir saisie au SEV.</p>
      <small>Suivi personnel : aucune transmission automatique au SEV.</small>
    </header>
    <nav className="sev-tabs" aria-label="Sous-pages SEV">{[["courses","Courses"],["taxes","Taxes et redevances"],["fees","Frais"]].map(([id,label])=><button key={id} type="button" aria-current={page === id ? "page" : undefined} onClick={()=>setPage(id)}>{label}</button>)}</nav>
    {page === "fees" ? <>
      <div className="sev-section-heading"><h3>Frais par période</h3><p>Frais Téo, aéroport, compagnie et dépenses taxi, qu’une course soit cochée ou non.</p></div>
      <div className="sev-filters"><label>Regrouper par<select value={feePeriod} onChange={e=>setFeePeriod(e.target.value)}><option value="month">Mois</option><option value="year">Année</option></select></label><label>Année<select value={feeYear} onChange={e=>setFeeYear(e.target.value)}><option value="all">Toutes les années</option>{years.map(year=><option key={year}>{year}</option>)}</select></label></div>
      <div className="sev-list-head sev-total-head"><b>Total des frais</b><strong>{money(feeRows.reduce((sum,row)=>sum+row.total,0))}</strong></div>
      <div className="sev-list sev-fees-list">{feeRows.map(row=><article key={row.period}><b>{row.period.length === 4 ? row.period : new Date(`${row.period}-15T12:00:00`).toLocaleDateString("fr-CA",{month:"long",year:"numeric"})}</b><strong>{money(row.total)}</strong><dl className="sev-ride-details"><div><dt>Frais Téo</dt><dd>{money(row.service)}</dd></div><div><dt>Redevances aéroport</dt><dd>{money(row.airport)}</dd></div><div><dt>Frais de compagnie</dt><dd>{money(row.company)}</dd></div><div><dt>Dépenses taxi</dt><dd>{money(row.expenses)}</dd></div></dl></article>)}</div>
      {!feeRows.length && <p className="sev-empty">Aucun frais enregistré pour cette période.</p>}
      <p className="sev-net-note">Les frais de compagnie sont comptés une fois par semaine avec des courses, au mardi de cette semaine. Les frais sont calculés selon les réglages actuels. Les perceptions STM et la redevance taxi comprise dans le prix client ne sont pas des frais ajoutés ici. Ne saisissez pas une seconde fois ces frais automatiques dans Dépenses.</p>
    </> : <>
    <div className="sev-stats sev-status-cards" aria-label="État des courses de la période">
      <button type="button" className={`sev-stat sev-stat-pending ${status === "pending" && page === "courses" ? "is-active" : ""}`}
        aria-pressed={status === "pending" && page === "courses"}
        onClick={() => { setPage("courses"); setStatus("pending"); }}>
        <span>À ajouter</span><b>{pending}</b><small>{money(pendingGross)}</small>
      </button>
      <button type="button" className={`sev-stat sev-stat-added ${status === "added" && page === "courses" ? "is-active" : ""}`}
        aria-pressed={status === "added" && page === "courses"}
        onClick={() => { setPage("courses"); setStatus("added"); }}>
        <span>Ajoutées</span><b>{added}</b><small>{money(addedGross)}</small>
      </button>
      <button type="button" className={`sev-stat sev-stat-all ${status === "all" && page === "courses" ? "is-active" : ""}`}
        aria-pressed={status === "all" && page === "courses"}
        onClick={() => { setPage("courses"); setStatus("all"); }}>
        <span>Toutes</span><b>{rows.length}</b><small>{money(grossTotal)}</small>
      </button>
    </div>
    <div className="sev-search-row">
      <label className="sev-search-label">
        <span>Rechercher une course</span>
        <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="HOB, ID Téo ou montant…" />
      </label>
    </div>
    <details className="sev-filter-accordion">
      <summary>Filtres <span>{period === "week" ? "Cette semaine" : period === "previous" ? "Semaine précédente" : period === "month" ? "Ce mois-ci" : period === "custom" ? "Dates personnalisées" : "Toutes les dates"} · {type === "all" ? "Tous types" : type === "taxi" ? "Taxi" : "Adapté"}</span></summary>
      <div className="sev-filters">
        <label>Période
          <select value={period} onChange={e => {
            const next = e.target.value;
            setPeriod(next);
            if (next === "custom") setRangeOpen(true);
          }}>
            <option value="week">Cette semaine</option>
            <option value="previous">Semaine précédente</option>
            <option value="month">Ce mois-ci</option>
            <option value="custom">Dates personnalisées</option>
            <option value="all">Toutes les dates</option>
          </select>
        </label>
        {page === "courses" && <label>Statut
          <select value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="all">Tous les statuts</option>
            <option value="pending">À ajouter au SEV</option>
            <option value="added">Ajoutées au SEV</option>
          </select>
        </label>}
        <label>Type de course
          <select value={type} onChange={e=>setType(e.target.value)}>
            <option value="all">Tous les types</option>
            <option value="taxi">Taxi / compte</option>
            <option value="adapte">Transport adapté</option>
          </select>
        </label>
        {period === "custom" && (
          <DateRangeField start={start} end={end} onClick={() => setRangeOpen(true)} />
        )}
        <button type="button" className="sev-reset-filters" onClick={()=>{
          setPeriod("week"); setType("all"); setStatus("all"); setSearch("");
        }}>Réinitialiser les filtres</button>
      </div>
    </details>
    <DateRangePicker open={rangeOpen} start={start} end={end}
      onClose={() => setRangeOpen(false)}
      onApply={(from, to) => {
        setStart(from);
        setEnd(to);
        setRangeOpen(false);
      }} />
    {period === "week" && <p>Du {week.start} au {week.end} · semaine du mardi au lundi</p>}
    {period === "custom" && start > end && <p role="alert">La date de fin doit être après la date de début.</p>}
    {page === "taxes" ? <>
      <div className="sev-section-heading"><h3>Taxes et redevances</h3><p>Estimations calculées selon les courses filtrées.</p></div>
      <div className="sev-tax-panels">{[true,false].map(declared=>{
        const selected = rows.filter(ride=>!!ride.sevAdded === declared);
        const totals = sevTotals(selected);
        return <article key={String(declared)} className={`sev-tax-summary ${declared ? "sev-tax-added" : "sev-tax-pending"}`}><h3>{declared ? "Ajouté au SEV" : "Reste à ajouter au SEV"}</h3><p>{selected.filter(r=>r.type === "taxi").length} courses taxi · {selected.filter(r=>r.type === "adapte").length} tournées</p><dl className="sev-ride-details"><div><dt>TPS</dt><dd>{money(totals.gst)}</dd></div><div><dt>TVQ</dt><dd>{money(totals.qst)}</dd></div><div className="sev-net"><dt>Total des taxes{totals.unknown ? " connu" : ""}</dt><dd>{money(totals.taxes)}</dd></div><div><dt>Redevances taxi hors taxes</dt><dd>{money(totals.levy)}</dd></div><div><dt>Sous-total hors taxes et redevances{totals.unknown ? " connu" : ""}</dt><dd>{money(totals.subtotal)}</dd></div></dl>{!!totals.unknown && <p role="status">{totals.unknown} capture(s) en attente de pourboire : leurs taxes et sous-totaux sont exclus de ce bilan provisoire.</p>}</article>;
      })}</div>
      <p className="sev-net-note">Les taxes sur la redevance sont déjà comprises dans le total des taxes. Une tournée représente un enregistrement, pas le nombre de passagers ou de courses qu’elle contient. Pour les tournées, aucune redevance n’est comptée par défaut : renseignez les courses assujetties dans leurs paramètres.</p>
    </> : <>
    <div className="sev-list-head sev-total-head">
      <div><b>{visible.length} course{visible.length !== 1 ? "s" : ""} affichée{visible.length !== 1 ? "s" : ""}</b><small>Montant brut de la sélection</small></div>
      <strong>{money(visible.reduce((sum, ride) => sum + ride.amount + ride.tip, 0))}</strong>
    </div>
    {!visible.length
      ? <div className="sev-empty">
          <b>Aucune course trouvée</b>
          <p>Changez la période ou les filtres pour retrouver vos courses.</p>
          <button type="button" onClick={() => { setPeriod("all"); setStatus("all"); setType("all"); setSearch(""); }}>Afficher toutes les courses</button>
        </div>
      : <div className="sev-list sev-ride-list">
          {visible.map((ride) => (
            <SevRideCard key={ride.id} ride={ride} money={money}
              onChange={onChange} onEdit={onEdit} onFiscalChange={onFiscalChange} />
          ))}
        </div>}
    </>}
    <p className="sev-calculation-note">Calcul estimatif à partir des montants taxes comprises : TPS 5 % et TVQ 9,975 %, hors pourboire volontaire. Les frais Téo et perceptions ne diminuent pas automatiquement le prix de vente déclaré. Vérifiez les arrondis avec le reçu SEV. <a href="https://www.revenuquebec.ca/fr/entreprises/taxes/tpstvh-et-tvq/regles-de-base-relatives-a-lapplication-de-la-tpstvh-et-de-la-tvq/" target="_blank" rel="noreferrer">Taux Revenu Québec</a></p>
    </>}
  </section>;
}


function SevRideCard({
  ride, money, onChange, onEdit, onFiscalChange,
}: {
  ride: Ride;
  money: (amount: number) => string;
  onChange: (id: string, added: boolean) => void;
  onEdit: (id: string) => void;
  onFiscalChange: (id: string, patch: {sevTaxExempt?: boolean; sevLevyCount?: number}) => void;
}) {
  const gross = ride.amount + ride.tip;
  const fee = ride.serviceFee || 0;
  const perception = ride.perception || 0;
  const net = gross - fee - perception;
  const kind = ride.type === "adapte" ? "adapte" : ride.taxiCategory === "aeroport" ? "airport" : "centre-ville";
  return (
    <article className={`sev-ride-card ride-highlight ride-highlight-${kind}`}>
      <div className="sev-ride-top">
        <span className="sev-ride-icon" aria-hidden="true">{ride.type === "adapte" ? "♿" : ride.taxiCategory === "aeroport" ? "✈" : "🚕"}</span>
        <div className="sev-ride-identity">
          <b>{ride.type === "adapte" ? ride.hob || "Tournée adaptée" : ride.taxiCategory === "aeroport" ? "Course aéroport" : "Course centre-ville"}</b>
          <small>{new Date(`${ride.date}T12:00:00`).toLocaleDateString("fr-CA", {weekday: "short", day: "numeric", month: "short", year: "numeric"})}</small>
          <span className={`sev-ride-status ${ride.sevAdded ? "is-done" : "is-pending"}`}>{ride.sevAdded ? "✓ Ajoutée au SEV" : "• À ajouter au SEV"}</span>
        </div>
        <strong className="sev-ride-amount">{money(gross)}</strong>
      </div>
      <div className={`sev-ride-quick ${ride.type === "taxi" ? "sev-ride-quick-taxi" : ""}`}>
        <div><span>Brut</span><b>{money(gross)}</b></div>
        {ride.type === "taxi" && (
          <>
            <div><span>Avant pourboire</span><b>{ride.tipPending ? "À confirmer" : money(ride.amount)}</b></div>
            <div><span>Pourboire</span><b>{ride.tipPending ? "À récupérer" : money(ride.tip)}</b></div>
          </>
        )}
        <div><span>Frais Téo{perception > 0 ? " + STM" : ""}</span><b>− {money(fee + perception)}</b></div>
        <div className="sev-quick-net"><span>Net avant frais fixes</span><b>{money(net)}</b></div>
      </div>
      <div className="sev-ride-actions sev-quick-actions">
        <SevCheckbox ride={ride} onChange={onChange} />
        <button type="button" onClick={() => onEdit(ride.id)}>Modifier</button>
      </div>
      <details className="sev-ride-expanded">
        <summary>Voir les détails, taxes et vérifications</summary>
        <dl className="sev-ride-details">
          <div><dt>Paiement</dt><dd>{ride.type === "adapte" ? "Transport adapté" : "Téo · Carte / Compte"}</dd></div>
          <div><dt>{ride.type === "adapte" ? "Numéro HOB" : "Identifiant Téo"}</dt><dd>{(ride.type === "adapte" ? ride.hob : ride.teoId) || "Non renseigné"}</dd></div>
          {ride.type === "taxi" ? <>
            <div><dt>Avant pourboire</dt><dd>{ride.tipPending ? "À confirmer avec la paie" : money(ride.amount)}</dd></div>
            <div><dt>Pourboire</dt><dd>{ride.tipPending ? "À récupérer depuis la fiche Téo" : money(ride.tip)}</dd></div>
            <div><dt>Total avec pourboire</dt><dd>{money(gross)}</dd></div>
          </> : <>
            <div><dt>Début</dt><dd>{ride.start || "Non renseigné"}</dd></div>
            <div><dt>Fin</dt><dd>{ride.end || "Non renseignée"}{ride.start && ride.end && ride.end <= ride.start ? " (lendemain)" : ""}</dd></div>
            <div><dt>Durée réelle</dt><dd>{ride.duration === undefined ? "Non renseignée" : `${ride.duration.toLocaleString("fr-CA", {maximumFractionDigits: 2})} h`}</dd></div>
            <div><dt>Heures payées</dt><dd>{ride.billedDuration === undefined ? "Non renseignées" : `${ride.billedDuration.toLocaleString("fr-CA", {maximumFractionDigits: 2})} h`}</dd></div>
            <div><dt>Total avant frais</dt><dd>{money(gross)}</dd></div>
            <div><dt>Montant après frais Téo</dt><dd>{money(gross - fee)}</dd></div>
            <div><dt>Perception STM</dt><dd>− {money(perception)}</dd></div>
          </>}
          <div><dt>Frais Téo</dt><dd>− {money(fee)}</dd></div>
          <div className="sev-net"><dt>Net après frais et perceptions</dt><dd>{money(net)}</dd></div>
          {!!ride.airportFee && <div><dt>Redevance aéroport (déduite au résumé)</dt><dd>{money(ride.airportFee)}</dd></div>}
          <div><dt>Vérification de paie</dt><dd>{ride.verified ? "✓ Vérifiée" : "Non vérifiée"}</dd></div>
          {ride.verifiedBillId && <div><dt>Fiche Téo</dt><dd>{ride.verifiedBillId}</dd></div>}
          {ride.verifiedAt && Number.isFinite(Date.parse(ride.verifiedAt)) && <div><dt>Vérifiée le</dt><dd>{new Date(ride.verifiedAt).toLocaleDateString("fr-CA")}</dd></div>}
        </dl>
        <p className="sev-net-note">Net hors frais de compagnie, dépenses taxi et redevance aéroport.</p>
        <details className="sev-fiscal-options">
          <summary>Paramètres de taxes et redevance</summary>
          <div className="sev-filters">
            <label>Taxes sur le montant saisi
              <select value={ride.sevTaxExempt ? "exempt" : "included"} onChange={e=>onFiscalChange(ride.id,{sevTaxExempt:e.target.value === "exempt"})}>
                <option value="included">TPS et TVQ incluses</option>
                <option value="exempt">Exonéré de TPS et TVQ</option>
              </select>
            </label>
            <label>Nombre de courses avec redevance
              <input type="number" min="0" step="1" max="999" value={ride.sevLevyCount ?? (ride.type === "taxi" ? 1 : 0)}
                onChange={e=>{const count=Number(e.target.value); if(Number.isInteger(count) && count>=0 && count<=999) onFiscalChange(ride.id,{sevLevyCount:count});}} />
            </label>
          </div>
          <p>Redevance déjà comprise dans le montant saisi : 0,90 $ par course assujettie. Pour une tournée, renseignez le nombre réel de courses assujetties (0 si exemptées).</p>
        </details>
        {ride.sevAdded && <DeclarationDetails ride={ride} money={money} />}
      </details>
    </article>
  );
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
