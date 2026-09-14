type PayrollRowWithDate = {
  date?: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function getPayrollCourseDates(
  rows: ReadonlyArray<PayrollRowWithDate>,
) {
  return Array.from(
    new Set(
      rows
        .map((row) => row.date?.trim() || "")
        .filter((date) => ISO_DATE.test(date)),
    ),
  ).sort();
}
