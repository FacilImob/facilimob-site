export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(data?.error || 'Nao foi possivel concluir a acao.');
  }

  return data;
}

export const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

export function parseCurrency(value) {
  const normalized = String(value || '')
    .replace(/\D/g, '')
    .padStart(3, '0');
  const cents = normalized.slice(-2);
  const reais = normalized.slice(0, -2);
  return Number(`${Number(reais)}.${cents}`);
}

export function formatCpf(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function isValidCpf(value) {
  const cpf = String(value || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  const calc = (factor) => {
    let total = 0;
    for (let i = 0; i < factor - 1; i += 1) total += Number(cpf[i]) * (factor - i);
    const digit = (total * 10) % 11;
    return digit === 10 ? 0 : digit;
  };

  return calc(10) === Number(cpf[9]) && calc(11) === Number(cpf[10]);
}

export function toast(element, message, type = 'success') {
  element.textContent = message;
  element.className = `status ${type} show`;
  window.setTimeout(() => {
    element.classList.remove('show');
  }, 3500);
}
