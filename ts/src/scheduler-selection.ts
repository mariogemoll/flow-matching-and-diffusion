export function initSchedulerSelectionWidget(
  container: HTMLElement,
  onChange: (schedulerType: string) => void
): void {
  const schedulers = [
    { value: 'linear', label: 'α=t, β=1-t' },
    { value: 'sqrt', label: 'α=t, β=√(1-t)' },
    { value: 'inverse-sqrt', label: 'α=t, β=1-t²' },
    { value: 'constant', label: 'α=t, β=√(1-t²)', checked: true },
    { value: 'sqrt-sqrt', label: 'α=√t, β=√(1-t)' },
    { value: 'circular-circular', label: 'α=sin(πt/2), β=cos(πt/2)' }
  ];

  const selectLabel = document.createElement('label');
  selectLabel.textContent = 'Schedule: ';
  const select = document.createElement('select');

  schedulers.forEach(({ value, label, checked }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    if (checked === true) { option.selected = true; }
    select.appendChild(option);
  });

  selectLabel.appendChild(select);
  container.appendChild(selectLabel);

  select.addEventListener('change', () => {
    onChange(select.value);
  });
}
