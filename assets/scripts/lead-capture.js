(function () {
  if (window.NikaLeadCapture) return;

  const sourceScript = document.currentScript;
  if (!sourceScript) return;

  const pageConfig = {
    endpoint: sourceScript.dataset.endpoint || '',
    landingName: sourceScript.dataset.landingName || document.title,
    offerName: sourceScript.dataset.offerName || '',
    formname: sourceScript.dataset.formname || ''
  };
  const pendingForms = new WeakMap();
  const botChecks = new WeakMap();
  const recentQuizLeads = new Map();
  const duplicateWindowMs = 30 * 60 * 1000;
  let storageSalt = Math.random().toString(36).slice(2);

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function controlByName(form, name) {
    const escapedName = String(name).replace(/["\\]/g, '\\$&');
    return form.querySelector(`[name="${escapedName}"]`);
  }

  function byNames(form, names) {
    for (const name of names) {
      const element = form.elements.namedItem(name);
      const value = element && 'value' in element ? text(element.value) : '';
      if (value) return value;
    }
    return '';
  }

  function formDataObject(form) {
    const result = {};
    new FormData(form).forEach((value, key) => {
      if (value instanceof File) return;
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        result[key] = Array.isArray(result[key]) ? result[key] : [result[key]];
        result[key].push(value);
      } else {
        result[key] = value;
      }
    });
    return result;
  }

  function labelFor(form, name) {
    const control = controlByName(form, name);
    if (!control) return name;
    const label = control.labels && control.labels[0]
      ? control.labels[0]
      : control.closest('label');
    return text(label && label.textContent) || name;
  }

  function answerList(form, fields) {
    const skipped = new Set([
      'name', 'first_name', 'firstname', 'last_name', 'phone', 'contact',
      'tel', 'telephone', 'email', 'e_mail', 'telegram', 'tg', 'whatsapp',
      'messenger', 'preferred_contact', 'contact_method', 'privacy_consent',
      'consent', 'project', 'offer_name', 'website', 'human_check'
    ]);

    return Object.keys(fields)
      .filter((key) => !skipped.has(key))
      .map((key) => ({
        field: key,
        question: labelFor(form, key),
        answer: fields[key]
      }));
  }

  function quizFormName(form, baseName, answers) {
    if (form.dataset.includeQuizAnswers !== 'true') return baseName;
    const byField = new Map(answers.map(item => [item.field, item.answer]));
    const clean = value => text(value).replace(/[|\r\n]+/g, ' ').slice(0, 120);
    const goal = clean(byField.get('purchase_goal'));
    const workVisa = clean(byField.get('work_visa'));
    const market = clean(byField.get('preferred_market'));
    const approach = clean(byField.get('purchase_approach'));
    const budget = clean(byField.get('investment_budget'));
    const parts = [baseName];
    if (goal) parts.push(`Goal: ${goal}`);
    if (workVisa) parts.push(`Work visa: ${workVisa}`);
    if (market) parts.push(`City: ${market}`);
    if (approach) parts.push(`Purchase format: ${approach}`);
    if (budget) parts.push(`Budget: ${budget}`);
    return parts.join(' | ');
  }

  function getUtm() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content: params.get('utm_content') || '',
      utm_term: params.get('utm_term') || ''
    };
  }

  function createLeadId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function quizLeadToken(payload) {
    if (payload.form_type !== 'Квиз' || !payload.dedupe_key) return '';
    try {
      const storage = window.localStorage;
      if (storage) {
        storageSalt = storage.getItem('nika_lead_salt_v1') || storageSalt;
        storage.setItem('nika_lead_salt_v1', storageSalt);
      }
    } catch (_) { /* In-memory protection still works when storage is unavailable. */ }
    const value = `${storageSalt}|${payload.dedupe_key.toLowerCase()}`;
    let first = 2166136261;
    let second = 2246822519;
    for (let i = 0; i < value.length; i += 1) {
      first = Math.imul(first ^ value.charCodeAt(i), 16777619);
      second = Math.imul(second ^ value.charCodeAt(i), 3266489917);
    }
    return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
  }

  function recentQuizSubmission(token) {
    if (!token) return false;
    let sentAt = recentQuizLeads.get(token) || 0;
    try {
      const stored = Number(window.localStorage?.getItem(`nika_quiz_sent_${token}`));
      if (Number.isFinite(stored)) sentAt = Math.max(sentAt, stored);
    } catch (_) { /* Storage can be disabled by the browser. */ }
    return sentAt > 0 && Date.now() - sentAt < duplicateWindowMs;
  }

  function rememberQuizSubmission(token) {
    if (!token) return;
    const sentAt = Date.now();
    recentQuizLeads.set(token, sentAt);
    try { window.localStorage?.setItem(`nika_quiz_sent_${token}`, String(sentAt)); }
    catch (_) { /* Keep the in-memory guard. */ }
  }

  function initBotCheck(form) {
    if (form.dataset.botProtection !== 'true') return;
    const question = form.querySelector('[data-human-question]');
    const answer = form.elements.namedItem('human_check');
    if (!question || !answer) return;
    const left = 2 + Math.floor(Math.random() * 6);
    const right = 2 + Math.floor(Math.random() * 6);
    question.textContent = `${left} + ${right} = ?`;
    botChecks.set(form, { answer: left + right, startedAt: performance.now() });
    const wrongAnswer = form.dataset.language === 'tr'
      ? 'İşlemin sonucunu kontrol edin.'
      : form.dataset.language === 'en'
        ? 'Please check the answer to the sum.'
        : 'Проверьте ответ на пример.';
    if (typeof answer.addEventListener === 'function' && typeof answer.setCustomValidity === 'function') {
      answer.addEventListener('input', () => {
        answer.setCustomValidity(text(answer.value) && text(answer.value) !== String(left + right)
          ? wrongAnswer : '');
      });
    }
  }

  function botCheckError(form) {
    if (form.dataset.botProtection !== 'true') return '';
    const language = form.dataset.language;
    const messages = language === 'tr'
      ? {
          unavailable: 'Kontrol yüklenemedi. Sayfayı yenileyip tekrar deneyin.',
          failed: 'Başvuru doğrulanamadı. Sayfayı yenileyip tekrar deneyin.',
          answer: 'İşlemin sonucunu kontrol edin.',
          questions: 'Lütfen tüm soruları yanıtlayın.',
          wait: 'Birkaç saniye bekleyip tekrar deneyin.'
        }
      : language === 'en'
        ? {
            unavailable: 'The check did not load. Refresh the page and try again.',
            failed: 'We could not verify the request. Refresh and try again.',
            answer: 'Please check the answer to the sum.',
            questions: 'Please answer every quiz question.',
            wait: 'Wait a few seconds and try again.'
          }
        : {
            unavailable: 'Проверка формы не загрузилась. Обновите страницу и попробуйте снова.',
            failed: 'Не удалось проверить заявку. Обновите страницу и попробуйте снова.',
            answer: 'Проверьте ответ на вопрос под формой.',
            questions: 'Ответьте на все вопросы.',
            wait: 'Подождите несколько секунд и отправьте заявку ещё раз.'
          };
    const check = botChecks.get(form);
    if (!check) return messages.unavailable;
    const trap = form.elements.namedItem('website');
    if (trap && text(trap.value)) return messages.failed;
    const answer = form.elements.namedItem('human_check');
    if (!answer || text(answer.value) !== String(check.answer)) {
      return messages.answer;
    }
    if (form.matches('[data-quiz-form]')) {
      const allAnswered = [...form.querySelectorAll('fieldset[data-step]')]
        .filter((step) => step.dataset.step !== 'human')
        .every((step) => Boolean(step.querySelector('input[type="radio"]:checked')));
      if (!allAnswered || form.dataset.quizFinished !== 'true') return messages.questions;
    }
    const minimumTime = form.matches('[data-quiz-form]') ? 7000 : 3000;
    if (performance.now() - check.startedAt < minimumTime) {
      return messages.wait;
    }
    return '';
  }

  function markQuizStarted(form) {
    const check = botChecks.get(form);
    if (check) check.startedAt = performance.now();
  }

  function buildPayload(form) {
    const fields = formDataObject(form);
    const answers = answerList(form, fields);
    const fullName = byNames(form, ['name', 'first_name', 'firstname']);
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const isQuiz = form.matches('[data-quiz-form], .quiz-form')
      || Boolean(form.querySelector('[data-quiz-next]'));
    const preferredContact = byNames(form, ['messenger', 'preferred_contact', 'contact_method']);
    const offerName = text(form.dataset.offerName || fields.offer_name || pageConfig.offerName);
    const generalContact = byNames(form, ['contact']);
    const explicitPhone = byNames(form, ['phone', 'tel', 'telephone']);
    const explicitTelegram = byNames(form, ['telegram', 'tg']);
    const phone = explicitPhone || (generalContact.startsWith('@') ? '' : generalContact);
    const telegram = explicitTelegram || (generalContact.startsWith('@') ? generalContact : '');
    const utm = getUtm();

    return {
      lead_id: createLeadId(),
      received_at: new Date().toISOString(),
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
      form_type: isQuiz ? 'Квиз' : 'Мини-лид-форма',
      landing_name: text(form.dataset.landingName || pageConfig.landingName),
      offer_name: offerName,
      landing_url: window.location.origin + window.location.pathname,
      page_url: window.location.href,
      referrer: document.referrer || '',
      channel: utm.utm_source || 'direct',
      form_id: form.id || form.dataset.formId || '',
      form_name: quizFormName(form, text(form.getAttribute('aria-label') || form.dataset.formName || form.className), answers),
      first_name: nameParts.shift() || '',
      last_name: nameParts.join(' '),
      phone,
      email: byNames(form, ['email', 'e_mail']),
      telegram,
      whatsapp: byNames(form, ['whatsapp']),
      city_country: byNames(form, ['city_country', 'city', 'country']),
      preferred_contact: preferredContact,
      privacy_consent: form.querySelector('[name="privacy_consent"], [name="consent"]')
        ? byNames(form, ['privacy_consent', 'consent'])
        : 'Да',
      answers,
      tags: [
        text(form.dataset.landingName || pageConfig.landingName),
        offerName,
        isQuiz ? 'Квиз' : 'Мини-форма'
      ].filter(Boolean),
      dedupe_key: [(phone || telegram || byNames(form, ['email'])).replace(/[^\dA-Za-z@.]/g, '').toLowerCase(), window.location.pathname, offerName]
        .filter(Boolean)
        .join('|'),
      ...utm
    };
  }

  function isDisqualified(form) {
    const field = form.dataset.disqualifyField;
    return form.dataset.disqualified === 'true'
      || Boolean(field && formDataObject(form)[field] === form.dataset.disqualifyValue);
  }

  function send(form) {
    if (!pageConfig.endpoint || isDisqualified(form) || !form.checkValidity() || botCheckError(form)) return Promise.resolve(false);
    if (pendingForms.has(form)) return pendingForms.get(form);

    const payload = buildPayload(form);
    const token = quizLeadToken(payload);
    if (recentQuizSubmission(token)) {
      form.dataset.nikaDuplicate = 'true';
      document.dispatchEvent(new CustomEvent('nika:lead-duplicate', {
        detail: { formId: payload.form_id }
      }));
      return Promise.resolve(false);
    }
    form.dataset.nikaDuplicate = 'false';
    // nika-landings: заявка идёт на наш сервер (antifraud-msk, wh.nikasecure.ru/proxy) в формате Tilda,
    // formname выбирает воронку/тег в TILDA_FORMNAME_AMO; бюджет «Up to $300K» → formname-minbudget.
    // Таблица и Apps Script nika-estate не используются (пилот идёт параллельно с подрядчиком).
    const params = new URLSearchParams(window.location.search);
    const fields = formDataObject(form);
    const low = fields.investment_budget === (form.dataset.lowBudgetValue || 'Up to $300K');
    const body = new URLSearchParams({
      formname: low ? (form.dataset.formnameLow || pageConfig.formname + '_minbudget') : pageConfig.formname,
      name: [payload.first_name, payload.last_name].filter(Boolean).join(' '),
      phone: payload.phone, email: payload.email || '', pageurl: payload.page_url,
      lead_id: payload.lead_id, fbclid: params.get('fbclid') || ''
    });
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => body.set(k, payload[k] || ''));
    ['purchase_goal', 'unit_type', 'investment_budget', 'messenger', 'telegram'].forEach((k) => {
      if (fields[k]) body.set(k, fields[k]);
    });
    const request = fetch(pageConfig.endpoint, {
      method: 'POST',
      mode: 'cors',
      body,
      keepalive: true
    }).then(async (response) => {
      if (!response.ok || response.type === 'opaque') return false;
      const result = await response.json().catch(() => ({}));
      if (result.ok === false) return false;

      rememberQuizSubmission(token);

      document.dispatchEvent(new CustomEvent('nika:lead-sent', {
        detail: {
          confirmed: true,
          leadId: payload.lead_id,
          formType: payload.form_type === 'Квиз' ? 'quiz' : 'mini_form',
          formId: payload.form_id,
          landingName: payload.landing_name,
          offerName: payload.offer_name
        }
      }));
      return true;
    }).catch(() => false).finally(() => pendingForms.delete(form));
    pendingForms.set(form, request);
    return request;
  }

  function init(root) {
    (root || document).querySelectorAll('form').forEach((form) => {
      if (form.dataset.nikaLeadBound === 'true') return;
      if (!form.querySelector('[name="phone"], [name="contact"], [name="email"]')) return;
      initBotCheck(form);
      form.dataset.nikaLeadBound = 'true';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (isDisqualified(form)) return;
        if (!form.checkValidity()) {
          form.reportValidity();
          return;
        }
        const botError = botCheckError(form);
        if (botError) {
          const status = form.querySelector('[data-form-status], .form-success');
          if (status) status.textContent = botError;
          return;
        }
        if (form.dataset.nikaSubmitting === 'true') return;
        const status = form.querySelector('[data-form-status], .form-success');
        const language = form.dataset.language;
        const messages = language === 'tr'
          ? {
              unavailable: 'Başvurunuz gönderilemedi. Lütfen daha sonra tekrar deneyin.',
              sending: 'Başvurunuz gönderiliyor…',
              confirmed: 'Başvurunuz alındı. Nika Estate danışmanı seçtiğiniz kanaldan sizinle iletişime geçecek.',
              duplicate: 'Başvurunuz zaten alındı. Rehberi tekrar açabilirsiniz.',
              failed: 'Başvurunuz doğrulanamadı. Lütfen tekrar deneyin.'
            }
          : language === 'en'
            ? {
                unavailable: 'We could not send your request. Please try later.',
                sending: 'Sending your request…',
                confirmed: 'Request received. A Nika Estate advisor will contact you via your chosen channel.',
                duplicate: 'We already received your request. You can open the guide again.',
                failed: 'We could not confirm your request. Please try again.'
              }
            : {
                unavailable: 'Не удалось отправить заявку. Попробуйте позже.',
                sending: 'Отправляем заявку…',
                confirmed: 'Заявка отправлена. Брокер Nika Estate свяжется с вами выбранным способом.',
                duplicate: 'Мы уже получили вашу заявку. Гайд можно открыть повторно.',
                failed: 'Не удалось подтвердить отправку заявки. Попробуйте ещё раз.'
              };
        if (!pageConfig.endpoint) {
          if (status) status.textContent = messages.unavailable;
          return;
        }
        form.dataset.nikaSubmitting = 'true';
        const buttons = [...form.querySelectorAll('button[type="submit"], input[type="submit"]')];
        const disabledBefore = buttons.map((button) => button.disabled);
        if (status) status.textContent = messages.sending;
        // Build the payload before disabling controls. No messenger redirect or fallback.
        const request = send(form);
        buttons.forEach((button) => { button.disabled = true; });
        form.setAttribute('aria-busy', 'true');
        const confirmed = await request;
        if (status) status.textContent = confirmed ? messages.confirmed
          : form.dataset.nikaDuplicate === 'true' ? messages.duplicate : messages.failed;
        buttons.forEach((button, index) => { button.disabled = disabledBefore[index]; });
        form.setAttribute('aria-busy', 'false');
        form.dataset.nikaSubmitting = 'false';
      }, true);
    });
  }

  window.NikaLeadCapture = { init, send, buildPayload, markQuizStarted };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(document));
  } else {
    init(document);
  }
}());
