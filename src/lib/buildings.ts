/** Extract the building prefix from a room such as PRP1234 or SJT311A. */
export function buildingFromVenue(venue: string | null | undefined): string {
  const value = venue?.trim().toUpperCase() ?? "";
  const prefix = value.match(/^([A-Z]+)(?:\s*\d.*)?$/)?.[1] ?? "";
  // G marks a ground-floor room in these buildings, not a separate building.
  return ({ PRPG: "PRP", SJTG: "SJT", SMVG: "SMV", GDNG: "GDN" } as Record<string, string>)[prefix] ?? prefix;
}
