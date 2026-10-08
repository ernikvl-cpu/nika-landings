(() => {
  const form = document.querySelector('[data-property-quiz]');
  const hasBudgetStep = Boolean(form.querySelector('[data-step="budget"]'));
  const hasWorkVisaStep = Boolean(form.querySelector('[data-step="work-visa"]'));
  const turkish = form.dataset.language === 'tr';
  const steps = [...document.querySelectorAll('[data-step]')];
  const progressLabel = document.getElementById('progress-label');
  const progressNumber = document.getElementById('progress-number');
  const progressBar = document.getElementById('progress-bar');
  const stepCount = document.getElementById('step-count');
  const progress = {
    intro: ['Your guide starts here', 0, hasWorkVisaStep ? 'About 1 minute' : hasBudgetStep ? 'About 45 seconds' : 'About 30 seconds'],
    purpose: [hasWorkVisaStep ? 'Question 1 of 4' : hasBudgetStep ? 'Question 1 of 3' : 'Question 1 of 2', hasWorkVisaStep ? 20 : 30, hasWorkVisaStep ? 'Step 1 of 4' : hasBudgetStep ? 'Step 1 of 3' : 'Step 1 of 2'],
    'work-visa': ['Question 2 of 4', 40, 'Step 2 of 4'],
    purchase: [hasWorkVisaStep ? 'Question 3 of 4' : hasBudgetStep ? 'Question 2 of 3' : 'Question 2 of 2', 60, hasWorkVisaStep ? 'Step 3 of 4' : hasBudgetStep ? 'Step 2 of 3' : 'Step 2 of 2'],
    budget: [hasWorkVisaStep ? 'Question 4 of 4' : 'Question 3 of 3', 80, hasWorkVisaStep ? 'Step 4 of 4' : 'Step 3 of 3'],
    human: ['One quick check', 90, 'Human check'],
    contact: ['Almost done', 95, 'Contact details'],
    ineligible: ['Thank you', 100, 'Quiz complete'],
    success: ['Complete', 100, 'Thank you']
  };
  if (form.querySelector('[data-step="timing"]')) {
    // nika-landings: квиз с 4 вопросами (цель → тип → бюджет → сроки)
    Object.assign(progress, {
      intro: [progress.intro[0], 0, 'About 1 minute'],
      purpose: ['Question 1 of 4', 20, 'Step 1 of 4'],
      purchase: ['Question 2 of 4', 40, 'Step 2 of 4'],
      budget: ['Question 3 of 4', 60, 'Step 3 of 4'],
      timing: ['Question 4 of 4', 80, 'Step 4 of 4']
    });
  }
  if (turkish) {
    Object.assign(progress, {
      intro: ['Rehberiniz burada başlıyor', 0, 'Yaklaşık 1 dakika'],
      purpose: ['4 sorudan 1.si', 20, '1 / 4'],
      'work-visa': ['4 sorudan 2.si', 40, '2 / 4'],
      purchase: ['4 sorudan 3.sü', 60, '3 / 4'],
      budget: ['4 sorudan 4.sü', 80, '4 / 4'],
      human: ['Kısa bir kontrol', 90, 'Doğrulama'],
      contact: ['Neredeyse tamam', 95, 'İletişim bilgileri'],
      ineligible: ['Teşekkürler', 100, 'Test tamamlandı'],
      success: ['Tamamlandı', 100, 'Teşekkürler']
    });
  }

  // воронка квиза в пиксель: каждый шаг — отдельное событие (один раз за визит), чтобы видеть, где уходят люди
  const FUNNEL = { purpose: 'QuizStart', purchase: 'Quiz2Unit', budget: 'Quiz3Budget', timing: 'Quiz4Timing',
    human: 'Quiz5Check', contact: 'Quiz6Contact' };
  const tracked = new Set();
  function trackStep(name) {
    const ev = FUNNEL[name];
    if (!ev || tracked.has(ev) || typeof window.fbq !== 'function') return;
    tracked.add(ev);
    const budget = (form.querySelector('[name="investment_budget"]:checked') || {}).value;
    try { window.fbq('trackCustom', ev, { quiz: form.dataset.formName || document.title, ...(budget ? { budget } : {}) }); } catch (e) { /* аналитика не мешает квизу */ }
  }

  function show(name) {
    trackStep(name);
    document.body.dataset.quizStep = name;
    form.dataset.quizFinished = name === 'contact' || name === 'success' ? 'true' : 'false';
    form.dataset.disqualified = name === 'ineligible' ? 'true' : 'false';
    steps.forEach((step) => { step.hidden = step.dataset.step !== name; });
    const [label, percent, count] = progress[name];
    progressLabel.textContent = label;
    progressNumber.textContent = `${percent}%`;
    progressBar.style.width = `${percent}%`;
    stepCount.textContent = count;
    if (name !== 'intro') {
      const heading = document.querySelector(`[data-step="${name}"] legend, [data-step="${name}"] h2`);
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  document.body.dataset.quizStep = 'intro';
  document.querySelector('[data-start]').addEventListener('click', () => {
    window.NikaLeadCapture?.markQuizStarted(form);
    show('purpose');
  });
  document.querySelectorAll('[data-next]').forEach((button) => {
    button.addEventListener('click', () => {
      const fieldset = button.closest('fieldset');
      if (fieldset.dataset.step === 'human') {
        const answer = fieldset.querySelector('[name="human_check"]');
        if (answer.reportValidity()) show(button.dataset.next);
        return;
      }
      const selected = fieldset.querySelector('input[type="radio"]:checked');
      if (selected) show(selected.dataset.quizDisqualify || button.dataset.next);
    });
  });
  document.querySelectorAll('[data-back]').forEach((button) => {
    button.addEventListener('click', () => show(button.dataset.back));
  });
  form.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener('change', () => {
      const group = input.closest('fieldset[data-step]');
      if (group) {
        const next = group.querySelector('[data-next]');
        next.disabled = false;
        show(input.dataset.quizDisqualify || next.dataset.next);
      }
      const telegram = document.querySelector('[data-telegram-handle]');
      if (input.name === 'messenger') telegram.hidden = input.value !== 'Telegram';
    });
  });
  document.addEventListener('nika:lead-sent', (event) => {
    if (event.detail?.confirmed && event.detail?.formId === form.id) show('success');
  });
  document.addEventListener('nika:lead-duplicate', (event) => {
    if (event.detail?.formId === form.id) show('success');
  });
})();
