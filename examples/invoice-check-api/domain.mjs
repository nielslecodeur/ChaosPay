export function validateInvoice(body) {
  const invoice = body?.invoice;
  if (!invoice || typeof invoice.reference !== "string" || !/^[a-zA-Z0-9_-]{1,60}$/.test(invoice.reference) ||
      !Array.isArray(invoice.lines) || invoice.lines.length < 1 || invoice.lines.length > 100 ||
      typeof invoice.declaredTotalMinor !== "string" || !/^[0-9]{1,15}$/.test(invoice.declaredTotalMinor)) throw new Error("Invalid invoice");
  const lines = invoice.lines.map(line => {
    if (!line || typeof line.unitPriceMinor !== "string" || !/^[0-9]{1,12}$/.test(line.unitPriceMinor) ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 10000) throw new Error("Invalid invoice line");
    return {unitPriceMinor:line.unitPriceMinor,quantity:line.quantity};
  });
  return {reference:invoice.reference,declaredTotalMinor:invoice.declaredTotalMinor,lines};
}
export function checkInvoice(invoice) {
  const computedTotalMinor = invoice.lines.reduce((sum,line) => sum + BigInt(line.unitPriceMinor)*BigInt(line.quantity),0n).toString();
  return {reference:invoice.reference,computedTotalMinor,declaredTotalMinor:invoice.declaredTotalMinor,
    totalsMatch:BigInt(computedTotalMinor)===BigInt(invoice.declaredTotalMinor),
    scope:"Arithmetic check only; no invoice payment or tax validation."};
}
