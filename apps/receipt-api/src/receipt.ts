export interface Invoice { reference: string; amountMinor: string; currency: "EUR" | "USD"; }
export function validateInvoice(body: unknown): Invoice {
  const i=(body as {invoice?:Invoice})?.invoice;
  if (!i||typeof i.reference!=="string"||!/^[a-zA-Z0-9_-]{1,60}$/.test(i.reference)||
      typeof i.amountMinor!=="string"||!/^[1-9][0-9]{0,11}$/.test(i.amountMinor)||
      !["EUR","USD"].includes(i.currency)) throw new Error("Invalid invoice.");
  return {reference:i.reference,amountMinor:i.amountMinor,currency:i.currency};
}
export function makeReceipt(invoice: Invoice, context: { purchaseId: string; txHash: string; buyer: string }) {
  return { type:"demo-receipt",invoice,receiptId:context.purchaseId,
    generationPayment:{network:"stellar:testnet",txHash:context.txHash,buyer:context.buyer},
    notice:"Test receipt generation only; the invoice itself has not been paid." };
}
