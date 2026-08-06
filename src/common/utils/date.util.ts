export function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const originalMonth = result.getMonth();
  const targetMonth = originalMonth + months;

  result.setMonth(targetMonth);
  const expectedMonth = (((originalMonth + months) % 12) + 12) % 12;

  if (result.getMonth() !== expectedMonth) {
    result.setDate(0);
  }

  return result;
}

export function monthsBetween(anchor: Date, target: Date): number {
  if (target < anchor) return 0;

  const yearsDiff = target.getFullYear() - anchor.getFullYear();
  const monthsDiff = target.getMonth() - anchor.getMonth();

  let totalMonths = yearsDiff * 12 + monthsDiff;

  const checkDate = addCalendarMonths(anchor, totalMonths);
  if (target.getTime() < checkDate.getTime()) {
    totalMonths--;
  }

  return Math.max(0, totalMonths);
}
