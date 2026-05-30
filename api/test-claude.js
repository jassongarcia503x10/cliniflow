// ============================================================
// CLINIFLOW - TEST CLAUDE API
// Diagnostico directo de Claude sin WhatsApp ni Supabase
// Uso: https://cliniflow-theta.vercel.app/api/test-claude
// ============================================================

module.exports = async function handler(req, res) {
  console.log('=== TEST CLAUDE INICIADO ===');

  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

  // 1. Verificar que existe la variable
  const keyCheck = {
    exists: !!CLAUDE_API_KEY,
    length: CLAUDE_API_KEY?.length || 0,
    starts_with: CLAUDE_API_KEY?.substring(0, 20) || 'NO KEY',
    ends_with: CLAUDE_API_KEY?.slice(-10) || 'NO KEY',
    has_spaces: CLAUDE_API_KEY?.includes(' ') || false,
    has_newline: CLAUDE_API_KEY?.includes('\n') || false,
  };

  console.log('Key check:', JSON.stringify(keyCheck));

  if (!CLAUDE_API_KEY) {
    return res.status(200).json({
      success: false,
      error: 'CLAUDE_API_KEY no existe en variables de entorno',
      key_check: keyCheck,
    });
  }

  // 2. Intentar llamada real a Claude
  const results = {};

  // Test A: modelo claude-sonnet-4-20250514
  try {
    console.log('Testing claude-sonnet-4-20250514...');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Di solo: Sofia lista' }],
      }),
    });

    const text = await r.text();
    console.log('Model A status:', r.status);
    console.log('Model A response:', text.substring(0, 300));

    results.model_sonnet_4 = {
      status: r.status,
      ok: r.ok,
      response: text.substring(0, 500),
      answer: r.ok ? JSON.parse(text)?.content?.[0]?.text : null,
    };
  } catch (e) {
    results.model_sonnet_4 = { error: e.message };
  }

  // Test B: modelo claude-3-5-haiku (mas barato, por si el otro falla)
  try {
    console.log('Testing claude-haiku-4-5-20251001...');
    const r2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Di solo: Sofia lista' }],
      }),
    });

    const text2 = await r2.text();
    console.log('Model B status:', r2.status);
    console.log('Model B response:', text2.substring(0, 300));

    results.model_haiku = {
      status: r2.status,
      ok: r2.ok,
      response: text2.substring(0, 500),
      answer: r2.ok ? JSON.parse(text2)?.content?.[0]?.text : null,
    };
  } catch (e) {
    results.model_haiku = { error: e.message };
  }

  // 3. Identificar modelo ganador
  const winner = Object.entries(results).find(([, v]) => v.ok);

  console.log('=== TEST CLAUDE COMPLETADO ===');
  console.log('Winner:', winner ? winner[0] : 'ninguno');

  return res.status(200).json({
    success: !!winner,
    winner: winner ? winner[0] : 'NINGUNO — ver error en results',
    key_check: keyCheck,
    results,
    next_step: winner
      ? `Usar modelo: ${winner[0]} en el webhook`
      : 'Revisar API key o creditos en console.anthropic.com',
  });
};
