// Module-level timezone used by all time formatters.
// Seeded to America/Mexico_City; overridden at startup from the user's profile.
let _tz = "America/Mexico_City";

export function setDisplayTimezone(tz: string) {
  _tz = tz || "America/Mexico_City";
}

export function getDisplayTimezone(): string {
  return _tz;
}
