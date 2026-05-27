// ============================================================
// CLINIFLOW - TEST SEND
// Prueba envío saliente a 360dialog independientemente
// Uso: abrir en navegador
// https://cliniflow-theta.vercel.app/api/test-send?phone=TUNUMERO
// Ejemplo: ?phone=385976769215
// ============================================================

module.exports = async function handler(req, res) {
  const targetPhone = req.query.phone;

  if (!targetPhone) {
    return res.status(400).json({
      error: 'Falta parametro phone',
      uso: '/api/test-send?phone=385976769215',
      nota: 'El numero sin + ni espacios'
    });
  }

  const API_KEY = process.env.DIALOG360_API_KEY;
  const results = {};

  console.log('=== TEST SEND INICIADO ===');
  console.log('Target phone:', targetPhone);
  console.log('API Key existe:', !!API_KEY);
  console.log('API Key primeros 10 chars:', API_KEY?.substring(0, 10));

  // ── INTENTO 1: waba-v2 (nuevo) ─────────────────────────
  try {
    console.log('Intentando waba-v2...');
    const res1 = await fetch('https://waba-v2.360dialog.io/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': API_KEY,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: targetPhone,
        type: 'text',
        text: { body: '✅ Sofia test OK (waba-v2) - CliniFlow funcionando' }
      }),
    });

    const text1 = await res1.text();
    console.log('waba-v2 status:', res1.status);
    console.log('waba-v2 response:', text1);

    results.waba_v2 = {
      status: res1.status,
      ok: res1.ok,
      response: text1.substring(0, 500)
    };
  } catch (e) {
    console.error('waba-v2 error:', e.message);
    results.waba_v2 = { error: e.message };
  }

  // ── INTENTO 2: waba original (legacy) ─────────────────
  try {
    console.log('Intentando waba original...');
    const res2 = await fetch('https://waba.360dialog.io/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': API_KEY,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: targetPhone,
        type: 'text',
        text: { body: '✅ Sofia test OK (waba-v1) - CliniFlow funcionando' }
      }),
    });

    const text2 = await res2.text();
    console.log('waba-v1 status:', res2.status);
    console.log('waba-v1 response:', text2);

    results.waba_v1 = {
      status: res2.status,
      ok: res2.ok,
      response: text2.substring(0, 500)
    };
  } catch (e) {
    console.error('waba-v1 error:', e.message);
    results.waba_v1 = { error: e.message };
  }

  console.log('=== TEST SEND COMPLETADO ===');
  console.log('Results:', JSON.stringify(results, null, 2));

  return res.status(200).json({
    success: true,
    target_phone: targetPhone,
    api_key_exists: !!API_KEY,
    results
  });
};
