export const scenarios = [
  { id: 'before-submit', label: 'Bug avant règlement · reprise auto', description: 'Une panne arrive avant l’envoi au facilitator. Le runner renvoie automatiquement la même autorisation ; aucune transaction n’est annulée sur Stellar.' },
  { id: 'confirmation-lost', label: 'Confirmation indisponible', description: 'Soumission asynchrone, UNKNOWN puis reconciliation.' },
  { id: 'ack-lost', label: 'Accuse perdu', description: 'Resultat recu, accuse omis, puis reprise et accuse.' },
  { id: 'baseline', label: 'Sans panne', description: 'Un paiement et un résultat accusé.' },
  { id: 'drop', label: 'Réponse perdue', description: 'Socket coupée après règlement, puis reprise de la même autorisation.' },
  { id: 'crash', label: 'Crash marchand', description: 'Arrêt après règlement, redémarrage et réconciliation.' },
  { id: 'concurrent', label: 'Deux requêtes', description: 'Deux appels simultanés avec la même autorisation.' },
  { id: 'comparison', label: 'Naïf vs durable', description: 'Réponse perdue : comparer la reprise et une nouvelle autorisation volontaire.' },
] as const;
export type Scenario = typeof scenarios[number]['id'];
export function isScenario(value: unknown): value is Scenario { return scenarios.some(s => s.id === value); }
