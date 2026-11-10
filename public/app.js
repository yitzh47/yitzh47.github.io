(() => {
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || document.querySelector('input[name="_csrf"]')?.value || '';
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  const getCookie = (n) => document.cookie.split('; ').find((c) => c.startsWith(n + '='))?.split('=')[1];
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
  const toast = (msg) => { const t = document.createElement('div'); t.className = 'toast'; t.role = 'status'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); };
  const track = (name, params) => { window.gtag?.('event', name, params); window.fbq?.('track', name, params); };

  // ---- Age gate ----
  const gate = document.getElementById('age-gate');
  if (gate && getCookie('age_ok') !== '1') {
    gate.hidden = false; document.body.style.overflow = 'hidden';
    gate.querySelector('[data-age-yes]')?.addEventListener('click', async () => {
      await post('/age-verify', {}).catch(() => {});
      document.cookie = 'age_ok=1; path=/; max-age=2592000; samesite=lax';
      gate.remove(); document.body.style.overflow = ''; schedulePopup();
    });
  }

  // ---- Lead capture popup (timed + exit intent), suppressed for existing subscribers ----
  const popup = document.getElementById('lead-popup');
  const popupAllowed = () => popup && getCookie('lead') !== '1' && !store.get('popup_dismissed') && !document.getElementById('age-gate') && !/^\/(checkout|cart|admin)/.test(location.pathname);
  const openPopup = (why) => { if (!popupAllowed() || !popup.hidden) return; popup.hidden = false; track('lead_popup_view', { trigger: why }); };
  const closePopup = () => { popup.hidden = true; store.set('popup_dismissed', String(Date.now())); };
  function schedulePopup() {
    if (!popup) return;
    setTimeout(() => openPopup('timer'), 20000);
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget && e.clientY < 10) openPopup('exit_intent'); });
  }
  if (!gate || getCookie('age_ok') === '1') schedulePopup();
  popup?.addEventListener('click', (e) => { if (e.target === popup || e.target.closest('[data-close-popup]')) closePopup(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popup && !popup.hidden) closePopup(); });

  // ---- Lead forms (AJAX with graceful fallback) ----
  document.querySelectorAll('[data-lead-form]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = form.querySelector('.form-msg'); const btn = form.querySelector('button');
    const data = Object.fromEntries(new FormData(form));
    if (popup && !popup.hidden && form.closest('#lead-popup')) data.source = 'popup';
    btn.disabled = true;
    try {
      const res = await post('/leads', data); const json = await res.json();
      msg.classList.toggle('err', !json.ok); msg.textContent = json.message || (json.ok ? 'Thanks!' : 'Something went wrong.');
      if (json.ok) { form.querySelector('input[type=email]').value = ''; track('generate_lead', { source: data.source }); store.set('popup_dismissed', '1'); }
    } catch { msg.classList.add('err'); msg.textContent = 'Network error, please try again.'; }
    btn.disabled = false;
  }));

  // ---- Cart ----
  const setCount = (n) => document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = n; });
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-add-to-cart]'); if (!btn) return;
    e.preventDefault();
    const qty = Number(btn.closest('form')?.querySelector('[name=qty]')?.value || 1);
    btn.disabled = true;
    const res = await post('/api/cart', { productId: Number(btn.dataset.addToCart), qty, add: true });
    const json = await res.json(); btn.disabled = false;
    if (json.ok) { setCount(json.count); toast('Added to cart ✓'); track('add_to_cart', { items: [{ item_id: btn.dataset.addToCart, quantity: qty }] }); }
    else toast(json.message || 'Could not add to cart');
  });
  document.querySelectorAll('[data-cart-qty]').forEach((input) => input.addEventListener('change', async () => {
    await post('/api/cart', { productId: Number(input.dataset.cartQty), qty: Number(input.value) });
    location.reload();
  }));

  // ---- Checkout: capture email early for abandoned-cart recovery ----
  document.querySelectorAll('[data-capture-email]').forEach((input) => input.addEventListener('blur', () => {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value)) post('/api/cart/email', { email: input.value }).catch(() => {});
  }));
  if (location.pathname === '/checkout') track('begin_checkout', {});

  // ---- Order status polling (awaiting payment webhook) ----
  const poll = document.querySelector('[data-poll-order]');
  if (poll) {
    let tries = 0;
    const tick = async () => {
      const res = await fetch(`/api/orders/${encodeURIComponent(poll.dataset.pollOrder)}/status`, { credentials: 'same-origin' });
      const json = await res.json().catch(() => ({}));
      if (json.status && json.status !== 'pending') return location.reload();
      if (++tries < 40) setTimeout(tick, 3000);
    };
    setTimeout(tick, 2000);
  }

  // ---- Misc ----
  document.querySelectorAll('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));
  document.querySelectorAll('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
  document.querySelectorAll('[data-counter]').forEach((el) => {
    const hint = document.createElement('small'); el.after(hint);
    const upd = () => { hint.textContent = `${el.value.length} / ${el.dataset.counter} recommended`; hint.style.color = el.value.length > Number(el.dataset.counter) ? 'var(--danger)' : 'var(--muted)'; };
    el.addEventListener('input', upd); upd();
  });
})();
