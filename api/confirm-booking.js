// ============================================================
// CLINIFLOW - CONFIRM BOOKING v2
// api/confirm-booking.js
// FIX: búsqueda de precio multilingüe con aliases
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DIALOG360_API_KEY = process.env.DIALOG360_API_KEY;
const { requireClinicUser } = require("../lib/auth");

const HDR = {
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: "Bearer " + SUPABASE_SERVICE_KEY,
  "Content-Type": "application/json",
};

// ── DICCIONARIO DENTAL UNIVERSAL (8 idiomas, 25+ tratamientos) ─
// Sofia conoce TODOS los tratamientos dentales del mundo
const DENTAL_KNOWLEDGE = {
  cleaning:     ["limpieza","limpieza dental","profilaxis","higiene dental","higiene bucal",
                 "detartraje","cleaning","dental cleaning","prophylaxis","scale and polish",
                 "čišćenje","čišćenje zuba","zahnreinigung","prophylaxe","détartrage",
                 "limpeza dentária","pulizia denti"],
  checkup:      ["consulta","consulta dental","revisión","control dental","chequeo",
                 "primera visita","checkup","dental exam","examination","oral exam",
                 "pregled","kontrola","zahnarzttermin","bilan dentaire","consulta dentária"],
  sealant:      ["sellado","selladores","sellado de fisuras","sealant","fissure sealant",
                 "pečatiranje","fissurenversiegelung","scellement"],
  fluoride:     ["fluor","fluoruro","barniz de flúor","fluoride","fluoride varnish",
                 "fluoridlack","fluor gel"],
  filling:      ["empaste","empaste dental","obturación","composite","amalgama","resina",
                 "caries","empaste blanco","filling","dental filling","composite filling",
                 "plomba","ispun","zahnfüllung","obturation","plombage","otturazione"],
  crown:        ["corona","corona dental","funda","funda dental","zirconio","corona de porcelana",
                 "crown","dental crown","porcelain crown","zirconia crown","ceramic crown",
                 "krunica","zahnkrone","couronne","coroa","corona dentale"],
  veneer:       ["carilla","carillas","faceta","laminado","carilla de porcelana",
                 "veneer","veneers","porcelain veneer","composite veneer","laminate",
                 "ljuskica","veneer","facette","faccetta"],
  whitening:    ["blanqueamiento","blanquear","manchas amarillas","dientes amarillos",
                 "blanqueo","quitar manchas","aclarar dientes","dientes blancos",
                 "whitening","teeth whitening","bleaching","laser whitening","zoom",
                 "izbjeljivanje","zahnaufhellung","blanchiment","clareamento","sbiancamento"],
  bonding:      ["bonding","bonding dental","cierre de diastema","composite estético",
                 "composite directo","reconstrucción estética",
                 "dental bonding","composite bonding","tooth bonding"],
  braces:       ["brackets","ortodoncia","aparato dental","ortodoncia fija","brackets metálicos",
                 "brackets cerámicos","dientes torcidos","maloclusión","correccion dental",
                 "braces","dental braces","metal braces","ceramic braces","orthodontics",
                 "aparatić","ortodoncija","zahnspange","appareil dentaire","aparelho fixo"],
  invisalign:   ["invisalign","alineadores","ortodoncia invisible","alineadores transparentes",
                 "guteras","ortodoncia removible","clear aligners","fundas de ortodoncia",
                 "nevidljiva ortodoncija","unsichtbare zahnspange","gouttières","alinhadores"],
  retainer:     ["retenedor","retenedores","retención","contención","férula de retención",
                 "retainer","dental retainer","fiksni retainer","retentionsschiene","contention"],
  root_canal:   ["endodoncia","tratamiento de conductos","matar nervio","nervio dental",
                 "dolor de nervio","infección dental","absceso","pulpitis","canal radicular",
                 "root canal","endodontics","nerve treatment","pulp treatment",
                 "kanal","vađenje živca","wurzelbehandlung","traitement de canal","tratamento de canal"],
  periodontics: ["periodoncia","encías","gingivitis","periodontitis","curetaje","raspado",
                 "sangrado de encías","encías inflamadas","bolsas periodontales",
                 "periodontics","gum treatment","scaling and root planing","deep cleaning",
                 "liječenje desni","parodontitis","zahnfleischbehandlung","traitement parodontal"],
  gum_surgery:  ["cirugía de encías","alargamiento de corona","injerto de encías","recesión gingival",
                 "gingivectomía","encías retraídas",
                 "gum surgery","gum graft","crown lengthening","gingivectomy","kirurgija desni"],
  implant:      ["implante","implante dental","implantes","tornillo dental","raíz artificial",
                 "corona sobre implante","diente perdido","pieza perdida",
                 "implant","dental implant","titanium implant","tooth implant",
                 "implantati","zahnimplantat","implant dentaire","implante dentário"],
  bone_graft:   ["injerto óseo","regeneración ósea","sinus lift","elevación de seno",
                 "aumento de hueso","hueso para implante",
                 "bone graft","sinus lift","bone regeneration","ridge augmentation",
                 "koštani presadak","knochenaufbau","greffe osseuse","enxerto ósseo"],
  all_on_4:     ["all on 4","all on four","prótesis sobre implantes","boca completa en implantes",
                 "all on 6","dientes fijos sobre implantes","rehabilitación completa",
                 "all on 4","full arch","teeth in a day","all on four implants","sve na četiri"],
  extraction:   ["extracción","extracción dental","sacar diente","exodoncia","muela",
                 "muela del juicio","cordal","tercer molar","diente impactado",
                 "extraction","tooth extraction","wisdom tooth removal","oral surgery",
                 "vađenje","vađenje zuba","vađenje umnjaka","zahnextraktion","extraction dentaire"],
  denture:      ["prótesis","dentadura","dentadura postiza","prótesis removible","dientes postizos",
                 "denture","dentures","full denture","partial denture","false teeth",
                 "proteza","zahnprothese","prothèse dentaire","prótese dentária"],
  bridge:       ["puente","puente dental","puente fijo","prótesis fija",
                 "bridge","dental bridge","fixed bridge","porcelain bridge",
                 "mostić","zahnbrücke","bridge dentaire","ponte dentária"],
  pediatric:    ["niños","odontología infantil","odontopediatría","dentista niños",
                 "dientes de leche","dentición infantil","primera visita niño",
                 "pediatric","children dentistry","kids dentist","baby teeth","milk teeth",
                 "dječja stomatologija","kinderzahnheilkunde","dentisterie pédiatrique"],
  emergency:    ["urgencia","urgencia dental","emergencia","dolor dental","dolor de muela",
                 "dolor intenso","dolor agudo","infección","absceso","hinchazón",
                 "traumatismo","diente roto","corona caída","sangrado","fractura dental",
                 "emergency","dental emergency","toothache","severe pain","abscess","swelling",
                 "hitno","hitna pomoć","notfall","zahnschmerzen","urgence dentaire"],
  nightguard:   ["férula","férula de descarga","bruxismo","apretar dientes","rechinar dientes",
                 "protector nocturno","desgaste dental",
                 "nightguard","night guard","bruxism","occlusal splint","bite guard",
                 "štitinik","bruksizam","aufbissschiene","knirscherschiene","gouttière"],
  xray:         ["radiografía","panorámica","ortopantomografía","tac dental","escaner dental",
                 "radiografía periapical","cbct",
                 "xray","dental xray","panoramic","cbct","cone beam ct","3d scan",
                 "rtg","rentgen","röntgen","panoramaröntgen"],
};

function getSearchTerms(treatment) {
  if (!treatment) return [];
  const t = treatment.toLowerCase().trim();
  for (const aliases of Object.values(DENTAL_KNOWLEDGE)) {
    if (aliases.some(a => t.includes(a.toLowerCase()))) {
      return [...new Set([treatment, ...aliases.slice(0, 10)])];
    }
  }
  return [treatment];
}

function findCanonical(text) {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  for (const [key, aliases] of Object.entries(DENTAL_KNOWLEDGE)) {
    if (aliases.some(a => t.includes(a.toLowerCase()))) return key;
  }
  return null;
}

// ── SUPABASE HELPERS ──────────────────────────────────────────
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

// ── BUSCAR PRECIO CON ALIASES ─────────────────────────────────
async function findPrice(clinicId, treatmentName) {
  if (!treatmentName) return 0;
  const terms = getSearchTerms(treatmentName);
  for (const term of terms) {
    try {
      const rows = await sbGet(
        "treatments?select=price,price_mode&clinic_id=eq." +
        clinicId +
        "&name=ilike." +
        encodeURIComponent("%" + term + "%") +
        "&active=eq.true" +
        "&limit=1"
      );
      if (Array.isArray(rows) && rows.length > 0) {
        const t = rows[0];
        console.log("Price found via:", term, "->", t.price);
        return t.price_mode === "consult" ? 0 : (parseFloat(t.price) || 0);
      }
    } catch (e) {
      console.error("Price lookup error:", term, e.message);
    }
  }
  console.log("No price found for:", treatmentName);
  return 0;
}

// ── ENVIAR WHATSAPP ───────────────────────────────────────────
async function sendWhatsApp(to, body) {
  try {
    const clean = to.replace(/[\s\-()]/g, "");
    const r = await fetch("https://waba-v2.360dialog.io/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "D360-API-KEY": DIALOG360_API_KEY },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: clean, type: "text", text: { body },
      }),
    });
    return r.ok;
  } catch (e) {
    console.error("WhatsApp error:", e.message);
    return false;
  }
}

// ── MAIN HANDLER ──────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { booking_id, action, confirmed_by } = req.body || {};
  if (!booking_id || !action) return res.status(400).json({ error: "booking_id y action requeridos" });
  if (!["confirm","reject","reschedule"].includes(action)) return res.status(400).json({ error: "action invalido" });

  try {
    const auth = await requireClinicUser(req.headers.authorization);

    // 1. Leer la reserva
    const bookings = await sbGet(
      "pending_bookings?select=*&id=eq." + encodeURIComponent(booking_id) +
      "&clinic_id=eq." + encodeURIComponent(auth.clinic_id) + "&limit=1"
    );
    if (!Array.isArray(bookings) || bookings.length === 0) return res.status(404).json({ error: "Reserva no encontrada" });
    const booking = bookings[0];
    if (booking.status !== "pending") return res.status(400).json({ error: "Reserva ya procesada: " + booking.status });

    // 2. Leer clínica
    const clinics = await sbGet("clinics?select=*&id=eq." + booking.clinic_id + "&limit=1");
    const clinic = Array.isArray(clinics) && clinics.length > 0 ? clinics[0] : null;
    const clinicName  = clinic ? clinic.name  : "la clínica";
    const clinicPhone = clinic ? (clinic.phone || "") : "";

    const now = new Date().toISOString();
    const by  = auth.email || confirmed_by || "recepcion";
    let appointmentId = null;
    let patientMessage = "";
    let whatsappSent = false;

    if (action === "confirm") {
      // 3. Actualizar pending_bookings
      await sbPatch("pending_bookings?id=eq." + booking_id, {
        status: "confirmed", confirmed_by: by, confirmed_at: now,
      });

      // 4. Buscar precio con aliases multilingüe
      const price = await findPrice(booking.clinic_id, booking.treatment);

      // 5. Insertar en appointments
      const appts = await sbPost("appointments", {
        clinic_id:     booking.clinic_id,
        patient_name:  booking.patient_name  || "Paciente",
        patient_phone: booking.patient_phone || "",
        treatment:     booking.treatment     || "Consulta",
        status:        "confirmed",
        price:         price,
        source:        "whatsapp",
        reminded_48h:  false,
        created_at:    now,
      });
      appointmentId = Array.isArray(appts) && appts.length > 0 ? appts[0].id : null;

      // 6. Mensaje confirmación
      patientMessage =
        "✅ ¡Cita confirmada, " + (booking.patient_name || "paciente") + "!\n\n" +
        "📅 *" + (booking.treatment || "Consulta") + "*\n" +
        "📆 " + (booking.requested_day  || "—") + " a las " +
                (booking.requested_time || "—") + "\n" +
        "🏥 " + clinicName +
        (clinicPhone ? "\n📞 " + clinicPhone : "") +
        "\n\nPor favor llega 10 minutos antes. " +
        "Para cambios escribe aquí o llama a la clínica.";

    } else if (action === "reject") {
      await sbPatch("pending_bookings?id=eq." + booking_id, {
        status: "rejected", confirmed_by: by, confirmed_at: now,
      });
      patientMessage =
        "Hola " + (booking.patient_name || "") + ", lamentablemente no podemos " +
        "confirmar tu cita para " + (booking.requested_day || "la fecha solicitada") + ".\n\n" +
        "Escríbenos para buscar otra fecha" +
        (clinicPhone ? " o llama al " + clinicPhone : "") + ". ¡Disculpa!";

    } else if (action === "reschedule") {
      await sbPatch("pending_bookings?id=eq." + booking_id, {
        status: "rescheduled", confirmed_by: by, confirmed_at: now,
      });
      patientMessage =
        "Hola " + (booking.patient_name || "") + ", necesitamos reagendar tu cita.\n\n" +
        "Escríbenos para elegir una nueva fecha" +
        (clinicPhone ? " o llama al " + clinicPhone : "") + ". ¡Gracias!";
    }

    // 7. Enviar WhatsApp
    const phone = booking.patient_phone;
    if (phone && phone !== "no proporcionado" && patientMessage) {
      whatsappSent = await sendWhatsApp(phone, patientMessage);
    }

    return res.status(200).json({
      success: true, action, booking_id,
      appointment_id: appointmentId,
      patient_notified: whatsappSent,
    });

  } catch (error) {
    console.error("confirm-booking error:", error.message);
    return res.status(error.status || 500).json({ error: error.status ? error.message : "Error interno", detail: error.message });
  }
};
