export type Row = Record<string, string | number | boolean | null>;
export function validateRows(input: unknown): Row[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100 || input.some(row =>
    !row || typeof row !== "object" || Array.isArray(row) ||
    Object.keys(row).length > 20 || Object.entries(row).some(([key,value]) =>
      key.length > 100 || (value !== null && !["string","number","boolean"].includes(typeof value)) ||
      (typeof value === "string" && value.length > 1000) || (typeof value === "number" && !Number.isFinite(value)))))
    throw new Error("Expected 1..100 flat rows, at most 20 columns.");
  return input as Row[];
}
export function toCsv(rows: Row[]): string {
  const columns = [...new Set(rows.flatMap(Object.keys))].sort();
  const cell = (v: unknown) => {
    const value = String(v ?? "");
    // A leading apostrophe makes spreadsheet formula-like strings plain text.
    const safeValue = typeof v === "string" && /^[\u0000-\u0020]*[=+\-@]/.test(v) ? "'" + value : value;
    return '"' + safeValue.replaceAll('"','""') + '"';
  };
  return [columns.map(cell).join(","), ...rows.map(row => columns.map(k => cell(row[k])).join(","))].join("\n") + "\n";
}
