// ============================================================
// CLINIFLOW - CONFIRM BOOKING
// api/confirm-booking.js
// Cuando action=confirm:
//   1. Lee pending_bookings
//   2. Actualiza status a confirmed
//   3. Inserta en appointments (con precio real desde treatments)
//   4. Envía WhatsApp al paciente
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
  if (!r.ok) throw new Error("SB GET " + r.status + ": " + text.substring(0, 200));
  return text ? JSON.parse(text) : null;
}

async function sbPost(path, body) {
  const url = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path;
  const r = await fetch(url, {
    method: "POST",
    headers: { ...HDR, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error("SB POST " + r.status + ": " + text.substring(0, 200));
  return text ? JSON.parse(text) : null;
}

async function sbPatch(path, body) {
  const url = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { ...HDR, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error("SB PATCH " + r.status + ": " + text.substring(0, 200));
  return text ? JSON.parse(text) : null;
}

async function sendWhatsApp(to, body) {
  try {
    const clean = to.replace(/[\s\-()]/g, "");
    const r = await fetch("https://waba-v2.360dialog.io/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "D360-API-KEY": DIALOG360_API_KEY },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: clean,
        type: "text",
        text: { body },
      }),
    });
    return r.ok;
  } catch (e) {
    console.error("WhatsApp send failed:", e.message);
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { booking_id, action, confirmed_by } = req.body || {};

  if (!booking_id || !action) {
    return res.status(400).json({ error: "booking_id y action son requeridos" });
  }
  if (!["confirm", "reject", "reschedule"].includes(action)) {
    return res.status(400).json({ error: "action debe ser: confirm, reject, reschedule" });
  }

  try {
    // 1. LEER LA RESERVA
    const bookings = await sbGet(
      "pending_bookings?select=*&id=eq." + booking_id + "&limit=1"
    );
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }
    const booking = bookings[0];

    if (booking.status !== "pending") {
      return res.status(400).json({
        error: "Esta reserva ya fue procesada: " + booking.status,
      });
    }

    // 2. LEER DATOS DE LA CLÍNICA
    const clinics = await sbGet("clinics?select=*&id=eq." + booking.clinic_id + "&limit=1");
    const clinic = Array.isArray(clinics) && clinics.length > 0 ? clinics[0] : null;

    const now = new Date().toISOString();
    let appointmentId = null;
    let patientMessage = "";
    let whatsappSent = false;

    if (action === "confirm") {
      // 3. ACTUALIZAR pending_bookings
      await sbPatch(
        "pending_bookings?id=eq." + booking_id,
        {
          status: "confirmed",
          confirmed_by: confirmed_by || "recepcion",
          confirmed_at: now,
        }
      );

      // 4. BUSCAR PRECIO EN treatments
      let price = 0;
      if (booking.treatment) {
        try {
          const found = await sbGet(
            "treatments?select=price,price_mode&clinic_id=eq." +
            booking.clinic_id +
            "&name=ilike." +
            encodeURIComponent("%" + booking.treatment + "%") +
            "&limit=1"
          );
          if (Array.isArray(found) && found.length > 0) {
            const t = found[0];
            price = t.price_mode === "consult" ? 0 : (parseFloat(t.price) || 0);
          }
        } catch (e) {
          console.error("Price lookup failed:", e.message);
        }
      }

      // 5. INSERTAR EN appointments
      const apptRows = await sbPost("appointments", {
        clinic_id:     booking.clinic_id,
        patient_name:  booking.patient_name || "Paciente",
        patient_phone: booking.patient_phone || "",
        treatment:     booking.treatment || "Consulta",
        status:        "confirmed",
        price:         price,
        source:        "whatsapp",
        reminded_48h:  false,
        created_at:    now,
      });
      appointmentId = Array.isArray(apptRows) && apptRows.length > 0
        ? apptRows[0].id : null;

      // 6. MENSAJE AL PACIENTE
      const clinicName = clinic ? clinic.name : "la clínica";
      const clinicPhone = clinic ? (clinic.phone || "") : "";
      patientMessage =
        "✅ ¡Cita confirmada, " + (booking.patient_name || "paciente") + "!\n\n" +
        "📅 *" + (booking.treatment || "Consulta") + "*\n" +
        "📆 " + (booking.requested_day || "—") + " a las " + (booking.requested_time || "—") + "\n" +
        "🏥 " + clinicName +
        (clinicPhone ? "\n📞 " + clinicPhone : "") +
        "\n\nPor favor llega 10 minutos antes. " +
        "Para cancelar o cambiar, escribe aquí o llama a la clínica.";

    } else if (action === "reject") {
      await sbPatch(
        "pending_bookings?id=eq." + booking_id,
        {
          status: "rejected",
          confirmed_by: confirmed_by || "recepcion",
          confirmed_at: now,
        }
      );
      const clinicPhone = clinic ? (clinic.phone || "") : "";
      patientMessage =
        "Hola " + (booking.patient_name || "") + ", lamentablemente no podemos " +
        "confirmar tu cita para " + (booking.requested_day || "el día solicitado") +
        " a las " + (booking.requested_time || "la hora solicitada") + ".\n\n" +
        "Escríbenos para buscar otra fecha" +
        (clinicPhone ? " o llama al " + clinicPhone : "") +
        ". ¡Disculpa los inconvenientes!";

    } else if (action === "reschedule") {
      await sbPatch(
        "pending_bookings?id=eq." + booking_id,
        {
          status: "rescheduled",
          confirmed_by: confirmed_by || "recepcion",
          confirmed_at: now,
        }
      );
      const clinicPhone = clinic ? (clinic.phone || "") : "";
      patientMessage =
        "Hola " + (booking.patient_name || "") + ", necesitamos reagendar tu cita " +
        "para " + (booking.requested_day || "el día solicitado") + ".\n\n" +
        "Escríbenos para elegir una nueva fecha" +
        (clinicPhone ? " o llama al " + clinicPhone : "") +
        ". ¡Gracias por tu paciencia!";
    }

    // 7. ENVIAR WHATSAPP AL PACIENTE
    const patientPhone = booking.patient_phone;
    if (patientPhone && patientPhone !== "no proporcionado" && patientMessage) {
      whatsappSent = await sendWhatsApp(patientPhone, patientMessage);
    }

    return res.status(200).json({
      success: true,
      action,
      booking_id,
      appointment_id: appointmentId,
      patient_notified: whatsappSent,
    });

  } catch (error) {
    console.error("confirm-booking error:", error.message);
    return res.status(500).json({
      error: "Error procesando la solicitud",
      detail: error.message,
    });
  }
};
