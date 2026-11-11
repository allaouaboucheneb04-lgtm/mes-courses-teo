"use client";
import {useState} from "react";
import DateRangePicker from "@/components/date-range-picker";
import {comparisonTotals,periodDates,previousAnchor,periodGoal,percentageChange,type ComparisonRide} from "@/lib/comparison";
import {statisticsPeriodDates,statisticsGraphGroups,type StatisticsPeriod} from "@/lib/statistics-period";
import {airportLevyAccountingDate,isAirportLevyRide} from "@/lib/airport-levy";

const money = (n:number) => n.toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
const formatDate = (d:string) => new Date(d+"T12:00:00").toLocaleDateString("fr-CA",{day:"numeric",month:"short",year:"numeric"});
const label = (d:string) => new Date(d+"T12:00:00").toLocaleDateString("fr-CA",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
const range = (dates:string[]) => dates.length ? dates.length===1 ? label(dates[0]) : label(dates[0])+" → "+label(dates.at(-1)!) : "—";
const shortRange = (dates:string[]) => dates.length ? dates.length===1 ? formatDate(dates[0]) : formatDate(dates[0])+" – "+formatDate(dates.at(-1)!) : "Aucune course";
type Metric = "net"|"gross"|"count"|"tips";
type Category = "all"|"taxi"|"aeroport"|"centre-ville"|"adapte";
const metricLabels:Record<Metric,string> = {net:"Revenu net",gross:"Revenu brut",count:"Courses / tournées",tips:"Pourboires connus"};

export default function StatisticsPage({courses,today,dailyGoals,goalsEnabled,onSettings}:{
  courses:ComparisonRide[];today:string;dailyGoals:number[];goalsEnabled:boolean;onSettings:()=>void
}){
 const [view,setView] = useState<"comparison"|"goals">("comparison");
 const [period,setPeriod] = useState<StatisticsPeriod>("week");
 const [start,setStart] = useState(periodDates(today,"week")[0]||today);
 const [end,setEnd] = useState(periodDates(today,"week").at(-1)||today);
 const [rangeOpen,setRangeOpen] = useState(false);
 const [metric,setMetric] = useState<Metric>("net");
 const [type,setType] = useState<Category>("all");
 const [elapsed,setElapsed] = useState(true);

 const filtered = courses.filter(ride =>
  type==="all" ||
  (type==="taxi" && ride.type==="taxi") ||
  (type==="adapte" && ride.type==="adapte") ||
  (type==="aeroport" && ride.type==="taxi" && ride.taxiCategory==="aeroport") ||
  (type==="centre-ville" && ride.type==="taxi" && ride.taxiCategory!=="aeroport")
 );
 // Include fee-only Tuesdays in the all-time calendar, even if no ride
 // was made that Tuesday. Monday airport fees post on the next Tuesday.
 const activityDates = filtered.flatMap(ride => isAirportLevyRide(ride)
   ? [ride.date,airportLevyAccountingDate(ride.date)] : [ride.date]);
 const selection = statisticsPeriodDates(period,today,start,end,activityDates);
 const currentDates=selection.current,previousDates=selection.previous;
 const running=period!=="all"&&currentDates.includes(today);
 const limit=elapsed&&running?currentDates.indexOf(today)+1:currentDates.length;
 const shown=currentDates.slice(0,limit);
 const oldShown=elapsed&&running?previousDates.slice(0,limit):previousDates;
 const current=comparisonTotals(filtered,shown);
 const previous=comparisonTotals(filtered,oldShown);
 const format=(n:number)=>metric==="count"?n.toLocaleString("fr-CA"):money(n);
 const diff=current[metric]-previous[metric],percent=percentageChange(current[metric],previous[metric]);
 const groups=statisticsGraphGroups(shown,oldShown,period==="all");
 const pairs=groups.map(group=>({
   label:group.label,
   a:group.now.length?comparisonTotals(filtered,group.now)[metric]:null,
   b:group.old.length?comparisonTotals(filtered,group.old)[metric]:null,
   first:group.now[0]||group.old[0]||"",
   last:group.now.at(-1)||group.old.at(-1)||"",
 }));
 const maximum=Math.max(1,...pairs.flatMap(item=>[item.a||0,item.b||0]));
 const todayWeek=periodDates(today,"week"),todayMonth=periodDates(today,"month");
 const lastWeek=periodDates(previousAnchor(today,"week"),"week"),lastMonth=periodDates(previousAnchor(today,"month"),"month");
 const weekNet=comparisonTotals(courses,todayWeek.filter(d=>d<=today)).net,lastWeekNet=comparisonTotals(courses,lastWeek).net;
 const goals:{title:string;days:string[]}[]=[{title:"Cette semaine",days:todayWeek},{title:"Semaine passée",days:lastWeek},{title:"Ce mois-ci",days:todayMonth},{title:"Mois passé",days:lastMonth}];
 const referenceText=period==="week"?"semaine précédente":period==="previous"?"semaine encore précédente":period==="month"?"mois précédent":period==="day"?"même jour de la semaine passée":"période précédente de même durée";
 const selectedLabel=period==="all"?"Toutes les dates enregistrées":shortRange(currentDates);
 const chartTitle=period==="all"?"Activité par mois":"Évolution de l’activité";
 return <section className="statistics-page">
  <header className="statistics-header"><span>VOTRE ACTIVITÉ EN UN COUP D’ŒIL</span><h2>Statistiques</h2><p>Revenus, courses et évolution, avec des périodes faciles à comparer.</p></header>
  <div className="statistics-view-switch" role="group" aria-label="Vue des statistiques">
   <button type="button" aria-pressed={view==="comparison"} onClick={()=>setView("comparison")}>Résultats</button>
   <button type="button" aria-pressed={view==="goals"} onClick={()=>setView("goals")}>Objectifs</button>
  </div>
  {view==="comparison" && <>
   <section className="statistics-period-card" aria-label="Filtrer les statistiques par date">
    <div className="statistics-period-heading"><strong>Période</strong><small>{selectedLabel}</small></div>
    <div className="statistics-period-row">
     <label className="statistics-period-select">
      <span className="statistics-sr-only">Choisir une période</span>
      <select aria-label="Choisir une période" value={period} onChange={event=>{
       const next=event.target.value as StatisticsPeriod;
       if(next==="custom")setRangeOpen(true);else setPeriod(next);
      }}>
       <option value="day">Aujourd’hui</option>
       <option value="week">Cette semaine</option>
       <option value="previous">Semaine passée</option>
       <option value="month">Ce mois</option>
       <option value="all">Toutes les dates</option>
       <option value="custom">Dates personnalisées</option>
      </select>
     </label>
     <button className="statistics-calendar-button" type="button" onClick={()=>setRangeOpen(true)}
      aria-label="Choisir les dates dans le calendrier"><span aria-hidden="true">▦</span> Calendrier</button>
    </div>
   </section>
   <DateRangePicker open={rangeOpen} start={start} end={end}
    onClose={()=>setRangeOpen(false)} onApply={(from,to)=>{
     setStart(from);setEnd(to);setPeriod("custom");setRangeOpen(false);
    }}/>
   <div className="statistics-simple-filters" aria-label="Personnaliser les statistiques">
    <label>Indicateur
     <select aria-label="Indicateur statistique" value={metric} onChange={event=>setMetric(event.target.value as Metric)}>
      <option value="net">Revenu net estimé</option><option value="gross">Revenu brut</option>
      <option value="count">Courses / tournées</option><option value="tips">Pourboires connus</option>
     </select>
    </label>
    <label>Activité
     <select aria-label="Type d’activité" value={type} onChange={event=>setType(event.target.value as Category)}>
      <option value="all">Toutes</option><option value="taxi">Taxi</option>
      <option value="aeroport">Aéroport</option><option value="centre-ville">Centre-ville</option>
      <option value="adapte">Transport adapté</option>
     </select>
    </label>
   </div>
   {running && period!=="day" && <label className="statistics-elapsed">
    <input type="checkbox" checked={elapsed} onChange={event=>setElapsed(event.target.checked)}/>
    Comparer uniquement jusqu’à aujourd’hui
   </label>}
   {!selection.valid?<p className="statistics-validation" role="alert">Choisis des dates valides (maximum 10 ans) dans le calendrier.</p>:<>
    <section className="statistics-overview" aria-label="Chiffres de la période">
     <article className="statistics-overview-main"><span>Revenu net estimé</span><strong>{money(current.net)}</strong><small>Après frais Téo, perceptions et redevances</small></article>
     <article><span>Revenu brut</span><strong>{money(current.gross)}</strong><small>Taxes comprises</small></article>
     <article><span>Courses / tournées</span><strong>{current.count.toLocaleString("fr-CA")}</strong><small>{current.days} jour{current.days===1?"":"s"} avec activité</small></article>
     <article><span>Pourboires connus</span><strong>{money(current.tips)}</strong><small>{current.unknownTips?"Certains pourboires restent inconnus":"Pourboires renseignés"}</small></article>
    </section>
    <div className="statistics-comparison-head"><h3>Comparaison</h3><small>{selection.comparable?"Par rapport à la "+referenceText:"Vue globale de l’activité"}</small></div>
    <div className={"comparison-summary"+(selection.comparable?"":" only-current")}>
     <article><span>Période choisie</span><small>{range(shown)}</small><strong>{format(current[metric])}</strong><small>{metricLabels[metric]}</small></article>
     {selection.comparable && <article><span>Période de référence</span><small>{range(oldShown)}</small><strong>{format(previous[metric])}</strong><small>{previous.count} courses / tournées</small></article>}
    </div>
    {selection.comparable && <div className={"comparison-gap "+(diff>=0?"positive":"negative")}>
     <b>{diff>=0?"+":"−"}{format(Math.abs(diff))}</b>
     <span>{percent===null?"Référence à zéro : variation en pourcentage non calculable":(percent>=0?"+":"")+percent.toLocaleString("fr-CA",{maximumFractionDigits:1})+" % par rapport à la référence"}</span>
    </div>}
    {running && <p className="statistics-note">La journée en cours peut être incomplète. Les valeurs proviennent des courses enregistrées.</p>}
    {!!(current.unknownTips+previous.unknownTips) && <p className="statistics-tip">Des pourboires sont inconnus dans certaines captures. Les pourboires connus peuvent être incomplets.</p>}
    <section className="statistics-card statistics-graph-card">
     <div className="statistics-graph-head"><h3>{chartTitle}</h3><small>{metricLabels[metric]}</small></div>
     {selection.comparable && <p className="comparison-legend"><span>● Période choisie</span><span>● Référence</span></p>}
     {period==="all" && groups.length>0 && <p className="statistics-note">Les chiffres ci-dessus couvrent toutes les dates. Le graphique montre les 12 derniers mois avec activité.</p>}
     {pairs.length===0?<p className="statistics-empty-chart">Aucune course pour cette période.</p>:
      <div className="comparison-graph">{pairs.map((pair,index)=>(
       <div className="comparison-pair" key={index}>
        <b>{period==="all"?pair.label:
          pair.first===pair.last?new Date(pair.first+"T12:00:00").toLocaleDateString("fr-CA",{weekday:"short",day:"numeric",month:"short"}):
          formatDate(pair.first)+" – "+formatDate(pair.last)}</b>
        {[{value:pair.a},{value:pair.b}].slice(0,selection.comparable?2:1).map((bar,j)=>(
         <div className={"comparison-bar bar-"+j} key={j}>
          <div><small>{j===0?"Période choisie":"Référence"}</small><strong>{bar.value===null?"—":format(bar.value)}</strong></div>
          <div className="comparison-track"><i style={{width:String(Math.max(0,bar.value||0)/maximum*100)+"%"}}/></div>
         </div>
        ))}
       </div>
      ))}</div>}
    </section>
    {!current.count && !previous.count && <p className="sev-empty">Aucune course enregistrée dans ces périodes.</p>}
   </>}
  </>}
  {view==="goals" && <section className="statistics-card statistics-goal-card"><h3>Mes objectifs</h3><p>Sur toutes les courses, indépendamment des filtres. Les objectifs de semaine et de mois additionnent tes objectifs quotidiens des Réglages.</p>
  {!goalsEnabled?<><p>Active tes objectifs quotidiens pour voir ce qu’il reste à gagner.</p><button type="button" className="comparison-settings" onClick={onSettings}>Définir mes objectifs</button></>:<><div className="comparison-goals">{goals.map(({title,days})=>{
   const goal=periodGoal(days,dailyGoals),earned=comparisonTotals(courses,days.filter(d=>d<=today)).net,remaining=Math.max(0,goal-earned),progress=goal>0?Math.min(100,Math.max(0,earned/goal*100)):0;
   return <article key={title}><h4>{title}</h4><small>{range(days)}</small><strong>{goal>0?remaining>0?`${money(remaining)} ${days.at(-1)!<today?"manquaient":"restants"}`:`Objectif atteint · +${money(earned-goal)}`:"Aucun objectif défini"}</strong><p>{money(earned)} réalisés / {money(goal)} visés</p><div className="comparison-track" role="progressbar" aria-label={`Objectif ${title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{width:`${progress}%`}}/></div></article>;
  })}</div><button type="button" className="comparison-settings" onClick={onSettings}>Modifier mes objectifs</button><p className="statistics-note">Les périodes passées utilisent tes objectifs actuels ; aucun ancien objectif n’a été conservé.</p></>}
  <div className="comparison-match"><b>Pour égaler le revenu de toute la semaine passée</b><strong>{money(Math.max(0,lastWeekNet-weekNet))} restants</strong><span>{money(weekNet)} cette semaine / {money(lastWeekNet)} la semaine passée</span></div>
  <div className="comparison-match"><b>Pour égaler le revenu de tout le mois passé</b><strong>{money(Math.max(0,comparisonTotals(courses,lastMonth).net-comparisonTotals(courses,todayMonth.filter(d=>d<=today)).net))} restants</strong><span>{money(comparisonTotals(courses,todayMonth.filter(d=>d<=today)).net)} ce mois-ci / {money(comparisonTotals(courses,lastMonth).net)} le mois passé</span></div>
  </section>}<p className="statistics-note statistics-footnote">Même calcul que l’objectif de l’accueil : revenu après frais Téo, perceptions STM et redevances aéroport, avant frais de compagnie et dépenses taxi. Les montants incluent les taxes. Une tournée compte pour un enregistrement.</p>
 </section>;
}
