function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  return dateKey(new Date(Date.UTC(year, number - 1 + offset, 1))).slice(0, 7);
}
/** Monday-first calendar, complete weeks without local daylight-saving offsets. */
export function monthDays(month: string) {
  const [year, number] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) =>
    dateKey(new Date(Date.UTC(year, number - 1, 1 - offset + i))),
  );
}
