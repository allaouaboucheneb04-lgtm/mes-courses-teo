"use client";

import { useState } from "react";
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
  dayRides: HomeRide[];
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

export default function HomeDashboard({
  currentDate, days, dayRides, todayGoal, goalsEnabled, weekGross, weekFees,
  weekNet, onAdd, onExpenses, onHistory, onStatistics, onSettings
}: Props) {
  const today = days.find(day => day.date === currentDate) ?? {
    date: currentDate, gross: 0, tips: 0, fees: 0, net: 0, count: 0
  };
  const [inspectedDate, setInspectedDate] = useState<string | null>(null);
  const selected = days.find(day => day.date === inspectedDate) ?? today;
  const percentage = goalsEnabled && todayGoal > 0
    ? Math.min(100, Math.max(0, Math.round((today.net / todayGoal) * 100))) : 0;

  const values = days.map(day => day.net);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const width = max - min;
  const yFor = (value: number) => width === 0 ? 74 : 116 - ((value - min) / width) * 88;
  const points = days.map((day, index) => ({
    x: 18 + index * 51,
    y: yFor(day.net),
    date: day.date,
  }));
  const path = points.map((point, index) =>
    (index === 0 ? "M" : "L") + point.x + " " + point.y.toFixed(2)
  ).join(" ");
  const area = points.length ? path + " L324 125 L18 125 Z" : "";

  return (
    <section className="home-dashboard" aria-label="Tableau de bord">
      <header className="home-intro">
        <div>
          <span className="home-kicker">TABLEAU DE BORD</span>
          <h2>Aujourd’hui</h2>
          <p>{longDate(currentDate)}</p>
        </div>
        <span className="home-live-indicator">Mes courses Téo</span>
      </header>

      <article className="home-today-card">
        <div className="home-today-main">
          <div className="home-today-income">
            <span className="home-overline">NET AUJOURD’HUI</span>
            <strong className="home-big-number">{money(today.net)}</strong>
            {goalsEnabled && todayGoal > 0 ? (
              <p>Objectif {money(todayGoal)} <span className="home-target-percent">· {percentage} %</span></p>
            ) : (
              <button className="home-goal-link" type="button" onClick={onSettings}>
                <Target size={15} /> Définir un objectif
              </button>
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
            <b>{goalsEnabled && todayGoal > 0 ? `${percentage}%` : "—"}</b>
          </div>
        </div>
        <div className="home-today-stats">
          <div><span>BRUT</span><strong>{money(today.gross)}</strong></div>
          <div><span>POURBOIRES</span><strong>{money(today.tips)}</strong></div>
          <div><span>FRAIS</span><strong>{money(today.fees)}</strong></div>
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
          <div><h3>Cette semaine</h3><small>Mardi au lundi</small></div>
          <strong>{money(weekNet)}</strong>
        </header>
        <div className="home-chart" role="img"
          aria-label="Évolution du revenu net pour les sept jours, du mardi au lundi">
          <svg viewBox="0 0 342 146" preserveAspectRatio="none" aria-hidden="true">
            <path d="M18 36 H324 M18 74 H324 M18 112 H324"
              fill="none" stroke="#e5eeee" strokeWidth="1.2" />
            {points.length > 0 && (
              <>
                <path d={area} fill="#00777d" fillOpacity=".10" />
                <path d={path} fill="none" stroke="#00777d" strokeWidth="3.2"
                  strokeLinecap="round" strokeLinejoin="round" />
                {points.map(point => (
                  <circle key={point.date} cx={point.x} cy={point.y} r={point.date === selected.date ? 5.3 : 3.8}
                    fill={point.date === selected.date ? "#00777d" : "#fff"}
                    stroke="#00777d" strokeWidth="2.5" />
                ))}
              </>
            )}
          </svg>
        </div>
        <div className="home-chart-days" aria-label="Consulter un jour du graphique">
          {days.map(day => (
            <button key={day.date} type="button" aria-pressed={day.date === selected.date}
              onClick={() => setInspectedDate(day.date)}>
              {shortDay(day.date)}
            </button>
          ))}
        </div>
        <div className="home-chart-selection" aria-live="polite">
          <span>{longDate(selected.date)}</span><b>{money(selected.net)}</b>
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
