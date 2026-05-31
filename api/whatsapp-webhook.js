// ============================================================
// CLINIFLOW - WEBHOOK 360DIALOG
// Version 3.8 — Sofia como CLOSER
// - Idioma bloqueado (no cambia)
// - Estados de conversacion (no repite preguntas)
// - Precios siempre desde Supabase
// - Solo deriva a telefono en emergencia
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const DIALOG360_API_KEY = process.env.DIALOG360_API_KEY;
const CEO_PHONE = process.env.CEO_PHONE;

const processedMessages = new Set();

const URGENCY_KEYWORDS = [
  'dolor intenso','sangrado','emergencia','urgente','accidente',
  'fractura','hinchado','fiebre','me desmaye','golpe','me cai',
  'severe pain','bleeding','emergency','urgent','accident',
  'fracture','swollen','fever','fainted',
  'hitno','bol','krvarenje','nesreca',
  'dringend','schmerzen','blutung','notfall',
];

const LIFE_THREATENING = [
  'no respira','not breathing','perdida de conocimiento',
  'unconscious','sangrado severo','severe bleeding',
];

// ─── LANGUAGE — bloqueado desde primer mensaje ────────────────

function detectLanguage(text) {
  const t = text.toLowerCase();
  if (/\b(hola|gracias|buenos|quiero|tengo|cita|dentista|me gustaria|cuanto|limpieza)\b/.test(t)) return 'es';
  if (/\b(bonjour|merci|je veux)\b/.test(t)) return 'fr';
  if (/\b(hallo|danke|ich|zahnarzt)\b/.test(t)) return 'de';
  if (/\b(hvala|zelim|zubar|dobar|zelim)\b/.test(t)) return 'hr';
  return 'en';
}

function getLockedLang(context, detectedLang) {
  return context?.context_json?.locked_lang || detectedLang;
}

// ─── URGENCY ──────────────────────────────────────────────────

function detectUrgency(text) {
  const t = text.toLowerCase();
  if (LIFE_THREATENING.some(kw => t.includes(kw))) return 'life_threatening';
  if (URGENCY_KEYWORDS.some(kw => t.includes(kw))) return 'urgent';
  return 'normal';
}

// ─── EXTRACT BOOKING DATA FROM MESSAGE ───────────────────────

function extractBookingData(message, current = {}) {
  const m = message.toLowerCase();
  const d = { ...current };

  if (!d.treatment) {
    if (/limpieza|cleaning|čišćenje|profilaxis/.test(m)) d.treatment = 'Limpieza dental';
    else if (/implante|implant|implantati/.test(m))      d.treatment = 'Implantes';
    else if (/blanquea|whiten|izbjeljivanje/.test(m))     d.treatment = 'Blanqueamiento';
    else if (/ortodoncia|ortodoncija|braces/.test(m))     d.treatment = 'Ortodoncia';
    else if (/empaste|filling|plomba/.test(m))            d.treatment = 'Empaste';
    else if (/consulta|pregled|checkup|revision/.test(m)) d.treatment = 'Consulta general';
  }

  if (!d.day) {
    if (/lunes|monday/.test(m))       d.day = 'lunes';
    else if (/martes|tuesday/.test(m)) d.day = 'martes';
    else if (/miercoles|wednesday/.test(m)) d.day = 'miercoles';
    else if (/jueves|thursday/.test(m)) d.day = 'jueves';
    else if (/viernes|friday/.test(m)) d.day = 'viernes';
    else if (/sabado|saturday/.test(m)) d.day = 'sabado';
    else if (/hoy|today/.test(m))      d.day = 'hoy';
    else if (/manana|tomorrow/.test(m)) d.day = 'manana';
  }

  if (!d.time) {
    const tMatch = m.match(/a\s+las?\s+(\d{1,2})(?::(\d{2}))?|(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|h\b)/);
    if (tMatch) {
      const raw = tMatch[1] || tMatch[3];
      let hour = parseInt(raw);
      if ((/tarde|pm/.test(m)) && hour < 12) hour += 12;
      const mins = tMatch[2] || tMatch[4] || '00';
      d.time = `${hour}:${mins}`;
    }
  }

  if (!d.phone) {
    const pm = message.match(/\+?[\d][\d\s\-()]{7,14}[\d]/);
    if (pm && pm[0].replace(/\D/g, '').length >= 8) d.phone = pm[0].trim();
  }

  return d;
}

function bookingState(d) {
  if (d.treatment && d.day && d.time && d.name) return 'ready_to_book';
  if (d.treatment && (d.day || d.time))          return 'has_treatment';
  if (d.treatment)                                return 'has_treatment';
  return 'start';
}

// ─── HELPERS ─────────────────────────────────────────────────

function detectIntent(message) {
  const m = message.toLowerCase();
  if (/cita|appointment|agendar|reservar|booking/.test(m)) return 'booking';
  if (/cancelar|cancel/.test(m)) return 'cancel';
  if (/precio|price|cuanto|cuesta/.test(m)) return 'info';
  return 'unknown';
}

function detectTreatment(message) {
  const m = message.toLowerCase();
  if (/limpieza|cleaning/.test(m)) return 'Limpieza';
  if (/implante|implant/.test(m))  return 'Implante';
  if (/blanquea|whitening/.test(m)) return 'Blanqueamiento';
  return 'Consulta General';
}

function extractName(message) {
  const patterns = [
    /(?:soy|me llamo|mi nombre es)\s+([A-Za-z\u00C0-\u024F]+)/i,
    /(?:I am|my name is|I'm)\s+([A-Za-z]+)/i,
  ];
  for (const p of patterns) {
    const match = message.match(p);
    if (match) return match[1];
  }
  return null;
}

function updateSummary(prev, msg, resp) {
  const entry = `P: ${msg.substring(0, 80)} | S: ${resp.substring(0, 80)}`;
  if (!prev) return entry;
  return prev.split('\n').slice(-2).concat(entry).join('\n');
}

function getFallback(lang, phone) {
  const msgs = {
    es: `Estamos procesando tu mensaje. Para urgencias llama al ${phone || 'la clinica'}.`,
    en: `Processing your message. For urgent matters call ${phone || 'the clinic'}.`,
    hr: `Obradujemo vasu poruku. Hitno nazovite ${phone || 'kliniku'}.`,
  };
  return msgs[lang] || msgs['es'];
}

// ─── BUILD SOFIA PROMPT V2 — CLOSER ──────────────────────────

function buildSofiaPrompt(clinic, context, lang, treatments, doctors, settings, bookingData) {

  const langInstr = {
    es: 'RESPONDE SIEMPRE EN ESPAÑOL. Aunque recibas texto en otro idioma del sistema, responde al paciente en español.',
    en: 'RESPOND ALWAYS IN ENGLISH. Never switch languages.',
    hr: 'UVIJEK ODGOVARAJ NA HRVATSKOM. Nikad ne mijenjaj jezik.',
    fr: 'RÉPONDS TOUJOURS EN FRANÇAIS.',
    de: 'ANTWORTE IMMER AUF DEUTSCH.',
  }[lang] || 'Respond in the SAME language as the patient. Never change language.';

  // Lo que Sofia ya sabe — no volver a preguntar
  const knows = [];
  if (bookingData.name)      knows.push(`✓ Nombre: ${bookingData.name}`);
  if (bookingData.treatment) knows.push(`✓ Tratamiento: ${bookingData.treatment}`);
  if (bookingData.day)       knows.push(`✓ Dia: ${bookingData.day}`);
  if (bookingData.time)      knows.push(`✓ Hora: ${bookingData.time}`);
  if (bookingData.phone)     knows.push(`✓ Telefono: ${bookingData.phone}`);

  const knownSection = knows.length > 0
    ? `YA TIENES ESTA INFORMACION — NO VUELVAS A PREGUNTAR:\n${knows.join('\n')}`
    : 'Primera interaccion con este paciente.';

  // Tratamientos con precios reales
  let priceList = 'Sin tratamientos configurados.';
  if (treatments?.length > 0) {
    const curr = clinic.currency || 'EUR';
    priceList = treatments
      .filter(t => t.active !== false)
      .map(t => {
        if (t.price_mode === 'exact' || t.price_mode === 'fixed')
          return `• ${t.name}: ${curr} ${t.price}`;
        if (t.price_mode === 'from')
          return `• ${t.name}: desde ${curr} ${t.price}${t.price_max ? ` hasta ${curr} ${t.price_max}` : ''}`;
        return `• ${t.name}: precio a consultar`;
      }).join('\n');
  }

  const canBook = settings?.sofia_can_book !== false;
  const schedule = `Lun-Vie: ${clinic.hours_mon_fri || '09:00-18:00'} | Sab: ${clinic.hours_saturday || 'Cerrado'}`;

  const nextStep = !bookingData.treatment ? 'Pregunta por el tratamiento que necesita.'
    : (!bookingData.day || !bookingData.time) ? 'Ya sabes el tratamiento. Pregunta solo dia y hora preferida.'
    : !bookingData.name ? 'Ya tienes tratamiento, dia y hora. Pide solo el nombre completo para confirmar.'
    : 'Tienes toda la informacion. Confirma la cita con todos los detalles y di que el equipo les contactara para confirmar.';

  return `Eres Sofia, recepcionista y asistente IA de ${clinic.name}.
OBJETIVO: Convertir cada mensaje en una CITA AGENDADA. Eres proactiva y directa.

${langInstr}

DATOS DE LA CLINICA:
• Horario: ${schedule}
• Telefono: ${clinic.phone || '+385 20 123 456'} (solo para emergencias medicas)
• Direccion: ${clinic.address || 'Dubrovnik'}

${knownSection}

TRATAMIENTOS Y PRECIOS (FUENTE OFICIAL — USA SOLO ESTOS):
${priceList}

REGLA ABSOLUTA DE PRECIOS:
Si el tratamiento esta en la lista → da el precio exacto de la lista.
NUNCA digas "llama para consultar precio" si el precio existe arriba.
Solo di "llama" si el tratamiento NO existe en la lista.

SIGUIENTE PASO EN EL AGENDAMIENTO:
${nextStep}

${canBook ? `REGLAS DE AGENDAMIENTO:
• NUNCA digas "llama a la clinica" para agendar. Tu puedes hacerlo.
• NUNCA derives a recepcion para confirmar precio si el precio esta en la lista.
• Cuando tengas: tratamiento + dia + hora + nombre → confirma la cita directamente.
• Ejemplo de confirmacion: "Perfecto [nombre], te he registrado para [tratamiento] el [dia] a las [hora]. El equipo de ${clinic.name} te confirmara por este chat. ¿Algo mas en que pueda ayudarte?"
` : 'Para agendar citas escribe RECEPCION.'}

CUANDO DERIVAR A RECEPCION O TELEFONO (SOLO EN ESTOS CASOS):
• El paciente escribe "RECEPCION"
• Emergencia medica (dolor severo, sangrado, accidente)
• Pregunta que no puedes resolver (resultado de examen, historial medico)
• EN NINGUN OTRO CASO

REGLAS MEDICAS:
Si menciona dolor intenso, sangrado, accidente, fractura, fiebre:
→ "Entiendo que es urgente. Llama a la clinica: ${clinic.phone}. Emergencias: 112."
Si riesgo de vida: "Llama al 112 ahora. Es una emergencia medica."

ESTILO:
• Maximo 3 oraciones. Sin excepciones.
• Directo y calido. Sin palabreria innecesaria.
• Una sola pregunta al final, especifica.
• No repitas lo que el paciente ya dijo.
${context?.message_count === 0 || !context ? '\nEn este primer mensaje agrega: "Si prefieres hablar con alguien, escribe RECEPCION."' : ''}`;
}

// ─── LOG EVENT ────────────────────────────────────────────────

async function logEvent(step, data = {}, phone = null) {
  try {
    const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/webhook_logs';
    await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        step, phone: phone || null,
        data: typeof data === 'string' ? { message: data } : data,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (e) { /* silencioso */ }
}

// ─── SUPABASE ─────────────────────────────────────────────────

async function sbGet(path) {
  const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error('Supabase GET ' + res.status + ': ' + text.substring(0, 200));
  return text ? JSON.parse(text) : null;
}

async function sbPost(path, body, prefer) {
  const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': prefer || 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) console.error('[sbPost]', res.status, text.substring(0, 150));
  return text ? JSON.parse(text) : null;
}

async function getClinic() {
  const data = await sbGet('clinics?select=*&limit=1');
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function getTreatments(clinicId) {
  try {
    const data = await sbGet(`treatments?select=*&clinic_id=eq.${clinicId}&order=name.asc`);
    return Array.isArray(data) ? data : [];
  } catch (e) { return []; }
}

async function getDoctors(clinicId) {
  try {
    const data = await sbGet(`doctors?select=*&clinic_id=eq.${clinicId}&active=eq.true`);
    return Array.isArray(data) ? data : [];
  } catch (e) { return []; }
}

async function getSettings(clinicId) {
  try {
    const data = await sbGet(`clinic_settings?select=*&clinic_id=eq.${clinicId}&limit=1`);
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) { return null; }
}

async function getContext(clinicId, phone) {
  try {
    const data = await sbGet(
      `conversation_context?select=*&clinic_id=eq.${clinicId}&phone=eq.${encodeURIComponent(phone)}&limit=1`
    );
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) { return null; }
}

async function upsertContext(clinicId, phone, updates) {
  try {
    await sbPost(
      'conversation_context',
      { clinic_id: clinicId, phone, ...updates, updated_at: new Date().toISOString() },
      'resolution=merge-duplicates'
    );
  } catch (e) { console.error('upsertContext:', e.message); }
}

async function saveMessage(clinicId, phone, message, response, type) {
  try {
    await sbPost('messages', {
      clinic_id: clinicId, patient_phone: phone,
      patient_message: message, sofia_response: response,
      response_type: type || 'ai', created_at: new Date().toISOString(),
    });
  } catch (e) { /* silencioso */ }
}

async function saveLead(clinicId, phone, name, treatment) {
  try {
    await sbPost('leads', {
      clinic_id: clinicId, patient_name: name || 'Paciente WhatsApp',
      phone, source: 'whatsapp', status: 'nuevo',
      treatment_interest: treatment, created_at: new Date().toISOString(),
    });
  } catch (e) { /* silencioso */ }
}

// ─── SEND WHATSAPP ────────────────────────────────────────────

async function sendMessage(to, body) {
  const res = await fetch('https://waba-v2.360dialog.io/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'D360-API-KEY': DIALOG360_API_KEY },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to, type: 'text', text: { body }
    }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error('360dialog ' + res.status + ': ' + t.substring(0, 150));
  return JSON.parse(t);
}

// ─── CLAUDE ───────────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error('Claude HTTP ' + res.status + ': ' + err.substring(0, 150));
    }
    const data = await res.json();
    return data.content[0].text;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────

module.exports = async function handler(req, res) {

  if (req.method === 'GET') {
    const challenge = req.query['hub.challenge'];
    if (challenge) return res.status(200).send(challenge);
    return res.status(200).send('Webhook OK');
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const body = req.body;
    let phone = null, message = null, contactName = null, messageId = null;

    if (body?.entry?.[0]?.changes?.[0]?.value?.messages) {
      const value = body.entry[0].changes[0].value;
      const msg = value.messages[0];
      if (msg.type !== 'text') return res.status(200).json({ status: 'ok', skipped: 'non-text' });
      phone = msg.from;
      message = msg.text?.body?.trim();
      contactName = value?.contacts?.[0]?.profile?.name;
      messageId = msg.id;
    } else if (body?.messages?.[0]) {
      const msg = body.messages[0];
      if (msg.type !== 'text') return res.status(200).json({ status: 'ok', skipped: 'non-text' });
      phone = msg.from;
      message = msg.text?.body?.trim();
      contactName = body?.contacts?.[0]?.profile?.name;
      messageId = msg.id;
    } else {
      return res.status(200).json({ status: 'ok', note: 'status update' });
    }

    if (!phone || !message) return res.status(200).json({ status: 'ok', note: 'missing data' });

    // Deduplicacion
    if (messageId && processedMessages.has(messageId)) {
      await logEvent('DUPLICATE_IGNORED', { messageId }, phone);
      return res.status(200).json({ status: 'ok', note: 'duplicate' });
    }
    if (messageId) {
      processedMessages.add(messageId);
      if (processedMessages.size > 1000) processedMessages.clear();
    }

    await logEvent('WEBHOOK_RECEIVED', { messageId, message: message.substring(0, 50) }, phone);

    const rawLang = detectLanguage(message);
    const urgency = detectUrgency(message);

    // Obtener datos en paralelo
    let clinic = null;
    try { clinic = await getClinic(); } catch (e) { /* handled below */ }

    if (!clinic) {
      await logEvent('GET_CLINIC_NULL', {}, phone);
      await sendMessage(phone, getFallback(rawLang, null));
      return res.status(200).json({ status: 'ok', error: 'no clinic' });
    }

    // Cargar todo en paralelo
    const [context, treatments, doctors, settings] = await Promise.all([
      getContext(clinic.id, phone),
      getTreatments(clinic.id),
      getDoctors(clinic.id),
      getSettings(clinic.id),
    ]);

    // Idioma bloqueado desde el primer mensaje
    const lang = getLockedLang(context, rawLang);

    // Estado de reserva actual
    const prevBookingData = {
      name:      context?.patient_name || null,
      treatment: context?.context_json?.booking_treatment || null,
      day:       context?.context_json?.booking_day || null,
      time:      context?.context_json?.booking_time || null,
      phone:     context?.context_json?.booking_phone || null,
    };

    // Extraer nuevos datos del mensaje actual
    const bookingData = extractBookingData(message, prevBookingData);

    // Actualizar nombre si viene del contacto WhatsApp
    if (!bookingData.name && contactName) bookingData.name = contactName;
    if (!bookingData.name) bookingData.name = extractName(message);

    await logEvent('MESSAGE_PARSED', {
      lang, urgency, booking_state: bookingState(bookingData),
      knows: Object.entries(bookingData).filter(([,v]) => v).map(([k]) => k),
    }, phone);

    // Urgencia vital
    if (urgency === 'life_threatening') {
      await sendMessage(phone, 'Llama al 112 ahora. Esto es una emergencia medica.');
      await saveMessage(clinic.id, phone, message, 'EMERGENCY_REDIRECT', 'emergency');
      return res.status(200).json({ status: 'ok', action: 'emergency' });
    }

    // Comando RECEPCION
    if (/^recepcion|reception$/i.test(message.trim())) {
      const humanMsg = lang === 'es'
        ? `Perfecto! He notificado al equipo de ${clinic.name}. Te contactaran pronto en este chat.`
        : `Got it! I've notified ${clinic.name} team. They'll contact you shortly.`;
      await sendMessage(phone, humanMsg);
      await saveMessage(clinic.id, phone, message, humanMsg, 'human_redirect');
      return res.status(200).json({ status: 'ok', action: 'human_redirect' });
    }

    // Construir prompt con estado de conversacion
    const systemPrompt = buildSofiaPrompt(
      clinic, context, lang, treatments, doctors, settings, bookingData
    );

    await logEvent('CLAUDE_START', { lang, booking_state: bookingState(bookingData) }, phone);

    let sofiaResponse;
    try {
      sofiaResponse = await callClaude(systemPrompt, message);
      await logEvent('CLAUDE_SUCCESS', { preview: sofiaResponse.substring(0, 80) }, phone);
    } catch (claudeError) {
      await logEvent('CLAUDE_ERROR', { error: claudeError.message }, phone);
      sofiaResponse = getFallback(lang, clinic.phone);
    }

    if (urgency === 'urgent') {
      sofiaResponse = lang === 'es'
        ? `Entiendo que es urgente. Para atencion inmediata llama a la clinica: ${clinic.phone}. Para cita prioritaria responde URGENTE.`
        : `I understand this is urgent. Please call the clinic: ${clinic.phone} for immediate attention.`;
    }

    // Enviar respuesta
    await logEvent('SEND_WHATSAPP_START', { preview: sofiaResponse.substring(0, 80) }, phone);
    try {
      await sendMessage(phone, sofiaResponse);
      await logEvent('SEND_WHATSAPP_SUCCESS', {}, phone);
    } catch (sendError) {
      await logEvent('SEND_WHATSAPP_ERROR', { error: sendError.message }, phone);
      return res.status(200).json({ status: 'ok', error: 'send failed' });
    }

    // Guardar todo
    await saveMessage(clinic.id, phone, message, sofiaResponse, 'ai');

    const summary = (() => {
      const entry = `P: ${message.substring(0, 80)} | S: ${sofiaResponse.substring(0, 80)}`;
      if (!context?.summary_so_far) return entry;
      return context.summary_so_far.split('\n').slice(-2).concat(entry).join('\n');
    })();

    await upsertContext(clinic.id, phone, {
      patient_name: bookingData.name || context?.patient_name,
      last_intent: detectIntent(message),
      summary_so_far: summary,
      message_count: (context?.message_count || 0) + 1,
      context_json: {
        ...(context?.context_json || {}),
        locked_lang:        lang,
        booking_state:      bookingState(bookingData),
        booking_treatment:  bookingData.treatment,
        booking_day:        bookingData.day,
        booking_time:       bookingData.time,
        booking_phone:      bookingData.phone,
      },
    });

    if (!context) {
      await saveLead(clinic.id, phone, bookingData.name, detectTreatment(message));
    }

    await logEvent('MESSAGE_PROCESSED_OK', { clinic: clinic.name, lang }, phone);
    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    await logEvent('CRITICAL_ERROR', { error: error.message, stack: error.stack?.substring(0, 300) });
    try {
      const phone = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from
        || req.body?.messages?.[0]?.from;
      if (phone) await sendMessage(phone, 'Lo sentimos, intenta en unos minutos.');
    } catch (e) { /* silencioso */ }
    return res.status(200).json({ status: 'error', message: error.message });
  }
};
