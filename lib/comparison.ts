import {rideStatistics,type StatisticsRide} from "./statistics";
export type ComparisonRide=StatisticsRide & {airportFee?:number};
export type PeriodMode="day"|"week"|"month";
export const shiftDate=(date:string,days:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export function periodDates(anchor:string,mode:PeriodMode){
 const d=new Date(`${anchor}T12:00:00Z`);
 if(!Number.isFinite(d.getTime()))return [];
 if(mode === "day")return [anchor];
 if(mode === "week"){const start=shiftDate(anchor,-((d.getUTCDay()+5)%7));return Array.from({length:7},(_,i)=>shiftDate(start,i));}
 const start=`${anchor.slice(0,7)}-01`;
 const days=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 return Array.from({length:days},(_,i)=>shiftDate(start,i));
}
export function previousAnchor(anchor:string,mode:PeriodMode){return mode === "month" ? shiftDate(`${anchor.slice(0,7)}-01`,-1) : shiftDate(anchor,-7);}
export function comparisonTotals(rides:ComparisonRide[],dates:string[]){
 const keys=new Set(dates);const rows=rides.filter(r=>keys.has(r.date));const s=rideStatistics(rows);
 return {...s,net:Math.round((s.net-rows.reduce((n,r)=>n+(r.airportFee||0),0))*100)/100};
}
export function periodGoal(dates:string[],dailyGoals:number[]){return dates.reduce((sum,date)=>sum+Math.round((dailyGoals[(new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7]||0)*100),0)/100;}
export function percentageChange(current:number,previous:number){return previous>0 ? (current-previous)/previous*100 : null;}
