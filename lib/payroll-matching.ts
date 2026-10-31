// Match exact amounts before assigning discrepancies. A mismatched row must never
// consume the only course that exactly matches a later row in the same PDF.
export function matchPayrollRows<C, R>(courses: C[], rows: R[], matches: (course: C, row: R) => boolean, difference: (course: C, row: R) => number) {
  const assigned = new Map<number, number>();
  const used = new Set<number>();
  const candidates = rows.map(row => courses.map((course, index) => ({ index, delta: difference(course, row) })).filter(item => matches(courses[item.index], row)).sort((a, b) => a.delta - b.delta));
  const owners = new Map<number, number>();
  function assignExact(rowIndex: number, seen: Set<number>): boolean {
    for (const candidate of candidates[rowIndex]) {
      if (candidate.delta >= 0.02 || seen.has(candidate.index)) continue;
      seen.add(candidate.index);
      const owner = owners.get(candidate.index);
      if (owner === undefined || assignExact(owner, seen)) {
        owners.set(candidate.index, rowIndex);
        return true;
      }
    }
    return false;
  }
  rows.forEach((_row, index) => assignExact(index, new Set()));
  owners.forEach((rowIndex, courseIndex) => { assigned.set(rowIndex, courseIndex); used.add(courseIndex); });
  rows.forEach((_row, index) => {
    if (assigned.has(index)) return;
    const candidate = candidates[index].find(item => !used.has(item.index));
    if (candidate) { assigned.set(index, candidate.index); used.add(candidate.index); }
  });
  return { assigned, used };
}
