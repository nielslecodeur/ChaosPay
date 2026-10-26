export type Application = 'invoice-agent' | 'csv' | 'receipt' | 'market-quote' | 'web-research' | 'delivery-status' | 'weather-brief';

const simulatedApplications: readonly string[] = [
  'csv',
  'receipt',
  'market-quote',
  'web-research',
  'delivery-status',
  'weather-brief',
];
const testnetApplications: readonly string[] = ['csv', 'receipt', 'invoice-agent'];

export function isSupportedApplication(application: unknown, source: unknown): application is Application {
  if (typeof application !== 'string') return false;
  if (source === 'SIMULATED') return simulatedApplications.includes(application);
  if (source === 'TESTNET') return testnetApplications.includes(application);
  return false;
}
