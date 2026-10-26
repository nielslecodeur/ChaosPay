import express from 'express';
import { createPaidRouter } from '../../packages/recovery/src/stellar-http.js';
const domainPath = '../../examples/invoice-check-api/domain.mjs';
const { validateInvoice, checkInvoice } = await import(domainPath);
const app = express();
const paid = await createPaidRouter({ serviceId: 'invoice-check', port: 3014, basePath: '/paid',
  databasePath: '.local/agent-invoice-merchant.sqlite', description: 'Invoice arithmetic check for local AI agent',
  enableFaults: true, validate: validateInvoice, produce: checkInvoice });
app.use('/paid', paid.router);
const server = app.listen(3014, '127.0.0.1');
server.once('close', paid.close);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close());
