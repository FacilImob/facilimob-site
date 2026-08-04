const WHATSAPP_BASE_URL = 'https://wa.me/5543936181186';
const WHATSAPP_URL = `${WHATSAPP_BASE_URL}?text=${encodeURIComponent('Olá, quero saber mais sobre a Garantia FacilImob para alugar sem fiador.')}`;

handleSupabaseLinkHash();

const menuButton = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-site-nav]');

menuButton?.addEventListener('click', () => {
  const isOpen = nav?.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(Boolean(isOpen)));
});

nav?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    nav.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
  }
});

const animatedElements = document.querySelectorAll('[data-animate]');
const counters = document.querySelectorAll('[data-count]');

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  animatedElements.forEach((element) => revealObserver.observe(element));

  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.target instanceof HTMLElement) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  counters.forEach((counter) => counterObserver.observe(counter));
} else {
  animatedElements.forEach((element) => element.classList.add('is-visible'));
  counters.forEach((counter) => {
    counter.textContent = counter.getAttribute('data-count') || '0';
  });
}

const form = document.querySelector('[data-whatsapp-form]');
const status = document.querySelector('[data-form-status]');

form?.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!(form instanceof HTMLFormElement)) return;

  const formData = new FormData(form);
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const message = [
    'Olá, quero saber mais sobre a Garantia FacilImob para alugar sem fiador.',
    '',
    `Nome: ${name}`,
    `E-mail: ${email}`,
    `Telefone: ${phone}`
  ].join('\n');

  setStatus('Abrindo WhatsApp com seus dados...');
  form.reset();
  window.open(`${WHATSAPP_BASE_URL}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
});

function setStatus(message) {
  if (status) status.textContent = message;
}

function animateCounter(element) {
  const target = Number(element.getAttribute('data-count') || '0');
  const duration = 900;
  const start = performance.now();

  const tick = (time) => {
    const progress = Math.min((time - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(target * eased));

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
}

async function handleSupabaseLinkHash() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) return;

  try {
    const response = await fetch('/api/auth/session-from-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken
      })
    });

    if (!response.ok) throw new Error('Falha no login.');

    window.history.replaceState({}, document.title, '/');
    window.location.href = '/site-admin.html';
  } catch {
    window.location.href = '/login.html';
  }
}
