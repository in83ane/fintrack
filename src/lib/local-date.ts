/**
 * Date inputs represent a calendar day in the user's local timezone. Keeping
 * this separate from ISO/UTC formatting prevents a post-midnight entry in
 * UTC+ timezones from appearing under the previous day.
 */
export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Store a chosen calendar day at local noon so its local date is preserved. */
export function localDateKeyToIso(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const localNoon = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    !Number.isFinite(localNoon.getTime()) ||
    localNoon.getFullYear() !== year ||
    localNoon.getMonth() !== month - 1 ||
    localNoon.getDate() !== day
  ) {
    throw new Error("Invalid local date key");
  }

  return localNoon.toISOString();
}
