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
    window.fbq('track', 'Lead', params, { eventID: d.leadId });
    if (budget && budget !== (form.dataset.lowBudgetValue || 'Up to $300K')) {
      window.fbq('trackCustom', 'QualifiedBudget', { ...params, budget }, { eventID: d.leadId + ':qb' });
    }
  });
}(window, document));
