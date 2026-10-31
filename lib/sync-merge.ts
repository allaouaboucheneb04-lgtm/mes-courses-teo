export class SyncConflict extends Error {
  constructor(){super('Une même donnée a été modifiée sur un autre appareil. Vos changements locaux sont conservés.');}
}
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
export const sameData=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function mergeValue(base:unknown,local:unknown,remote:unknown):unknown {
  if(sameData(local,base)) return remote;
  if(sameData(remote,base)||sameData(local,remote)) return local;
  if(base && local && remote && typeof base==='object'&&typeof local==='object'&&typeof remote==='object'&&!Array.isArray(base)&&!Array.isArray(local)&&!Array.isArray(remote)) {
    const b=base as Record<string,unknown>,l=local as Record<string,unknown>,r=remote as Record<string,unknown>;
    return Object.fromEntries([...new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])].map(key=>[key,mergeValue(b[key],l[key],r[key])]).filter(([,v])=>v!==undefined));
  }
  throw new SyncConflict();
}
export function mergeRecords<T extends {id:string}>(base:T[],local:T[],remote:T[]):T[] {
  const b=new Map(base.map(x=>[x.id,x])),l=new Map(local.map(x=>[x.id,x])),r=new Map(remote.map(x=>[x.id,x]));
  const ids=[...new Set([...local.map(x=>x.id),...remote.map(x=>x.id),...base.map(x=>x.id)])];
  return ids.map(id=>mergeValue(b.get(id),l.get(id),r.get(id)) as T|undefined).filter((v):v is T=>!!v);
}
export type DriverSyncData={courses:{id:string}[];expenses:{id:string}[];payStatements:{id:string}[];settings:object};
export function mergeDriverData<T extends DriverSyncData>(base:T,local:T,remote:T):T {
  return {...remote,courses:mergeRecords(base.courses,local.courses,remote.courses),expenses:mergeRecords(base.expenses,local.expenses,remote.expenses),payStatements:mergeRecords(base.payStatements,local.payStatements,remote.payStatements),settings:mergeValue(base.settings,local.settings,remote.settings)} as T;
}
