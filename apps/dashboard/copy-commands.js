const tabs = [...document.querySelectorAll('[role="tab"]')];

function selectTab(tab, moveFocus = false) {
  for (const candidate of tabs) {
    const selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.setAttribute('tabindex', selected ? '0' : '-1');
    document.getElementById(candidate.getAttribute('aria-controls')).hidden = !selected;
  }
  if (moveFocus) tab.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    let nextIndex;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[nextIndex], true);
  });
});

document.querySelectorAll('.install-command .copy-button').forEach(button => {
  button.addEventListener('click', async () => {
    const block = button.closest('.install-command');
    const code = block.querySelector('code');
    const status = block.querySelector('.copy-status');

    try {
      await navigator.clipboard.writeText(code.textContent.trim());
      button.setAttribute('aria-label', 'Copied');
      button.setAttribute('title', 'Copied');
      status.textContent = 'Command copied to clipboard.';
    } catch {
      button.setAttribute('aria-label', 'Copy failed');
      button.setAttribute('title', 'Copy failed');
      status.textContent = 'Clipboard access failed. Select and copy the command manually.';
    }

    window.setTimeout(() => {
      button.setAttribute('aria-label', 'Copy command');
      button.setAttribute('title', 'Copy command');
      status.textContent = '';
    }, 2000);
  });
});
