type Amounts = { amount: number; tip: number; tipPending?: boolean };

// A blank screenshot tip is unknown, while an explicitly entered zero is known.
export function cardPayrollDifference(course: Amounts, row: Amounts) {
  return course.tipPending
    ? Math.abs(Math.round((course.amount + course.tip) * 100) - Math.round((row.amount + row.tip) * 100)) / 100
    : Math.abs(course.amount - row.amount) + Math.abs(course.tip - row.tip);
}

export function resolvePhotoTip(course: Amounts, row: Amounts) {
  return course.tipPending ? { amount: row.amount, tip: row.tip, tipPending: false } : {};
}
