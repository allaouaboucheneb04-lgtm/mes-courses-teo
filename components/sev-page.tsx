"use client";
import { useState } from "react";
import DateRangePicker, { DateRangeField } from "@/components/date-range-picker";
import { isCardPayment } from "@/lib/teo-payment";
import { feePeriods, sevBreakdown, sevTotals } from "@/lib/sev";
import { summarizePayroll } from "@/lib/payroll-summary";
import { filterSevRides, filterSevStatuses, matchesSevCategory, summarizeSevCategories, type SevCategory, type SevPeriod, type SevDeclarationStatus, type SevPayrollStatus } from "@/lib/sev-filtering";

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
  const [period, setPeriod] = useState<SevPeriod>("week");
  const [status, setStatus] = useState<SevDeclarationStatus>("all");
  const [payStatus, setPayStatus] = useState<SevPayrollStatus>("all");
  const [type, setType] = useState<SevCategory>("all");
  const [search, setSearch] = useState("");
  const [start, setStart] = useState(week.start);
  const [end, setEnd] = useState(week.end);
  const [rangeOpen, setRangeOpen] = useState(false);
  const resetFilters = () => {
    setPeriod("week"); setType("all"); setStatus("all");
    setPayStatus("all"); setSearch("");
    setStart(week.start); setEnd(week.end);
  };
  const categoryBaseRows = filterSevRides(courses.filter(sevEligible), {
    category: "all", period, week, today, start, end, search,
  });
  const categoryTotals = summarizeSevCategories(categoryBaseRows);
  const rows = type === "all"
    ? categoryBaseRows
    : categoryBaseRows.filter(ride => matchesSevCategory(ride, type));
  const categoryLabel = {
    all: "Toutes les catégories", taxi: "Toutes les courses taxi",
    aeroport: "Aéroport", "centre-ville": "Centre-ville", adapte: "Transport adapté",
  }[type];
  const declarationLabel = {
    all: "Tous statuts SEV", pending: "À ajouter au SEV", added: "Ajoutées au SEV",
  }[status];
  const payrollLabel = {
    all: "Toutes les paies", verified: "Paie vérifiée", unverified: "Paie non vérifiée",
  }[payStatus];
  const activeAdvancedCount = Number(type !== "all") +
    (page === "courses" ? Number(status !== "all") + Number(payStatus !== "all") : 0);
  const hasNonDefaultFilters =
    period !== "week" || type !== "all" || status !== "all" ||
    payStatus !== "all" || !!search.trim();
  const added = rows.filter((ride) => ride.sevAdded).length;
  const pending = rows.length - added;
  const grossTotal = rows.reduce((sum, ride) => sum + ride.amount + ride.tip, 0);
  const pendingGross = rows.filter((ride) => !ride.sevAdded).reduce((sum, ride) => sum + ride.amount + ride.tip, 0);
  const addedGross = grossTotal - pendingGross;
  // Paie Téo et déclaration SEV sont deux statuts indépendants.
  // Le résumé porte sur toutes les courses éligibles de la période, avant
  // l'application des filtres de statut SEV et de vérification de paie.
  const payroll = summarizePayroll(rows);
  const visible = filterSevStatuses(rows, status, payStatus);
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
    <div className="sev-quick-period" role="group" aria-label="Période des courses">
      {([
        ["week", "Cette semaine"], ["previous", "Semaine passée"],
        ["month", "Ce mois"], ["all", "Toutes"],
      ] as const).map(([value, label]) => (
        <button key={value} type="button" className={period === value ? "is-active" : ""}
          aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>
      ))}
      <button type="button" className={period === "custom" ? "is-active" : ""}
        aria-pressed={period === "custom"} onClick={() => { setPeriod("custom"); setRangeOpen(true); }}>
        Dates…
      </button>
    </div>
    <div className="sev-search-row">
      <label className="sev-search-label">
        <span>Rechercher une course</span>
        <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="HOB, ID Téo, BILL, date ou montant…" />
      </label>
      {search && <button type="button" className="sev-search-clear"
        aria-label="Effacer la recherche" onClick={() => setSearch("")}>×</button>}
      <button type="button" className="sev-filters-clear"
        onClick={resetFilters} disabled={!hasNonDefaultFilters}>Effacer les filtres</button>
    </div>
    <details className="sev-filter-accordion">
      <summary>Filtres avancés{activeAdvancedCount ? " (" + activeAdvancedCount + ")" : ""}<span>{categoryLabel}{page === "courses" ? " · " + declarationLabel + " · " + payrollLabel : ""}</span></summary>
      <div className="sev-filters">
        <label>Période
          <select value={period} onChange={e => {
            const next = e.target.value;
            setPeriod(next as SevPeriod);
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
          <select value={status} onChange={e=>setStatus(e.target.value as SevDeclarationStatus)}>
            <option value="all">Tous les statuts</option>
            <option value="pending">À ajouter au SEV</option>
            <option value="added">Ajoutées au SEV</option>
          </select>
        </label>}
        {page === "courses" && <label>Vérification paie Téo
          <select value={payStatus} onChange={e => setPayStatus(e.target.value as SevPayrollStatus)}>
            <option value="all">Toutes les courses</option>
            <option value="verified">Vérifiées</option>
            <option value="unverified">Non vérifiées</option>
          </select>
        </label>}
        <label>Catégorie de course
          <select value={type} onChange={e=>setType(e.target.value as SevCategory)}>
            <option value="all">Toutes les catégories</option>
            <option value="taxi">Toutes les courses taxi</option>
            <option value="aeroport">Aéroport</option>
            <option value="centre-ville">Centre-ville</option>
            <option value="adapte">Transport adapté</option>
          </select>
        </label>
        {period === "custom" && (
          <DateRangeField start={start} end={end} onClick={() => setRangeOpen(true)} />
        )}
        <button type="button" className="sev-reset-filters" onClick={resetFilters} disabled={!hasNonDefaultFilters}>Réinitialiser les filtres</button>
      </div>
    </details>
    <DateRangePicker open={rangeOpen} start={start} end={end}
      onClose={() => setRangeOpen(false)}
      onApply={(from, to) => {
        setStart(from);
        setEnd(to);
        setRangeOpen(false);
      }} />
    {page === "courses" && (type !== "all" || status !== "all" || payStatus !== "all" || search.trim() || period === "custom") && (
      <div className="sev-active-chips" aria-label="Filtres actifs">
        {type !== "all" && <button type="button" onClick={() => setType("all")}>{categoryLabel} ×</button>}
        {status !== "all" && <button type="button" onClick={() => setStatus("all")}>{declarationLabel} ×</button>}
        {payStatus !== "all" && <button type="button" onClick={() => setPayStatus("all")}>{payrollLabel} ×</button>}
        {!!search.trim() && <button type="button" onClick={() => setSearch("")}>Recherche : {search.trim()} ×</button>}
        {period === "custom" && <button type="button" onClick={() => setPeriod("week")}>Dates personnalisées ×</button>}
      </div>
    )}
    {page === "courses" && <p className="sev-filter-count" role="status">
      {visible.length} course{visible.length === 1 ? "" : "s"} correspond{visible.length === 1 ? "" : "ent"} aux filtres
    </p>}
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
    {page === "courses" && (
      <section className="sev-payroll-section" aria-label="Vérification avec les fiches Téo">
        <div className="sev-payroll-heading">
          <h3>Vérification paie Téo</h3>
          <small>Selon les dates, le type et la recherche sélectionnés · indépendant du SEV</small>
        </div>
        <div className="sev-payroll-status-cards">
          <button type="button" className={`sev-payroll-card is-verified ${payStatus === "verified" ? "is-active" : ""}`}
            aria-pressed={payStatus === "verified"}
            onClick={() => setPayStatus(current => current === "verified" ? "all" : "verified")}>
            <span>✓ Vérifiées</span><b>{payroll.verified.length}</b><small>{money(payroll.verifiedTotal)}</small>
          </button>
          <button type="button" className={`sev-payroll-card is-unverified ${payStatus === "unverified" ? "is-active" : ""}`}
            aria-pressed={payStatus === "unverified"}
            onClick={() => setPayStatus(current => current === "unverified" ? "all" : "unverified")}>
            <span>• Non vérifiées</span><b>{payroll.unverified.length}</b><small>{money(payroll.unverifiedTotal)}</small>
          </button>
        </div>
        <p className="sev-payroll-caption">« Vérifiée » signifie comparée à une fiche de paie Téo, et non ajoutée au SEV ni reçue en banque.</p>
      </section>
    )}
    {page === "courses" && (
      <section className="sev-category-summary" aria-label="Montants des courses par catégorie">
        <div className="sev-payroll-heading">
          <h3>Montants par catégorie</h3>
          <small>Brut avec pourboire · selon la période et la recherche</small>
        </div>
        <div className="sev-category-cards">
          {categoryTotals.map(category => (
            <button type="button" key={category.id}
              className={`sev-category-card sev-category-${category.id} ${type === category.id ? "is-active" : ""}`}
              aria-pressed={type === category.id}
              aria-label={`${category.label} : ${category.count} courses, ${money(category.amount)}. ${type === category.id ? "Retirer le filtre" : "Filtrer cette catégorie"}`}
              onClick={() => setType(current => current === category.id ? "all" : category.id)}>
              <span>{category.label}</span>
              <b>{category.count}</b>
              <small>{money(category.amount)}</small>
            </button>
          ))}
        </div>
      </section>
    )}
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
          <button type="button" onClick={() => { resetFilters(); setPeriod("all"); }}>Afficher toutes les courses</button>
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
          <div className="sev-ride-statuses">
            <span className={`sev-ride-status ${ride.sevAdded ? "is-done" : "is-pending"}`}>{ride.sevAdded ? "✓ Ajoutée au SEV" : "• À ajouter au SEV"}</span>
            <span className={`sev-ride-payroll-status ${ride.verified === true ? "is-verified" : "is-unverified"}`}>
              {ride.verified === true ? "✓ Paie vérifiée" : "• Paie non vérifiée"}
            </span>
          </div>
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
