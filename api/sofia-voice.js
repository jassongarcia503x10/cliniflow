// ============================================================
// CLINIFLOW - SOFIA VOICE
// api/sofia-voice.js
// Pipeline: Audio → Groq Whisper → Claude/Sofia → respuesta
// Modos: reception | copilot | ceo
// ============================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";

const SB_HEADERS = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
  "Content-Type": "application/json",
};

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function normalizeMode(mode) {
  if (mode === "doctor") return "copilot";
  if (mode === "reports") return "ceo";
  if (["reception", "copilot", "ceo"].includes(mode)) return mode;
  return "reception";
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;

  if (typeof req.body === "string") {
    return Buffer.from(req.body);
  }

  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", resolve);
    req.on("error", reject);
  });

  return Buffer.concat(chunks);
}

async function resolveClinicFromJWT(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);

  const userRes = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: "Bearer " + token,
    },
  });

  if (!userRes.ok) return null;

  const user = await userRes.json();
  if (!user.id) return null;

  const clinicUserRes = await fetch(
    SUPABASE_URL +
      "/rest/v1/clinic_users?select=clinic_id,role&user_id=eq." +
      encodeURIComponent(user.id) +
      "&limit=1",
    { headers: SB_HEADERS }
  );

  const clinicUsers = await clinicUserRes.json();

  if (!Array.isArray(clinicUsers) || clinicUsers.length === 0) return null;

  return {
    user,
    clinic_id: clinicUsers[0].clinic_id,
    role: clinicUsers[0].role || "staff",
  };
}

async function sbSelect(path) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    headers: SB_HEADERS,
  });

  const data = await r.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function getClinicContext(clinicId) {
  if (!clinicId) {
    return {
      clinic: null,
      priceList: "Consultar con la clínica",
      todayAppointments: [],
      patients: [],
      doctors: [],
      metrics: {},
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  const [
    clinics,
    treatments,
    doctors,
    patients,
    appointments,
  ] = await Promise.all([
    sbSelect("clinics?select=*&id=eq." + encodeURIComponent(clinicId) + "&limit=1"),
    sbSelect("treatments?select=*&clinic_id=eq." + encodeURIComponent(clinicId)),
    sbSelect("doctors?select=*&clinic_id=eq." + encodeURIComponent(clinicId)),
    sbSelect("patients?select=*&clinic_id=eq." + encodeURIComponent(clinicId) + "&active=eq.true&limit=20"),
    sbSelect(
      "appointments?select=*&clinic_id=eq." +
        encodeURIComponent(clinicId) +
        "&start_time=gte." +
        today +
        "T00:00:00&start_time=lt." +
        today +
        "T23:59:59&order=start_time.asc"
    ),
  ]);

  const clinic = clinics[0] || null;
  const curr = clinic?.currency || "€";

  const priceList =
    treatments && treatments.length
      ? treatments
          .filter(t => t.active !== false)
          .map(t => {
            const price =
              t.price_mode === "from"
                ? "desde " + curr + t.price
                : t.price
                ? curr + t.price
                : "consultar precio";
            return "• " + t.name + ": " + price;
          })
          .join("\n")
      : "Consultar con la clínica";

  const revenueToday = appointments
    .filter(a => a.status === "completed")
    .reduce((sum, a) => sum + Number(a.total_cost || a.price || 0), 0);

  const metrics = {
    today_appointments: appointments.length,
    confirmed: appointments.filter(a => a.status === "confirmed").length,
    completed: appointments.filter(a => a.status === "completed").length,
    pending: appointments.filter(a => a.status === "pending").length,
    no_show: appointments.filter(a => a.status === "no_show").length,
    revenue_today: revenueToday,
    patients_count: patients.length,
    doctors_count: doctors.length,
  };

  return {
    clinic,
    priceList,
    todayAppointments: appointments,
    patients,
    doctors,
    metrics,
  };
}

function buildSystemPrompt(mode, ctx) {
  const clinic = ctx.clinic;
  const name = clinic?.name || "la clínica";
  const phone = clinic?.phone || "consultar con recepción";
  const hours = clinic?.hours_mon_fri || "9:00-18:00";

  if (mode === "copilot") {
    const agenda = ctx.todayAppointments
      .map(a => {
        return {
          hora: a.start_time,
          paciente: a.patient_name || a.patient_id || "Paciente",
          doctor: a.doctor_name || a.doctor_id || "Doctor",
          estado: a.status || "pending",
          motivo: a.reason || a.treatment || "",
        };
      })
      .slice(0, 20);

    const patientContext = ctx.patients
      .map(p => {
        return {
          nombre: p.name,
          telefono: p.phone,
          alergias: p.allergies || [],
          notas: p.notes || "",
        };
      })
      .slice(0, 20);

    return `Eres Sofía, copiloto clínico interno de ${name}.

Tu usuario es personal autorizado de la clínica. Puedes ayudar con agenda, pacientes, flujo operativo y apoyo clínico general.

DATOS REALES DISPONIBLES:
Agenda de hoy:
${JSON.stringify(agenda, null, 2)}

Pacientes activos recientes:
${JSON.stringify(patientContext, null, 2)}

REGLAS:
1. Responde como asistente clínica profesional, clara y humana.
2. Si preguntan por pacientes, usa los datos reales disponibles.
3. Si hay alergias, alertas o riesgos, menciónalos claramente.
4. No inventes datos que no estén en el contexto.
5. No des diagnóstico definitivo; la decisión final es del odontólogo.
6. Responde en el idioma del usuario.`;
  }

  if (mode === "ceo") {
    return `Eres Sofía, asistente ejecutiva de ${name}.

Tu trabajo es explicar métricas, ingresos, rendimiento, agenda y operación de la clínica.

MÉTRICAS REALES:
${JSON.stringify(ctx.metrics, null, 2)}

REGLAS:
1. Sé directa, ejecutiva y útil.
2. Si faltan datos, dilo claramente.
3. Da recomendaciones accionables.
4. Responde en el idioma del usuario.`;
  }

  return `Eres Sofía, recepcionista IA de ${name}.

Horario: ${hours}
Teléfono: ${phone}

TRATAMIENTOS Y PRECIOS:
${ctx.priceList || "Consultar con la clínica"}

REGLAS:
1. Responde máximo en 2-3 oraciones.
2. Usa precios reales de la lista. Nunca inventes precios.
3. Para agendar, pide nombre, tratamiento, día y hora.
4. Nunca reveles información privada de pacientes en modo recepción.
5. Nunca diagnostiques enfermedades.
6. En urgencias, indica: "Llama a ${phone} o al 112."
7. Responde en el idioma del usuario.`;
}

async function transcribeWithGroq(audioBuffer, contentType) {
  const formData = new FormData();

  const mime = contentType.includes("audio/") ? contentType.split(";")[0] : "audio/webm";
  const ext = mime.includes("wav") ? "wav" : mime.includes("mp4") ? "mp4" : "webm";

  const audioBlob = new Blob([audioBuffer], { type: mime });
  formData.append("file", audioBlob, "audio." + ext);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "json");

  const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + GROQ_API_KEY,
    },
    body: formData,
  });

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    throw new Error("Groq Whisper error " + whisperRes.status + ": " + errText.substring(0, 300));
  }

  const whisperData = await whisperRes.json();
  return (whisperData.text || "").trim();
}

async function askClaude(systemPrompt, transcript) {
  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 350,
      system: systemPrompt,
      messages: [{ role: "user", content: transcript }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    throw new Error("Claude API error " + claudeRes.status + ": " + err.substring(0, 300));
  }

  const claudeData = await claudeRes.json();
  return claudeData.content?.[0]?.text || "Lo siento, no pude procesar tu mensaje.";
}

async function saveMessages(clinicId, transcript, reply) {
  if (!clinicId) return;

  const base = SUPABASE_URL + "/rest/v1/messages";

  const headers = {
    ...SB_HEADERS,
    Prefer: "return=minimal",
  };

  await Promise.all([
    fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        clinic_id: clinicId,
        patient_name: "Voz",
        patient_phone: "voice",
        content: transcript,
        direction: "inbound",
      }),
    }),
    fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        clinic_id: clinicId,
        patient_name: "Sofía IA",
        patient_phone: "sofia",
        content: reply,
        direction: "outbound",
      }),
    }),
  ]);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return json(res, 500, {
      error: "Supabase no configurado",
      fix: "Configura SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel.",
    });
  }

  if (!GROQ_API_KEY) {
    return json(res, 500, {
      error: "GROQ_API_KEY no configurada",
      fix: "Agrega GROQ_API_KEY en Vercel → Settings → Environment Variables.",
    });
  }

  if (!CLAUDE_API_KEY) {
    return json(res, 500, {
      error: "CLAUDE_API_KEY no configurada",
      fix: "Agrega CLAUDE_API_KEY en Vercel → Settings → Environment Variables.",
    });
  }

  const authContext = await resolveClinicFromJWT(req.headers.authorization);
  const clinicId = authContext?.clinic_id || null;

  const mode = normalizeMode(req.query.mode || "reception");
  const contentType = req.headers["content-type"] || "";

  if (!contentType.startsWith("audio/") && contentType !== "application/octet-stream") {
    return json(res, 400, {
      error: "Content-Type debe ser audio/webm, audio/wav, audio/mp4 o application/octet-stream",
    });
  }

  let audioBuffer;

  try {
    audioBuffer = await readRawBody(req);
  } catch (e) {
    return json(res, 400, { error: "No se pudo leer el audio: " + e.message });
  }

  if (!audioBuffer || audioBuffer.length < 800) {
    return json(res, 400, {
      error: "Audio vacío o demasiado corto",
      info: "Habla al menos 1 segundo cerca del micrófono.",
    });
  }

  let transcript = "";

  try {
    transcript = await transcribeWithGroq(audioBuffer, contentType);
  } catch (e) {
    return json(res, 500, {
      error: "Transcripción fallida",
      detail: e.message,
    });
  }

  if (!transcript) {
    return json(res, 200, {
      transcript: "",
      reply: "",
      info: "No se detectó voz. Intenta hablar más cerca del micrófono.",
    });
  }

  let reply = "";

  try {
    const ctx = await getClinicContext(clinicId);
    const systemPrompt = buildSystemPrompt(mode, ctx);
    reply = await askClaude(systemPrompt, transcript);
  } catch (e) {
    return json(res, 500, {
      error: "Error procesando respuesta de Sofía",
      detail: e.message,
    });
  }

  saveMessages(clinicId, transcript, reply).catch(e => {
    console.error("Supabase save voice messages error:", e.message);
  });

  return json(res, 200, {
    transcript,
    reply,
    mode,
    clinic_id: clinicId,
  });
};
