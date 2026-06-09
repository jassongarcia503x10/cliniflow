// ============================================================
// CLINIFLOW - SOFIA VOICE
// api/sofia-voice.js
// Pipeline: Audio → Groq Whisper → Sofia Chat → respuesta
//
// ENV requerida: GROQ_API_KEY (console.groq.com — gratis)
// ============================================================

const GROQ_API_KEY    = process.env.GROQ_API_KEY;
const SB_SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

async function resolveClinicFromJWT(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const ur = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SB_SERVICE_KEY, Authorization: "Bearer " + token },
  });
  if (!ur.ok) return null;
  const user = await ur.json();
  if (!user.id) return null;
  const cu = await fetch(SUPABASE_URL + "/rest/v1/clinic_users?select=clinic_id&user_id=eq." + user.id + "&limit=1", {
    headers: { apikey: SB_SERVICE_KEY, Authorization: "Bearer " + SB_SERVICE_KEY },
  });
  const cuData = await cu.json();
  return Array.isArray(cuData) && cuData.length > 0 ? cuData[0].clinic_id : null;
}
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_API_KEY  = process.env.CLAUDE_API_KEY;

// ── CARGAR CONTEXTO DE LA CLÍNICA ────────────────────────────
async function getClinicContext(clinicId) {
  if (!clinicId) return { systemPrompt: "Eres Sofía, asistente dental." };

  try {
    const sbHdr = { apikey: SUPABASE_SERVICE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_KEY };

    const [cr, tr] = await Promise.all([
      fetch(SUPABASE_URL + "/rest/v1/clinics?select=*&id=eq." + clinicId + "&limit=1", { headers: sbHdr }),
      fetch(SUPABASE_URL + "/rest/v1/treatments?select=*&clinic_id=eq." + clinicId + "&active=eq.true", { headers: sbHdr }),
    ]);

    const clinics = await cr.json();
    const treats  = await tr.json();
    const clinic  = Array.isArray(clinics) && clinics.length > 0 ? clinics[0] : null;

    if (!clinic) return { systemPrompt: "Eres Sofía, asistente dental." };

    const curr = clinic.currency || "€";
    const priceList = Array.isArray(treats) && treats.length > 0
      ? treats.filter(t => t.active !== false).map(t =>
          t.price_mode === "exact"  ? "• " + t.name + ": " + curr + t.price :
          t.price_mode === "from"   ? "• " + t.name + ": desde " + curr + t.price :
                                      "• " + t.name + ": consultar precio"
        ).join("\n")
      : "Consultar con la clínica";

    return { clinic, priceList };
  } catch (e) {
    console.error("getClinicContext error:", e.message);
    return { systemPrompt: "Eres Sofía, asistente dental." };
  }
}

function buildSystemPrompt(mode, clinic, priceList) {
  const name  = clinic ? clinic.name  : "la clínica";
  const phone = clinic ? (clinic.phone || "consultar") : "consultar";
  const hours = clinic ? (clinic.hours_mon_fri || "9:00-18:00") : "9:00-18:00";

  if (mode === "doctor") {
    return `Eres Sofía, copiloto clínico de ${name}.
Asistes a odontólogos y estudiantes. Proporciona:
• Protocolos clínicos paso a paso
• Información sobre anestésicos y medicamentos comunes en odontología
• Guía de procedimientos (endodoncia, extracción, implantes, etc.)
• Apoyo para emergencias dentales
REGLA: La decisión final siempre es del odontólogo tratante.
REGLA: Nunca diagnostiques enfermedades sistémicas.
Responde en el idioma de la pregunta. Sé preciso y profesional.`;
  }

  if (mode === "reports") {
    return `Eres Sofía, asistente ejecutiva de ${name}.
Responde preguntas sobre métricas, citas, ingresos y operaciones de la clínica.
Sé directa, usa datos cuando los tengas, habla en el idioma de la pregunta.`;
  }

  // Modo recepción (default)
  return `Eres Sofía, recepcionista IA de ${name}.
Horario: ${hours}. Teléfono: ${phone}.
Responde SIEMPRE en el idioma del usuario.
TRATAMIENTOS Y PRECIOS (solo estos):
${priceList || "Consultar con la clínica"}
REGLAS:
1. Máximo 2-3 oraciones.
2. Precios → usar lista exacta, nunca inventar.
3. Para agendar: pedir nombre, tratamiento, día y hora.
4. Nunca diagnostiques enfermedades.
5. Urgencias: "Llama a ${phone} o al 112."`;
}

// ── HANDLER PRINCIPAL ─────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── VERIFICAR GROQ KEY ────────────────────────────────────
  if (!GROQ_API_KEY) {
    return res.status(500).json({
      error: "GROQ_API_KEY no configurada",
      fix: "Agrega GROQ_API_KEY en Vercel → Settings → Environment Variables. Regístrate gratis en console.groq.com"
    });
  }

  // ── LEER AUDIO DEL BODY (multipart) ──────────────────────
  // Vercel deserializa el body como Buffer para content-type audio/*
  const contentType = req.headers["content-type"] || "";

  let audioBuffer;
  // Resolve clinic from JWT (never trust query param)
  let clinicId = await resolveClinicFromJWT(req.headers.authorization);
  if (!clinicId) clinicId = req.query.clinic_id || null; // fallback for legacy calls
  let mode     = req.query.mode || "reception";

  // El frontend envía el audio como raw binary con query params
  if (contentType.startsWith("audio/") || contentType === "application/octet-stream") {
    // Body llega como stream — leer chunks
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", resolve);
      req.on("error", reject);
    });
    audioBuffer = Buffer.concat(chunks);
  } else {
    return res.status(400).json({ error: "Content-Type debe ser audio/webm o audio/wav" });
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    return res.status(400).json({ error: "Audio vacío o no recibido" });
  }

  console.log("Audio recibido:", audioBuffer.length, "bytes | modo:", mode, "| clinic:", clinicId);

  // ── TRANSCRIBIR CON GROQ WHISPER ──────────────────────────
  let transcript = "";
  try {
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: "audio/webm" });
    formData.append("file", audioBlob, "audio.webm");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("response_format", "json");
    formData.append("language", "es"); // acelera transcripción; Whisper auto-detecta si está mal

    const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + GROQ_API_KEY },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error("Groq Whisper error:", whisperRes.status, errText);
      return res.status(500).json({
        error: "Transcripción fallida",
        detail: errText.substring(0, 300),
        status: whisperRes.status,
      });
    }

    const whisperData = await whisperRes.json();
    transcript = (whisperData.text || "").trim();
    console.log("Transcript:", transcript);

    if (!transcript) {
      return res.status(200).json({
        transcript: "",
        reply: "",
        info: "No se detectó audio con voz. Intenta hablar más cerca del micrófono."
      });
    }
  } catch (e) {
    console.error("Whisper fetch error:", e.message);
    return res.status(500).json({ error: "Error al transcribir: " + e.message });
  }

  // ── OBTENER CONTEXTO DE CLÍNICA ───────────────────────────
  const { clinic, priceList } = await getClinicContext(clinicId);
  const systemPrompt = buildSystemPrompt(mode, clinic, priceList);

  // ── LLAMAR A CLAUDE ───────────────────────────────────────
  let reply = "";
  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 250,
        system: systemPrompt,
        messages: [{ role: "user", content: transcript }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("Claude error:", err);
      return res.status(500).json({ error: "Claude API error", detail: err.substring(0, 200) });
    }

    const claudeData = await claudeRes.json();
    reply = claudeData.content?.[0]?.text || "Lo siento, no pude procesar tu mensaje.";
  } catch (e) {
    console.error("Claude fetch error:", e.message);
    return res.status(500).json({ error: "Error al procesar: " + e.message });
  }

  // ── GUARDAR EN SUPABASE (opcional, no bloquea) ────────────
  if (clinicId) {
    const sbHdr = {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    };
    const sbBase = SUPABASE_URL + "/rest/v1/messages";
    Promise.all([
      fetch(sbBase, { method: "POST", headers: sbHdr, body: JSON.stringify({ clinic_id: clinicId, patient_name: "Voz", patient_phone: "voice", content: transcript, direction: "inbound" }) }),
      fetch(sbBase, { method: "POST", headers: sbHdr, body: JSON.stringify({ clinic_id: clinicId, patient_name: "Sofía IA", patient_phone: "sofia", content: reply, direction: "outbound" }) }),
    ]).catch(e => console.error("Supabase save error:", e.message));
  }

  return res.status(200).json({ transcript, reply });
};
