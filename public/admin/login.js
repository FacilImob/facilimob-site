const emailForm = document.querySelector('#emailForm');
const codeForm = document.querySelector('#codeForm');
const statusBox = document.querySelector('#status');
const sentTo = document.querySelector('[data-sent-to]');
const tokenInput = codeForm.elements.token;
const resendButton = document.querySelector('[data-resend]');
const changeEmailButton = document.querySelector('[data-change-email]');

let currentEmail = '';
let sending = false;

emailForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending) return;

  const email = emailForm.elements.email.value.trim().toLowerCase();

  try {
    await withBusy(emailForm.querySelector('button[type="submit"]'), 'Enviando...', async () => {
      await requestCode(email);
    });
    showCodeStep(email);
    showStatus('Codigo enviado. Verifique seu e-mail.', 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  }
});

codeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await verifyCode();
});

tokenInput.addEventListener('input', async () => {
  tokenInput.value = tokenInput.value.replace(/\D/g, '').slice(0, 6);
  if (tokenInput.value.length === 6) await verifyCode();
});

resendButton.addEventListener('click', async () => {
  if (!currentEmail || sending) return;

  try {
    await withBusy(resendButton, 'Reenviando...', async () => {
      await requestCode(currentEmail);
    });
    tokenInput.value = '';
    tokenInput.focus();
    showStatus('Novo codigo enviado.', 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  }
});

changeEmailButton.addEventListener('click', () => {
  codeForm.hidden = true;
  emailForm.hidden = false;
  emailForm.elements.email.focus();
  showStatus('', '');
});

async function requestCode(email) {
  await api('/api/admin/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

async function verifyCode() {
  const token = tokenInput.value.replace(/\D/g, '');
  if (token.length !== 6 || sending) return;

  try {
    tokenInput.disabled = true;
    await api('/api/admin/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email: currentEmail, token })
    });
    window.location.href = '/admin/';
  } catch (error) {
    tokenInput.disabled = false;
    tokenInput.value = '';
    tokenInput.focus();
    showStatus(error.message, 'error');
  }
}

function showCodeStep(email) {
  currentEmail = email;
  sentTo.textContent = `Enviamos o codigo para ${email}.`;
  emailForm.hidden = true;
  codeForm.hidden = false;
  tokenInput.disabled = false;
  tokenInput.value = '';
  tokenInput.focus();
}

async function withBusy(button, label, action) {
  const original = button.textContent;
  sending = true;
  button.disabled = true;
  button.textContent = label;

  try {
    return await action();
  } finally {
    sending = false;
    button.disabled = false;
    button.textContent = original;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Nao foi possivel concluir a acao.');
  }

  return data;
}

function showStatus(message, type) {
  statusBox.textContent = message;
  statusBox.className = `admin-status ${type || ''}`.trim();
}
