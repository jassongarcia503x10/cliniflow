// ============================================================
// CLINIFLOW - TEST SEND v2
// Payload correcto para 360dialog waba-v2
// Uso: /api/test-send?phone=385976769215
// ============================================================

module.exports = async function handler(req, res) {
  const targetPhone = req.query.phone;

  if (!targetPhone) {
    return res.status(400).json({
      error: 'Falta parametro phone',
      uso: '/api/test-send?phone=385976769215',
      nota: 'Numero sin + ni espacios'
    });
  }

  const API_KEY = process.env.DIALOG360_API_KEY;
  const results = {};

  console.log('=== TEST SEND v2 ===');
  console.log('Target:', targetPhone);
  console.log('API Key exists:', !!API_KEY);

  // ── INTENTO 1: waba-v2 payload simplificado ────────────
  try {
    console.log('Trying waba-v2 simplified payload...');

    const payload = {
      to: targetPhone,
      type: 'text',
      text: { body: 'Sofia test OK (v2) - CliniFlow funcionando!' }
    };

    console.log('Payload:', JSON.stringify(payload));

    const r = await fetch('https://waba-v2.360dialog.io/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    console.log('waba-v2 status:', r.status);
    console.log('waba-v2 response:', text);

    results.waba_v2_simple = {
      status: r.status,
      ok: r.ok,
      response: text.substring(0, 500)
    };
  } catch (e) {
    console.error('waba-v2 error:', e.message);
    results.waba_v2_simple = { error: e.message };
  }

  // ── INTENTO 2: waba-v2 con recipient_type ─────────────
  try {
    console.log('Trying waba-v2 with recipient_type...');

    const payload2 = {
      recipient_type: 'individual',
      to: targetPhone,
      type: 'text',
      text: { body: 'Sofia test OK (v2 + recipient) - CliniFlow!' }
    };

    const r2 = await fetch('https://waba-v2.360dialog.io/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': API_KEY,
      },
      body: JSON.stringify(payload2),
    });

    const text2 = await r2.text();
    console.log('waba-v2 recipient_type status:', r2.status);
    console.log('waba-v2 recipient_type response:', text2);

    results.waba_v2_recipient = {
      status: r2.status,
      ok: r2.ok,
      response: text2.substring(0, 500)
    };
  } catch (e) {
    results.waba_v2_recipient = { error: e.message };
  }

  // ── INTENTO 3: waba-v1 payload simplificado ────────────
  try {
    console.log('Trying waba-v1 simplified...');

    const payload3 = {
      to: targetPhone,
      type: 'text',
      text: { body: 'Sofia test OK (v1) - CliniFlow!' }
    };

    const r3 = await fetch('https://waba.360dialog.io/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': API_KEY,
      },
      body: JSON.stringify(payload3),
    });

    const text3 = await r3.text();
    console.log('waba-v1 status:', r3.status);
    console.log('waba-v1 response:', text3);

    results.waba_v1_simple = {
      status: r3.status,
      ok: r3.ok,
      response: text3.substring(0, 500)
    };
  } catch (e) {
    results.waba_v1_simple = { error: e.message };
  }

  console.log('=== RESULTADOS FINALES ===');
  console.log(JSON.stringify(results, null, 2));

  // Identificar cual funciono
  const winner = Object.entries(results).find(([, v]) => v.ok);

  return res.status(200).json({
    success: true,
    target_phone: targetPhone,
    winner: winner ? winner[0] : 'ninguno funciono',
    results
  });
};
   
