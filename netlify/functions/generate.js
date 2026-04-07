const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

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

function getQuestionDistribution(questionCount) {
  const count = Number(questionCount) || 10;

  if (count === 5) return { mudah: 1, sederhana: 2, kbat: 2 };
  if (count === 10) return { mudah: 2, sederhana: 5, kbat: 3 };
  if (count === 20) return { mudah: 5, sederhana: 10, kbat: 5 };

  return { mudah: 2, sederhana: 5, kbat: 3 };
}

function loadChapterData(selectedSkop, selectedSesi) {
  try {
    if (!selectedSkop || !selectedSesi) return null;

    const filePath = path.join(
      process.cwd(),
      'data',
      'textbooks',
      `form${selectedSkop}`,
      `chapter${selectedSesi}.json`
    );

    console.log('Trying chapter file:', filePath);

    if (!fs.existsSync(filePath)) {
      console.log('Chapter file not found:', filePath);
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    console.log('Chapter file loaded:', {
      form: parsed.form,
      chapter: parsed.chapter,
      title: parsed.title
    });

    return parsed;
  } catch (error) {
    console.error('Error loading chapter data:', error);
    return null;
  }
}

function listToBulletText(items) {
  if (!Array.isArray(items) || items.length === 0) return '- Tiada';
  return items.map(item => `- ${item}`).join('\n');
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickItems(items, limit = 4) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return shuffleArray(items).slice(0, Math.min(limit, items.length));
}

function buildVariationPlan(chapterData, mode, totalQuestions) {
  if (!chapterData) {
    return {
      focusMix: [],
      questionAngles: [],
      kbatMix: []
    };
  }

  const focusLimit = mode === 'mcq'
    ? Math.min(5, Math.max(3, Math.ceil(totalQuestions / 3)))
    : 4;

  const angleLimit = mode === 'mcq'
    ? Math.min(6, Math.max(4, Math.ceil(totalQuestions / 2)))
    : 4;

  const kbatLimit = mode === 'mcq' ? 3 : 2;

  return {
    focusMix: pickItems(chapterData.focus_areas || [], focusLimit),
    questionAngles: pickItems(chapterData.possible_question_angles || [], angleLimit),
    kbatMix: pickItems(chapterData.kbat_angles || [], kbatLimit)
  };
}

function buildChapterContext(chapterData, variationPlan) {
  if (!chapterData) return '';

  const learningPoints = listToBulletText(chapterData.learning_points);
  const keyTerms = listToBulletText(chapterData.key_terms);
  const keyFacts = listToBulletText(chapterData.key_facts);
  const focusAreas = listToBulletText(chapterData.focus_areas);
  const possibleAngles = listToBulletText(chapterData.possible_question_angles);
  const kbatAngles = listToBulletText(chapterData.kbat_angles);

  const selectedFocusMix = listToBulletText(variationPlan?.focusMix || []);
  const selectedQuestionAngles = listToBulletText(variationPlan?.questionAngles || []);
  const selectedKbatMix = listToBulletText(variationPlan?.kbatMix || []);

  return `
=== KANDUNGAN WAJIB BAB ===
Tingkatan: ${chapterData.form}
Bab: ${chapterData.chapter}
Tajuk: ${chapterData.title}

Sinopsis:
${chapterData.synopsis || 'Tiada sinopsis'}

Isi pembelajaran:
${learningPoints}

Istilah penting:
${keyTerms}

Fakta penting:
${keyFacts}

Fokus penguasaan bab:
${focusAreas}

Sudut soalan yang dibenarkan:
${possibleAngles}

Sudut KBAT:
${kbatAngles}
=== AKHIR KANDUNGAN WAJIB BAB ===

=== PELAN VARIASI JANAAN UNTUK PUSINGAN INI ===
Fokus yang perlu diutamakan dalam set kali ini:
${selectedFocusMix}

Sudut soalan yang WAJIB dicampurkan dalam set kali ini:
${selectedQuestionAngles}

Sudut KBAT yang perlu diberi keutamaan:
${selectedKbatMix}
=== AKHIR PELAN VARIASI ===
`;
}

function normalizeMcqQuestions(questions) {
  if (!Array.isArray(questions)) return [];

  return questions.map((q) => {
    if (!q || !Array.isArray(q.opts) || typeof q.ans !== 'number') {
      return q;
    }

    const originalOptions = [...q.opts];
    const correctAnswerText = originalOptions[q.ans];

    const shuffledOptions = shuffleArray(originalOptions);
    const newAnswerIndex = shuffledOptions.findIndex(
      (opt) => opt === correctAnswerText
    );

    return {
      ...q,
      opts: shuffledOptions,
      ans: newAnswerIndex >= 0 ? newAnswerIndex : q.ans
    };
  });
}

function sanitizeMcqQuestions(questions, totalQuestions) {
  if (!Array.isArray(questions)) return [];

  const cleaned = questions
    .filter(q =>
      q &&
      typeof q.q === 'string' &&
      q.q.trim() &&
      Array.isArray(q.opts) &&
      q.opts.length === 4 &&
      typeof q.ans === 'number' &&
      q.ans >= 0 &&
      q.ans <= 3 &&
      typeof q.exp === 'string' &&
      q.exp.trim()
    )
    .map(q => ({
      q: String(q.q).trim(),
      opts: q.opts.map(opt => String(opt).trim()),
      ans: Number(q.ans),
      exp: String(q.exp).trim(),
      level: ['mudah', 'sederhana', 'kbat'].includes(String(q.level).toLowerCase())
        ? String(q.level).toLowerCase()
        : 'sederhana'
    }));

  return cleaned.slice(0, totalQuestions);
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
    const {
      mode,
      scopeLabel,
      questions,
      context,
      studentAnswers,
      questionCount,
      quizMode,
      selectedSkop,
      selectedSesi
    } = body;

    let systemText = '';
    let userText = '';
    let model = 'gpt-5.4-mini';

    const totalQuestions = Number(questionCount) || 10;
    const distribution = getQuestionDistribution(totalQuestions);

    const chapterData =
      quizMode === 'chapter'
        ? loadChapterData(selectedSkop, selectedSesi)
        : null;

    const variationPlan = buildVariationPlan(chapterData, mode, totalQuestions);
    const chapterContext = buildChapterContext(chapterData, variationPlan);

    if (mode === 'mcq') {
      model = 'gpt-5.4-nano';

      systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang sangat ketat terhadap skop bab.
Tugas anda ialah menjana soalan HANYA daripada kandungan bab yang diberi.
JANGAN campurkan fakta daripada bab lain.
JANGAN guna pengetahuan umum jika kandungan bab telah diberi.
Jika maklumat tiada dalam kandungan bab, jangan reka fakta tambahan.

Anda juga mesti mempelbagaikan jenis soalan.
JANGAN bina semua soalan dengan corak yang sama.
Gunakan campuran:
- fakta langsung
- istilah
- sebab dan akibat
- perbandingan
- kronologi
- aplikasi mudah
- analisis berasaskan bab
- inferens berasaskan bab

Jana TEPAT ${totalQuestions} soalan objektif berkualiti tinggi.
Campuran aras mestilah:
- ${distribution.mudah} soalan mudah
- ${distribution.sederhana} soalan sederhana
- ${distribution.kbat} soalan KBAT

${chapterContext}

Balas dalam JSON SAHAJA dengan format:
{
  "questions": [
    {
      "q": "Soalan",
      "opts": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
      "ans": 0,
      "exp": "Penjelasan ringkas yang merujuk kandungan bab",
      "level": "mudah"
    }
  ]
}

Peraturan sangat penting:
- Bahasa Melayu
- Semua soalan mesti datang daripada kandungan bab yang diberi
- Jangan masukkan topik daripada bab lain
- Jangan ulang semula ayat soalan dengan pola yang sama
- Jangan jadikan semua soalan berbentuk definisi
- Soalan mesti meliputi beberapa bahagian berbeza dalam bab
- Gunakan istilah penting, fakta penting, fokus bab dan sudut soalan yang diberi
- Jika "focus_areas" dan "possible_question_angles" diberi, anda WAJIB gunakannya untuk mempelbagaikan set
- Elakkan dua soalan yang hanya berbeza pada satu perkataan
- Fakta mesti tepat
- Pilihan jawapan mesti 4 sahaja
- "ans" ialah index 0 hingga 3
- "level" mesti salah satu daripada: mudah, sederhana, kbat
- Elakkan pilihan jawapan yang terlalu jelas salah
- Elakkan meletakkan jawapan betul terlalu kerap pada pilihan pertama
- Soalan mudah = fakta asas / pengetahuan langsung dalam bab
- Soalan sederhana = kefahaman / sebab-akibat / aplikasi mudah dalam bab
- Soalan KBAT = analisis / inferens / penilaian berdasarkan bab
- Penjelasan "exp" mesti selaras dengan fakta bab yang diberi
- Sekurang-kurangnya 60% soalan mesti datang daripada focus_areas dan possible_question_angles terpilih dalam pelan variasi
`;

      userText = `
Skop dipilih pengguna:
${scopeLabel}

Tingkatan dipilih:
${selectedSkop}

Bab dipilih:
${selectedSesi}

${chapterData ? `Tajuk bab sebenar: ${chapterData.title}` : 'TIADA DATA BAB DIJUMPAI'}

Jana ${totalQuestions} soalan objektif yang mematuhi kandungan bab ini sahaja.

Agihan wajib:
- Mudah: ${distribution.mudah}
- Sederhana: ${distribution.sederhana}
- KBAT: ${distribution.kbat}

Pelan variasi fokus set ini:
${listToBulletText(variationPlan.focusMix)}

Pelan variasi sudut soalan set ini:
${listToBulletText(variationPlan.questionAngles)}

Pelan variasi KBAT set ini:
${listToBulletText(variationPlan.kbatMix)}

Pastikan set ini pelbagai, tidak berulang dan tidak terlalu tertumpu pada satu jenis soalan sahaja.
`;
    } else if (mode === 'structured') {
      model = 'gpt-5.4-mini';

      systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang sangat ketat terhadap skop bab.
Tugas anda ialah menjana soalan struktur HANYA daripada kandungan bab yang diberi.
JANGAN campurkan fakta daripada bab lain.
JANGAN guna pengetahuan umum jika kandungan bab telah diberi.

Anda juga mesti mempelbagaikan bentuk bahagian soalan:
- fakta asas
- kefahaman
- sebab-akibat
- aplikasi
- analisis
- inferens
- penilaian

${chapterContext}

Balas dalam JSON SAHAJA dengan format:
{
  "context": "Petikan atau rangsangan ringkas berdasarkan bab",
  "questions": [
    { "id": "a", "q": "Soalan", "marks": 2, "model": "Jawapan contoh" },
    { "id": "b", "q": "Soalan", "marks": 4, "model": "Jawapan contoh" },
    { "id": "c", "q": "Soalan", "marks": 4, "model": "Jawapan contoh" }
  ]
}

Peraturan:
- Bahasa Melayu
- Semua soalan mesti datang daripada kandungan bab yang diberi
- Jangan masukkan topik daripada bab lain
- Gunakan focus_areas dan possible_question_angles jika diberi
- Petikan atau rangsangan mesti serasi dengan bab
- Jumlah markah 10
- Fakta tepat
- Bahagian (a) lebih asas
- Bahagian (b) sederhana
- Bahagian (c) lebih mencabar / berunsur KBAT
- Jawapan model mesti padat, tepat dan berpandukan bab
- Jangan jadikan ketiga-tiga bahagian terlalu serupa
`;

      userText = `
Skop dipilih pengguna:
${scopeLabel}

Tingkatan dipilih:
${selectedSkop}

Bab dipilih:
${selectedSesi}

${chapterData ? `Tajuk bab sebenar: ${chapterData.title}` : 'TIADA DATA BAB DIJUMPAI'}

Jana satu set soalan struktur berdasarkan bab ini sahaja.

Gunakan pelan variasi berikut:
Fokus:
${listToBulletText(variationPlan.focusMix)}

Sudut soalan:
${listToBulletText(variationPlan.questionAngles)}

Sudut KBAT:
${listToBulletText(variationPlan.kbatMix)}
`;
    } else if (mode === 'mark-structured') {
      model = 'gpt-5.4-mini';

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
- Jangan terlalu kedekut dan jangan terlalu murah markah
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
      model,
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

    if (mode === 'mcq' && Array.isArray(parsed.questions)) {
      parsed.questions = sanitizeMcqQuestions(parsed.questions, totalQuestions);
      parsed.questions = normalizeMcqQuestions(parsed.questions);
    }

    return jsonResponse(200, {
      ...parsed,
      debug_source: chapterData
        ? {
            form: chapterData.form,
            chapter: chapterData.chapter,
            title: chapterData.title
          }
        : null,
      debug_variation_plan: chapterData
        ? {
            focusMix: variationPlan.focusMix,
            questionAngles: variationPlan.questionAngles,
            kbatMix: variationPlan.kbatMix
          }
        : null
    });

  } catch (error) {
    console.error('Function error full:', error);

    let userMessage = 'Ralat backend AI.';
    const apiMessage = error?.error?.message || error?.message || '';
    const errorCode = error?.code || error?.error?.code || null;
    const errorType = error?.type || error?.error?.type || null;
    const errorStatus = error?.status || null;

    if (
      errorStatus === 429 ||
      errorCode === 'insufficient_quota' ||
      errorType === 'insufficient_quota'
    ) {
      userMessage = 'Kuota AI telah habis atau billing API belum aktif. Sila semak OpenAI billing.';
    } else if (errorStatus === 401) {
      userMessage = 'API key tidak sah atau tidak dibaca oleh server.';
    } else if (errorStatus === 404) {
      userMessage = 'Model AI tidak dijumpai.';
    } else if (
      String(apiMessage).toLowerCase().includes('mismatched source ip') ||
      String(apiMessage).toLowerCase().includes('mismatched client ip') ||
      String(errorCode).toLowerCase().includes('mismatched_client_ip')
    ) {
      userMessage = 'Ralat sambungan rangkaian dikesan (mismatched source IP). Cuba matikan VPN/Private Relay dan mulakan semula netlify dev.';
    } else if (apiMessage) {
      userMessage = apiMessage;
    }

    return jsonResponse(500, {
      error: userMessage,
      debug: {
        message: apiMessage || null,
        code: errorCode,
        type: errorType,
        status: errorStatus
      }
    });
  }
};