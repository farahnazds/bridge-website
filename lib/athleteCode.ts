// Auto-generated, editable per docs/10-athlete-data-fields.md ("Athlete
// code (auto-generated, editable)"). Prefills the registration form's
// code field; the server action re-checks uniqueness on submit since two
// browsers could generate the same candidate.
export function generateAthleteCode(lastName: string): string {
  const prefix = (lastName.replace(/[^a-zA-Z]/g, "").slice(0, 3) || "ATH").toUpperCase();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${suffix}`;
}
