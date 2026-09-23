"use client";
import {useState} from "react";
import {groupStatistics, rideStatistics, type StatisticsRide} from "@/lib/statistics";
import {isCardPayment} from "@/lib/teo-payment";
const money=(n:number)=>n.toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
const payment=(r:StatisticsRide)=>r.type === "adapte" ? "Transport adapté" : isCardPayment(r.payment) ? "Téo / carte / compte" : r.payment;
const dayLabel=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString("fr-CA",{day:"numeric",month:"short",year:"numeric"});
export default function StatisticsPage({courses,today,week}:{courses:StatisticsRide[];today:string;week:{start:string;end:string}}){
  const [period,setPeriod]=useState("week");
  const [type,setType]=useState("all");
  const [mode,setMode]=useState("all");
  const [start,setStart]=useState(week.start);
  const [end,setEnd]=useState(week.end);
  const [group,setGroup]=useState("day");
  const shift=(date:string,n:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const bounds=period === "week" ? [week.start,week.end] : period === "previous" ? [shift(week.start,-7),shift(week.end,-7)] : period === "month" ? [`${today.slice(0,7)}-01`,`${today.slice(0,7)}-31`] : period === "year" ? [`${today.slice(0,4)}-01-01`,`${today.slice(0,4)}-12-31`] : period === "custom" ? [start,end] : ["","9999"];
  const rows=courses.filter(r=>r.date>=bounds[0] && r.date<=bounds[1] && (type === "all" || (type === "adapte" ? r.type === "adapte" : r.type === "taxi" && (type === "taxi" || (type === "airport" ? r.taxiCategory === "aeroport" : r.taxiCategory !== "aeroport")))) && (mode === "all" || payment(r) === mode));
  const stats=rideStatistics(rows);
  const periods=groupStatistics(rows,r=>r.date.slice(0,group === "month" ? 7 : 10)).sort((a,b)=>a.label.localeCompare(b.label));
  const max=Math.max(1,...periods.map(r=>r.gross));
  const distribution=groupStatistics(rows,payment).sort((a,b)=>b.gross-a.gross);
  const best=groupStatistics(rows,r=>r.date).sort((a,b)=>b.gross-a.gross)[0];
  return <section className="statistics-page">
    <header className="statistics-header"><span>VOTRE ACTIVITÉ EN CHIFFRES</span><h2>Statistiques</h2><p>Suivez vos courses, vos tournées et vos revenus sur la période de votre choix.</p></header>
    <div className="sev-filters statistics-filters">
      <label>Période<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="week">Cette semaine</option><option value="previous">Semaine précédente</option><option value="month">Ce mois-ci</option><option value="year">Cette année</option><option value="custom">Dates personnalisées</option><option value="all">Toutes les dates</option></select></label>
      <label>Type de courses<select value={type} onChange={e=>setType(e.target.value)}><option value="all">Toutes les courses</option><option value="taxi">Taxi — toutes catégories</option><option value="city">Taxi centre-ville</option><option value="airport">Taxi aéroport</option><option value="adapte">Transport adapté</option></select></label>
      <label>Paiement<select value={mode} onChange={e=>setMode(e.target.value)}><option value="all">Tous les paiements</option>{[...new Set(courses.map(payment))].sort().map(p=><option key={p}>{p}</option>)}</select></label>
      <label>Évolution par<select value={group} onChange={e=>setGroup(e.target.value)}><option value="day">Jour</option><option value="month">Mois</option></select></label>
      {period === "custom" && <><label>Du<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Au<input type="date" min={start} value={end} onChange={e=>setEnd(e.target.value)}/></label></>}
    </div>
    {(period === "week" || period === "previous") && <p className="statistics-note">Du {dayLabel(bounds[0])} au {dayLabel(bounds[1])} · mardi au lundi</p>}
    {period === "custom" && (!start || !end || start>end) ? <p role="alert">Choisissez une période valide : la fin doit suivre le début.</p> : <>
    <div className="statistics-kpis">{[["Courses et tournées",String(stats.count)],["Revenu brut",money(stats.gross)],["Après frais Téo et perceptions",money(stats.net)],["Pourboires connus",money(stats.tips)],["Moyenne par course / tournée",money(stats.average)],["Moyenne par jour travaillé",money(stats.dailyAverage)]].map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <p className="statistics-note">Le brut inclut les pourboires et les taxes. Le montant après frais exclut les frais de compagnie, les redevances aéroport et les dépenses taxi. Frais calculés selon vos réglages actuels.</p>
    {!!stats.unknownTips && <p className="statistics-tip" role="status">{stats.unknownTips} capture(s) avec pourboire à confirmer : leur total est inclus dans le revenu brut, mais leur pourboire n’est pas encore compté dans « Pourboires connus ».</p>}
    {!rows.length ? <p className="sev-empty">Aucune course pour cette sélection. Modifiez les filtres ou ajoutez une course.</p> : <>
    <section className="statistics-card"><h3>Évolution du revenu brut</h3><p>Montants par {group === "month" ? "mois" : "jour"} avec activité · {periods.length} période(s)</p><div className="statistics-chart">{periods.map(p=><div className="statistics-bar-row" key={p.label}><div><span>{group === "month" ? new Date(`${p.label}-15T12:00:00`).toLocaleDateString("fr-CA",{month:"long",year:"numeric"}) : dayLabel(p.label)}</span><b>{money(p.gross)}</b></div><div className="statistics-track"><div style={{width:`${Math.max(0,p.gross)/max*100}%`}}/></div><small>{p.count} course(s) / tournée(s)</small></div>)}</div></section>
    <div className="statistics-columns"><section className="statistics-card"><h3>Répartition par paiement</h3><div className="statistics-table-wrap"><table><thead><tr><th>Paiement</th><th>Nombre</th><th>Brut</th></tr></thead><tbody>{distribution.map(p=><tr key={p.label}><th scope="row">{p.label}</th><td>{p.count}</td><td>{money(p.gross)}</td></tr>)}</tbody></table></div></section>
    <section className="statistics-card"><h3>Détails de l’activité</h3><dl className="statistics-details">{[["Courses taxi",rows.filter(r=>r.type === "taxi").length],["Tournées adaptées",rows.filter(r=>r.type === "adapte").length],["Jours travaillés",stats.days],["Heures réelles — adapté",`${stats.hours.toLocaleString("fr-CA",{maximumFractionDigits:2})} h`],["Frais Téo",money(stats.fees)],["Perceptions STM",money(stats.perceptions)],["Courses / tournées vérifiées",`${stats.verified} / ${stats.count}`],["Meilleur jour (brut)",best ? `${dayLabel(best.label)} · ${money(best.gross)}` : "—"]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section></div>
    </>}
    </>}
  </section>;
}
