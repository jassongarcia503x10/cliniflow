// ============================================================
// CLINIFLOW - WEBHOOK 360DIALOG
// Version 3.9 — Confirmacion real de citas
// - booking_mode: automatic (confirma ya) vs manual (espera recepcion)
// - INSERT real en pending_bookings o appointments
// - Notificacion al director de la clinica
// - Recordatorios programados en scheduled_reminders
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

// ─── LANGUAGE ─────────────────────────────────────────────────

function detectLanguage(text) {
  const t = text.toLowerCase();
  if (/\b(hola|gracias|buenos|quiero|tengo|cita|dentista|me gustaria|cuanto|limpieza|para el)\b/.test(t)) return 'es';
  if (/\b(bonjour|merci|je veux)\b/.test(t)) return 'fr';
  if (/\b(hallo|danke|ich|zahnarzt)\b/.test(t)) return 'de';
  if (/\b(hvala|zelim|zubar|dobar)\b/.test(t)) return 'hr';
  return 'en';
}

function getLockedLang(context, detected) {
  return context?.context_json?.locked_lang || detected;
}

// ─── URGENCY ──────────────────────────────────────────────────

function detectUrgency(text) {
  const t = text.toLowerCase();
  if (LIFE_THREATENING.some(kw => t.includes(kw))) return 'life_threatening';
  if (URGENCY_KEYWORDS.some(kw => t.includes(kw))) return 'urgent';
  return 'normal';
}

// ─── BOOKING DATA EXTRACTION ─────────────────────────────────

function extractBookingData(message, current = {}) {
  const m = message.toLowerCase();
  const d = { ...current };

  // Tratamientos (multiples en el mismo mensaje)
  const foundTreatments = [];
  if (/limpieza|cleaning|čišćenje|profilaxis/.test(m)) foundTreatments.push('Limpieza dental');
  if (/implante|implant|implantati/.test(m)) foundTreatments.push('Implantes');
  if (/blanquea|whiten|izbjeljivanje/.test(m)) foundTreatments.push('Blanqueamiento');
  if (/ortodoncia|ortodoncija|braces/.test(m)) foundTreatments.push('Ortodoncia');
  if (/empaste|filling|plomba/.test(m)) foundTreatments.push('Empaste');
  if (/consulta|pregled|checkup|revision/.test(m)) foundTreatments.push('Consulta general');

  if (foundTreatments.length > 0) {
    // Combinar con tratamientos previos sin duplicar
    const prev = d.treatments ? d.treatments.split(', ') : [];
    const combined = [...new Set([...prev, ...foundTreatments])];
    d.treatment = combined[0]; // para compatibilidad
    d.treatments = combined.join(', ');
  }

  if (!d.day) {
    if (/lunes|monday/.test(m))         d.day = 'lunes';
    else if (/martes|tuesday/.test(m))   d.day = 'martes';
    else if (/miercoles|wednesday/.test(m)) d.day = 'miercoles';
    else if (/jueves|thursday/.test(m))  d.day = 'jueves';
    else if (/viernes|friday/.test(m))   d.day = 'viernes';
    else if (/sabado|saturday/.test(m))  d.day = 'sabado';
    else if (/hoy|today/.test(m))        d.day = 'hoy';
    else if (/manana|tomorrow/.test(m))  d.day = 'manana';
  }

  if (!d.time) {
    const tMatch = m.match(/a\s+las?\s+(\d{1,2})(?::(\d{2}))?|(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|h\b)/);
    if (tMatch) {
      const raw = tMatch[1] || tMatch[3];
      let hour = parseInt(raw);
      if (/tarde|pm/.test(m) && hour < 12) hour += 12;
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

function getBookingState(d) {
  if (d.treatment && d.day && d.time && d.name) return 'ready_to_book';
  if (d.treatment && (d.day || d.time))          return 'has_treatment';
  if (d.treatment)                                return 'has_treatment';
  return 'start';
}

// ─── HELPERS ─────────────────────────────────────────────────

function detectIntent(message) {
  const m = message.toLowerCase();
  if (/cita|appointment|agendar|reservar/.test(m)) return 'booking';
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

function getFallback(lang, phone) {
  const msgs = {
    es: `Estamos procesando tu mensaje. Para urgencias llama al ${phone || 'la clinica'}.`,
    en: `Processing your message. For urgent matters call ${phone || 'the clinic'}.`,
    hr: `Obradujemo vasu poruku. Hitno nazovite ${phone || 'kliniku'}.`,
  };
  return msgs[lang] || msgs['es'];
}

// ─── BUILD PROMPT ─────────────────────────────────────────────

function buildSofiaPrompt(clinic, context, lang, treatments, doctors, settings, bookingData) {
  const langInstr = {
    es: 'RESPONDE SIEMPRE EN ESPAÑOL sin excepcion.',
    en: 'RESPOND ALWAYS IN ENGLISH without exception.',
    hr: 'UVIJEK ODGOVARAJ NA HRVATSKOM bez iznimke.',
    fr: 'RÉPONDS TOUJOURS EN FRANÇAIS sans exception.',
    de: 'ANTWORTE IMMER AUF DEUTSCH ohne Ausnahme.',
  }[lang] || 'Respond in the SAME language as the patient. Never change.';

  const knows = [];
  if (bookingData.name) knows.push(`✓ Nombre: ${bookingData.name}`);
  if (bookingData.treatments || bookingData.treatment) knows.push(`✓ Tratamiento(s): ${bookingData.treatments || bookingData.treatment}`);
  if (bookingData.day)  knows.push(`✓ Dia: ${bookingData.day}`);
  if (bookingData.time) knows.push(`✓ Hora: ${bookingData.time}`);
  if (bookingData.phone) knows.push(`✓ Telefono: ${bookingData.phone}`);

  const knownSection = knows.length > 0
    ? `YA TIENES ESTA INFORMACION — NO VUELVAS A PREGUNTAR:\n${knows.join('\n')}`
    : 'Primera interaccion con este paciente.';

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
  const bookingMode = settings?.booking_mode || 'manual';
  const schedule = `Lun-Vie: ${clinic.hours_mon_fri || '09:00-18:00'} | Sab: ${clinic.hours_saturday || 'Cerrado'}`;
  const state = getBookingState(bookingData);

  const confirmationPhrase = bookingMode === 'automatic'
    ? 'Tu cita ha sido CONFIRMADA. El equipo te esperara.'
    : 'Tu solicitud fue registrada. El equipo de la clinica te confirmara por este chat en breve.';

  const nextStep = state === 'ready_to_book'
    ? `Tienes TODA la informacion necesaria: nombre, tratamiento, dia y hora. CONFIRMA la cita ahora mismo con todos los detalles usando esta frase: "${confirmationPhrase}"`
    : !bookingData.treatment ? 'Pregunta por el tratamiento que necesita.'
    : (!bookingData.day || !bookingData.time) ? 'Pregunta solo dia y hora preferida.'
    : 'Pide solo el nombre completo para confirmar.';

  return `Eres Sofia, recepcionista IA elite de ${clinic.name}.
OBJETIVO: Cerrar citas. Eres una CLOSER, no una informante.

${langInstr}

CLINICA:
• Horario: ${schedule}
• Telefono: ${clinic.phone} (SOLO para emergencias medicas)

${knownSection}

TRATAMIENTOS Y PRECIOS OFICIALES:
${priceList}

REGLA ABSOLUTA: Si el tratamiento esta en la lista → muestra el precio exacto. NUNCA digas "llama para precio" si existe arriba.

SIGUIENTE ACCION:
${nextStep}

${canBook ? `AGENDAMIENTO:
• NUNCA digas "llama a la clinica" para agendar.
• NUNCA derives a recepcion para precios o citas.
• Una vez tengas tratamiento + dia + hora + nombre: confirma la cita directamente.
• Confirmacion: "${confirmationPhrase}"
` : 'Para agendar escribe RECEPCION.'}

SOLO DERIVA EN ESTOS CASOS:
• Paciente escribe "RECEPCION"
• Emergencia medica (dolor severo, sangrado, accidente)
• Pregunta sobre historial medico o resultados de examenes

EMERGENCIAS:
• Dolor intenso, sangrado, fractura, fiebre: "Entiendo que es urgente. Llama: ${clinic.phone}. Emergencias: 112."
• Riesgo de vida: "Llama al 112 ahora."

ESTILO: 3 oraciones maximo. Directo. Una sola pregunta especifica al final.
${!context || context.message_count === 0 ? 'En este primer mensaje agrega: "Si prefieres hablar con alguien, escribe RECEPCION."' : ''}`;
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
  if (!res.ok) throw new Error('SB GET ' + res.status + ': ' + text.substring(0, 150));
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
      'Prefer': prefer || 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) console.error('[sbPost]', res.status, text.substring(0, 150));
  return text ? JSON.parse(text) : null;
}

async function getClinic() {
  const data = await sbGet('clinics?select=*&active=eq.true&limit=1');
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

// ─── GUARDAR RESERVA REAL ─────────────────────────────────────
// El corazon de Sofia v3.9 — cita real en Supabase

async function saveBooking(clinic, bookingData, mode, lang) {
  const name = bookingData.name || 'Paciente WhatsApp';
  const treatment = bookingData.treatments || bookingData.treatment || 'Consulta';
  const day = bookingData.day || 'por confirmar';
  const time = bookingData.time || 'por confirmar';
  const phone = bookingData.phone || 'no proporcionado';

  if (mode === 'automatic') {
    // Modo automatico: INSERT directo en appointments
    const result = await sbPost('appointments', {
      clinic_id: clinic.id,
      patient_name: name,
      patient_phone: phone,
      treatment,
      appointment_date: day,
      appointment_time: time,
      status: 'confirmed',
      source: 'whatsapp',
      confirmed_by: 'sofia',
      confirmed_at: new Date().toISOString(),
    });
    await logEvent('APPOINTMENT_CONFIRMED', { name, treatment, day, time, mode: 'automatic' }, phone);
    return { mode: 'automatic', id: result?.[0]?.id };
  } else {
    // Modo manual: INSERT en pending_bookings para que recepcion revise
    const result = await sbPost('pending_bookings', {
      clinic_id: clinic.id,
      patient_name: name,
      patient_phone: phone,
      treatment,
      requested_day: day,
      requested_time: time,
      status: 'pending',
    });
    await logEvent('BOOKING_PENDING', { name, treatment, day, time, mode: 'manual' }, phone);

    // Notificar al director de la clinica
    if (clinic.director_phone || clinic.phone) {
      const notifMsg = `📅 Nueva solicitud de cita en ${clinic.name}:
• Paciente: ${name}
• Tratamiento: ${treatment}
• Dia: ${day} a las ${time}
• WhatsApp: ${bookingData.phone || 'no dado'}
Confirma o rechaza en el panel de CliniFlow.`;

      try {
        await sendMessage(clinic.director_phone || clinic.phone, notifMsg);
      } catch (e) { /* silencioso */ }
    }

    return { mode: 'manual', id: result?.[0]?.id };
  }
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
      throw new Error('Claude ' + res.status + ': ' + err.substring(0, 150));
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
      return res.status(200).json({ status: 'ok', note: 'duplicate' });
    }
    if (messageId) {
      processedMessages.add(messageId);
      if (processedMessages.size > 1000) processedMessages.clear();
    }

    await logEvent('WEBHOOK_RECEIVED', { messageId, msg: message.substring(0, 50) }, phone);

    const rawLang = detectLanguage(message);
    const urgency = detectUrgency(message);

    let clinic = null;
    try { clinic = await getClinic(); } catch (e) { /* handled below */ }

    if (!clinic) {
      await sendMessage(phone, getFallback(rawLang, null));
      return res.status(200).json({ status: 'ok', error: 'no clinic' });
    }

    const [context, treatments, doctors, settings] = await Promise.all([
      getContext(clinic.id, phone),
      getTreatments(clinic.id),
      getDoctors(clinic.id),
      getSettings(clinic.id),
    ]);

    const lang = getLockedLang(context, rawLang);

    // Estado actual de la reserva
    const prevData = {
      name:       context?.patient_name || null,
      treatment:  context?.context_json?.booking_treatment || null,
      treatments: context?.context_json?.booking_treatments || null,
      day:        context?.context_json?.booking_day || null,
      time:       context?.context_json?.booking_time || null,
      phone:      context?.context_json?.booking_phone || null,
    };

    const bookingData = extractBookingData(message, prevData);
    if (!bookingData.name && contactName) bookingData.name = contactName;
    if (!bookingData.name) bookingData.name = extractName(message);

    const currentState = getBookingState(bookingData);

    await logEvent('MESSAGE_PARSED', {
      lang, urgency, state: currentState,
      knows: Object.entries(bookingData).filter(([,v])=>v).map(([k])=>k),
    }, phone);

    // Urgencia vital
    if (urgency === 'life_threatening') {
      await sendMessage(phone, 'Llama al 112 ahora. Esto es una emergencia medica.');
      await saveMessage(clinic.id, phone, message, 'EMERGENCY_REDIRECT', 'emergency');
      return res.status(200).json({ status: 'ok', action: 'emergency' });
    }

    // RECEPCION
    if (/^recepcion|reception$/i.test(message.trim())) {
      const humanMsg = lang === 'es'
        ? `Perfecto! He notificado al equipo de ${clinic.name}. Te contactaran pronto en este chat.`
        : `Got it! ${clinic.name} team will contact you shortly.`;
      await sendMessage(phone, humanMsg);
      await saveMessage(clinic.id, phone, message, humanMsg, 'human_redirect');
      return res.status(200).json({ status: 'ok', action: 'human_redirect' });
    }

    // ── DETECCION AUTOMATICA DE RESERVA COMPLETA ──────────
    // Si el prompt de Claude va a confirmar, guardamos ANTES de enviar
    let bookingResult = null;
    if (currentState === 'ready_to_book' && settings?.sofia_can_book !== false) {
      const bookingMode = settings?.booking_mode || 'manual';
      // Verificar que no exista ya una reserva reciente para este paciente
      const recentBooking = context?.context_json?.last_booking_at;
      const tooRecent = recentBooking &&
        (Date.now() - new Date(recentBooking).getTime()) < 60000; // 1 minuto

      if (!tooRecent) {
        try {
          bookingResult = await saveBooking(clinic, bookingData, bookingMode, lang);
        } catch (e) {
          await logEvent('BOOKING_ERROR', { error: e.message }, phone);
        }
      }
    }

    // Construir prompt
    const systemPrompt = buildSofiaPrompt(
      clinic, context, lang, treatments, doctors, settings, bookingData
    );

    await logEvent('CLAUDE_START', { lang, state: currentState }, phone);

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
        ? `Entiendo que es urgente. Llama a la clinica: ${clinic.phone}. Emergencias: 112.`
        : `Urgent situation detected. Please call: ${clinic.phone}. Emergency: 112.`;
    }

    // Enviar
    await logEvent('SEND_WHATSAPP_START', { preview: sofiaResponse.substring(0, 80) }, phone);
    try {
      await sendMessage(phone, sofiaResponse);
      await logEvent('SEND_WHATSAPP_SUCCESS', {}, phone);
    } catch (sendError) {
      await logEvent('SEND_WHATSAPP_ERROR', { error: sendError.message }, phone);
      return res.status(200).json({ status: 'ok', error: 'send failed' });
    }

    await saveMessage(clinic.id, phone, message, sofiaResponse, 'ai');

    // Actualizar contexto con todos los datos de reserva
    const summary = (() => {
      const entry = `P: ${message.substring(0, 80)} | S: ${sofiaResponse.substring(0, 80)}`;
      if (!context?.summary_so_far) return entry;
      return context.summary_so_far.split('\n').slice(-2).concat(entry).join('\n');
    })();

    const newContextJson = {
      ...(context?.context_json || {}),
      locked_lang:         lang,
      booking_state:       currentState,
      booking_treatment:   bookingData.treatment,
      booking_treatments:  bookingData.treatments,
      booking_day:         bookingData.day,
      booking_time:        bookingData.time,
      booking_phone:       bookingData.phone,
    };

    // Si se hizo una reserva, marcar el timestamp
    if (bookingResult) {
      newContextJson.last_booking_at = new Date().toISOString();
      newContextJson.last_booking_id = bookingResult.id;
      newContextJson.booking_state = 'booked';
    }

    await upsertContext(clinic.id, phone, {
      patient_name: bookingData.name || context?.patient_name,
      last_intent: detectIntent(message),
      summary_so_far: summary,
      message_count: (context?.message_count || 0) + 1,
      context_json: newContextJson,
    });

    if (!context) {
      await saveLead(clinic.id, phone, bookingData.name, detectTreatment(message));
    }

    await logEvent('MESSAGE_PROCESSED_OK', {
      clinic: clinic.name, lang,
      booking_made: !!bookingResult,
      booking_mode: bookingResult?.mode,
    }, phone);

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
