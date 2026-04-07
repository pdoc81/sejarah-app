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

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log('JSON file not found:', filePath);
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error reading JSON file:', filePath, error);
    return null;
  }
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
    const parsed = readJsonFile(filePath);

    if (parsed) {
      console.log('Chapter file loaded:', {
        form: parsed.form,
        chapter: parsed.chapter,
        title: parsed.title
      });
    }

    return parsed;
  } catch (error) {
    console.error('Error loading chapter data:', error);
    return null;
  }
}

function loadExamPattern(mode) {
  try {
    const fileName =
      mode === 'mcq'
        ? 'kertas1_patterns.json'
        : mode === 'structured'
          ? 'kertas2_patterns.json'
          : null;

    if (!fileName) return null;

    const filePath = path.join(
      process.cwd(),
      'data',
      'exams',
      'form45',
      fileName
    );

    console.log('Trying exam pattern file:', filePath);

    const parsed = readJsonFile(filePath);

    if (parsed) {
      console.log('Exam pattern loaded:', {
        paper: parsed.paper,
        source: parsed.source,
        exam_type: parsed.exam_type
      });
    }

    return parsed;
  } catch (error) {
    console.error('Error loading exam pattern:', error);
    return null;
  }
}

function buildVariationPlan(chapterData, examPattern, mode, totalQuestions) {
  if (chapterData) {
    const focusLimit = mode === 'mcq'
      ? Math.min(5, Math.max(3, Math.ceil(totalQuestions / 3)))
      : 4;

    const angleLimit = mode === 'mcq'
      ? Math.min(6, Math.max(4, Math.ceil(totalQuestions / 2)))
      : 4;

    const kbatLimit = mode === 'mcq' ? 3 : 2;

    return {
      sourceType: 'chapter',
      focusMix: pickItems(chapterData.focus_areas || [], focusLimit),
      questionAngles: pickItems(chapterData.possible_question_angles || [], angleLimit),
      kbatMix: pickItems(chapterData.kbat_angles || [], kbatLimit)
    };
  }

  if (examPattern) {
    if (mode === 'mcq') {
      return {
        sourceType: 'exam',
        questionStyles: pickItems(examPattern.question_styles || [], 6),
        stemPatterns: pickItems(examPattern.common_stem_patterns || [], 5),
        distractorPatterns: pickItems(examPattern.distractor_patterns || [], 4),
        kbatPatterns: pickItems(
          examPattern.difficulty_profile?.kbat || examPattern.kbat_patterns || [],
          4
        ),
        topicMix: pickItems(
          [
            ...(examPattern.topic_patterns?.form4 || []),
            ...(examPattern.topic_patterns?.form5 || [])
          ],
          Math.min(8, Math.max(4, Math.ceil(totalQuestions / 3)))
        )
      };
    }

    if (mode === 'structured') {
      return {
        sourceType: 'exam',
        stimulusMix: pickItems(examPattern.stimulus_types || [], 4),
        commandMix: pickItems(examPattern.common_command_words || [], 6),
        sectionAPatterns: examPattern.section_a_patterns || [],
        sectionBPatterns: examPattern.section_b_patterns || [],
        kbatPromptMix: pickItems(examPattern.kbat_prompt_patterns || [], 4),
        topicMix: pickItems(examPattern.topic_coverage_examples || [], 5)
      };
    }
  }

  return {
    sourceType: 'none'
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

function buildExamContext(examPattern, variationPlan, mode, totalQuestions) {
  if (!examPattern) return '';

  if (mode === 'mcq') {
    return `
=== POLA WAJIB MOD PERCUBAAN KERTAS 1 ===
Sumber pola: ${examPattern.source || 'Tidak dinyatakan'}
Jenis peperiksaan: ${examPattern.exam_type || 'trial'}
Skop tingkatan: ${Array.isArray(examPattern.form_scope) ? examPattern.form_scope.join(', ') : '4,5'}

Struktur rasmi:
- Jumlah soalan penuh: ${examPattern.structure?.total_questions || 40}
- Bentuk jawapan: objektif
- Pilihan jawapan setiap soalan: ${examPattern.structure?.options_per_question || 4}
- Agihan Tingkatan 4: ${examPattern.structure?.form4_questions || 20}
- Agihan Tingkatan 5: ${examPattern.structure?.form5_questions || 20}

Gaya soalan biasa:
${listToBulletText(examPattern.question_styles)}

Stem soalan biasa:
${listToBulletText(examPattern.common_stem_patterns)}

Jenis stimulus biasa:
${listToBulletText(examPattern.stimulus_types)}

Corak distractor:
${listToBulletText(examPattern.distractor_patterns)}

Profil aras mudah:
${listToBulletText(examPattern.difficulty_profile?.mudah)}

Profil aras sederhana:
${listToBulletText(examPattern.difficulty_profile?.sederhana)}

Profil aras KBAT:
${listToBulletText(examPattern.difficulty_profile?.kbat)}

Topik Tingkatan 4:
${listToBulletText(examPattern.topic_patterns?.form4)}

Topik Tingkatan 5:
${listToBulletText(examPattern.topic_patterns?.form5)}
=== AKHIR POLA WAJIB ===

=== PELAN VARIASI MOD PERCUBAAN UNTUK SET INI ===
Gaya soalan terpilih:
${listToBulletText(variationPlan?.questionStyles)}

Stem soalan terpilih:
${listToBulletText(variationPlan?.stemPatterns)}

Corak distractor terpilih:
${listToBulletText(variationPlan?.distractorPatterns)}

Corak KBAT terpilih:
${listToBulletText(variationPlan?.kbatPatterns)}

Campuran topik terpilih:
${listToBulletText(variationPlan?.topicMix)}
=== AKHIR PELAN VARIASI ===

=== PERATURAN AGIHAN SET INI ===
- Jika pengguna minta ${totalQuestions} soalan, cuba campurkan Tingkatan 4 dan Tingkatan 5 secara seimbang
- Jika set besar, seboleh mungkin sentuh pelbagai bab
- Kekalkan gaya seperti trial sebenar: ringkas, padat, tepat
=== AKHIR PERATURAN ===
`;
  }

  if (mode === 'structured') {
    const sectionAPatterns = Array.isArray(variationPlan?.sectionAPatterns)
      ? variationPlan.sectionAPatterns.map(item => `- Bahagian ${item.part}: ${item.style} (${item.typical_marks} markah biasa)`).join('\n')
      : '- Tiada';

    const sectionBPatterns = Array.isArray(variationPlan?.sectionBPatterns)
      ? variationPlan.sectionBPatterns.map(item => `- Bahagian ${item.part}: ${item.style} (${item.typical_marks} markah biasa)`).join('\n')
      : '- Tiada';

    return `
=== POLA WAJIB MOD PERCUBAAN KERTAS 2 ===
Sumber pola: ${examPattern.source || 'Tidak dinyatakan'}
Jenis peperiksaan: ${examPattern.exam_type || 'trial'}
Skop tingkatan: ${Array.isArray(examPattern.form_scope) ? examPattern.form_scope.join(', ') : '4,5'}

Struktur Bahagian A:
- Bilangan soalan: ${examPattern.structure?.section_a?.question_count || 4}
- Wajib jawab: ${examPattern.structure?.section_a?.must_answer ? 'Ya' : 'Tidak'}
- Jumlah markah: ${examPattern.structure?.section_a?.total_marks || 40}

Struktur Bahagian B:
- Bilangan soalan: ${examPattern.structure?.section_b?.question_count || 5}
- Pilih jawab: ${examPattern.structure?.section_b?.choose || 3}
- Jumlah markah: ${examPattern.structure?.section_b?.total_marks || 60}

Jenis stimulus biasa:
${listToBulletText(examPattern.stimulus_types)}

Kata tugas biasa:
${listToBulletText(examPattern.common_command_words)}

Pola Bahagian A:
${sectionAPatterns}

Pola Bahagian B:
${sectionBPatterns}

Jangkaan jawapan:
${listToBulletText(examPattern.observed_answer_expectations)}

Panduan semakan fakta:
${listToBulletText(examPattern.auto_marking_guidelines?.short_response)}

Panduan semakan jawapan panjang:
${listToBulletText(examPattern.auto_marking_guidelines?.extended_response)}
=== AKHIR POLA WAJIB ===

=== PELAN VARIASI MOD PERCUBAAN UNTUK SET INI ===
Stimulus terpilih:
${listToBulletText(variationPlan?.stimulusMix)}

Kata tugas terpilih:
${listToBulletText(variationPlan?.commandMix)}

Corak prompt KBAT terpilih:
${listToBulletText(variationPlan?.kbatPromptMix)}

Campuran topik terpilih:
${listToBulletText(variationPlan?.topicMix)}
=== AKHIR PELAN VARIASI ===
`;
  }

  return '';
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
        : 'sederhana',
      form: q.form ? Number(q.form) : undefined,
      chapter: q.chapter ? Number(q.chapter) : undefined
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

    const isChapterMode = quizMode === 'chapter';
    const isExamMode = quizMode === 'exam';

    const chapterData = isChapterMode
      ? loadChapterData(selectedSkop, selectedSesi)
      : null;

    const examPattern = isExamMode
      ? loadExamPattern(mode)
      : null;

    const variationPlan = buildVariationPlan(chapterData, examPattern, mode, totalQuestions);
    const chapterContext = buildChapterContext(chapterData, variationPlan);
    const examContext = buildExamContext(examPattern, variationPlan, mode, totalQuestions);

    if (mode === 'mcq') {
      model = 'gpt-5.4-nano';

      if (isExamMode) {
        systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang membina set soalan gaya percubaan SPM.
Tugas anda ialah menjana soalan objektif gaya trial sebenar berdasarkan pola peperiksaan yang diberi.

JANGAN keluar daripada skop Sejarah SPM Tingkatan 4 dan Tingkatan 5.
JANGAN hasilkan soalan yang terlalu umum atau terlalu santai.
JANGAN jadikan semua soalan berbentuk definisi.
JANGAN ulang pola soalan yang sama berkali-kali.

Anda mesti mematuhi gaya peperiksaan berikut:
- stem ringkas dan tepat
- pilihan jawapan munasabah
- distractor hampir sama kekuatan
- gabungan fakta, kefahaman, sebab-akibat, peranan, kesan dan KBAT ringan
- campuran topik Tingkatan 4 dan Tingkatan 5

Jana TEPAT ${totalQuestions} soalan objektif berkualiti tinggi.
Campuran aras mestilah:
- ${distribution.mudah} soalan mudah
- ${distribution.sederhana} soalan sederhana
- ${distribution.kbat} soalan KBAT

${examContext}

Balas dalam JSON SAHAJA dengan format:
{
  "questions": [
    {
      "q": "Soalan",
      "opts": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
      "ans": 0,
      "exp": "Penjelasan ringkas",
      "level": "mudah",
      "form": 4,
      "chapter": 1
    }
  ]
}

Peraturan:
- Bahasa Melayu
- Ikut gaya trial SPM Sejarah
- Campurkan Tingkatan 4 dan Tingkatan 5
- Jika soalan sentuh topik Tingkatan 4, letak "form": 4
- Jika soalan sentuh topik Tingkatan 5, letak "form": 5
- Letak "chapter" yang paling berkaitan jika boleh
- Pilihan jawapan mesti 4 sahaja
- "ans" ialah index 0 hingga 3
- "level" mesti salah satu daripada: mudah, sederhana, kbat
- Elakkan jawapan terlalu jelas
- Elakkan jawapan betul terlalu kerap di pilihan pertama
- Gunakan sekurang-kurangnya sebahagian stem, gaya dan topik daripada pola peperiksaan yang diberi
- Pastikan set ini pelbagai dan tidak berulang
`;
        userText = `
Mod dipilih:
Percubaan SPM Sejarah Kertas 1

Skop:
${scopeLabel || 'Gabungan Tingkatan 4 dan Tingkatan 5'}

Jana ${totalQuestions} soalan objektif gaya percubaan sebenar.

Agihan aras wajib:
- Mudah: ${distribution.mudah}
- Sederhana: ${distribution.sederhana}
- KBAT: ${distribution.kbat}

Campurkan topik Tingkatan 4 dan Tingkatan 5 secara munasabah.
`;
      } else {
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
      }
    } else if (mode === 'structured') {
      model = 'gpt-5.4-mini';

      if (isExamMode) {
        systemText = `
Anda ialah guru Sejarah KSSM Malaysia yang membina set soalan gaya percubaan SPM Kertas 2.
Tugas anda ialah menjana set soalan struktur / esei berdasarkan pola peperiksaan yang diberi.

Anda mesti mengekalkan rasa dan format trial sebenar:
- ada rangsangan seperti petikan, pernyataan, rajah atau maklumat ringkas
- soalan kecil bergerak daripada fakta kepada huraian dan KBAT
- jawapan model perlu jelas dan mudah disemak
- bahagian KBAT perlu matang tetapi masih sesuai untuk calon SPM

${examContext}

Balas dalam JSON SAHAJA dengan format:
{
  "context": "Petikan atau rangsangan ringkas berdasarkan gaya peperiksaan",
  "questions": [
    { "id": "a", "q": "Soalan", "marks": 2, "model": "Jawapan contoh" },
    { "id": "b", "q": "Soalan", "marks": 4, "model": "Jawapan contoh" },
    { "id": "c", "q": "Soalan", "marks": 4, "model": "Jawapan contoh" }
  ]
}

Peraturan:
- Bahasa Melayu
- Gaya mesti menyerupai soalan percubaan sebenar
- Campurkan Tingkatan 4 dan Tingkatan 5 secara munasabah jika sesuai
- Bahagian (a) lebih asas dan terus
- Bahagian (b) lebih menghuraikan
- Bahagian (c) lebih KBAT, ulasan, kepentingan, iktibar atau aplikasi
- Gunakan kata tugas peperiksaan sebenar seperti nyatakan, jelaskan, huraikan, ulaskan
- Jawapan model mesti padat, tepat dan mudah dipadankan semasa semakan
- Elakkan soalan terlalu umum
`;
        userText = `
Mod dipilih:
Percubaan SPM Sejarah Kertas 2

Skop:
${scopeLabel || 'Gabungan Tingkatan 4 dan Tingkatan 5'}

Jana satu set soalan gaya percubaan sebenar dengan 3 bahagian kecil:
- (a) asas
- (b) huraian
- (c) KBAT / ulasan

Gunakan stimulus yang munasabah dan gaya skema yang mudah disemak.
`;
      } else {
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
      }
    } else if (mode === 'mark-structured') {
      model = 'gpt-5.4-mini';

      if (isExamMode) {
        systemText = `
Anda ialah pemeriksa Sejarah KSSM Malaysia yang menyemak jawapan gaya percubaan SPM Kertas 2.
Semak jawapan murid dengan adil, padankan dengan kehendak kata tugas, ketepatan isi, huraian dan unsur KBAT.

Gunakan pendekatan berikut:
- bahagian fakta: beri markah ikut poin tepat
- bahagian ulasan/KBAT: nilai berdasarkan ketepatan, relevan, huraian, inferens dan kematangan jawapan
- terima sinonim yang tepat
- jangan terlalu kedekut dan jangan terlalu murah markah

Balas dalam JSON SAHAJA dengan format:
{
  "results": [
    { "id": "a", "marks_awarded": 1, "feedback": "Maklum balas ringkas" }
  ],
  "total": 0
}
`;
      } else {
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
      }

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
            type: 'chapter',
            form: chapterData.form,
            chapter: chapterData.chapter,
            title: chapterData.title
          }
        : examPattern
          ? {
              type: 'exam',
              paper: examPattern.paper,
              source: examPattern.source,
              exam_type: examPattern.exam_type
            }
          : null,
      debug_variation_plan: variationPlan || null
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