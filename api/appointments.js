// ============================================================
// CLINIFLOW - api/appointments.js
// GET   -> list appointments (by date, doctor, patient)
// POST  -> create appointment (validates double-booking)
// PATCH -> update status / reschedule (validates overlap)
//
// Security: JWT -> clinic_users -> clinic_id  (never from body)
// Double-booking: checked server-side, never trusted from frontend
// ============================================================

const SB_URL         = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SB = {
  apikey:         SB_SERVICE_KEY,
  Authorization:  "Bearer " + SB_SERVICE_KEY,
  "Content-Type": "application/json",
};

function returnSupabaseError(res, response, data, operation) {
  const details = data && typeof data === "object" ? data : {};
  const message = details.message || (typeof data === "string" ? data : "Error de base de datos");

  console.error("[appointments] Supabase " + operation + " failed", {
    status:  response.status,
    code:    details.code,
    message,
    details: details.details,
    hint:    details.hint,
  });

  return res.status(response.status).json({
    error: message,
    code:  details.code || undefined,
  });
}

// -- JWT -> clinic_id (shared auth logic) ----------------------
async function resolveClinic(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw Object.assign(new Error("Token requerido"), { status: 401 });
  }
  const token = authHeader.slice(7);

  const userRes = await fetch(SB_URL + "/auth/v1/user", {
    headers: { apikey: SB_SERVICE_KEY, Authorization: "Bearer " + token },
  });
  if (!userRes.ok) throw Object.assign(new Error("Token inválido"), { status: 401 });
  const user = await userRes.json();
  if (!user.id) throw Object.assign(new Error("No autenticado"), { status: 401 });

  const cuRes = await fetch(
    SB_URL + "/rest/v1/clinic_users?select=clinic_id,role&user_id=eq." + user.id + "&limit=1",
    { headers: SB }
  );
  const cu = await cuRes.json();
  if (!Array.isArray(cu) || cu.length === 0) {
    throw Object.assign(new Error("Sin clínica asignada"), { status: 403 });
  }
  return { user_id: user.id, clinic_id: cu[0].clinic_id, role: cu[0].role };
}

// -- DOUBLE-BOOKING CHECK --------------------------------------
// Returns the conflicting appointment if any, null otherwise
// Algorithm: [s1,e1) overlaps [s2,e2) iff s1 < e2 AND e1 > s2
async function checkOverlap(clinic_id, doctor_id, start_time, end_time, exclude_id) {
  let url = SB_URL + "/rest/v1/appointments"
    + "?clinic_id=eq." + clinic_id
    + "&doctor_id=eq." + doctor_id
    + "&status=not.in.(cancelled,no_show)"
    + "&start_time=lt." + encodeURIComponent(end_time)
    + "&end_time=gt."   + encodeURIComponent(start_time)
    + "&select=id,start_time,end_time,status"
    + "&limit=1";

  if (exclude_id) url += "&id=neq." + exclude_id;

  const r = await fetch(url, { headers: SB });
  const data = await r.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

// -- LOG TIMELINE (fire-and-forget) ----------------------------
async function logTimeline(clinic_id, patient_id, event_type, description, ref_id, ref_table) {
  if (!patient_id) return;
  try {
    await fetch(SB_URL + "/rest/v1/patient_timeline", {
      method:  "POST",
      headers: Object.assign({}, SB, { Prefer: "return=minimal" }),
      body:    JSON.stringify({ clinic_id, patient_id, event_type, description,
                                reference_id: ref_id, reference_table: ref_table }),
    });
  } catch (e) { /* non-blocking */ }
}

// -- MAIN HANDLER ---------------------------------------------
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!SB_URL || !SB_SERVICE_KEY) {
    return res.status(500).json({ error: "SUPABASE_URL o SUPABASE_SERVICE_KEY no configurada" });
  }

  let clinic_id, user_id, role;
  try {
    ({ clinic_id, user_id, role } = await resolveClinic(req.headers.authorization));
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message });
  }

  // -- GET - list appointments -------------------------------
  if (req.method === "GET") {
    const q = req.query || {};
    let url = SB_URL + "/rest/v1/appointments"
      + "?select=*,patients(id,name,phone),doctors(id,name,color),treatments(id,name,price)"
      + "&clinic_id=eq." + clinic_id
      + "&order=start_time.asc";

    if (q.date)       url += "&start_time=gte." + encodeURIComponent(q.date + "T00:00:00")
                           + "&start_time=lte." + encodeURIComponent(q.date + "T23:59:59");
    if (q.doctor_id)  url += "&doctor_id=eq."  + q.doctor_id;
    if (q.patient_id) url += "&patient_id=eq." + q.patient_id;
    if (q.status)     url += "&status=eq."     + q.status;
    if (q.limit)      url += "&limit="         + Math.min(parseInt(q.limit) || 50, 200);

    const r = await fetch(url, { headers: SB });
    const data = await r.json();
    return res.status(200).json(Array.isArray(data) ? data : []);
  }

  // -- POST - create appointment ----------------------------
  if (req.method === "POST") {
    const {
      patient_id, doctor_id, treatment_id,
      start_time, end_time, duration_minutes,
      chief_complaint, notes, price, source,
      pending_booking_id,
    } = req.body || {};

    // Required fields
    if (!start_time || !end_time) {
      return res.status(400).json({ error: "start_time y end_time son requeridos" });
    }
    if (!doctor_id) {
      return res.status(400).json({ error: "doctor_id es requerido" });
    }
    if (new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({ error: "end_time debe ser posterior a start_time" });
    }

    // Verify doctor belongs to this clinic
    if (doctor_id) {
      const docCheck = await fetch(
        SB_URL + "/rest/v1/doctors?id=eq." + doctor_id + "&clinic_id=eq." + clinic_id + "&limit=1",
        { headers: SB }
      );
      const doc = await docCheck.json();
      if (!Array.isArray(doc) || doc.length === 0) {
        return res.status(403).json({ error: "Doctor no pertenece a esta clínica" });
      }
    }

    // Verify patient belongs to this clinic
    if (patient_id) {
      const patCheck = await fetch(
        SB_URL + "/rest/v1/patients?id=eq." + patient_id +
        "&clinic_id=eq." + clinic_id + "&select=id&limit=1",
        { headers: SB }
      );
      const pat = await patCheck.json();
      if (!Array.isArray(pat) || pat.length === 0) {
        return res.status(403).json({ error: "Paciente no pertenece a esta clínica" });
      }
    }

    // Verify treatment belongs to this clinic and is active.
    // Use DB price — never trust the price submitted by the frontend.
    let verifiedTreatment = null;
    if (treatment_id) {
      const txCheck = await fetch(
        SB_URL + "/rest/v1/treatments?id=eq." + treatment_id +
        "&clinic_id=eq." + clinic_id +
        "&active=eq.true&select=id,price,duration_minutes&limit=1",
        { headers: SB }
      );
      const tx = await txCheck.json();
      if (!Array.isArray(tx) || tx.length === 0) {
        return res.status(403).json({ error: "Tratamiento no disponible en esta clínica" });
      }
      verifiedTreatment = tx[0];
    }

    // Verify pending_booking belongs to this clinic
    if (pending_booking_id) {
      const pbCheck = await fetch(
        SB_URL + "/rest/v1/pending_bookings?id=eq." + pending_booking_id +
        "&clinic_id=eq." + clinic_id + "&select=id&limit=1",
        { headers: SB }
      );
      const pb = await pbCheck.json();
      if (!Array.isArray(pb) || pb.length === 0) {
        return res.status(403).json({ error: "Reserva no encontrada en esta clínica" });
      }
    }

    // Double-booking check
    const conflict = await checkOverlap(clinic_id, doctor_id, start_time, end_time, null);
    if (conflict) {
      return res.status(409).json({
        error: "El doctor ya tiene una cita en ese horario",
        conflict: { start_time: conflict.start_time, end_time: conflict.end_time },
      });
    }

    // Calculate duration if not provided
    const dur = duration_minutes || Math.round(
      (new Date(end_time) - new Date(start_time)) / 60000
    );

    const payload = {
      clinic_id,          // always from JWT, never from body
      patient_id:          patient_id || null,
      doctor_id:           doctor_id,
      treatment_id:        treatment_id || null,
      start_time,
      end_time,
      duration_minutes:    dur,
      status:              "confirmed",
      chief_complaint:     chief_complaint || null,
      notes:               notes || null,
      // When treatment_id is provided, use the DB price — never the frontend value.
      price:               verifiedTreatment
                             ? (parseFloat(verifiedTreatment.price) || 0)
                             : (price != null ? parseFloat(price) : 0),
      source:              source || "manual",
      pending_booking_id:  pending_booking_id || null,
      created_by:          user_id,
      confirmed_at:        new Date().toISOString(),
    };

    const r = await fetch(SB_URL + "/rest/v1/appointments", {
      method:  "POST",
      headers: Object.assign({}, SB, { Prefer: "return=representation" }),
      body:    JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) return returnSupabaseError(res, r, data, "appointment create");

    const appt = Array.isArray(data) ? data[0] : data;

    // Log timeline (non-blocking)
    if (patient_id) {
      const ts = new Date(start_time).toLocaleString("es",
        { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
      await logTimeline(clinic_id, patient_id, "appointment_created",
        "Cita agendada para " + ts, appt.id, "appointments");
    }

    return res.status(201).json(appt);
  }

  // -- PATCH - update appointment ----------------------------
  if (req.method === "PATCH") {
    const { id, status, start_time, end_time, notes, treatment_notes, price, paid, payment_method, cancelled_reason } = req.body || {};

    if (!id) return res.status(400).json({ error: "id requerido" });

    // Verify appointment belongs to this clinic
    const checkRes = await fetch(
      SB_URL + "/rest/v1/appointments?select=id,status,doctor_id,patient_id&id=eq." + id + "&clinic_id=eq." + clinic_id + "&limit=1",
      { headers: SB }
    );
    const existing = await checkRes.json();
    if (!Array.isArray(existing) || existing.length === 0) {
      return res.status(403).json({ error: "Cita no encontrada en tu clínica" });
    }
    const current = existing[0];

    // If rescheduling, check double-booking
    if (start_time && end_time) {
      if (new Date(end_time) <= new Date(start_time)) {
        return res.status(400).json({ error: "end_time debe ser posterior a start_time" });
      }
      const conflict = await checkOverlap(clinic_id, current.doctor_id, start_time, end_time, id);
      if (conflict) {
        return res.status(409).json({
          error: "El doctor ya tiene una cita en ese horario",
          conflict: { start_time: conflict.start_time, end_time: conflict.end_time },
        });
      }
    }

    // Build patch - only include provided fields
    const patch = {};
    const now = new Date().toISOString();
    const VALID_STATUSES = ['pending','confirmed','checked_in','in_chair','completed','cancelled','no_show'];

    if (status && VALID_STATUSES.includes(status)) {
      patch.status = status;
      if (status === "confirmed")   patch.confirmed_at  = now;
      if (status === "checked_in")  patch.checked_in_at = now;
      if (status === "completed")   patch.completed_at  = now;
      if (status === "cancelled")   patch.cancelled_at  = now;
      if (status === "no_show")     patch.no_show_at    = now;
    }
    if (start_time)       patch.start_time        = start_time;
    if (end_time)         patch.end_time          = end_time;
    if (start_time && end_time) patch.duration_minutes =
      Math.round((new Date(end_time) - new Date(start_time)) / 60000);
    if (notes            !== undefined) patch.notes             = notes;
    if (treatment_notes  !== undefined) patch.treatment_notes   = treatment_notes;
    if (price            !== undefined) patch.price             = parseFloat(price);
    if (paid             !== undefined) patch.paid              = Boolean(paid);
    if (payment_method   !== undefined) patch.payment_method    = payment_method;
    if (cancelled_reason !== undefined) patch.cancelled_reason  = cancelled_reason;

    const r = await fetch(
      SB_URL + "/rest/v1/appointments?id=eq." + id + "&clinic_id=eq." + clinic_id,
      {
        method:  "PATCH",
        headers: Object.assign({}, SB, { Prefer: "return=representation" }),
        body:    JSON.stringify(patch),
      }
    );
    const data = await r.json();
    if (!r.ok) return returnSupabaseError(res, r, data, "appointment update");

    const appt = Array.isArray(data) ? data[0] : data;

    // Log status changes to timeline
    if (status && current.patient_id) {
      const labels = {
        confirmed:"Cita confirmada", checked_in:"Paciente en clínica",
        in_chair:"Tratamiento iniciado", completed:"Tratamiento completado",
        cancelled:"Cita cancelada"+(cancelled_reason?" - "+cancelled_reason:""),
        no_show:"Paciente no se presentó",
      };
      if (labels[status]) {
        await logTimeline(clinic_id, current.patient_id,
          status === "completed" ? "treatment_completed" :
          status === "checked_in" ? "checked_in" :
          status === "cancelled" ? "appointment_cancelled" :
          status === "no_show" ? "no_show" : "appointment_confirmed",
          labels[status], id, "appointments"
        );
      }
    }

    return res.status(200).json(appt);
  }

  return res.status(405).json({ error: "Method not allowed" });
};
