export type VerifiableCourse = { id: string; verified?: boolean; verifiedBillId?: string; verifiedAt?: string; teoId?: string; tipPending?: boolean };
export function reconcileVerification<C extends VerifiableCourse, R, S extends {id:string;importedAt:string;rows:R[]}>(
  courses:C[], statements:S[], matches:(course:C,row:R)=>boolean, difference:(course:C,row:R)=>number, resolve:(course:C,row:R)=>Partial<C>,
):C[] {
  const used = new Set<string>();
  const result = new Map<string,C>();
  const ordered = [...courses].sort((a,b)=>Number(!!b.verifiedBillId)-Number(!!a.verifiedBillId)||Number(!!b.teoId)-Number(!!a.teoId)||Number(!!a.tipPending)-Number(!!b.tipPending));
  for (const course of ordered) {
    let next = course;
    let found = false;
    const preferred = [...statements].sort((a,b)=>Number(b.id===course.verifiedBillId)-Number(a.id===course.verifiedBillId));
    for(const statement of preferred) {
      const index = statement.rows.findIndex((row,index)=>!used.has(`${statement.id}:${index}`)&&matches(course,row)&&difference(course,row)<0.02);
      if(index<0) continue;
      used.add(`${statement.id}:${index}`); found=true;
      next={...course,...resolve(course,statement.rows[index]),verified:true,verifiedBillId:statement.id,verifiedAt:course.verifiedBillId===statement.id&&course.verifiedAt?course.verifiedAt:statement.importedAt};
      break;
    }
    if(!found && (course.verified || course.verifiedBillId || course.verifiedAt)) {
      next={...course,verified:false}; delete next.verifiedBillId; delete next.verifiedAt;
    }
    result.set(course.id,JSON.stringify(next)===JSON.stringify(course)?course:next);
  }
  return courses.every(course=>result.get(course.id)===course)?courses:courses.map(course=>result.get(course.id)!);
}
