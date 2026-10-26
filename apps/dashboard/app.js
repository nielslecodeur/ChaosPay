const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const badge = (text, tone = '') => el('span', text, `badge ${tone}`);
const apps = {
  csv: 'CSV conversion',
  receipt: 'Receipt generation',
  'market-quote': 'Market quote · simulation',
  'web-research': 'Research brief · simulation',
  'delivery-status': 'Parcel tracking · simulation',
  'weather-brief': 'Weather briefing · simulation',
  'invoice-check': 'Invoice check · installed package',
};
const appDescriptions = {
  csv: 'The client pays to convert a small data table into a CSV file.',
  receipt: 'The client pays to generate a JSON receipt; this does not pay the invoice.',
  'market-quote': 'Simulation only: an agent requests a sample price quote for an asset.',
  'web-research': 'Simulation only: an agent buys a short brief from a fictional research service.',
  'delivery-status': 'Simulation only: an agent checks a fictional parcel tracking service.',
  'weather-brief': 'Simulation only: an agent requests a sample local weather briefing.',
};
const appActions = {
  csv: 'convert a small data table into a CSV file',
  receipt: 'generate a JSON receipt; the invoice itself is not paid',
  'market-quote': 'get a sample market quote for an asset',
  'web-research': 'buy a short research brief',
  'delivery-status': 'check a parcel delivery update',
  'weather-brief': 'get a local weather briefing',
};
const testnetApplications = new Set(['csv', 'receipt']);
const scenarios = {
  comparison: ['Compare two recovery strategies', 'After a lost response, compare paying again with recovering the existing purchase.'],
  drop: ['The response disappears', 'Payment is confirmed, but the client never receives the response.'],
  crash: ['The app crashes', 'The app restarts after payment and must recover the purchase.'],
  'confirmation-lost': ['Confirmation is unavailable', 'Payment was submitted. Its status remains unknown until confirmation returns.'],
  'ack-lost': ['Receipt cannot be confirmed', 'The result arrives, but its acknowledgment is lost.'],
  'before-submit': ['Bug before settlement · automatic retry', 'A failure is injected before the facilitator receives the payment. The runner retries the same authorization; no on-chain transaction is cancelled.'],
  concurrent: ['The client sends two requests', 'Two simultaneous requests refer to the same purchase.'],
  baseline: ['Everything works', 'A purchase with no failure, as a baseline.'],
};
const sourceText = { SIMULATED: 'SIMULATION · fictional data', TESTNET: 'TESTNET · live test', ARCHIVE: 'ARCHIVE · historical evidence' };
const statusText = { RUNNING: 'Experiment running', COMPLETE: 'Experiment finished', INTERRUPTED: 'Experiment interrupted' };
let state = { scenarios: [], runs: [], busy: false }, selected, previous = '', pending = false, reachable = false;
const starCanvas = $('starfield');
const starContext = starCanvas?.getContext?.('2d');
let launchSkyJourney = () => {};
if (starContext) {
  const starMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const home = starCanvas.closest('#home');
  const starTints = ['255,239,225', '196,210,255', '255,194,178'];
  const stars = Array.from({ length: 360 }, () => ({
    x: 0.01 + Math.random() * 0.98,
    y: Math.random(),
    radius: Math.random() * 1.35 + 0.35,
    phase: Math.random() * Math.PI * 2,
    pace: 0.0007 + Math.random() * 0.0014,
    sparkle: Math.random() > 0.82,
    tint: starTints[Math.floor(Math.random() * starTints.length)],
  }));
  const route = [[0.46, 0.76], [0.57, 0.54], [0.68, 0.67], [0.79, 0.38], [0.92, 0.48]];
  const pointer = { x: -1000, y: -1000, lastX: -1000, lastY: -1000, active: false };
  const pulses = [], sparks = [], journeys = [];
  let skyWidth = 0, skyHeight = 0, frame = 0, nextMeteor = 3500, meteor, lastFrame = 0;

  function drawSky(time) {
    const frameScale = lastFrame ? Math.min((time - lastFrame) / 16.67, 2) : 1;
    lastFrame = time;
    starContext.clearRect(0, 0, skyWidth, skyHeight);

    const routeGradient = starContext.createLinearGradient(route[0][0] * skyWidth, 0, route.at(-1)[0] * skyWidth, 0);
    routeGradient.addColorStop(0, 'rgba(255, 147, 124, 0.2)');
    routeGradient.addColorStop(0.55, 'rgba(255, 177, 145, 0.76)');
    routeGradient.addColorStop(1, 'rgba(255, 231, 204, 0.72)');
    starContext.lineWidth = 2;
    starContext.shadowBlur = 17;
    starContext.shadowColor = 'rgba(255, 149, 125, 0.55)';
    starContext.strokeStyle = routeGradient;
    starContext.beginPath();
    route.forEach(([x, y], index) => {
      if (index === 0) starContext.moveTo(x * skyWidth, y * skyHeight);
      else starContext.lineTo(x * skyWidth, y * skyHeight);
    });
    starContext.stroke();
    starContext.shadowBlur = 0;

    const nearby = [];
    for (const star of stars) {
      const baseX = star.x * skyWidth, baseY = star.y * skyHeight;
      const dx = pointer.x - baseX, dy = pointer.y - baseY;
      const distance = Math.hypot(dx, dy);
      const pull = pointer.active && distance < 210 ? Math.pow(1 - distance / 210, 2) * 34 : 0;
      const x = baseX + (distance ? dx / distance * pull : 0);
      const y = baseY + (distance ? dy / distance * pull : 0);
      const twinkle = (Math.sin(time * star.pace + star.phase) + 1) / 2;
      const pulse = 0.2 + twinkle * 0.75;
      const lit = pointer.active && distance < 175;
      starContext.fillStyle = lit ? `rgba(255, 197, 169, ${0.55 + pulse * 0.45})` : `rgba(${star.tint}, ${pulse})`;
      const glint = star.sparkle && twinkle > 0.82;
      if (lit || glint) {
        starContext.shadowBlur = glint ? 5 + twinkle * 7 : 12;
        starContext.shadowColor = lit ? 'rgba(255, 137, 119, 0.8)' : 'rgba(255, 231, 204, 0.9)';
        nearby.push({ x, y, distance });
      }
      starContext.beginPath();
      starContext.arc(x, y, star.radius * (glint ? 1.35 : 1) + (lit ? 0.5 : 0), 0, Math.PI * 2);
      starContext.fill();
      starContext.shadowBlur = 0;
      if (glint) {
        const flare = star.radius * (1.5 + twinkle);
        starContext.strokeStyle = `rgba(255, 244, 231, ${(twinkle - 0.65) * 0.75})`;
        starContext.lineWidth = 0.7;
        starContext.beginPath();
        starContext.moveTo(x - flare, y);
        starContext.lineTo(x + flare, y);
        starContext.moveTo(x, y - flare);
        starContext.lineTo(x, y + flare);
        starContext.stroke();
      }
    }

    if (pointer.active) {
      starContext.lineWidth = 0.7;
      for (const star of nearby) {
        if (star.distance > 150) continue;
        starContext.strokeStyle = `rgba(255, 184, 159, ${(1 - star.distance / 165) * 0.42})`;
        starContext.beginPath();
        starContext.moveTo(pointer.x, pointer.y);
        starContext.lineTo(star.x, star.y);
        starContext.stroke();
      }
    }

    route.forEach(([x, y], index) => {
      const pulse = 0.52 + Math.sin(time * 0.0015 + index) * 0.2;
      starContext.fillStyle = index === route.length - 1 ? `rgba(255, 208, 176, ${pulse})` : `rgba(255, 165, 139, ${pulse})`;
      starContext.shadowBlur = 12;
      starContext.shadowColor = index === route.length - 1 ? 'rgba(255, 188, 152, 0.9)' : 'rgba(255, 132, 113, 0.8)';
      starContext.beginPath();
      starContext.arc(x * skyWidth, y * skyHeight, index === route.length - 1 ? 2.4 : 1.8, 0, Math.PI * 2);
      starContext.fill();
    });

    const routePosition = progress => {
      const bounded = Math.max(0, Math.min(progress, route.length - 1));
      const segment = Math.min(Math.floor(bounded), route.length - 2);
      const ratio = bounded - segment;
      return [
        (route[segment][0] + (route[segment + 1][0] - route[segment][0]) * ratio) * skyWidth,
        (route[segment][1] + (route[segment + 1][1] - route[segment][1]) * ratio) * skyHeight,
      ];
    };
    for (let index = journeys.length - 1; index >= 0; index--) {
      const journey = journeys[index];
      const progress = (time - journey.started) / 2300;
      if (progress >= 1) {
        const [x, y] = route.at(-1);
        pulses.push({ x: x * skyWidth, y: y * skyHeight, started: time, delay: 0 });
        addSparks(x * skyWidth, y * skyHeight, 36, 5.5);
        home.classList.remove('is-charging');
        journey.onComplete?.();
        journeys.splice(index, 1);
        continue;
      }
      while (journey.checkpoint < route.length && progress >= journey.checkpoint / (route.length - 1)) {
        const [x, y] = route[journey.checkpoint];
        const pointX = x * skyWidth, pointY = y * skyHeight;
        pulses.push({ x: pointX, y: pointY, started: time, delay: 0 });
        addSparks(pointX, pointY, 12, 2.8);
        journey.checkpoint++;
      }
      const journeyProgress = Math.max(0, progress) * (route.length - 1);
      const [headX, headY] = routePosition(journeyProgress);
      starContext.beginPath();
      for (let tail = 12; tail >= 0; tail--) {
        const trailProgress = Math.max(0, journeyProgress - tail * 0.045);
        const [trailX, trailY] = routePosition(trailProgress);
        if (tail === 12) starContext.moveTo(trailX, trailY);
        else starContext.lineTo(trailX, trailY);
      }
      starContext.lineCap = 'round';
      starContext.lineJoin = 'round';
      starContext.lineWidth = 3;
      starContext.strokeStyle = 'rgba(255, 220, 202, 0.9)';
      starContext.shadowBlur = 30;
      starContext.shadowColor = '#ff9a82';
      starContext.stroke();
      starContext.fillStyle = '#ffffff';
      starContext.beginPath();
      starContext.arc(headX, headY, 5.5, 0, Math.PI * 2);
      starContext.fill();
      starContext.shadowBlur = 0;
    }

    const routeDuration = 4200;
    for (let packet = 0; packet < 3; packet++) {
      const routeProgress = ((time / routeDuration * (route.length - 1) + packet * 1.38) % (route.length - 1));
      const packetColor = packet === 2 ? '#ffe0bd' : packet === 1 ? '#ff9c86' : '#fff1e6';
      for (let tail = 8; tail >= 0; tail--) {
        const progress = routeProgress - tail * 0.035;
        if (progress < 0) continue;
        const point = routePosition(progress);
        const fade = 1 - tail / 9;
        starContext.fillStyle = packetColor;
        starContext.globalAlpha = fade * (packet === 0 ? 1 : 0.72);
        starContext.shadowBlur = tail === 0 ? 24 : 8;
        starContext.shadowColor = packetColor;
        starContext.beginPath();
        starContext.arc(point[0], point[1], tail === 0 ? 3.5 : 1.6 * fade, 0, Math.PI * 2);
        starContext.fill();
      }
      starContext.globalAlpha = 1;
      starContext.shadowBlur = 0;
    }

    for (let index = pulses.length - 1; index >= 0; index--) {
      const pulse = pulses[index];
      const progress = (time - pulse.started) / 1500 - pulse.delay;
      if (progress < 0) continue;
      if (progress >= 1) { pulses.splice(index, 1); continue; }
      starContext.strokeStyle = `rgba(255, 180, 151, ${(1 - progress) * 0.95})`;
      starContext.lineWidth = 3.5 * (1 - progress) + 0.5;
      starContext.shadowBlur = 26 * (1 - progress);
      starContext.shadowColor = '#ff9279';
      starContext.beginPath();
      starContext.arc(pulse.x, pulse.y, 12 + progress * 290, 0, Math.PI * 2);
      starContext.stroke();
      starContext.shadowBlur = 0;
    }

    for (let index = sparks.length - 1; index >= 0; index--) {
      const spark = sparks[index];
      spark.x += spark.vx * frameScale;
      spark.y += spark.vy * frameScale;
      spark.vx *= 0.985;
      spark.vy *= 0.985;
      spark.life -= 0.012 * frameScale;
      if (spark.life <= 0) { sparks.splice(index, 1); continue; }
      starContext.fillStyle = spark.color;
      starContext.globalAlpha = Math.min(spark.life * 1.8, 1);
      starContext.shadowBlur = 8;
      starContext.shadowColor = spark.color;
      starContext.beginPath();
      starContext.arc(spark.x, spark.y, spark.size * spark.life, 0, Math.PI * 2);
      starContext.fill();
      starContext.globalAlpha = 1;
      starContext.shadowBlur = 0;
    }

    if (time > nextMeteor && !meteor) {
      meteor = { started: time, x: 0.62 + Math.random() * 0.32, y: Math.random() * 0.3 };
      nextMeteor = time + 7000 + Math.random() * 8000;
    }
    if (meteor) {
      const progress = (time - meteor.started) / 850;
      if (progress >= 1) meteor = undefined;
      else {
        const x = meteor.x - progress * 0.32, y = meteor.y + progress * 0.4;
        const trail = starContext.createLinearGradient(x * skyWidth, y * skyHeight, (x + 0.14) * skyWidth, (y - 0.18) * skyHeight);
        trail.addColorStop(0, 'rgba(255, 182, 154, 0)');
        trail.addColorStop(1, 'rgba(255, 236, 218, 0.88)');
        starContext.strokeStyle = trail;
        starContext.lineWidth = 1.5;
        starContext.beginPath();
        starContext.moveTo(x * skyWidth, y * skyHeight);
        starContext.lineTo((x + 0.14) * skyWidth, (y - 0.18) * skyHeight);
        starContext.stroke();
      }
    }
  }

  function addSparks(x, y, count, speed = 3.8) {
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 0.6 + Math.random() * speed;
      const colors = ['#ff9c86', '#fff0d8', '#ffffff', '#ffc5a1'];
      sparks.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: 0.65 + Math.random() * 0.4, size: 0.7 + Math.random() * 1.8, color: colors[index % colors.length] });
    }
  }

  function movePointer(event) {
    const bounds = starCanvas.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    pointer.active = true;
    if (Math.hypot(pointer.x - pointer.lastX, pointer.y - pointer.lastY) > 22) {
      addSparks(pointer.x, pointer.y, 2, 1.6);
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;
    }
    if (starMotion.matches) drawSky(performance.now());
  }

  function burst(event) {
    const bounds = starCanvas.getBoundingClientRect();
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    const started = performance.now();
    pulses.push({ x, y, started, delay: 0 }, { x, y, started, delay: 0.13 });
    addSparks(x, y, 72, 7.2);
    if (starMotion.matches) drawSky(performance.now());
  }

  let chargingTimer;
  launchSkyJourney = (onComplete = () => {}) => {
    if (starMotion.matches) {
      const [x, y] = route[0];
      pulses.push({ x: x * skyWidth, y: y * skyHeight, started: performance.now(), delay: 0 });
      addSparks(x * skyWidth, y * skyHeight, 28, 4.5);
      drawSky(performance.now());
      onComplete();
      return;
    }
    journeys.push({ started: performance.now(), checkpoint: 1, onComplete });
    while (journeys.length > 2) journeys.shift();
    home.classList.add('is-charging');
    clearTimeout(chargingTimer);
    chargingTimer = setTimeout(() => home.classList.remove('is-charging'), 2800);
    const [x, y] = route[0];
    pulses.push({ x: x * skyWidth, y: y * skyHeight, started: performance.now(), delay: 0 });
    addSparks(x * skyWidth, y * skyHeight, 28, 4.5);
    if (starMotion.matches) drawSky(performance.now());
  };

  function resizeSky() {
    const bounds = starCanvas.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 2);
    skyWidth = bounds.width;
    skyHeight = bounds.height;
    starCanvas.width = Math.round(skyWidth * scale);
    starCanvas.height = Math.round(skyHeight * scale);
    starContext.setTransform(scale, 0, 0, scale, 0, 0);
    drawSky(performance.now());
  }

  function animateSky(time) {
    drawSky(time);
    frame = requestAnimationFrame(animateSky);
  }

  function syncSkyMotion() {
    cancelAnimationFrame(frame);
    if (starMotion.matches) drawSky(performance.now());
    else animateSky(performance.now());
  }

  home.addEventListener('pointermove', movePointer);
  home.addEventListener('pointerleave', () => { pointer.active = false; if (starMotion.matches) drawSky(performance.now()); });
  home.addEventListener('pointerdown', event => { if (event.isPrimary) burst(event); });
  document.querySelector('.home-cta')?.addEventListener('click', event => {
    event.preventDefault();
    launchSkyJourney(() => { location.hash = 'try'; });
  });
  addEventListener('resize', resizeSky);
  starMotion.addEventListener('change', syncSkyMotion);
  resizeSky();
  syncSkyMotion();
  const skyVisibility = new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(frame);
    if (!entry.isIntersecting) return;
    if (starMotion.matches) drawSky(performance.now());
    else animateSky(performance.now());
  });
  skyVisibility.observe(starCanvas);
}
const xlm = atomic => { const n = BigInt(atomic); return `${n / 10000000n}.${(n % 10000000n).toString().padStart(7, '0')} XLM`; };
const stellarContractUrl = contract => /^C[A-Z2-7]{55}$/.test(contract) ? `https://stellar.expert/explorer/testnet/contract/${contract}` : undefined;
const isPackageIntegration = run => run.reports.length > 0 && run.reports.every(report => report.serviceId === 'invoice-check');
const titleOf = run => run.source === 'ARCHIVE' ? (isPackageIntegration(run) ? 'Independent package integration' : 'Saved campaign') : scenarios[run.scenario]?.[0] ?? run.scenario;
const appOf = (report, run) => apps[run.application] ?? apps[report.serviceId] ?? report.serviceId ?? 'Application not specified';
function describe() {
  const testnet = $('source').value === 'TESTNET';
  $('source-description').textContent = testnet
    ? 'Submits real Stellar Testnet transactions using test funds. Confirm before sending.'
    : 'Fictional amounts and results. No payment is sent.';
  const application = $('application');
  for (const option of application.options) option.disabled = testnet && !testnetApplications.has(option.value);
  let applicationNotice = '';
  if (testnet && !testnetApplications.has(application.value)) {
    application.value = 'csv';
    applicationNotice = ' Testnet currently supports CSV conversion and JSON receipts only; select this example in simulation mode.';
  }
  $('description').textContent = scenarios[$('scenario').value]?.[1] ?? '';
  $('application-description').textContent = (appDescriptions[application.value] ?? 'The client pays to use this service.') + applicationNotice;
  const notice = $('notice');
  notice.className = `notice ${testnet ? 'notice-testnet' : 'notice-simulated'}`;
  notice.textContent = testnet
    ? 'Stellar Testnet only — test funds have no real-world value. A comparison may make three test payments. Stop the demo servers before launching. '
    : 'Simulation only — no payment is made; amounts and results are fictional.';
  if (testnet) {
    const explorer = el('a', 'Open Stellar Expert ↗');
    explorer.href = 'https://stellar.expert/explorer/testnet';
    explorer.target = '_blank';
    explorer.rel = 'noopener noreferrer';
    notice.append(explorer);
  }
}
function controls() {
  const disabled = pending || state.busy || !reachable;
  for (const id of ['launch', 'application', 'scenario', 'source']) $(id).disabled = disabled;
  $('launch').textContent = pending ? 'Starting…' : state.busy ? 'Experiment running…' : $('source').value === 'TESTNET' ? 'Run Testnet experiment →' : 'Run simulation →';
}
function metric(value, label, note) {
  const n = el('div', undefined, 'metric'); n.append(el('span', label), el('strong', value)); if (note) n.append(el('small', note)); return n;
}
function plainSummary(report, run, overpaid, paid) {
  const summary = el('section', undefined, 'plain-summary');
  summary.setAttribute('aria-label', 'Plain-language summary');
  summary.append(el('h4', 'What happened'));
  const points = el('ul');
  const action = appActions[run.application] ?? appOf(report, run);
  points.append(el('li', `The agent requested a service to ${action}.`));
  if (run.source === 'SIMULATED') {
    points.append(el('li', paid
      ? `Payment: ${xlm(report.settledAmountAtomic)} is fictional; no real payment was sent.`
      : 'Payment: this fictional run records no payment.'));
  } else if (run.source === 'ARCHIVE') {
    points.append(el('li', `Payment: the archived report records ${xlm(report.settledAmountAtomic)}; no new network verification was performed.`));
  } else if (overpaid) {
    points.append(el('li', `Payment: ${xlm(report.settledAmountAtomic)} was observed, more than the expected ${xlm(report.expectedAmountAtomic)}.`));
  } else if (report.verdict === 'PASS') {
    points.append(el('li', `Payment: ${paid ? xlm(report.settledAmountAtomic) : 'the expected payment'} was confirmed.`));
  } else {
    points.append(el('li', 'Payment: the available evidence does not establish a successful payment.'));
  }
  if (run.source === 'SIMULATED') {
    points.append(el('li', `Result: the simulation marks it as ${report.responseRecovered ? 'received' : 'not confirmed'}; no real service was called.`));
  } else if (run.source === 'ARCHIVE') {
    points.append(el('li', `Result: the archived report marks receipt as ${report.responseRecovered ? 'confirmed' : 'not confirmed'}; it was not checked again.`));
  } else {
    points.append(el('li', report.responseRecovered
      ? 'Result: the client software confirmed that it received the service result.'
      : 'Result: receipt by the client software is not confirmed.'));
  }
  if (report.mode === 'naive') {
    points.append(el('li', 'Retry: this comparison deliberately created a new payment authorization.'));
  } else if (run.scenario === 'baseline') {
    points.append(el('li', 'Recovery: the request completed without an interruption.'));
  } else if (run.scenario === 'concurrent') {
    points.append(el('li', 'Recovery: two simultaneous requests used the same authorization.'));
  } else if (run.scenario === 'before-submit') {
    points.append(el('li', `${run.source === 'SIMULATED' ? 'Simulation: ' : ''}an error happened before payment submission; the runner retried the same signed authorization automatically.`));
  } else {
    points.append(el('li', `${run.source === 'SIMULATED' ? 'Simulation: ' : 'Recovery: '}the original purchase was retried instead of creating a new authorization.`));
  }
  summary.append(points);
  return summary;
}
function technical(report, run) {
  const d = el('details', undefined, 'technical'); d.dataset.key = report.purchaseId;
  d.append(el('summary', 'Inspect Stellar evidence and measurements'));
  d.append(el('p', `Engine verdict: ${report.verdict} · Purchase: ${report.purchaseId}`));
  d.append(el('p', `Price: ${report.expectedAmountAtomic} atomic units. Observed amount: ${report.settledAmountAtomic}. Fees excluded.`));
  d.append(el('p', `Server-measured recovery: ${run.source !== 'SIMULATED' && Number.isFinite(report.recoveryMs) ? report.recoveryMs + ' ms' : 'not measured'}. Unknown observations: ${report.unknownObservations ?? 'not reported'}.`));
  for (const t of report.transfers) {
    const row = el('div', undefined, 'transfer');
    row.append(el('div', `Amount: ${t.amountAtomic} · Ledger: ${t.ledger}`), el('div', `Asset: ${t.tokenContract}`), el('div', `From: ${t.from}`), el('div', `To: ${t.to}`));
    if (run.source !== 'SIMULATED' && /^[a-f0-9]{64}$/i.test(t.txHash)) {
      const a = el('a', `Open transaction ${t.txHash}`); a.href = `https://stellar.expert/explorer/testnet/tx/${t.txHash}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; row.append(a);
    } else row.append(el('div', `Transaction hash: ${t.txHash}`));
    d.append(row);
  }
  if (!report.transfers.length) d.append(el('p', 'No transfer is available. This does not prove that no payment occurred.'));
  return d;
}
function reportCard(report, run) {
  const simulated = run.source === 'SIMULATED';
  const archived = run.source === 'ARCHIVE';
  const overpaid = BigInt(report.settledAmountAtomic) > BigInt(report.expectedAmountAtomic);
  const paid = BigInt(report.settledAmountAtomic) > 0n;
  const label = report.verdict === 'PASS'
    ? archived ? 'Payment reported as confirmed' : 'Payment confirmed'
    : report.verdict === 'UNKNOWN' ? 'Payment status unknown'
      : report.verdict === 'UNSUPPORTED' ? 'Evidence unsupported'
        : overpaid ? 'Customer overpaid' : 'Payment not verified';
  const card = el('article', undefined, `panel report ${report.mode}`);
  card.append(el('p', appOf(report, run), 'eyebrow'), el('h3', report.mode === 'naive' ? 'Pay again on retry' : 'Recover the same purchase'));
  const evidence = el('div', undefined, 'payment-evidence');
  evidence.append(el('h4', 'Payment evidence'), badge(`${simulated ? 'Fictional · ' : archived ? 'Historical · ' : ''}${label}`, report.verdict));
  if (report.verdict === 'UNKNOWN') {
    const nextStep = simulated
      ? 'This fictional result does not establish any real payment state.'
      : archived
        ? 'This is a historical snapshot, not the current payment status. Check the original Testnet run before deciding what to do.'
        : 'Do not create a new payment yet. Check the facilitator and Stellar evidence again, or reconcile manually.';
    evidence.append(el('p', nextStep, 'evidence-next-step'));
  }
  card.append(evidence);
  const count = new Set(report.transfers.map(t => t.txHash).filter(Boolean)).size;
  const metrics = el('div', undefined, 'metrics');
  metrics.append(metric(paid ? xlm(report.settledAmountAtomic) : 'Not established', simulated ? 'Fictional payment' : 'Observed payment', `${count} ${simulated ? 'fictional' : 'observed'} settlement(s) · fees excluded`));
  metrics.append(metric(report.responseRecovered ? 'Yes' : 'Not confirmed', 'Result received?', report.responseRecovered ? 'Receipt confirmed by the client software.' : 'No receipt acknowledgment is available.'));
  const clientTime = Number.isFinite(report.recoveryDurationMs);
  const ms = clientTime ? report.recoveryDurationMs : report.recoveryMs;
  const measured = !simulated && Number.isFinite(ms);
  metrics.append(metric(measured ? `${(ms / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} s` : 'Not measured', 'Recovery time', measured ? (clientTime ? 'Since the client detected the interruption.' : 'Since the server recorded the interruption.') + ' Restart included.' : 'No complete duration is available.'));
  card.append(metrics);
  let explanation = report.verdict === 'PASS' ? 'One expected payment and a received result are confirmed.' : overpaid ? `The observed amount exceeds the price by ${xlm((BigInt(report.settledAmountAtomic) - BigInt(report.expectedAmountAtomic)).toString())}.` : 'The available evidence cannot confirm a successful purchase.';
  if (report.mode === 'naive') explanation += ' This demo mode deliberately creates a new payment authorization.';
  if (simulated) explanation = 'Fictional example. ' + explanation;
  card.append(el('p', explanation, 'explanation'));
  card.append(plainSummary(report, run, overpaid, paid));
  if (run.source !== 'SIMULATED') {
    const contracts = [...new Set([report.tokenContract, ...report.transfers.map(transfer => transfer.tokenContract)])]
      .filter(contract => stellarContractUrl(contract));
    if (contracts.length) {
      const explorerLinks = el('div', undefined, 'explorer-links');
      explorerLinks.append(el('span', 'Testnet contracts'));
      for (const [index, contract] of contracts.entries()) {
        const link = el('a', contracts.length === 1 ? 'View contract on Stellar Expert ↗' : `Contract ${index + 1} on Stellar Expert ↗`);
        link.href = stellarContractUrl(contract);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        explorerLinks.append(link);
      }
      card.append(explorerLinks);
    }
  }
  const checkpoint = run.checkpoints?.find(c => c.purchaseId === report.purchaseId);
  if (checkpoint) card.append(el('p', `Before recovery: ${checkpoint.verdict === 'UNKNOWN' ? 'unknown status' : checkpoint.verdict}, receipt ${checkpoint.responseRecovered ? 'confirmed' : 'not confirmed'}. After: ${label.toLowerCase()}.`, 'checkpoint'));
  card.append(technical(report, run)); return card;
}
function render() {
  controls(); $('history').replaceChildren();
  const filter = $('history-filter').value;
  const visibleRuns = state.runs.filter(run => filter === 'ALL' || run.source === filter);
  if (!visibleRuns.length) $('history').append(el('p', state.runs.length ? 'No experiments match this source.' : 'Your first run will appear here.', 'muted'));
  if (!visibleRuns.some(run => run.runId === selected)) selected = visibleRuns[0]?.runId;
  for (const run of visibleRuns) {
    const b = el('button', titleOf(run), `history-item ${selected === run.runId ? 'active' : ''}`);
    b.setAttribute('aria-pressed', String(selected === run.runId));
    b.append(el('small', `${run.source === 'ARCHIVE' ? 'Multiple purchases' : apps[run.application] ?? 'Application not specified'} · ${statusText[run.status]}`), el('small', sourceText[run.source]), el('small', new Date(run.startedAt).toLocaleString('en-GB')));
    b.onclick = () => { selected = run.runId; render(); }; $('history').append(b);
  }
  const run = visibleRuns.find(r => r.runId === selected);
  if (!run) {
    $('detail').replaceChildren(el('div', 'Choose a source with saved experiments to see its results.', 'empty'));
    return;
  }
  const detail = $('detail');
  const open = new Set([...detail.querySelectorAll('details[open]')].map(n => n.dataset.key));
  detail.replaceChildren();
  const heading = el('div', undefined, 'panel run-heading'); const title = el('div');
  title.append(badge(sourceText[run.source], run.source), el('h2', titleOf(run)), el('p', statusText[run.status]));
  if (run.source === 'ARCHIVE') title.append(el('p', 'Saved results; no new network verification was performed. Multiple purchases may come from different scenarios.'));
  if (run.source === 'ARCHIVE' && isPackageIntegration(run)) title.append(el('p', 'This invoice-check API was built by our team and installed from an archive outside the repository. It has not been piloted by an external customer. The campaign runs separately from the dashboard.'));
  if (run.source === 'SIMULATED') title.append(el('p', 'These results are fictional. No network payment was made.'));
  const download = el('a', '↓ Download evidence (JSON)'); download.href = `/api/runs/${encodeURIComponent(run.runId)}/export`; download.download = '';
  heading.append(title, download); detail.append(heading);
  if (run.status === 'RUNNING') detail.append(el('p', 'The experiment is running. Wait for evidence before drawing conclusions about payment.', 'panel notice'));
  if (run.status === 'INTERRUPTED') detail.append(el('p', 'Execution interrupted. Purchases without a report remain uncertain. Keep authorizations for recovery.', 'panel notice'));
  if (run.scenario === 'comparison' && run.reports.length === 2) detail.append(el('p', 'Same failure, two strategies: compare the amount paid and whether the result arrived. These cards represent two separate demo purchases.', 'comparison-note'));
  const reports = el('div', undefined, 'reports');
  const ordered = run.scenario === 'comparison' ? [...run.reports].sort((a, b) => (a.mode === 'naive' ? 0 : 1) - (b.mode === 'naive' ? 0 : 1)) : run.reports;
  for (const report of ordered) reports.append(reportCard(report, run)); detail.append(reports);
  if (!run.reports.length) detail.append(el('div', 'Payment: unknown. Receipt: not confirmed. No final report is available yet.', 'panel empty'));
  const timeline = el('details', undefined, 'panel'); timeline.dataset.key = 'timeline'; timeline.append(el('summary', 'View technical timeline'));
  const list = el('ol', undefined, 'timeline'); for (const e of run.timeline) { const li = el('li'); li.append(el('time', new Date(e.at).toLocaleTimeString('en-GB')), el('span', e.message)); list.append(li); } timeline.append(list); detail.append(timeline);
  for (const d of detail.querySelectorAll('details')) d.open = open.has(d.dataset.key);
  const announcement = `${titleOf(run)}: ${statusText[run.status]}, ${run.reports.length} report(s) available.`;
  if ($('announcement').textContent !== announcement) $('announcement').textContent = announcement;
}
async function refresh() {
  try {
    const response = await fetch('/api/state', { signal: AbortSignal.timeout(5000) }); if (!response.ok) throw new Error();
    const next = await response.json(); reachable = true; $('connection').textContent = ''; controls();
    if (JSON.stringify(next) === previous) return;
    previous = JSON.stringify(next); state = next;
    if (!$('scenario').options.length) for (const [id, [label]] of Object.entries(scenarios)) if (state.scenarios.some(s => s.id === id)) { const o = el('option', label); o.value = id; $('scenario').append(o); }
    describe(); render();
  } catch { reachable = false; controls(); $('connection').textContent = 'Connection to the lab lost. Showing the latest results received; retrying automatically.'; }
}
for (const id of ['scenario', 'source', 'application']) $(id).onchange = () => { describe(); controls(); };
$('history-filter').onchange = () => render();
const confirmation = $('testnet-confirmation');
confirmation.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    confirmation.close();
  }
});
confirmation.addEventListener('cancel', event => {
  event.preventDefault();
  confirmation.close();
});
confirmation.addEventListener('close', () => {
  if ($('launch').disabled) $('balance-title').focus();
});
function confirmTestnetRun() {
  if (typeof confirmation.showModal !== 'function') {
    $('error').textContent = 'This browser cannot open the Testnet confirmation safely. Use a current browser before running this experiment.';
    return;
  }
  const scenario = scenarios[$('scenario').value]?.[0] ?? $('scenario').value;
  const application = apps[$('application').value] ?? $('application').value;
  const maxPayments = $('scenario').value === 'comparison' ? 3 : 1;
  $('testnet-confirmation-summary').textContent = `You selected “${scenario}” for ${application}. This run can submit up to ${maxPayments} settlement${maxPayments === 1 ? '' : 's'} using 0.01 test XLM each.`;
  confirmation.showModal();
}
async function startRun() {
  pending = true; controls(); $('error').textContent = '';
  try {
    const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ChaosPay-Local': '1' }, body: JSON.stringify({ scenario: $('scenario').value, source: $('source').value, application: $('application').value }), signal: AbortSignal.timeout(15000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Unable to start this experiment.');
    selected = result.runId; previous = ''; await refresh(); $('balance-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { $('error').textContent = e.name === 'TimeoutError' ? 'The start could not be confirmed. Check the experiment list before trying again.' : e.message; }
  finally { pending = false; controls(); }
}
$('launch').onclick = () => {
  $('error').textContent = '';
  if ($('source').value === 'TESTNET') confirmTestnetRun();
  else startRun();
};
$('confirm-testnet').onclick = () => {
  confirmation.close();
  startRun();
};
if (['127.0.0.1', 'localhost'].includes(location.hostname) && location.port === '3002') {
  await refresh();
  setInterval(refresh, 2000);
}
