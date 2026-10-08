// nika-landings: только наш пиксель пилота (ID задаётся в <head> страницы). Метрика и пиксель подрядчика не используются.
// Lead — любая подтверждённая заявка; QualifiedBudget — бюджет от $300K (план пилота: можно учить рекламу сразу).
(function (window, document) {
  if (window.NikaAnalytics) return;
  window.NikaAnalytics = true;
  const tracked = new Set();
  document.addEventListener('nika:lead-sent', (event) => {
    const d = event.detail || {};
    if (d.confirmed !== true || !d.leadId || tracked.has(d.leadId) || typeof window.fbq !== 'function') return;
    tracked.add(d.leadId);
    const form = d.formId && document.getElementById(d.formId);
    const budget = form ? (new FormData(form).get('investment_budget') || '') : '';
    const params = { content_name: d.landingName || document.title, form_type: d.formType || '' };
    // расширенное сопоставление: пиксель сам хеширует email/телефон/имя — Meta точнее узнаёт человека
    try {
      const fd = form ? new FormData(form) : null;
      const pixel = window.fbq.getState && window.fbq.getState().pixels[0];
      const user = { external_id: d.leadId };
      const ph = fd ? String(fd.get('phone') || '').replace(/\D/g, '') : '';
      const em = fd ? String(fd.get('email') || '').trim().toLowerCase() : '';
      const fn = fd ? String(fd.get('name') || '').trim().split(/\s+/)[0].toLowerCase() : '';
      if (ph) user.ph = ph;
      if (em) user.em = em;
      if (fn) user.fn = fn;
      if (pixel && pixel.id) window.fbq('init', pixel.id, user);
    } catch (e) { /* без сопоставления событие всё равно уйдёт */ }
    window.fbq('track', 'Lead', params, { eventID: d.leadId });
    if (budget && budget !== (form.dataset.lowBudgetValue || 'Up to $300K')) {
      window.fbq('trackCustom', 'QualifiedBudget', { ...params, budget }, { eventID: d.leadId + ':qb' });
    }
  });
}(window, document));
