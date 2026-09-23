export type StatisticsRide = {
  id: string; date: string; type: string; amount: number; tip: number;
  payment: string; serviceFee: number; perception?: number; duration?: number;
  billedDuration?: number; taxiCategory?: string; tipPending?: boolean;
  verified?: boolean; sevAdded?: boolean;
};
const cents = (n: number) => Math.round(n * 100);
export function rideStatistics(rides: StatisticsRide[]) {
  const gross = rides.reduce((s,r)=>s+cents(r.amount)+cents(r.tip),0)/100;
  const fees = rides.reduce((s,r)=>s+cents(r.serviceFee),0)/100;
  const perceptions = rides.reduce((s,r)=>s+cents(r.perception || 0),0)/100;
  const days = new Set(rides.map(r=>r.date)).size;
  return {count:rides.length, gross, fees, perceptions, net:Math.round((gross-fees-perceptions)*100)/100,
    tips:rides.reduce((s,r)=>s+cents(r.tip),0)/100,
    unknownTips:rides.filter(r=>r.tipPending).length,
    days, average:rides.length ? gross/rides.length : 0, dailyAverage:days ? gross/days : 0,
    verified:rides.filter(r=>r.verified).length,
    hours:rides.filter(r=>r.type === "adapte").reduce((s,r)=>s+(r.duration || 0),0),
  };
}
export function groupStatistics(rides: StatisticsRide[], key: (r:StatisticsRide)=>string) {
  const groups = new Map<string,StatisticsRide[]>();
  for(const ride of rides){const label=key(ride);groups.set(label,[...(groups.get(label)||[]),ride]);}
  return [...groups].map(([label,items])=>({label,...rideStatistics(items)}));
}
