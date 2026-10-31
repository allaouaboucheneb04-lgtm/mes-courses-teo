import { validTrackingDate } from './payroll-summary';
import { isCardPayment } from './teo-payment';
export type PhotoCandidate = {date:string;total:string;tip:string;sourceFingerprint?:string;sourceContentFingerprint?:string};
export type ExistingPhotoCourse = {date:string;amount:number;tip:number;type:string;payment:string;sourceFingerprint?:string;sourceContentFingerprint?:string};
const readMoney=(s:string)=>s.trim()===''?NaN:Number(s.trim().replace(/\s/g,'').replace(',','.'));
export function photoCandidateError(item:PhotoCandidate) {
  const total=readMoney(item.total),tip=item.tip.trim()===''?0:readMoney(item.tip);
  if(!validTrackingDate(item.date)) return 'Choisissez une date valide pour chaque course.';
  if(!Number.isFinite(total)||total<=0) return 'Chaque course doit avoir un montant total supérieur à zéro.';
  if(!Number.isFinite(tip)||tip<0||tip>total) return 'Le pourboire doit être compris entre zéro et le montant total.';
  return '';
}
export function photoDuplicateStatus(item:PhotoCandidate,courses:ExistingPhotoCourse[]) {
  if(courses.some(c => (item.sourceFingerprint && c.sourceFingerprint === item.sourceFingerprint) || (item.sourceContentFingerprint && c.sourceContentFingerprint === item.sourceContentFingerprint))) return 'exact';
  const total=readMoney(item.total);
  return courses.some(c=>c.type==='taxi'&&isCardPayment(c.payment)&&c.date===item.date&&Math.abs(c.amount+c.tip-total)<0.02)?'possible':'new';
}
export function photoCategory(segment:string,defaultCategory:'centre-ville'|'aeroport',airportEnabled:boolean) {
  if(!airportEnabled) return 'centre-ville';
  const text=segment.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  // Normalize punctuation as well as accents: tablet labels are often truncated
  // (Montréal-Pierre Elliott Trude…) or wrap across OCR lines.
  const words=text.replace(/[^A-Z0-9]+/g,' ').trim();
  const streetNamedTrudeau=/\b(?:RUE|STREET|ST|AVENUE|AV|BOULEVARD|BLVD|BOUL|BD)\s+(?:PIERRE\s+ELL?IOTT?\s+)?TRUD\w*/.test(words);
  const yulName=/\bY\s*U\s*[LI1]\b/.test(words)
    || /\bMONTREAL\s+(?:PIERRE(?:\s+ELL?IOTT?)?(?:\s+TRUD\w*)?|TRUD\w*)\b/.test(words)
    || (!streetNamedTrudeau && /\bPIERRE\s+ELL?IOTT?\s+TRUD\w*\b/.test(words))
    || /\b(?:AEROPORT|AIRPORT|AEROGARE|TERMINAL)\b.*\b(?:TRUD\w*|DORVAL)\b/.test(words)
    || /\b(?:TRUD\w*|DORVAL)\b.*\b(?:AEROPORT|AIRPORT|AEROGARE|TERMINAL)\b/.test(words);
  // The terminal's street address, with French/English street abbreviations.
  // Do not classify every Dorval address or every street named Trudeau as YUL.
  const yulTerminalAddress=/\b975\s+(?:(?:BOULEVARD|BLVD|BOUL|BD|RUE|STREET|ST)\s+)?ROMEO\s+VACHON\b/.test(words);
  if(yulName || yulTerminalAddress || /\bAEROPORT\b|\bAIRPORT\b/.test(words)) return 'aeroport';
  if(/CENTRE[\s-]*VILLE|DOWNTOWN/.test(text)) return 'centre-ville';
  return defaultCategory;
}

// Ignore status/header changes, but retain every ride's address, amount, date and order.
// A whole-screen signature does not collapse equal-price rides within that screen.
export function photoScreenContent(text:string) {
  const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const firstAmount=normalized.search(/\b\d{1,4}[,.]\d{2}\s*[$§]?/);
  if(firstAmount<0) return '';
  return normalized.slice(firstAmount).replace(/[^A-Z0-9]/g,'');
}
export function uniquePhotoCandidates<T extends PhotoCandidate>(items:T[]) {
  const files=new Set<string>(),contents=new Set<string>();
  return items.filter(item=>{
    if((item.sourceFingerprint&&files.has(item.sourceFingerprint))||(item.sourceContentFingerprint&&contents.has(item.sourceContentFingerprint))) return false;
    if(item.sourceFingerprint) files.add(item.sourceFingerprint);
    if(item.sourceContentFingerprint) contents.add(item.sourceContentFingerprint);
    return true;
  });
}
const captureId=(item:PhotoCandidate)=>item.sourceFingerprint?.split(':')[0];
export function photoPreviewDuplicateStatus<T extends PhotoCandidate>(item:T,items:T[],courses:ExistingPhotoCourse[]) {
  const existing=photoDuplicateStatus(item,courses);
  if(existing!=='new') return existing;
  const index=items.indexOf(item);
  const earlier=items.slice(0,Math.max(0,index)).filter(other=>captureId(other)!==captureId(item));
  if(earlier.some(other=>other.sourceContentFingerprint&&other.sourceContentFingerprint===item.sourceContentFingerprint)) return 'exact';
  return earlier.some(other=>other.date===item.date&&Math.abs(readMoney(other.total)-readMoney(item.total))<0.02)?'possible':'new';
}
