// ============================================================
// CLINIFLOW - CONFIRM BOOKING API
// Archivo: /api/confirm-booking.js
// Uso: Panel CliniFlow llama a este endpoint
// POST /api/confirm-booking
// Body: { booking_id, action: 'confirm'|'reject', notes? }
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DIALOG360_API_KEY = process.env.DIALOG360_API_KEY;

async function sbGet(path) {
  const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error('SB GET ' + res.status);
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
  return text ? JSON.parse(text) : null;
}

async function sbPatch(path, body) {
  const url = SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sendWhatsApp(to, body) {
  const res = await fetch('https://waba-v2.360dialog.io/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'D360-API-KEY': DIALOG360_API_KEY,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to, type: 'text', text: { body }
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('360dialog ' + res.status + ': ' + t.substring(0, 100));
  }
  return res.json();
}

module.exports = async function handler(req, res) {

  // CORS para el panel CliniFlow
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { booking_id, action, notes, confirmed_by } = req.body || {};

  if (!booking_id || !action) {
    return res.status(400).json({ error: 'booking_id y action son requeridos' });
  }

  if (!['confirm', 'reject', 'reschedule'].includes(action)) {
    return res.status(400).json({ error: 'action debe ser: confirm, reject, reschedule' });
  }

  try {
    // 1. Obtener la solicitud pendiente
    const bookings = await sbGet(
      `pending_bookings?select=*&id=eq.${booking_id}&limit=1`
    );

    if (!Array.isArray(bookings) || bookings.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const booking = bookings[0];

    if (booking.status !== 'pending') {
      return res.status(400).json({
        error: `Esta solicitud ya fue procesada: ${booking.status}`
      });
    }

    // 2. Obtener datos de la clínica
    const clinics = await sbGet(`clinics?select=*&id=eq.${booking.clinic_id}&limit=1`);
    const clinic = Array.isArray(clinics) && clinics.length > 0 ? clinics[0] : null;

    let patientMessage = '';
    let appointmentId = null;

    if (action === 'confirm') {
      // 3a. Confirmar: actualizar pending_bookings
      await sbPatch(
        `pending_bookings?id=eq.${booking_id}`,
        {
          status: 'confirmed',
          confirmed_by: confirmed_by || 'recepcion',
          confirmed_at: new Date().toISOString(),
        }
      );

      // 3b. Crear cita en appointments
      const appointments = await sbPost('appointments', {
        clinic_id:        booking.clinic_id,
        patient_name:     booking.patient_name,
        patient_phone:    booking.patient_phone,
        treatment:        booking.treatment,
        appointment_date: booking.requested_day,
        appointment_time: booking.requested_time,
        status:           'confirmed',
        source:           'whatsapp',
        confirmed_by:     confirmed_by || 'recepcion',
        confirmed_at:     new Date().toISOString(),
        notes:            notes || null,
      });

      appointmentId = appointments?.[0]?.id;

      // 3c. Mensaje de confirmación al paciente
      const clinicName = clinic?.name || 'la clínica';
      const phone = clinic?.phone || '';
      patientMessage = `✅ ¡Cita confirmada, ${booking.patient_name}!

📅 *${booking.treatment}*
📆 ${booking.requested_day} a las ${booking.requested_time}
🏥 ${clinicName}
${phone ? `📞 ${phone}` : ''}

Por favor llega 10 minutos antes. Si necesitas cancelar o cambiar, escribe aquí o llama a la clínica. ¡Hasta pronto!`;

    } else if (action === 'reject') {
      // 4. Rechazar: actualizar pending_bookings
      await sbPatch(
        `pending_bookings?id=eq.${booking_id}`,
        {
          status: 'rejected',
          confirmed_by: confirmed_by || 'recepcion',
          confirmed_at: new Date().toISOString(),
        }
      );

      const clinicName = clinic?.name || 'la clínica';
      const phone = clinic?.phone || '';
      patientMessage = `Hola ${booking.patient_name}, lamentablemente no podemos confirmar la cita para ${booking.requested_day} a las ${booking.requested_time}.

Por favor escríbenos para buscar otra fecha disponible o llama al ${phone}. ¡Disculpa los inconvenientes!`;

    } else if (action === 'reschedule') {
      await sbPatch(
        `pending_bookings?id=eq.${booking_id}`,
        {
          status: 'rescheduled',
          confirmed_by: confirmed_by || 'recepcion',
          confirmed_at: new Date().toISOString(),
        }
      );

      const clinicPhone = clinic?.phone || '';
      patientMessage = `Hola ${booking.patient_name}, necesitamos cambiar tu cita para ${booking.requested_day} a las ${booking.requested_time}.

Por favor escríbenos para buscar una nueva fecha o llama al ${clinicPhone}.`;
    }

    // 5. Enviar WhatsApp al paciente (si tiene número válido)
    let whatsappSent = false;
    const patientPhone = booking.patient_phone;

    if (patientPhone && patientPhone !== 'no proporcionado' && patientMessage) {
      try {
        // Normalizar número (remover espacios y guiones)
        const cleanPhone = patientPhone.replace(/[\s\-()]/g, '');
        await sendWhatsApp(cleanPhone, patientMessage);
        whatsappSent = true;
      } catch (e) {
        console.error('WhatsApp send failed:', e.message);
        // No fallar si WhatsApp no llega — la cita igual se confirma
      }
    }

    // 6. Respuesta al panel
    return res.status(200).json({
      success: true,
      action,
      booking_id,
      appointment_id: appointmentId,
      patient_notified: whatsappSent,
      patient_phone: patientPhone,
      message: action === 'confirm'
        ? `Cita confirmada para ${booking.patient_name} el ${booking.requested_day} a las ${booking.requested_time}`
        : action === 'reject'
          ? `Solicitud rechazada. Paciente notificado.`
          : `Solicitud marcada para reagendar. Paciente notificado.`
    });

  } catch (error) {
    console.error('confirm-booking error:', error.message);
    return res.status(500).json({
      error: 'Error procesando la solicitud',
      detail: error.message
    });
  }
};
