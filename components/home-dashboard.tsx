"use client";

import { useMemo, useState } from "react";
import { homePeriodBounds, summarizeHomePeriod, type HomePeriod, type HomePeriodRide, type HomePeriodExpense } from "@/lib/home-period";
import { ArrowRight, CarFront, ChartNoAxesCombined, ClipboardList, Plus, ReceiptText, Target, Wallet } from "lucide-react";

const money = (value: number) => new Intl.NumberFormat("fr-CA", {
  style: "currency", currency: "CAD"
}).format(value);

export type HomeDay = {
  date: string;
  gross: number;
  tips: number;
  fees: number;
  net: number;
  count: number;
};

export type HomeRide = {
  id: string;
  type: "taxi" | "adapte";
  taxiCategory?: "aeroport" | "centre-ville";
  hob?: string;
  amount: number;
  tip: number;
  payment: string;
};

type Props = {
  currentDate: string;
  days: HomeDay[];
  previousDays: HomeDay[];
  dayRides: HomeRide[];
  periodRides: HomePeriodRide[];
  periodExpenses: HomePeriodExpense[];
  periodSettings: { airportFee:number; companyFee:number; dailyGoals:ReadonlyArray<number>; dailyGoalEnabled:boolean };
  todayGoal: number;
  goalsEnabled: boolean;
  weekGross: number;
  weekFees: number;
  weekNet: number;
  onAdd: () => void;
  onExpenses: () => void;
  onHistory: () => void;
  onStatistics: () => void;
  onSettings: () => void;
};

const shortDay = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("fr-CA", { timeZone: "UTC", weekday: "short" }).replace(".", "");

const longDate = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("fr-CA", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long"
  });

const shortPeriod = (days: HomeDay[]) => days.length
  ? `${new Date(days[0].date + "T12:00:00Z").toLocaleDateString("fr-CA", { timeZone: "UTC", day: "numeric", month: "short" })} – ${new Date(days[days.length - 1].date + "T12:00:00Z").toLocaleDateString("fr-CA", { timeZone: "UTC", day: "numeric", month: "short" })}`
  : "—";

const axisMoney = (value: number) =>
  new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 0 }).format(value) + " $";

const niceTickStep = (interval: number) => {
  const base = 10 ** Math.floor(Math.log10(Math.max(0.01, interval)));
  const scaled = interval / base;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * base;
};

export default function HomeDashboard({
  currentDate, days, previousDays, dayRides, periodRides, periodExpenses, periodSettings, todayGoal, goalsEnabled, weekGross, weekFees,
  weekNet, onAdd, onExpenses, onHistory, onStatistics, onSettings
}: Props) {
  const today = days.find(day => day.date === currentDate) ?? {
    date: currentDate, gross: 0, tips: 0, fees: 0, net: 0, count: 0
  };
  const [inspectedDate, setInspectedDate] = useState<string | null>(null);
  const selected = days.find(day => day.date === inspectedDate) ?? today;
  const [period, setPeriod] = useState<HomePeriod>("day");
  const [customStart, setCustomStart] = useState(days[0]?.date ?? currentDate);
  const [customEnd, setCustomEnd] = useState(currentDate);
  const bounds = homePeriodBounds(period, currentDate, customStart, customEnd);
  const periodSummary = useMemo(() => summarizeHomePeriod(
    periodRides, periodExpenses, bounds, currentDate, periodSettings
  ), [periodRides, periodExpenses, bounds?.start, bounds?.end, currentDate, periodSettings]);
  const percentage = periodSummary.valid && periodSummary.goal > 0
    ? Math.min(100, Math.max(0, Math.round((periodSummary.net / periodSummary.goal) * 100))) : 0;
  const periodLabel = ({
    day: "Aujourd’hui", week: "Cette semaine", month: "Ce mois",
    year: "Cette année", custom: "Personnalisé",
  } as const)[period];
  const periodSubtitle = bounds
    ? bounds.start === bounds.end ? longDate(bounds.start)
      : `${new Date(bounds.start + "T12:00:00Z").toLocaleDateString("fr-CA", {timeZone:"UTC",day:"numeric",month:"short",year:"numeric"})} – ${new Date(bounds.end + "T12:00:00Z").toLocaleDateString("fr-CA", {timeZone:"UTC",day:"numeric",month:"short",year:"numeric"})}`
    : "Choisissez des dates valides";

  // Every point is one day's real accounting net, never a cumulative balance.
  // Only completed/current days appear on this week's line.
  const elapsedDays = days.filter(day => day.date <= currentDate);
  const values = [0, ...elapsedDays.map(day => day.net), ...previousDays.map(day => day.net)];
  const actualMin = Math.min(...values);
  const actualMax = Math.max(...values);
  const spread = Math.max(1, actualMax - actualMin);
  const tickStep = Math.max(1, niceTickStep(spread / 4));
  const axisMin = Math.floor((actualMin - spread * 0.07) / tickStep) * tickStep;
  const axisMax = Math.ceil((actualMax + spread * 0.07) / tickStep) * tickStep;
  const bottom = 180;
  const top = 17;
  const chartX = (index: number) => 52 + index * 50.5;
  const yFor = (value: number) =>
    bottom - ((value - axisMin) / Math.max(tickStep, axisMax - axisMin)) * (bottom - top);
  const ticks = Array.from({ length: Math.round((axisMax - axisMin) / tickStep) + 1 },
    (_, index) => Math.round((axisMin + index * tickStep) * 100) / 100);
  const chartPoint = (day: HomeDay, index: number) => ({
    x: chartX(index), y: yFor(day.net), date: day.date
  });
  const currentPoints = days.flatMap((day, index) =>
    day.date <= currentDate ? [chartPoint(day, index)] : []
  );
  const previousPoints = previousDays.map(chartPoint);
  const linePath = (points: ReturnType<typeof chartPoint>[]) => points.map((point, index) =>
    (index === 0 ? "M" : "L") + point.x + " " + point.y.toFixed(2)
  ).join(" ");
  const currentPath = linePath(currentPoints);
  const previousPath = linePath(previousPoints);
  const selectedIndex = days.findIndex(day => day.date === selected.date);
  const previousSelected = previousDays[selectedIndex];
  const hasCurrentSelected = selected.date <= currentDate;
  const selectedDelta = previousSelected && hasCurrentSelected
    ? Math.round((selected.net - previousSelected.net) * 100) / 100 : null;
  const previousWeekNet = Math.round(previousDays.reduce((sum, day) => sum + day.net, 0) * 100) / 100;

  return (
    <section className="home-dashboard" aria-label="Tableau de bord">
      <header className="home-intro">
        <div>
          <span className="home-kicker">TABLEAU DE BORD</span>
          <h2>{periodLabel}</h2>
          <p>{periodSubtitle}</p>
        </div>
        <label className="home-period-control">
          <span>Période</span>
          <select aria-label="Filtrer le bilan par période" value={period}
            onChange={event => setPeriod(event.target.value as HomePeriod)}>
            <option value="day">Aujourd’hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="year">Cette année</option>
            <option value="custom">Personnalisé</option>
          </select>
        </label>
      </header>
      {period === "custom" && (
        <div className="home-custom-dates" aria-label="Dates de la période personnalisée">
          <label>Du <input type="date" value={customStart} max={currentDate}
            onChange={event => setCustomStart(event.target.value)}/></label>
          <label>Au <input type="date" value={customEnd} max={currentDate}
            onChange={event => setCustomEnd(event.target.value)}/></label>
          {!bounds && <p role="alert">La date de début doit précéder la date de fin.</p>}
        </div>
      )}

      <article className="home-today-card">
        <div className="home-today-main">
          <div className="home-today-income">
            <span className="home-overline">NET · {periodLabel.toLocaleUpperCase("fr-CA")}</span>
            <strong className="home-big-number">{periodSummary.valid ? money(periodSummary.net) : "—"}</strong>
            {goalsEnabled && periodSummary.valid && periodSummary.goal > 0 ? (
              <p>Objectif {money(periodSummary.goal)} <span className="home-target-percent">· {percentage} %</span></p>
            ) : !goalsEnabled ? (
              <button className="home-goal-link" type="button" onClick={onSettings}>
                <Target size={15} /> Définir un objectif
              </button>
            ) : (
              <p className="home-goal-empty">Aucun objectif défini pour cette période.</p>
            )}
          </div>
          <div className="home-progress-ring" role="progressbar"
            aria-label="Progression de l’objectif quotidien"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="40" stroke="#e0ecec" strokeWidth="9" fill="none" />
              <circle cx="50" cy="50" r="40" stroke="#00777d" strokeWidth="9" fill="none"
                strokeLinecap="round" transform="rotate(-90 50 50)"
                strokeDasharray={`${percentage * 2.5133} 251.33`} />
            </svg>
            <b>{goalsEnabled && periodSummary.valid && periodSummary.goal > 0 ? `${percentage}%` : "—"}</b>
          </div>
        </div>
        <div className="home-today-stats">
          <div><span>BRUT</span><strong>{periodSummary.valid ? money(periodSummary.gross) : "—"}</strong></div>
          <div><span>POURBOIRES</span><strong>{periodSummary.valid ? money(periodSummary.tips) : "—"}</strong></div>
          <div><span>FRAIS ET DÉP.</span><strong>{periodSummary.valid ? money(periodSummary.fees) : "—"}</strong></div>
        </div>
      </article>

      <div className="home-shortcuts">
        <button type="button" className="home-action-primary" onClick={onAdd}>
          <Plus size={23} strokeWidth={2.8} /><span>Nouvelle course</span>
        </button>
        <button type="button" className="home-action-secondary" onClick={onExpenses}>
          <ReceiptText size={21} /><span>Dépense</span>
        </button>
      </div>

      <article className="home-week-card">
        <header className="home-card-top">
          <div><h3>Évolution quotidienne</h3><small>Revenu net par jour · Mardi au lundi</small></div>
          <div className="home-week-header-total">
            <small>Net de la semaine</small>
            <strong>{money(weekNet)}</strong>
          </div>
        </header>

        <div className="home-compare-legend" aria-label="Légende du graphique">
          <span><i className="home-line-current" aria-hidden="true" /> Cette semaine <small>{shortPeriod(days)}</small></span>
          <span><i className="home-line-previous" aria-hidden="true" /> Semaine passée <small>{shortPeriod(previousDays)}</small></span>
        </div>

        <div className="home-chart" role="img"
          aria-label="Deux courbes de revenus nets journaliers : turquoise cette semaine, gris pointillé semaine passée. Chaque journée peut monter ou descendre. La ligne horizontale zéro sépare les gains et pertes.">
          <svg viewBox="0 0 380 202" preserveAspectRatio="none" aria-hidden="true">
            {ticks.map(tick => (
              <g key={tick}>
                <line x1="52" x2="356" y1={yFor(tick)} y2={yFor(tick)}
                  stroke={tick === 0 ? "#a2b8bb" : "#e6eeef"}
                  strokeDasharray={tick === 0 ? "4 4" : undefined}
                  strokeWidth={tick === 0 ? 1.6 : 1}/>
                <text x="45" y={yFor(tick) + 3.5} fill={tick === 0 ? "#365f64" : "#86999f"}
                  fontSize="10" fontWeight={tick === 0 ? 800 : 500} textAnchor="end">
                  {axisMoney(tick)}
                </text>
              </g>
            ))}
            {selectedIndex >= 0 && (
              <line x1={chartX(selectedIndex)} x2={chartX(selectedIndex)} y1={top}
                y2={bottom} stroke="#ccdadc" strokeWidth="1.5" strokeDasharray="3 5"/>
            )}
            {previousPoints.length > 0 && (
              <>
                <path d={previousPath} fill="none" stroke="#8e9ea8" strokeWidth="3.2"
                  strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" />
                {previousPoints.map((point, index) => (
                  <circle key={point.date} cx={point.x} cy={point.y}
                    r={index === selectedIndex ? 5.1 : 3.3}
                    fill="#fff" stroke="#8e9ea8" strokeWidth="2.5"/>
                ))}
              </>
            )}
            {currentPoints.length > 0 && (
              <>
                <path d={currentPath} fill="none" stroke="#00777d" strokeWidth="4"
                  strokeLinecap="round" strokeLinejoin="round"/>
                {currentPoints.map(point => (
                  <circle key={point.date} cx={point.x} cy={point.y}
                    r={point.date === selected.date ? 6.1 : 4}
                    fill={point.date === selected.date ? "#00777d" : "#fff"}
                    stroke="#00777d" strokeWidth="2.9"/>
                ))}
              </>
            )}
          </svg>
        </div>

        <div className="home-chart-days" aria-label="Choisir une journée à comparer">
          {days.map(day => (
            <button key={day.date} type="button"
              aria-pressed={day.date === selected.date}
              onClick={() => setInspectedDate(day.date)}>
              {shortDay(day.date)}
            </button>
          ))}
        </div>
        <div className="home-selected-day-label">{longDate(selected.date)}</div>
        <div className="home-chart-result-grid" aria-live="polite">
          <div className="home-chart-result current">
            <span><i aria-hidden="true" /> Cette semaine</span>
            <b>{hasCurrentSelected ? money(selected.net) : "À venir"}</b>
            <small>{selected.count} course{selected.count !== 1 ? "s" : ""}</small>
          </div>
          <div className="home-chart-result previous">
            <span><i aria-hidden="true" /> Semaine passée</span>
            <b>{previousSelected ? money(previousSelected.net) : "—"}</b>
            <small>{previousSelected ? longDate(previousSelected.date) : "—"}</small>
          </div>
        </div>
        {selectedDelta !== null && (
          <div className="home-chart-difference">
            <span>Écart par rapport au même jour</span>
            <strong className={selectedDelta >= 0 ? "positive" : "negative"}>
              {selectedDelta > 0 ? "+" : ""}{money(selectedDelta)}
            </strong>
          </div>
        )}
        <div className="home-previous-week-total">
          <span>Total semaine passée</span><strong>{money(previousWeekNet)}</strong>
        </div>
        <div className="home-week-stats">
          <div><span>BRUT</span><strong>{money(weekGross)}</strong></div>
          <div><span>FRAIS ET DÉPENSES</span><strong>{money(weekFees)}</strong></div>
        </div>
        <button className="home-inline-link" type="button" onClick={onStatistics}>
          <ChartNoAxesCombined size={16} /> Voir les statistiques <ArrowRight size={15} />
        </button>
      </article>

      <article className="home-rides-card">
        <header className="home-card-top">
          <div><h3>Courses du jour</h3><small>{today.count} course{today.count !== 1 ? "s" : ""} enregistrée{today.count !== 1 ? "s" : ""}</small></div>
          <strong>{money(today.gross)}</strong>
        </header>
        {dayRides.length > 0 ? (
          <div className="home-ride-list">
            {dayRides.slice(0, 4).map(ride => (
              <div className="home-ride-item" key={ride.id}>
                <span className={`home-ride-symbol ${ride.type === "adapte" ? "adapted" : ride.taxiCategory === "aeroport" ? "airport" : "city"}`}>
                  {ride.type === "adapte" ? <ClipboardList size={19} /> : <CarFront size={19} />}
                </span>
                <div>
                  <b>{ride.type === "adapte" ? ride.hob || "Transport adapté" : ride.taxiCategory === "aeroport" ? "Aéroport" : "Centre-ville"}</b>
                  <small>{ride.payment}</small>
                </div>
                <strong>{money(ride.amount + ride.tip)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="home-rides-empty">
            <Wallet size={21} />
            <p>Aucune course enregistrée aujourd’hui.</p>
          </div>
        )}
        <button className="home-inline-link" type="button" onClick={onHistory}>
          Voir toutes les courses <ArrowRight size={16} />
        </button>
      </article>
    </section>
  );
}
