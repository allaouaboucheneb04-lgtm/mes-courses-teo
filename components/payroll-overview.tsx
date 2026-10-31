"use client";
import { useMemo, useState } from "react";
import { summarizePayroll, trackingRange, courseAge, isLongUnverified, bankReceiptStatus, expectedBankAmount, validBankReceipt, type TrackingPeriod, type BankReceipt, type PayrollBankStatement, type PayrollSummaryCourse } from "../lib/payroll-summary";

type OverviewCourse = PayrollSummaryCourse & {
  type: "taxi" | "adapte";
  payment: string;
  hob?: string;
  teoId?: string;
  couponNumber?: string;
  taxiCategory?: "centre-ville" | "aeroport";
  verifiedBillId?: string;
  tipPending?: boolean;
};
const money = (value: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(value);
const dateLabel = (value: string) => value.split("-").reverse().join("/");
const receiptLabels = { unconfirmed: "Réception bancaire non confirmée", partial: "Versement partiel confirmé", received: "Argent reçu confirmé" };

function BankConfirmation({ statement, today, onSave }: { statement: PayrollBankStatement; today: string; onSave: (receipt: BankReceipt | null) => void }) {
  const [date, setDate] = useState(statement.bankReceipt?.date || today);
  const [amount, setAmount] = useState(statement.bankReceipt?.amount.toFixed(2).replace(".", ",") || "");
  const [error, setError] = useState("");
  const status = bankReceiptStatus(statement);
  return (
    <details className="bank-confirmation">
      <summary><b>{statement.id}</b><span>{receiptLabels[status]}</span></summary>
      <p>Montant indiqué sur la fiche : <b>{money(expectedBankAmount(statement))}</b>. Confirmez uniquement ce que vous avez reçu en banque pour cette fiche.</p>
      {statement.bankReceipt && <p role="status">Vous avez confirmé {money(statement.bankReceipt.amount)} reçus le {dateLabel(statement.bankReceipt.date)}.</p>}
      <form onSubmit={event => {
        event.preventDefault();
        const receipt = { date, amount: Math.round(Number(amount.replace(/\s/g, "").replace(",", ".")) * 100) / 100 };
        if (!validBankReceipt(receipt, today)) { setError("Entrez un montant supérieur à zéro et une date de réception valide, au plus tard aujourd’hui."); return; }
        setError(""); onSave(receipt);
      }}>
        <div className="payroll-filter-grid">
          <label>Date reçue<input type="date" required max={today} value={date} onChange={event => setDate(event.target.value)} /></label>
          <label>Total reçu pour cette fiche ($)<input type="text" inputMode="decimal" required placeholder="0,00" value={amount} onChange={event => setAmount(event.target.value)} /></label>
        </div>
        <p className="payroll-overview-note">Pour plusieurs versements, inscrivez leur total cumulé et la date du dernier. Un montant inférieur à celui de la fiche reste signalé comme partiel.</p>
        {error && <p className="error-box" role="alert">{error}</p>}
        <div className="payroll-course-actions">
          <button type="submit">{statement.bankReceipt ? "Mettre à jour la réception" : "Confirmer l’argent reçu"}</button>
          {statement.bankReceipt && <button type="button" onClick={() => { onSave(null); setAmount(""); setDate(today); setError(""); }}>Annuler la confirmation</button>}
        </div>
      </form>
    </details>
  );
}

export default function PayrollOverview({ courses, statements, today, onEdit, onOpenStatement, onBankReceipt }: {
  courses: OverviewCourse[];
  statements: PayrollBankStatement[];
  today: string;
  onEdit: (id: string) => void;
  onOpenStatement: (id: string) => void;
  onBankReceipt: (id: string, receipt: BankReceipt | null) => void;
}) {
  const [period, setPeriod] = useState<TrackingPeriod>("all");
  const [start, setStart] = useState(today.slice(0, 7) + "-01");
  const [end, setEnd] = useState(today);
  const [status, setStatus] = useState<"unverified" | "verified" | "all" | "received" | "waiting">("unverified");
  const [lateDays, setLateDays] = useState(7);
  const [onlyLate, setOnlyLate] = useState(false);
  const [limit, setLimit] = useState(20);
  const range = trackingRange(period, today, start, end);
  const filtered = useMemo(() => range.valid ? courses.filter(course => (!range.start || course.date >= range.start) && (!range.end || course.date <= range.end)) : [], [courses, range.start, range.end, range.valid]);
  const summary = useMemo(() => summarizePayroll(filtered), [filtered]);
  const billsById = new Map(statements.map(statement => [statement.id, statement]));
  const getBankStatus = (course: OverviewCourse) => bankReceiptStatus(course.verified ? billsById.get(course.verifiedBillId || "") : undefined);
  const late = filtered.filter(course => isLongUnverified(course, today, lateDays));
  const items = [...filtered].filter(course => {
    if (onlyLate) return isLongUnverified(course, today, lateDays);
    if (status === "unverified") return !course.verified;
    if (status === "verified") return course.verified;
    if (status === "received") return course.verified && getBankStatus(course) === "received";
    if (status === "waiting") return course.verified && getBankStatus(course) !== "received";
    return true;
  }).sort((a, b) => onlyLate ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const relevantIds = new Set(summary.verified.map(course => course.verifiedBillId).filter(Boolean));
  const relevantBills = statements.filter(statement => relevantIds.has(statement.id));
  const bankTotal = relevantBills.reduce((sum, statement) => sum + (bankReceiptStatus(statement) !== "unconfirmed" ? Math.round(statement.bankReceipt!.amount * 100) : 0), 0) / 100;
  return (
    <section className="payroll-overview" aria-labelledby="payroll-overview-title">
      <h3 id="payroll-overview-title">Suivi de mes courses</h3>
      <p>Courses Téo / carte, coupons déposés et transport adapté.</p>
      <div className="payroll-filter-grid">
        <label>Période des courses<select value={period} onChange={event => { setPeriod(event.target.value as TrackingPeriod); setLimit(20); }}>
          <option value="all">Toutes les dates</option><option value="week">Cette semaine</option><option value="last-week">Semaine passée</option><option value="month">Ce mois</option><option value="custom">Dates personnalisées</option>
        </select></label>
        <label>État à afficher<select value={onlyLate ? "late" : status} onChange={event => {
          setLimit(20); setOnlyLate(event.target.value === "late");
          if (event.target.value !== "late") setStatus(event.target.value as typeof status);
        }}><option value="unverified">Non vérifiées</option><option value="verified">Vérifiées</option><option value="all">Toutes les courses</option><option value="late">Anciennes non vérifiées</option><option value="waiting">Vérifiées · réception non confirmée ou partielle</option><option value="received">Vérifiées · argent reçu confirmé</option></select></label>
      </div>
      {period === "custom" && <div className="payroll-filter-grid">
        <label>Du<input type="date" value={start} onChange={event => { setStart(event.target.value); setLimit(20); }} /></label>
        <label>Au<input type="date" value={end} onChange={event => { setEnd(event.target.value); setLimit(20); }} /></label>
      </div>}
      {!range.valid ? <p className="error-box" role="alert">Choisissez deux dates valides, avec la date de fin après ou égale à la date de début.</p> : <p className="payroll-overview-note">{range.start ? `Du ${dateLabel(range.start)} au ${dateLabel(range.end)}` : "Toutes les dates"} · Semaine du mardi au lundi.</p>}
      {range.valid && <>
        <div className="payroll-overview-totals">
          <div><span>Brut non vérifié</span><strong>{money(summary.unverifiedTotal)}</strong><small>{summary.unverified.length} course(s)</small></div>
          <div><span>Brut vérifié</span><strong>{money(summary.verifiedTotal)}</strong><small>{summary.verified.length} course(s)</small></div>
        </div>
        <div className="payroll-overview-totals payroll-net-totals">
          <div><span>Net non vérifié</span><strong>{money(summary.unverifiedNet)}</strong></div>
          <div><span>Net vérifié</span><strong>{money(summary.verifiedNet)}</strong></div>
        </div>
        <p className="payroll-overview-note">Net estimé avec vos frais actuels : brut moins frais de service, perceptions et redevances aéroport. Hors frais fixes de compagnie et dépenses. Ce net n’est pas une confirmation du dépôt bancaire.</p>
        <p className="payroll-overview-note">Totaux de la période, tous états confondus. Pourboires inclus, avant retenues. Une course vérifiée est comparée à une fiche Téo ; sa réception bancaire reste à confirmer.</p>
        <details className="payroll-aging">
          <summary>{late.length} course(s) non vérifiée(s) depuis au moins {lateDays} jours</summary>
          <label>Signaler après<select value={lateDays} onChange={event => { setLateDays(Number(event.target.value)); setLimit(20); }}><option value={7}>7 jours</option><option value={14}>14 jours</option><option value={30}>30 jours</option></select></label>
          <p>Repérage selon la date de course, sans présumer d’un retard de paiement. Limité à la période sélectionnée.</p>
          <button type="button" onClick={() => { setOnlyLate(true); setLimit(20); }}>Afficher ces courses</button>
        </details>
        <details className="payroll-bank-section">
          <summary>Versements bancaires · {money(bankTotal)} confirmés</summary>
          <p>Fiches liées aux courses vérifiées de la période. Chaque fiche est comptée une seule fois, pour son montant reçu complet, même si elle couvre d’autres dates. Ce total bancaire est distinct du montant brut des courses.</p>
          {relevantBills.length === 0 && <p>Aucune fiche liée aux courses vérifiées de cette période.</p>}
          {relevantBills.map(statement => <BankConfirmation key={`${statement.id}:${statement.bankReceipt?.date || ""}:${statement.bankReceipt?.amount || ""}`} statement={statement} today={today} onSave={receipt => onBankReceipt(statement.id, receipt)} />)}
        </details>
        <h4>{onlyLate ? "Anciennes courses non vérifiées" : "Courses"} · {items.length}</h4>
        {items.length === 0 ? <p role="status">Aucune course ne correspond à ces filtres.</p> : <ul className="payroll-overview-list">
          {items.slice(0, limit).map(course => {
            const statement = course.verified ? billsById.get(course.verifiedBillId || "") : undefined;
            return <li key={course.id}>
              <div className="payroll-course-info">
                <b>{dateLabel(course.date)} · {course.type === "adapte" ? course.hob || "Transport adapté" : course.payment === "Coupon" ? `Coupon ${course.couponNumber || ""}` : course.teoId ? `Téo ${course.teoId}` : "Course Téo / carte"}</b>
                <small>{course.type === "adapte" ? "Transport adapté" : course.taxiCategory === "aeroport" ? "Aéroport" : "Centre-ville"} · {course.verified ? "Vérifiée" : "Non vérifiée"}</small>
                {isLongUnverified(course, today, lateDays) && <small className="payroll-age-badge">Non vérifiée depuis {courseAge(course.date, today)} jours</small>}
                {course.verified && <small>{receiptLabels[getBankStatus(course)]}</small>}
                {course.verified && !statement && <small>Aucune fiche liée disponible.</small>}
                {course.tipPending && <small>Répartition du pourboire à confirmer</small>}
              </div>
              <strong>{money(course.amount + course.tip)}</strong>
              <div className="payroll-course-actions">
                <button type="button" onClick={() => onEdit(course.id)} aria-label={`Voir la course du ${dateLabel(course.date)} de ${money(course.amount + course.tip)}`}>Voir la course</button>
                {statement && <button type="button" onClick={() => onOpenStatement(statement.id)}>Fiche {statement.id}</button>}
              </div>
            </li>;
          })}
        </ul>}
        {items.length > limit && <button type="button" className="payroll-show-more" onClick={() => setLimit(value => value + 20)}>Afficher plus ({items.length - limit} restantes)</button>}
      </>}
    </section>
  );
}
