export function initSchedulerSelectionWidget(
  container: HTMLElement,
  onChange: (schedulerType: string) => void,
  radioGroupName = 'scheduler'
): void {
  const schedulerRadiosContainer = document.createElement('div');
  schedulerRadiosContainer.style.display = 'flex';
  schedulerRadiosContainer.style.flexDirection = 'column';
  schedulerRadiosContainer.style.gap = '4px';
  schedulerRadiosContainer.style.fontSize = '12px';
  container.appendChild(schedulerRadiosContainer);

  const schedulers = [
    { value: 'linear', label: 'α=t, β=1-t' },
    { value: 'sqrt', label: 'α=t, β=√(1-t)' },
    { value: 'inverse-sqrt', label: 'α=t, β=1-t²' },
    { value: 'constant', label: 'α=t, β=√(1-t²)', checked: true },
    { value: 'sqrt-sqrt', label: 'α=√t, β=√(1-t)' },
    { value: 'circular-circular', label: 'α=sin(πt/2), β=cos(πt/2)' }
  ];

  const schedulerRadios: HTMLInputElement[] = [];
  schedulers.forEach(({ value, label, checked }) => {
    const radioLabel = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = radioGroupName;
    radio.value = value;
    if (checked === true) { radio.checked = true; }
    schedulerRadios.push(radio);
    radioLabel.appendChild(radio);
    radioLabel.appendChild(document.createTextNode(` ${label}`));
    schedulerRadiosContainer.appendChild(radioLabel);
  });

  schedulerRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        onChange(radio.value);
      }
    });
  });
}
