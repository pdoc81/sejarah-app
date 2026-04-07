const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, {});
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method tidak dibenarkan.' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { mode, scopeLabel, questions, context, studentAnswers } = body;

    let systemText = '';
    let userText = '';

    if (mode === 'mcq') {
      systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang teliti.
Jana TEPAT 10 soalan objektif berkualiti tinggi.
Balas dalam JSON SAHAJA dengan format:
{
  "questions": [
    {
      "q": "Soalan",
      "opts": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
      "ans": 0,
      "exp": "Penjelasan ringkas"
    }
  ]
}

Peraturan:
- Bahasa Melayu
- Fakta tepat
- Tiada soalan berulang
- Sesuai untuk murid sekolah menengah
- Pilihan jawapan mesti 4 sahaja
- "ans" ialah index 0 hingga 3
`;
      userText = `Jana 10 soalan objektif Sejarah KSSM bagi skop: ${scopeLabel}.`;
    } else if (mode === 'structured') {
      systemText = `
Anda ialah guru Sejarah KSSM Malaysia.
Jana satu set soalan Kertas 2 berstruktur.
Balas dalam JSON SAHAJA dengan format:
{
  "context": "Petikan atau rangsangan ringkas",
  "questions": [
    { "id": "a", "q": "Soalan", "marks": 2, "model": "Jawapan contoh" },
    { "id": "b", "q": "Soalan", "marks": 4, "model": "Jawapan contoh" },
    { "id": "c", "q": "Soalan", "marks": 4, "model": "Jawapan contoh" }
  ]
}

Peraturan:
- Bahasa Melayu
- Jumlah markah 10
- Fakta tepat
- Sesuai gaya SPM Sejarah
`;
      userText = `Jana satu set soalan struktur Sejarah untuk skop: ${scopeLabel}.`;
    } else if (mode === 'mark-structured') {
      systemText = `
Anda ialah pemeriksa Sejarah KSSM Malaysia.
Semak jawapan murid dengan adil berdasarkan kehendak soalan dan jawapan model.
Balas dalam JSON SAHAJA dengan format:
{
  "results": [
    { "id": "a", "marks_awarded": 1, "feedback": "Maklum balas ringkas" }
  ],
  "total": 0
}

Peraturan:
- Bahasa Melayu
- Maklum balas jelas dan membina
- Markah realistik
`;
      userText = `
Konteks:
${context || ''}

Soalan:
${JSON.stringify(questions || [])}

Jawapan murid:
${JSON.stringify(studentAnswers || {})}
`;
    } else {
      return jsonResponse(400, { error: 'Mode tidak sah.' });
    }

    const response = await client.responses.create({
      model: 'gpt-5.4-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemText }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: userText }]
        }
      ],
      text: {
        format: {
          type: 'json_object'
        }
      }
    });

    const outputText =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      '';

    if (!outputText) {
      return jsonResponse(500, { error: 'AI tidak memulangkan data.' });
    }

    const parsed = JSON.parse(outputText);
    return jsonResponse(200, parsed);

  } catch (error) {
    console.error('Function error:', error);
    return jsonResponse(500, { error: 'Ralat backend AI.' });
  }
};