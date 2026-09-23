"use client";
import {useState} from "react";
import {comparisonTotals,periodDates,previousAnchor,periodGoal,percentageChange,type ComparisonRide,type PeriodMode} from "@/lib/comparison";
const money=(n:number)=>n.toLocaleString("fr-CA",{style:"currency",currency:"CAD"});
const label=(d:string)=>new Date(`${d}T12:00:00`).toLocaleDateString("fr-CA",{weekday:"short",day:"numeric",month:"short",year:"numeric"});
const range=(dates:string[])=>dates.length ? dates.length===1 ? label(dates[0]) : `${label(dates[0])} → ${label(dates.at(-1)!)}` : "—";
type Metric="net"|"gross"|"count"|"tips";
export default function StatisticsPage({courses,today,dailyGoals,goalsEnabled,onSettings}:{courses:ComparisonRide[];today:string;dailyGoals:number[];goalsEnabled:boolean;onSettings:()=>void}){
 const [mode,setMode]=useState<PeriodMode>("week"),[anchor,setAnchor]=useState(today),[reference,setReference]=useState("");
 const [metric,setMetric]=useState<Metric>("net"),[type,setType]=useState("all"),[elapsed,setElapsed]=useState(true);
 const valid=/^\d{4}-\d{2}-\d{2}$/.test(anchor) && periodDates(anchor,mode).length>0;
 const safeAnchor=valid?anchor:today,currentDates=periodDates(safeAnchor,mode),previousDates=periodDates(reference||previousAnchor(safeAnchor,mode),mode);
 const running=currentDates.includes(today),limit=elapsed&&running ? currentDates.indexOf(today)+1 : currentDates.length;
 const shown=currentDates.slice(0,limit),oldShown=elapsed&&running?previousDates.slice(0,limit):previousDates;
 const filtered=courses.filter(r=>type==="all"||r.type===type);
 const current=comparisonTotals(filtered,shown),previous=comparisonTotals(filtered,oldShown);
 const format=(n:number)=>metric==="count"?n.toLocaleString("fr-CA"):money(n);
 const diff=current[metric]-previous[metric],percent=percentageChange(current[metric],previous[metric]);
 const pairs=Array.from({length:Math.max(shown.length,oldShown.length)},(_,i)=>({now:shown[i],old:oldShown[i],a:shown[i]?comparisonTotals(filtered,[shown[i]])[metric]:null,b:oldShown[i]?comparisonTotals(filtered,[oldShown[i]])[metric]:null}));
 const maximum=Math.max(1,...pairs.flatMap(p=>[p.a||0,p.b||0]));
 const todayWeek=periodDates(today,"week"),todayMonth=periodDates(today,"month"),lastWeek=periodDates(previousAnchor(today,"week"),"week"),lastMonth=periodDates(previousAnchor(today,"month"),"month");
 const weekNet=comparisonTotals(courses,todayWeek.filter(d=>d<=today)).net,lastWeekNet=comparisonTotals(courses,lastWeek).net;
 const goals:{title:string;days:string[]}[]=[{title:"Cette semaine",days:todayWeek},{title:"Semaine passée",days:lastWeek},{title:"Ce mois-ci",days:todayMonth},{title:"Mois passé",days:lastMonth}];
 return <section className="statistics-page">
  <header className="statistics-header"><span>COMPARAISONS ET OBJECTIFS</span><h2>Est-ce que je fais mieux ?</h2><p>Compare une journée, une semaine ou un mois, puis vois combien il reste à gagner.</p></header>
  <nav className="sev-tabs" aria-label="Comparer par">{(["day","week","month"] as const).map((m,i)=><button type="button" key={m} aria-current={mode===m?"page":undefined} onClick={()=>{setMode(m);setReference("");}}>{["Journées","Semaines","Mois"][i]}</button>)}</nav>
  <div className="sev-filters"><label>{mode==="day"?"Journée à comparer":"Une date dans la période"}<input type="date" value={anchor} onChange={e=>{setAnchor(e.target.value);setReference("");}}/></label><label>Comparer avec<input type="date" value={reference||previousAnchor(safeAnchor,mode)} onChange={e=>setReference(e.target.value)}/></label><label>Indicateur<select value={metric} onChange={e=>setMetric(e.target.value as Metric)}><option value="net">Revenu net pour l’objectif</option><option value="gross">Revenu brut</option><option value="count">Nombre de courses / tournées</option><option value="tips">Pourboires connus</option></select></label><label>Activité<select value={type} onChange={e=>setType(e.target.value)}><option value="all">Toutes les courses</option><option value="taxi">Taxi</option><option value="adapte">Transport adapté</option></select></label></div>
  <p className="statistics-note">{mode==="day"?"Par défaut : le même jour de la semaine précédente (lundi contre lundi, par exemple).":mode==="week"?"Semaines du mardi au lundi, comparées jour par jour.":"Mois comparés par numéro de jour. Les jours absents d’un mois sont indiqués « — »."}</p>
  {running&&mode!=="day"&&<label className="comparison-check"><input type="checkbox" checked={elapsed} onChange={e=>setElapsed(e.target.checked)}/>Comparer au même stade : jusqu’à aujourd’hui, inclus</label>}
  {!valid?<p role="alert">Choisis une date valide.</p>:<>
  <div className="comparison-summary"><article><span>● Période choisie</span><small>{range(shown)}</small><strong>{format(current[metric])}</strong><small>{current.count} courses / tournées enregistrées</small></article><article><span>● Référence</span><small>{range(oldShown)}</small><strong>{format(previous[metric])}</strong><small>{previous.count} courses / tournées enregistrées</small></article></div>
  <div className={`comparison-gap ${diff>=0?"positive":"negative"}`}><b>{diff>=0?"+":"−"}{format(Math.abs(diff))}</b><span>{percent===null?"Pas de pourcentage : la référence est à zéro.":`${percent>=0?"+":""}${percent.toLocaleString("fr-CA",{maximumFractionDigits:1})} % par rapport à la référence`}</span></div>
  {running&&<p className="statistics-note">Aujourd’hui peut être incomplet : comparaison des courses enregistrées, sans alignement par heure.</p>}
  {!!(current.unknownTips+previous.unknownTips)&&<p className="statistics-tip">Pourboires encore inconnus dans certaines captures : leurs totaux sont inclus dans les revenus, mais les pourboires connus restent provisoires.</p>}
  <section className="statistics-card"><h3>{mode==="day"?"Comparaison des deux journées":"Comparaison jour par jour"}</h3><p className="comparison-legend"><span>● Période choisie</span><span>● Référence</span></p><div className="comparison-graph">{pairs.map((p,i)=><div className="comparison-pair" key={i}>{mode!=="day"&&<b>{mode==="week"?new Date(`${p.now||p.old}T12:00:00`).toLocaleDateString("fr-CA",{weekday:"long"}):`Jour ${i+1}`}</b>}{[{date:p.now,value:p.a},{date:p.old,value:p.b}].map((bar,j)=><div className={`comparison-bar bar-${j}`} key={j}><div><small>{bar.date?label(bar.date):"Jour absent"}</small><strong>{bar.value===null?"—":format(bar.value)}</strong></div><div className="comparison-track"><i style={{width:`${Math.max(0,bar.value||0)/maximum*100}%`}}/></div></div>)}</div>)}</div></section>
  {!current.count&&!previous.count&&<p className="sev-empty">Aucune course enregistrée dans ces deux périodes.</p>}
  </>}
  <section className="statistics-card"><h3>Combien me manque-t-il ?</h3><p>Sur toutes les courses, indépendamment des filtres. Les objectifs de semaine et de mois additionnent tes objectifs quotidiens des Réglages.</p>
  {!goalsEnabled?<><p>Active tes objectifs quotidiens pour voir ce qu’il reste à gagner.</p><button type="button" className="comparison-settings" onClick={onSettings}>Définir mes objectifs</button></>:<><div className="comparison-goals">{goals.map(({title,days})=>{
   const goal=periodGoal(days,dailyGoals),earned=comparisonTotals(courses,days.filter(d=>d<=today)).net,remaining=Math.max(0,goal-earned),progress=goal>0?Math.min(100,Math.max(0,earned/goal*100)):0;
   return <article key={title}><h4>{title}</h4><small>{range(days)}</small><strong>{goal>0?remaining>0?`${money(remaining)} ${days.at(-1)!<today?"manquaient":"restants"}`:`Objectif atteint · +${money(earned-goal)}`:"Aucun objectif défini"}</strong><p>{money(earned)} réalisés / {money(goal)} visés</p><div className="comparison-track" role="progressbar" aria-label={`Objectif ${title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{width:`${progress}%`}}/></div></article>;
  })}</div><button type="button" className="comparison-settings" onClick={onSettings}>Modifier mes objectifs</button><p className="statistics-note">Les périodes passées utilisent tes objectifs actuels ; aucun ancien objectif n’a été conservé.</p></>}
  <div className="comparison-match"><b>Pour égaler le revenu de toute la semaine passée</b><strong>{money(Math.max(0,lastWeekNet-weekNet))} restants</strong><span>{money(weekNet)} cette semaine / {money(lastWeekNet)} la semaine passée</span></div>
  <div className="comparison-match"><b>Pour égaler le revenu de tout le mois passé</b><strong>{money(Math.max(0,comparisonTotals(courses,lastMonth).net-comparisonTotals(courses,todayMonth.filter(d=>d<=today)).net))} restants</strong><span>{money(comparisonTotals(courses,todayMonth.filter(d=>d<=today)).net)} ce mois-ci / {money(comparisonTotals(courses,lastMonth).net)} le mois passé</span></div>
  </section><p className="statistics-note">Même calcul que l’objectif de l’accueil : revenu après frais Téo, perceptions STM et redevances aéroport, avant frais de compagnie et dépenses taxi. Les montants incluent les taxes. Une tournée compte pour un enregistrement.</p>
 </section>;
}
