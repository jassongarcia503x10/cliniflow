// ============================================================
// CLINIFLOW - RECORDATORIOS AUTOMÁTICOS
// api/send-reminders.js
// Vercel Cron: ejecuta cada hora
// Envía WhatsApp 48h, 24h y 2h antes de cada cita
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DIALOG360_API_KEY = process.env.DIALOG360_API_KEY;

const HDR = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
  "Content-Type": "application/json",
};

async function sbGet(path) {
  const url = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path;
  const r = await fetch(url, { headers: HDR });
  const text = await r.text();
  if (!r.ok) throw new Error("SB GET " + r.status);
  return text ? JSON.parse(text) : [];
}

async function sbPatch(path, body) {
  const url = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path;
  await fetch(url, {
    method: "PATCH",
    headers: { ...HDR, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
}

async function sendWhatsApp(to, body) {
  try {
    const r = await fetch("https://waba-v2.360dialog.io/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "D360-API-KEY": DIALOG360_API_KEY },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/[\s\-()]/g, ""),
        type: "text",
        text: { body },
      }),
    });
    return r.ok;
  } catch (e) {
    console.error("WhatsApp error:", e.message);
    return false;
  }
}

function buildReminderMessage(appt, hoursLeft, clinicName) {
  const time = appt.start_time
    ? new Date(appt.start_time).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
    : appt.appointment_time || "--:--";
  const date = appt.appointment_date
    ? new Date(appt.appointment_date).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })
    : appt.appointment_date || "próximamente";

  if (hoursLeft === 48) {
    return (
      "🦷 *Recordatorio de cita — " + clinicName + "*\n\n" +
      "Hola " + appt.patient_name + ", te recordamos tu cita:\n\n" +
      "📅 *" + appt.treatment + "*\n" +
      "📆 " + date + " a las " + time + "\n\n" +
      "¿Confirmas que vendrás? Responde *SÍ* para confirmar o escríbenos para reagendar."
    );
  }
  if (hoursLeft === 24) {
    return (
      "⏰ *Tu cita es mañana — " + clinicName + "*\n\n" +
      "Hola " + appt.patient_name + "! Tu cita de *" + appt.treatment + "* " +
      "es mañana " + date + " a las " + time + ".\n\n" +
      "Por favor llega 5 minutos antes. ¡Hasta mañana! 🦷"
    );
  }
  if (hoursLeft === 2) {
    return (
      "🔔 *Tu cita es en 2 horas — " + clinicName + "*\n\n" +
      "Hola " + appt.patient_name + "! En 2 horas tienes tu cita de *" + appt.treatment + "* " +
      "a las " + time + ".\n\n" +
      "¡Te esperamos! 🦷"
    );
  }
  return "";
}

module.exports = async function handler(req, res) {
  // Seguridad: solo Vercel Cron o clave secreta
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(503).json({ error: "CRON_SECRET no configurado" });
  }
  if (authHeader !== "Bearer " + cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const now = new Date();
  const results = { sent_48h: [], sent_24h: [], sent_2h: [], errors: [] };

  try {
    // Traer todas las citas confirmadas con fecha futura
    const appts = await sbGet(
      "appointments?select=*,clinics(name,phone)&status=eq.confirmed" +
      "&appointment_date=gte." + now.toISOString().slice(0, 10)
    );

    if (!Array.isArray(appts) || appts.length === 0) {
      return res.status(200).json({ message: "No appointments found", ...results });
    }

    for (const appt of appts) {
      if (!appt.start_time || !appt.patient_phone) continue;
      if (appt.patient_phone === "no proporcionado") continue;

      const apptTime = new Date(appt.start_time);
      const hoursUntil = (apptTime - now) / (1000 * 60 * 60);
      const clinicName = appt.clinics?.name || "la clínica";

      // ── RECORDATORIO 48h ──────────────────────────────
      if (!appt.reminded_48h && hoursUntil <= 49 && hoursUntil >= 47) {
        const msg = buildReminderMessage(appt, 48, clinicName);
        const sent = await sendWhatsApp(appt.patient_phone, msg);
        if (sent) {
          await sbPatch("appointments?id=eq." + appt.id, { reminded_48h: true });
          results.sent_48h.push({ id: appt.id, patient: appt.patient_name });
          console.log("48h reminder sent:", appt.patient_name);
        } else {
          results.errors.push({ id: appt.id, type: "48h", patient: appt.patient_name });
        }
      }

      // ── RECORDATORIO 24h ──────────────────────────────
      if (!appt.reminded_24h && hoursUntil <= 25 && hoursUntil >= 23) {
        const msg = buildReminderMessage(appt, 24, clinicName);
        const sent = await sendWhatsApp(appt.patient_phone, msg);
        if (sent) {
          await sbPatch("appointments?id=eq." + appt.id, { reminded_24h: true });
          results.sent_24h.push({ id: appt.id, patient: appt.patient_name });
          console.log("24h reminder sent:", appt.patient_name);
        } else {
          results.errors.push({ id: appt.id, type: "24h", patient: appt.patient_name });
        }
      }

      // ── RECORDATORIO 2h ───────────────────────────────
      if (!appt.reminded_2h && hoursUntil <= 2.5 && hoursUntil >= 1.5) {
        const msg = buildReminderMessage(appt, 2, clinicName);
        const sent = await sendWhatsApp(appt.patient_phone, msg);
        if (sent) {
          await sbPatch("appointments?id=eq." + appt.id, { reminded_2h: true });
          results.sent_2h.push({ id: appt.id, patient: appt.patient_name });
          console.log("2h reminder sent:", appt.patient_name);
        } else {
          results.errors.push({ id: appt.id, type: "2h", patient: appt.patient_name });
        }
      }
    }

    console.log("Reminders processed:", results);
    return res.status(200).json({ success: true, timestamp: now.toISOString(), ...results });

  } catch (error) {
    console.error("Reminders error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};
