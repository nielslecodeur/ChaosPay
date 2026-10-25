const scenario = document.getElementById('quick-scenario');
const useCase = document.getElementById('quick-usecase');
const runButton = document.getElementById('quick-run');
const result = document.getElementById('quick-result');
const useCases = {
  'market-quote': {
    request: 'The agent requests a sample XLM/EUR quote from a paid data service.',
    result: 'A sample quote is returned to the agent.',
  },
  'delivery-status': {
    request: 'The agent requests an update for a fictional parcel from a paid tracking service.',
    result: 'A fictional delivery update is returned to the agent.',
  },
  csv: {
    request: 'The agent asks a paid service to convert a budget table into CSV.',
    result: 'The converted CSV is returned to the agent.',
  },
  receipt: {
    request: 'The agent asks a paid service to generate a JSON receipt for an invoice.',
    result: 'A JSON receipt is returned; the invoice itself is not paid.',
  },
};

function make(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function outcome(title, amount, settlements, message, useCase, retry) {
  const card = make('article', undefined, 'quick-card');
  card.append(make('p', 'SIMULATED · FICTIONAL', 'quick-card-label'));
  card.append(make('h2', title));
  const amountRow = make('p', undefined, 'quick-metric');
  amountRow.append(make('span', 'Amount paid'), make('strong', `${amount} XLM`));
  const settlementRow = make('p', undefined, 'quick-metric');
  settlementRow.append(make('span', 'Fictional settlements'), make('strong', String(settlements)));
  card.append(amountRow, settlementRow, make('p', message, 'quick-card-note'));
  const summary = make('ul', undefined, 'quick-summary');
  summary.append(
    make('li', useCase.request),
    make('li', `Payment: ${settlements} fictional settlement${settlements === 1 ? '' : 's'} (${amount} XLM total).`),
    make('li', `${useCase.result} ${retry}`),
  );
  card.append(summary);
  return card;
}

runButton.addEventListener('click', () => {
  result.classList.remove('is-empty');
  result.replaceChildren();
  result.append(make('p', 'Simulation complete — no payment was made.', 'quick-result-note'));
  const selectedUseCase = useCases[useCase.value] ?? useCases['market-quote'];

  if (scenario.value === 'normal') {
    result.append(outcome(
      'Normal purchase',
      '0.0100000',
      1,
      'The customer receives the result after one fictional settlement.',
      selectedUseCase,
      'The request completes without interruption.',
    ));
    return;
  }

  result.append(
    outcome(
      'Naive retry',
      '0.0200000',
      2,
      'The retry starts a new purchase. The customer gets the result but is charged twice in this fictional example.',
      selectedUseCase,
      'The retry starts a second purchase because the first response was lost.',
    ),
    outcome(
      'Recover the same purchase',
      '0.0100000',
      1,
      'The retry finds the original purchase and returns its saved result without creating another settlement.',
      selectedUseCase,
      'The retry finds the original purchase, so it is not paid for twice.',
    )
  );
});
