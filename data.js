/* =========================================================
   data.js — static content, schemas and seed values.
   No fake progress history is generated here on purpose.
   ========================================================= */
window.DB = (function () {

  /* ---------------- profile baseline ---------------- */
  const PROFILE = {
    name: 'Pratham Sukhadia',
    degree: 'BCA',
    cgpa: 6.77,
    goal: "Master's in Germany",
    targetYear: 2027,
    examDate: '2026-10-17',
    startDate: '2026-08-17',
    baseline: { listening: 7.0, reading: 5.5, writing: 6.0, speaking: 6.25 },
    baselineRange: {
      listening: '6.5–7.5', reading: '5.0–5.5', writing: '5.5–6.5',
      speaking: '6.0–6.5', overall: '6.0–6.5'
    },
    targets: { listening: 7.5, reading: 7.0, writing: 7.0, speaking: 7.0, overall: 7.0, floor: 6.0 },
    germanLevel: 'A1',
    germanTarget: 'B1'
  };

  /* ---------------- weekly mandatory classes ---------------- */
  const CLASSES = {
    0: { name: 'Recovery + weekly review', tag: 'review', note: 'Light day. Review the week, plan the next one.' },
    1: { name: 'Writing Task 2', tag: 'ielts', note: 'Essay structure and argument development.' },
    2: { name: 'Speaking', tag: 'ielts', note: 'Fluency and extended answers.' },
    3: { name: 'Listening', tag: 'ielts', note: 'Prediction, spelling and distractors.' },
    4: { name: 'Reading', tag: 'ielts', note: 'Your weakest module. Bring your mistake book.' },
    5: { name: 'Writing Task 1', tag: 'ielts', note: 'Data description and overview sentences.' },
    6: { name: 'FLT / FLT review', tag: 'flt', note: 'Alternating full length test and review week.' }
  };

  /* ---------------- daily time structure ---------------- */
  const SCHEDULE = [
    { time: '07:00', label: 'Gym', kind: 'life' },
    { time: '09:30', label: 'IELTS class (until 13:00)', kind: 'ielts' },
    { time: '14:00', label: 'Main IELTS self-study (until 17:00)', kind: 'study' },
    { time: '18:00', label: 'Secondary study, work or free time (until 20:30)', kind: 'flex' },
    { time: '20:30', label: 'Dinner', kind: 'life' },
    { time: '22:00', label: 'German + vocabulary wind-down', kind: 'german' },
    { time: '00:00', label: 'Sleep target', kind: 'life' }
  ];

  /* ---------------- study modes ---------------- */
  const MODES = {
    full:   { label: 'Full day',   minutes: 165, note: '2.5–3 hours of self-study on top of class.' },
    normal: { label: 'Normal day', minutes: 105, note: '1.5–2 hours of self-study. The sustainable default.' },
    busy:   { label: 'Busy day',   minutes: 50,  note: '45–60 minutes. Protect the streak, do the highest-value work only.' }
  };

  /* ---------------- phases ---------------- */
  const PHASES = [
    { n: 1, title: 'IELTS intensive', from: '2026-08-17', to: 'exam', split: 'IELTS 80% · German 20%',
      focus: 'Reading and Writing to 7.0, hold Listening, lift Speaking.' },
    { n: 2, title: 'Germany applications + German A2', from: 'exam', to: '2026-12-31', split: 'Applications 30% · German 60% · IELTS upkeep 10%',
      focus: 'University shortlist, APS, documents, A1 → A2.' },
    { n: 3, title: 'German B1 + Germany preparation', from: '2027-01-01', to: '2027-03-31', split: 'German 70% · Applications 30%',
      focus: 'B1 exam preparation, visa file, accommodation research.' },
    { n: 4, title: 'German B2 + relocation', from: '2027-04-01', to: '2027-12-31', split: 'German 80% · Relocation 20%',
      focus: 'B2 work, blocked account, flights, arrival plan.' }
  ];

  /* ---------------- reading question types ---------------- */
  const READING_TYPES = [
    'True/False/Not Given', 'Yes/No/Not Given', 'Matching Headings', 'Matching Information',
    'Matching Features', 'Multiple Choice', 'Sentence Completion', 'Summary Completion',
    'Diagram Labels', 'Short Answer'
  ];
  const LISTENING_ERRORS = ['Spelling', 'Distractor', 'Lost concentration', 'Vocabulary',
    'Pronunciation', 'Missed information', 'Multiple choice confusion', 'Plural / singular'];
  const WRITING_ERRORS = ['Subject–verb agreement', 'Articles', 'Prepositions', 'Tense',
    'Sentence structure', 'Spelling', 'Punctuation', 'Word form', 'Weak argument',
    'Repetition', 'Cohesion', 'Vocabulary choice', 'Task response', 'Word count'];

  /* ---------------- form + table schemas ---------------- */
  const T = (name, label, extra) => Object.assign({ name, label, type: 'text' }, extra || {});
  const N = (name, label, extra) => Object.assign({ name, label, type: 'number', step: 'any' }, extra || {});
  const B = (name, label, extra) => Object.assign({ name, label, type: 'number', step: 0.5, min: 0, max: 9 }, extra || {});
  const D = (name, label, extra) => Object.assign({ name, label, type: 'date' }, extra || {});
  const S = (name, label, options, extra) => Object.assign({ name, label, type: 'select', options }, extra || {});
  const A = (name, label, extra) => Object.assign({ name, label, type: 'textarea' }, extra || {});

  const MASTERY = ['New', 'Learning', 'Familiar', 'Mastered'];

  const SCHEMAS = {
    ieltsScores: {
      title: 'IELTS score', sort: 'date',
      fields: [
        D('date', 'Date', { required: true, col: 1 }),
        T('test', 'Test name', { col: 1, placeholder: 'Cambridge 18 Test 2' }),
        T('source', 'Source', { placeholder: 'Institute / Cambridge / online' }),
        B('listening', 'Listening', { col: 1, num: 1 }),
        B('reading', 'Reading', { col: 1, num: 1 }),
        B('writing', 'Writing', { col: 1, num: 1 }),
        B('speaking', 'Speaking', { col: 1, num: 1 }),
        A('notes', 'Notes')
      ],
      derived: [{ key: 'overall', label: 'Overall', col: 1, num: 1 }]
    },
    dailyScores: {
      title: 'Daily score', sort: 'date',
      fields: [
        D('date', 'Date', { required: true, col: 1 }),
        T('day', 'Day', { col: 1, placeholder: 'e.g. Tuesday' }),
        S('module', 'Module', ['Listening', 'Reading', 'Writing', 'Speaking'], { col: 1, required: true }),
        B('band', 'Band score', { col: 1, num: 1, required: true }),
        S('source', 'Source', ['Class', 'Self Practice', 'Mock Test', 'FLT', 'Teacher Feedback'], { col: 1 }),
        T('topic', 'Topic / Activity', { col: 1, placeholder: 'e.g. Cambridge 18 T2 passage' }),
        A('notes', 'Notes')
      ]
    },
    fltTests: {
      title: 'Full length test', sort: 'date',
      fields: [
        N('number', 'FLT number', { col: 1, min: 1, step: 1 }),
        D('date', 'Date', { required: true, col: 1 }),
        T('source', 'Source', { placeholder: 'Institute FLT / Cambridge' }),
        B('listening', 'Listening', { col: 1, num: 1 }),
        B('reading', 'Reading', { col: 1, num: 1 }),
        B('writing', 'Writing', { col: 1, num: 1 }),
        B('speaking', 'Speaking', { col: 1, num: 1 }),
        N('duration', 'Duration (min)', { min: 0, step: 5 }),
        S('difficulty', 'Difficulty', ['Easy', 'Normal', 'Hard']),
        N('confidence', 'Confidence (1–5)', { min: 1, max: 5, step: 1 }),
        S('weakType', 'Question type with most errors', ['', ...READING_TYPES]),
        S('status', 'Status', ['Planned', 'Completed', 'Reviewed'], { col: 1 }),
        A('notes', 'Notes')
      ],
      derived: [{ key: 'overall', label: 'Overall', col: 1, num: 1 }]
    },
    readingSessions: {
      title: 'Reading practice', sort: 'date',
      fields: [
        D('date', 'Date', { required: true, col: 1 }),
        T('passage', 'Passage', { col: 1, placeholder: 'Cam 17 T3 P2 — Urban farming' }),
        S('questionType', 'Question type', READING_TYPES, { col: 1, required: true }),
        N('attempted', 'Questions attempted', { min: 1, step: 1, col: 1, required: true }),
        N('correct', 'Correct', { min: 0, step: 1, col: 1, required: true }),
        N('timeTaken', 'Time taken (min)', { min: 0, step: 1, col: 1 }),
        T('source', 'Source'),
        A('notes', 'Notes')
      ],
      derived: [
        { key: 'accuracy', label: 'Accuracy', col: 1 },
        { key: 'perQ', label: 'Time / question', col: 1 }
      ]
    },
    readingErrors: {
      title: 'Reading mistake', sort: 'date',
      fields: [
        D('date', 'Date', { required: true, col: 1 }),
        T('test', 'Test', { col: 1 }),
        T('passage', 'Passage'),
        T('qNumber', 'Question number', { col: 1 }),
        S('questionType', 'Question type', READING_TYPES, { col: 1, required: true }),
        T('myAnswer', 'My answer', { col: 1 }),
        T('correctAnswer', 'Correct answer', { col: 1 }),
        A('whyIChose', 'Why I chose my answer'),
        A('whyCorrect', 'Why the correct answer is correct'),
        A('evidence', 'Evidence from the passage'),
        T('vocab', 'New vocabulary'),
        A('lesson', 'Lesson learned')
      ]
    },
    writingSessions: {
      title: 'Writing entry', sort: 'date',
      fields: [
        D('date', 'Date', { required: true, col: 1 }),
        S('task', 'Task', ['Task 1', 'Task 2'], { col: 1, required: true }),
        T('essayType', 'Essay / chart type', { col: 1, placeholder: 'Opinion, Discussion, Line graph…' }),
        A('question', 'Question'),
        N('wordCount', 'Word count', { min: 0, step: 10, col: 1 }),
        N('timeTaken', 'Time (min)', { min: 0, step: 5 }),
        B('taskResponse', 'Task response', { col: 1, num: 1 }),
        B('coherence', 'Coherence & cohesion', { col: 1, num: 1 }),
        B('lexical', 'Lexical resource', { col: 1, num: 1 }),
        B('grammar', 'Grammar range & accuracy', { col: 1, num: 1 }),
        A('remarks', 'Teacher remarks'),
        A('mistakes', 'Mistakes'),
        A('rewrite', 'Rewritten version')
      ],
      derived: [{ key: 'band', label: 'Est. band', col: 1, num: 1 }]
    },
    writingErrors: {
      title: 'Writing error', sort: 'date',
      fields: [
        D('date', 'Date', { required: true, col: 1 }),
        S('category', 'Category', WRITING_ERRORS, { col: 1, required: true }),
        A('example', 'What I wrote', { col: 1 }),
        A('correction', 'Correct version', { col: 1 }),
        A('note', 'Rule to remember')
      ]
    },
    listeningSessions: {
      title: 'Listening practice', sort: 'date',
      fields: [
        D('date', 'Date', { required: true, col: 1 }),
        T('source', 'Source', { col: 1, placeholder: 'Cam 16 Test 1' }),
        S('section', 'Section', ['Section 1', 'Section 2', 'Section 3', 'Section 4', 'Full test'], { col: 1 }),
        N('total', 'Questions', { min: 1, step: 1, col: 1, required: true }),
        N('correct', 'Correct', { min: 0, step: 1, col: 1, required: true }),
        S('errorCategory', 'Main error category', ['', ...LISTENING_ERRORS], { col: 1 }),
        A('mistakes', 'Mistakes'),
        A('notes', 'Notes')
      ],
      derived: [{ key: 'band', label: 'Est. band', col: 1, num: 1 }]
    },
    speakingSessions: {
      title: 'Speaking practice', sort: 'date',
      fields: [
        D('date', 'Date', { required: true, col: 1 }),
        S('part', 'Part', ['Part 1', 'Part 2', 'Part 3'], { col: 1, required: true }),
        T('topic', 'Topic', { col: 1 }),
        N('duration', 'Duration (min)', { min: 0, step: 1, col: 1 }),
        N('confidence', 'Confidence (1–5)', { min: 1, max: 5, step: 1 }),
        B('band', 'Estimated band', { col: 1, num: 1 }),
        T('vocabulary', 'Vocabulary used'),
        A('grammarMistakes', 'Grammar mistakes'),
        A('pronunciationMistakes', 'Pronunciation mistakes'),
        T('fillers', 'Filler words', { placeholder: 'like, actually, umm' }),
        A('notes', 'Notes')
      ]
    },
    studySessions: {
      title: 'Study session', sort: 'date',
      fields: [
        D('date', 'Date', { required: true, col: 1 }),
        S('focus', 'Focus', ['Reading', 'Writing', 'Listening', 'Speaking', 'Vocabulary', 'German', 'University Research'], { col: 1, required: true }),
        N('minutes', 'Minutes', { min: 1, step: 5, col: 1, required: true }),
        T('task', 'Task', { col: 1 }),
        N('productivity', 'Productivity (1–5)', { min: 1, max: 5, step: 1, col: 1 }),
        S('completed', 'Completed', ['Yes', 'Partial', 'No']),
        A('notes', 'Notes')
      ]
    },
    ieltsVocabulary: {
      title: 'Vocabulary word', sort: 'dateAdded',
      fields: [
        T('word', 'Word', { required: true, col: 1 }),
        T('meaning', 'Meaning', { required: true, col: 1 }),
        T('synonyms', 'Synonyms', { col: 1 }),
        T('antonyms', 'Antonyms'),
        S('pos', 'Part of speech', ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'other']),
        T('pronunciation', 'Pronunciation'),
        A('example', 'Example sentence', { col: 1 }),
        T('topic', 'Topic', { col: 1, placeholder: 'Environment, Education…' }),
        S('mastery', 'Mastery', MASTERY, { col: 1 }),
        D('dateAdded', 'Date added')
      ]
    },
    germanVocabulary: {
      title: 'German word', sort: 'dateAdded',
      fields: [
        T('word', 'German word', { required: true, col: 1 }),
        S('article', 'Article', ['', 'der', 'die', 'das'], { col: 1 }),
        T('meaning', 'English meaning', { required: true, col: 1 }),
        T('localMeaning', 'Hindi / Gujarati meaning'),
        T('plural', 'Plural', { col: 1 }),
        T('pronunciation', 'Pronunciation'),
        T('ipa', 'IPA', { col: 1 }),
        A('example', 'Example sentence'),
        T('topic', 'Topic', { col: 1 }),
        S('level', 'CEFR level', ['A1', 'A2', 'B1', 'B2'], { col: 1 }),
        S('mastery', 'Mastery', MASTERY, { col: 1 }),
        D('dateAdded', 'Date learned')
      ]
    },
    pronunciation: {
      title: 'Pronunciation entry', sort: 'dateAdded',
      fields: [
        T('word', 'German word or phrase', { required: true, col: 1 }),
        T('pronunciation', 'Pronunciation', { col: 1 }),
        T('ipa', 'IPA', { col: 1 }),
        T('english', 'English approximation', { col: 1 }),
        T('meaning', 'Meaning', { col: 1 }),
        A('example', 'Example'),
        A('notes', 'Notes'),
        D('dateAdded', 'Date added')
      ]
    },
    resources: {
      title: 'Resource', sort: 'title',
      fields: [
        T('title', 'Title', { required: true, col: 1 }),
        S('group', 'Group', ['IELTS', 'German'], { col: 1, required: true }),
        T('category', 'Category', { col: 1, placeholder: 'Reading, Grammar, Conversation…' }),
        T('level', 'Level', { col: 1, placeholder: 'A1, Band 7, Any' }),
        T('source', 'Source', { col: 1 }),
        T('url', 'URL', { type: 'url', required: true }),
        S('status', 'Status', ['Not started', 'In progress', 'Completed'], { col: 1 }),
        N('rating', 'Rating (1–5)', { min: 1, max: 5, step: 1 }),
        A('notes', 'Notes')
      ]
    },
    notes: {
      title: 'Note', sort: 'updated',
      fields: [
        T('title', 'Title', { required: true, col: 1 }),
        S('category', 'Category', ['IELTS', 'Reading', 'Writing', 'Listening', 'Speaking', 'Grammar',
          'Vocabulary', 'German', 'Germany', 'University', 'Application', 'Visa', 'General'], { col: 1 }),
        T('tags', 'Tags', { col: 1, placeholder: 'comma, separated' }),
        A('body', 'Note', { rows: 10, help: 'Markdown-lite: # heading, - bullet, **bold**, [text](url)' })
      ]
    },
    universities: {
      title: 'University', sort: 'deadline',
      fields: [
        T('name', 'University', { required: true, col: 1 }),
        T('program', 'Program', { col: 1 }),
        T('city', 'City', { col: 1 }),
        S('degree', 'Degree', ['M.Sc.', 'M.A.', 'M.Eng.', 'MBA', 'Other']),
        S('language', 'Language of instruction', ['English', 'German', 'Mixed'], { col: 1 }),
        B('ieltsReq', 'IELTS requirement', { col: 1, num: 1 }),
        T('germanReq', 'German requirement', { placeholder: 'None / A2 / B1' }),
        N('cgpaReq', 'CGPA requirement', { step: 0.01 }),
        T('ects', 'ECTS / credit requirement'),
        D('deadline', 'Application deadline', { col: 1 }),
        T('portal', 'Application portal', { type: 'url' }),
        S('status', 'Status', ['Researching', 'Eligible', 'Shortlisted', 'Documents preparing',
          'Applied', 'Interview', 'Accepted', 'Rejected', 'Waitlisted'], { col: 1 }),
        A('notes', 'Notes')
      ]
    },
    documents: {
      title: 'Document', sort: 'name',
      fields: [
        T('name', 'Document', { required: true, col: 1 }),
        S('category', 'Category', ['Identity', 'Academic', 'Language', 'Application', 'APS', 'Financial', 'Visa'], { col: 1 }),
        S('status', 'Status', ['Not started', 'In progress', 'Completed'], { col: 1 }),
        D('dueDate', 'Needed by'),
        A('notes', 'Notes')
      ]
    }
  };

  /* ---------------- document checklist seed ---------------- */
  const DOCS_SEED = [
    ['Passport', 'Identity'], ['BCA degree certificate', 'Academic'],
    ['Provisional certificate', 'Academic'], ['Semester transcripts (all 6)', 'Academic'],
    ['10th standard certificate', 'Academic'], ['12th standard certificate', 'Academic'],
    ['IELTS score report', 'Language'], ['German language certificate (A1/A2)', 'Language'],
    ['CV / résumé', 'Application'], ['Statement of purpose', 'Application'],
    ['Letter of recommendation 1', 'Application'], ['Letter of recommendation 2', 'Application'],
    ['APS certificate', 'APS'], ['APS application documents', 'APS'],
    ['University-specific forms', 'Application'], ['Blocked account proof', 'Financial'],
    ['Health insurance', 'Financial'], ['Visa application form', 'Visa'],
    ['Visa appointment confirmation', 'Visa'], ['Motivation letter (visa)', 'Visa']
  ].map(([name, category]) => ({ name, category, status: 'Not started', notes: '' }));

  /* ---------------- resources seed ---------------- */
  const RES_SEED = [
    /* === IELTS SPEAKING === */
    { title: 'IELTS Speaking Part 1 — Topics & Natural Answers', group: 'IELTS', category: 'Speaking', level: 'Band 6–8', source: 'IELTS Liz', url: 'https://ieltsliz.com/ielts-speaking-part-1-topics/', status: 'Not started', notes: 'Master the Answer + Reason + Detail formula for 30+ everyday topics.' },
    { title: 'IELTS Speaking Part 2 — Cue Card Topics & 1-Minute Prep', group: 'IELTS', category: 'Speaking', level: 'Band 7+', source: 'IELTS Liz', url: 'https://ieltsliz.com/ielts-speaking-part-2-topics/', status: 'Not started', notes: 'Structured 6-step framework to speak for 2 minutes without stalling.' },
    { title: 'IELTS Speaking Part 3 — Abstract Discussion Formulations', group: 'IELTS', category: 'Speaking', level: 'Band 7+', source: 'IELTS Liz', url: 'https://ieltsliz.com/ielts-speaking-part-3-topics-sub-topics/', status: 'Not started', notes: 'Expressing opinions, analyzing societal issues, and contrasting perspectives.' },
    { title: 'Official IELTS Speaking Band Descriptors (Public Criteria)', group: 'IELTS', category: 'Speaking', level: 'Band 6–9', source: 'IELTS.org / British Council', url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions', status: 'Not started', notes: 'Official rubric breakdown for Fluency, Lexical Resource, Grammar, Pronunciation.' },
    { title: 'Oxford Online English — IELTS Speaking Practice Videos', group: 'IELTS', category: 'Speaking', level: 'Band 6–8', source: 'Oxford Online English', url: 'https://www.oxfordonlineenglish.com/ielts-speaking', status: 'Not started', notes: 'Video demonstrations of Band 7 and Band 8 responses with examiner notes.' },
    { title: 'BBC Learning English — Connected Speech & Pronunciation', group: 'IELTS', category: 'Speaking', level: 'Band 6–8', source: 'BBC Learning English', url: 'https://www.bbc.co.uk/learningenglish/features/pronunciation', status: 'Not started', notes: 'Intonation, sentence stress, weak forms, and linking sounds.' },
    { title: 'IELTS Advantage — Speaking Fluency & Coherence Guide', group: 'IELTS', category: 'Speaking', level: 'Band 7+', source: 'IELTS Advantage', url: 'https://ieltsadvantage.com/speaking/', status: 'Not started', notes: 'Techniques to eliminate "umm" fillers and extend answers naturally.' },

    /* === IELTS READING === */
    { title: 'IELTS Academic Reading Official Sample Tests', group: 'IELTS', category: 'Reading', level: 'Band 6–9', source: 'IELTS.org', url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions', status: 'Not started', notes: 'Full official reading tests with answer keys from test makers.' },
    { title: 'True / False / Not Given Step-by-Step Method', group: 'IELTS', category: 'Reading', level: 'Band 6–8', source: 'IELTS Advantage', url: 'https://ieltsadvantage.com/2015/04/27/ielts-reading-true-false-not-given/', status: 'Not started', notes: 'Dissecting text evidence vs silence to stop confusing False with Not Given.' },
    { title: 'Matching Headings Technique & Trap Elimination', group: 'IELTS', category: 'Reading', level: 'Band 7+', source: 'IELTS Liz', url: 'https://ieltsliz.com/ielts-reading-matching-headings-tips/', status: 'Not started', notes: 'Identify paragraph central purpose and eliminate keyword-matching traps.' },
    { title: 'British Council Academic Reading Practice Tests', group: 'IELTS', category: 'Reading', level: 'Band 6–8', source: 'British Council', url: 'https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-practice-tests/reading-academic', status: 'Not started', notes: 'Timed academic reading practice tests with scoring explanation.' },
    { title: 'ReadTheory Academic Reading Comprehension Drills', group: 'IELTS', category: 'Reading', level: 'Band 6–8', source: 'ReadTheory', url: 'https://readtheory.org/', status: 'Not started', notes: 'Adaptive difficulty reading passages to build speed and accuracy.' },
    { title: 'Scientific American — Academic Skimming Practice', group: 'IELTS', category: 'Reading', level: 'Band 7+', source: 'Scientific American', url: 'https://www.scientificamerican.com/', status: 'Not started', notes: 'Authentic C1-level scientific and academic articles for speed reading.' },
    { title: 'BBC News — In-Depth Analysis & Science Features', group: 'IELTS', category: 'Reading', level: 'Band 6–8', source: 'BBC News', url: 'https://www.bbc.com/news/science_and_environment', status: 'Not started', notes: 'Topical articles matching IELTS Academic reading topics.' },

    /* === IELTS WRITING TASK 1 === */
    { title: 'IELTS Writing Task 1 Academic Structure & Overviews', group: 'IELTS', category: 'Writing Task 1', level: 'Band 6–8', source: 'IELTS Liz', url: 'https://ieltsliz.com/ielts-writing-task-1-lessons-and-tips/', status: 'Not started', notes: 'The 4-paragraph formula and rules for the mandatory overview statement.' },
    { title: 'Describing Charts & Data Trends (C1 Register)', group: 'IELTS', category: 'Writing Task 1', level: 'Band 7', source: 'British Council LearnEnglish', url: 'https://learnenglish.britishcouncil.org/skills/writing/c1-writing/describing-charts-trends', status: 'Not started', notes: 'High-scoring verbs and adverbs for trends, fluctuations, and proportions.' },
    { title: 'Process Diagrams & Sequential Passive Language', group: 'IELTS', category: 'Writing Task 1', level: 'Band 7', source: 'IELTS Advantage', url: 'https://ieltsadvantage.com/2015/03/18/ielts-writing-task-1-process/', status: 'Not started', notes: 'Man-made and natural cycle workflows with sequential linkers and passive voice.' },
    { title: 'Describing Maps & Spatial Layout Changes', group: 'IELTS', category: 'Writing Task 1', level: 'Band 7', source: 'IELTS Liz', url: 'https://ieltsliz.com/ielts-map-vocabulary/', status: 'Not started', notes: 'Compass directions, spatial prepositions, and before/after transformation verbs.' },
    { title: 'Bar Charts, Tables & Mixed Charts Comparisons', group: 'IELTS', category: 'Writing Task 1', level: 'Band 7', source: 'IELTS Simon Archive', url: 'https://www.ielts-simon.com/', status: 'Not started', notes: 'Grouping data logically into two body paragraphs without listing all figures.' },

    /* === IELTS WRITING TASK 2 === */
    { title: 'Official IELTS Writing Band Descriptors (Task 2)', group: 'IELTS', category: 'Writing Task 2', level: 'Band 6–9', source: 'IELTS.org', url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions', status: 'Not started', notes: 'Official marking rubric: Task Response, Coherence & Cohesion, Lexical, Grammar.' },
    { title: 'IELTS Writing Task 2 Essay Structures Guide', group: 'IELTS', category: 'Writing Task 2', level: 'Band 7+', source: 'IELTS Liz', url: 'https://ieltsliz.com/ielts-writing-task-2/', status: 'Not started', notes: 'Templates for Opinion, Discussion, Advantages/Disadvantages, Problem/Solution.' },
    { title: 'Band 7+ Coherence & Cohesion: Natural Linking', group: 'IELTS', category: 'Writing Task 2', level: 'Band 7', source: 'IELTS Advantage', url: 'https://ieltsadvantage.com/2015/05/20/ielts-writing-task-2-coherence-and-cohesion/', status: 'Not started', notes: 'Paragraph unity, topic sentences, and flexible discourse markers.' },
    { title: 'Grammatical Range: Complex Clauses & Conditionals', group: 'IELTS', category: 'Writing Task 2', level: 'Band 7+', source: 'Cambridge Assessment English', url: 'https://www.cambridgeenglish.org/learning-english/', status: 'Not started', notes: 'Subordinate clauses, relative clauses, conditionals, and passive constructions.' },
    { title: 'IELTS Simon Task 2 Model Essays & Paragraphing', group: 'IELTS', category: 'Writing Task 2', level: 'Band 7–8', source: 'IELTS Simon Archive', url: 'https://www.ielts-simon.com/', status: 'Not started', notes: 'Concise, high-scoring Band 8+ 13-sentence essays with vocabulary breakdown.' },
    { title: 'Purdue OWL — Academic Essay Structure & Argumentation', group: 'IELTS', category: 'Writing Task 2', level: 'Band 7+', source: 'Purdue University OWL', url: 'https://owl.purdue.edu/owl/general_writing/academic_writing/essay_writing/index.html', status: 'Not started', notes: 'Academic argument structure, thesis formulation, and logical transitions.' },

    /* === IELTS LISTENING === */
    { title: 'Official IELTS Listening Audio Samples (Sections 1–4)', group: 'IELTS', category: 'Listening', level: 'Band 6–9', source: 'IELTS.org', url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions', status: 'Not started', notes: 'Official Cambridge audio tracks across all 4 listening sections.' },
    { title: 'BBC 6 Minute English — Audio & Topical Transcripts', group: 'IELTS', category: 'Listening', level: 'Band 6–8', source: 'BBC Learning English', url: 'https://www.bbc.co.uk/learningenglish/english/features/6-minute-english', status: 'Not started', notes: '6-minute discussions with authentic British accents, transcripts, and vocab.' },
    { title: 'Listening Distractors & Signposting Keywords', group: 'IELTS', category: 'Listening', level: 'Band 7', source: 'IELTS Liz', url: 'https://ieltsliz.com/ielts-listening/', status: 'Not started', notes: 'How speakers self-correct and how to track questions in real time.' },
    { title: 'British Council Podcasts with Transcripts & Exercises', group: 'IELTS', category: 'Listening', level: 'Band 6–8', source: 'British Council', url: 'https://learnenglish.britishcouncil.org/general-english/podcasts', status: 'Not started', notes: 'Conversational and academic podcasts with interactive comprehension questions.' },

    /* === IELTS VOCABULARY & GRAMMAR === */
    { title: 'Academic Word List (AWL Sublists 1–10 by Coxhead)', group: 'IELTS', category: 'Vocabulary', level: 'Band 7+', source: 'Victoria University of Wellington', url: 'https://www.wgtn.ac.nz/lals/resources/academicwordlist', status: 'Not started', notes: 'The most frequent 570 word families in academic writing.' },
    { title: 'English Profile — Academic Collocations & Precision', group: 'IELTS', category: 'Vocabulary', level: 'Band 7+', source: 'Cambridge University Press', url: 'https://www.englishprofile.org/', status: 'Not started', notes: 'CEFR C1-level academic word combinations and collocations.' },
    { title: 'British Council Grammar Reference — Advanced Modals & Tenses', group: 'IELTS', category: 'Grammar', level: 'Band 6–8', source: 'British Council LearnEnglish', url: 'https://learnenglish.britishcouncil.org/grammar', status: 'Not started', notes: 'Comprehensive grammar guides for perfect tenses, modals, and conditionals.' },
    { title: 'Road to IELTS Free Diagnostic & Mock Papers', group: 'IELTS', category: 'Mock Tests', level: 'Any', source: 'British Council', url: 'https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-practice-tests', status: 'Not started', notes: 'Diagnostic tests covering all 4 modules with score conversions.' },

    /* === GERMAN COURSES & GRAMMAR === */
    { title: 'Nicos Weg — A1 Full Video Course & Practice (DW)', group: 'German', category: 'A1 Course', level: 'A1', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg/c-36519789', status: 'Not started', notes: 'Complete telenovela course from zero to A1 certification.' },
    { title: 'Nicos Weg — A2 Full Video Course (DW)', group: 'German', category: 'A2 Course', level: 'A2', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg-a2/c-40760437', status: 'Not started', notes: '18 comprehensive units covering past tense, modals, dative, and subordinate clauses.' },
    { title: 'Nicos Weg — B1 Complete Course for University Preparation', group: 'German', category: 'B1 Course', level: 'B1', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg-b1/c-41652114', status: 'Not started', notes: 'Intermediate German for studying at German universities and daily life.' },
    { title: 'DW Deutschtrainer A1 — 100 Thematic Vocabulary Lessons', group: 'German', category: 'A1 Vocabulary', level: 'A1', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/deutschtrainer/c-33269758', status: 'Not started', notes: '100 short video modules on essential daily vocabulary with native audio.' },
    { title: 'Learn German with Anja — A1 Grammar & Pronunciation', group: 'German', category: 'A1 Grammar', level: 'A1', source: 'YouTube', url: 'https://www.youtube.com/@LearnGermanwithAnja', status: 'Not started', notes: 'Engaging, clear video explanations for beginner German grammar.' },
    { title: 'Duden Online — Official German Spelling, Grammar & Gender Reference', group: 'German', category: 'A1 Grammar', level: 'Any', source: 'Duden', url: 'https://www.duden.de/', status: 'Not started', notes: 'The authoritative reference for der/die/das genders and inflections.' },
    { title: 'LEO German–English Comprehensive Academic Dictionary', group: 'German', category: 'Vocabulary', level: 'Any', source: 'LEO Dictionary', url: 'https://dict.leo.org/german-english/', status: 'Not started', notes: 'Detailed translations, verb tables, pronunciation audio, and forums.' },

    /* === GERMAN EXAM & PRACTICE MATERIALS === */
    { title: 'Goethe-Institut Start Deutsch 1 (A1) Official Practice Exam', group: 'German', category: 'A1 Assessment', level: 'A1', source: 'Goethe-Institut', url: 'https://www.goethe.de/en/spr/kup/prf/prf/gzsd1.html', status: 'Not started', notes: 'Official practice papers with listening audio and evaluation criteria.' },
    { title: 'Goethe-Institut Goethe-Zertifikat A2 Practice Materials', group: 'German', category: 'A2 Assessment', level: 'A2', source: 'Goethe-Institut', url: 'https://www.goethe.de/en/spr/kup/prf/prf/gzsd2.html', status: 'Not started', notes: 'Official practice papers and model answers for A2 Goethe examination.' },
    { title: 'Goethe-Institut Goethe-Zertifikat B1 Practice Materials', group: 'German', category: 'B1 Assessment', level: 'B1', source: 'Goethe-Institut', url: 'https://www.goethe.de/en/spr/kup/prf/prf/gzb1.html', status: 'Not started', notes: 'Complete B1 exam model sets for Lesen, Hören, Schreiben, Sprechen.' },
    { title: 'DW German Placement Test (Einstufungstest A1–B1)', group: 'German', category: 'Assessment', level: 'Any', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/placement-test/c-56553517', status: 'Not started', notes: 'Interactive 30-minute test to evaluate your current CEFR German level.' },

    /* === GERMAN LISTENING, PODCASTS & CULTURE === */
    { title: 'Easy German — Super Easy German A1 Conversation Playlist', group: 'German', category: 'Listening', level: 'A1', source: 'Easy German', url: 'https://www.youtube.com/@EasyGerman/playlists', status: 'Not started', notes: 'Slow spoken German with dual German & English subtitles.' },
    { title: 'Slow German with Annik Rubens — Themed Listening with Transcripts', group: 'German', category: 'Listening', level: 'A1–B1', source: 'Slow German', url: 'https://slowgerman.com/', status: 'Not started', notes: 'Short, clear cultural audio episodes spoken at a gentle pace.' },
    { title: 'Deutschlandlabor — German Culture & Student Life Episodes', group: 'German', category: 'Culture', level: 'A2', source: 'Deutsche Welle & Goethe-Institut', url: 'https://learngerman.dw.com/en/deutschlandlabor/c-38446272', status: 'Not started', notes: 'Short video series exploring German stereotypes, student life, and habits.' },
    { title: 'Coffee Break German — Conversational German Podcast', group: 'German', category: 'Listening', level: 'A1–A2', source: 'Coffee Break Languages', url: 'https://coffeebreaklanguages.com/coffeebreakgerman/', status: 'Not started', notes: 'Friendly structured audio lessons for conversational German.' },

    /* === GERMANY UNIVERSITY & APPLICATION PORTALS === */
    { title: 'DAAD International Programmes & Master’s in Germany Search', group: 'German', category: 'University', level: 'Any', source: 'DAAD Germany', url: 'https://www2.daad.de/deutschland/studienangebote/international-programmes/en/', status: 'Not started', notes: 'Official database of 2,000+ English-taught Master\'s programs in Germany.' },
    { title: 'Uni-Assist — Official Application Guide for International Students', group: 'German', category: 'University', level: 'Any', source: 'Uni-Assist', url: 'https://www.uni-assist.de/en/', status: 'Not started', notes: 'Central evaluation service for international university applications.' },
    { title: 'APS India — Academic Evaluation Centre Document Guide', group: 'German', category: 'University', level: 'Any', source: 'APS India', url: 'https://aps-india.info/', status: 'Not started', notes: 'Mandatory certificate requirement for Indian degree holders applying to Germany.' },
    { title: 'Study in Germany — Official Federal Information Portal', group: 'German', category: 'University', level: 'Any', source: 'BMBF / DAAD', url: 'https://www.study-in-germany.de/en/', status: 'Not started', notes: 'Official guide on living costs, visa steps, university types, and admission.' },
    { title: 'Make it in Germany — Student Visa Requirements & Blocked Account', group: 'German', category: 'University', level: 'Any', source: 'German Federal Government', url: 'https://www.make-it-in-germany.com/en/study-training/studies-in-germany', status: 'Not started', notes: 'Official legal information for Indian students moving to Germany.' }
  ];

  /* ---------------- CEFR roadmap ---------------- */
  const CEFR = {
    A1: { vocabulary: '600 words', grammar: 'sein, haben, present tense, W-questions, accusative', listening: 'slow classroom speech, basic daily interactions',
      speaking: 'introduce yourself, order food, ask directions', reading: 'signs, menus, short emails', writing: 'short personal email, profile form' },
    A2: { vocabulary: '1,300 words', grammar: 'Perfekt, modal verbs, dative, separable verbs, weil/dass', listening: 'everyday dialogues, public announcements',
      speaking: 'describe daily routine, past events, simple opinions', reading: 'advertisements, simple articles', writing: 'informal letters, basic appointment requests' },
    B1: { vocabulary: '2,400 words', grammar: 'Konjunktiv II, passive, relative clauses, Genitiv', listening: 'radio reports, university announcements',
      speaking: 'give opinions, explain problems, negotiate', reading: 'newspaper articles, course descriptions', writing: 'structured opinion texts, formal complaints' },
    B2: { vocabulary: '4,000 words', grammar: 'Nominalisierung, complex connectors, Konjunktiv I', listening: 'lectures, fast native speech',
      speaking: 'argue complex positions fluently', reading: 'academic texts, technical literature', writing: 'structured essays, academic reports' },
    C1: { vocabulary: '8,000 words', grammar: 'full stylistic range, idiomatic control', listening: 'all registers including regional nuances',
      speaking: 'near-native flexibility and precision', reading: 'complex literature, scientific papers', writing: 'advanced academic register' }
  };

  /* ---------------- tips & strategies database ---------------- */
  const TIPS = {
    Reading: [
      'Core Method: Read the question stem first → Underline keywords → Anticipate paraphrases → Locate section in passage → Read surrounding context → Verify answer.',
      'True/False/Not Given: "True" means the passage explicitly confirms the statement; "False" means the passage explicitly contradicts it; "Not Given" means the passage is silent or neutral.',
      'Matching Headings: Never match on a single keyword. Read the entire paragraph, identify its single main controlling idea, and match against paragraph purpose.',
      'Matching Information: Detail questions live in a specific sentence. Scan for names, dates, numbers, and concrete nouns first.',
      'Sentence & Summary Completion: Always predict the grammatical part of speech (noun, verb, adjective) before scanning. Never alter words taken from the text.',
      'Multiple Choice: Eliminate two obviously wrong options first (usually those containing absolute terms like "all", "never", "only" or twisted facts).',
      'Time Management: Target ~15–17 minutes for Passage 1, ~18–20 minutes for Passage 2, and ~23–25 minutes for Passage 3. Leave 3–5 minutes for final checks.',
      'The 90-Second Rule: If you are stuck on any single question for more than 90 seconds, select your best guess, mark the question number, and move forward immediately.',
      'Evidence-First Principle: Never answer based on your prior background knowledge. Every correct answer has direct paraphrased evidence in the passage text.'
    ],
    Writing: [
      'Task 1 Structure: Paragraph 1 (Paraphrase the prompt) → Paragraph 2 (Overview of 2–3 major trends/extremes) → Paragraph 3 (Body 1 detailed comparisons) → Paragraph 4 (Body 2 remaining data).',
      'Task 1 Overview Rule: The overview is mandatory for Band 6+. Summarize the overarching pattern without quoting individual numbers in the overview paragraph.',
      'Task 1 Vocabulary Bank: Increase (rise, surge, climb, grow, escalate); Decrease (fall, decline, drop, dip, plunge); Stable (level off, remain constant, plateau).',
      'Task 1 Process & Map Diagrams: Use sequential connectors (Initially, Subsequently, Following this, In the final stage) and passive voice (is filtered, was constructed, was relocated).',
      'Task 2 4-Paragraph Framework: Introduction (Paraphrase + Clear Thesis) → Body 1 (Topic sentence → Explanation → Example → Result) → Body 2 (Second point developed) → Conclusion (Restate position).',
      'Band 7 Coherence & Cohesion: Ensure one clear central topic per paragraph with logical progression. Use flexible referencing (this phenomenon, these measures) over mechanical linkers.',
      'Band 7 Lexical Resource: Use high-precision topic collocations (e.g. "environmental degradation", "academic performance", "rapid urban growth") rather than bizarre archaic synonyms.',
      'Grammatical Range & Accuracy: Aim for controlled complexity (conditionals, relative clauses, passive voice) with high accuracy in subject-verb agreement and articles.',
      'Word Count Target: Write 260–285 words for Task 2 and 160–180 words for Task 1. Writing 400 words invites spelling and grammar errors without adding points.',
      'Writing Warning: Never memorize full essays or force unnatural idioms. Examiners penalize memorized templates immediately.'
    ],
    Listening: [
      'Pre-Audio Prediction: Use the 30-second silent pause to underline keywords and predict the expected answer type (name, date, time, currency, plural noun).',
      'Distractor Recognition: Speakers frequently change their minds or correct themselves ("I thought it was Monday, but actually it\'s Tuesday"). The real answer is the correction.',
      'Spelling & Capitalization: Names, addresses, and postcodes are spelled out letter-by-letter. Write letters down instantly without hesitating.',
      'Singular vs Plural Accuracy: Pay close attention to final "s" sounds. Writing singular when plural is spoken is marked incorrect.',
      'Signposting Cues: Words like "however", "on the other hand", "furthermore", "finally" signal that the conversation is advancing to the next question.',
      'Section 4 Concentration: Section 4 is a non-stop academic monologue without a break. Preview all 10 questions during the introduction.',
      'Recovery Principle: If you miss an answer, let it go immediately. Fixating on a missed question will cause you to miss the subsequent two answers.'
    ],
    Speaking: [
      'Part 1 Strategy (Answer + Reason + Detail): Answer directly in sentence 1, provide a reason with "because", and add a 1-sentence personal example or detail. Aim for 2–3 natural sentences.',
      'Part 2 6-Step Structure: Use your 1-minute prep to map: (1) Opening → (2) Context/Background → (3) Key Details → (4) Specific Example → (5) Personal Reaction → (6) Natural Closing.',
      'Part 3 Discussion Framework: Opinion ("From my perspective...") → Reason ("This is primarily due to...") → Explanation → Concrete Example → Qualification/Alternative View.',
      'Pre-Speaking Checklist: (1) Understand question topic, (2) State clear viewpoint, (3) Maintain steady pace, (4) Avoid fillers (umm, like), (5) Use natural connecting phrases.',
      'Post-Speaking Checklist: (1) Did I answer the full prompt? (2) Did I speak without long pauses? (3) Did I vary my vocabulary? (4) Was pronunciation clear?',
      'Natural Elaboration: Extend your answers naturally using "for instance", "as a result", "whereas in the past", instead of pausing after a 3-word answer.',
      'Speaking Warning: Never memorize entire scripts or recite canned idioms. Examiners detect recited speech instantly and mark down Fluency and Coherence.'
    ],
    German: [
      'Gender & Articles Rule: Always memorize every German noun with its article and plural (e.g. "das Haus, die Häuser", "der Tisch, die Tische").',
      'Verb Second (V2) Rule: In a German main clause, the conjugated verb MUST always occupy the second position ("Heute lerne ich Deutsch").',
      'Subordinate Clause Word Order: Subordinating conjunctions (weil, dass, obwohl, wenn) send the conjugated verb to the very end ("..., weil ich in Deutschland studieren möchte").',
      'Pronunciation of "W" and "V": German "W" is pronounced like English "V" (Wasser = "vasser"); German "V" is usually pronounced like English "F" (viel = "feel").',
      'Umlaut Accuracy: Umlauts (ä, ö, ü) change the meaning completely (schon = already vs. schön = beautiful).',
      'Separable Verbs (Trennbare Verben): The prefix detaches and moves to the end of the clause in the present tense ("Ich stehe um sieben Uhr auf").',
      'Accusative Case Trigger: Direct objects take the accusative case; only masculine changes form (der → den, ein → einen, mein → meinen).',
      'Dative Case with Location: Position prepositions (in, an, auf, bei, zu, mit) trigger the dative case when answering "where?" (in der Stadt, mit dem Bus).',
      'Daily Reusable Patterns: Master versatile sentence starters: "Ich möchte...", "Ich hätte gern...", "Ich brauche...", "Können Sie mir helfen?".'
    ]
  };

  /* ---------------- German A1/A2 lesson bank ---------------- */
  const w = (de, en, ipa, article) => ({ de, en, ipa, article: article || '' });
  const LESSONS = [
    {
      level: 'A1', topic: 'Introducing yourself',
      words: [w('ich', 'I', 'ɪç'), w('du', 'you (informal)', 'duː'), w('heißen', 'to be called', 'ˈhaɪsn̩'),
        w('kommen', 'to come', 'ˈkɔmən'), w('wohnen', 'to live', 'ˈvoːnən'), w('studieren', 'to study', 'ʃtuˈdiːʁən'),
        w('lernen', 'to learn', 'ˈlɛʁnən'), w('sprechen', 'to speak', 'ˈʃpʁɛçn̩'),
        w('Student', 'student (m)', 'ʃtuˈdɛnt', 'der'), w('Deutschland', 'Germany', 'ˈdɔɪtʃlant', 'das')],
      grammar: { title: 'sein — to be', body: 'The most used verb in German. Memorise it as a rhythm, not a table.',
        examples: ['ich bin — I am', 'du bist — you are', 'er/sie/es ist — he/she/it is', 'wir sind — we are', 'ihr seid — you all are', 'sie/Sie sind — they/you (formal) are'] },
      pronunciation: { focus: 'ei and ie', tip: 'Read the second letter: "ei" sounds like "eye", "ie" sounds like "ee".', words: ['heißen /ˈhaɪsn̩/', 'sie /ziː/', 'mein /maɪn/', 'wie /viː/'] },
      listening: { title: 'Nicos Weg A1 — Hallo!', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg/c-36519789' },
      speaking: ['Ich heiße Pratham.', 'Ich komme aus Indien.', 'Ich wohne in Gujarat.', 'Ich lerne Deutsch.', 'Ich möchte in Deutschland studieren.'],
      quiz: { q: 'Complete: Ich ___ Pratham.', options: ['bin', 'bist', 'sind'], answer: 0 },
      culture: 'Germans shake hands and use "Sie" with strangers. Switching to "du" is usually offered by the older or senior person.'
    },
    {
      level: 'A1', topic: 'Numbers and age',
      words: [w('eins', 'one', 'aɪns'), w('zwei', 'two', 'tsvaɪ'), w('drei', 'three', 'dʁaɪ'), w('zehn', 'ten', 'tseːn'),
        w('zwanzig', 'twenty', 'ˈtsvantsɪç'), w('hundert', 'hundred', 'ˈhʊndɐt'), w('Jahr', 'year', 'jaːɐ̯', 'das'),
        w('alt', 'old', 'alt'), w('Nummer', 'number', 'ˈnʊmɐ', 'die'), w('Telefonnummer', 'phone number', 'teleˈfoːnnʊmɐ', 'die')],
      grammar: { title: 'Reversed numbers', body: 'Two-digit numbers are spoken units-first, joined by "und".',
        examples: ['21 = einundzwanzig', '34 = vierunddreißig', '99 = neunundneunzig', 'Ich bin zwanzig Jahre alt.'] },
      pronunciation: { focus: 'z and s', tip: '"z" is "ts", "s" before a vowel is "z". Zwanzig starts "tsv".', words: ['zwei /tsvaɪ/', 'sechs /zɛks/', 'sieben /ˈziːbn̩/'] },
      listening: { title: 'Deutschtrainer — Zahlen', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/deutschtrainer/c-33269758' },
      speaking: ['Ich bin einundzwanzig Jahre alt.', 'Meine Nummer ist null neun fünf.', 'Wie alt bist du?', 'Das kostet zehn Euro.', 'Ich habe zwei Schwestern.'],
      quiz: { q: 'How do you say 42?', options: ['vierzigzwei', 'zweiundvierzig', 'vierundzwanzig'], answer: 1 },
      culture: 'Germans count on their fingers starting with the thumb. Holding up an index finger often gets you two beers.'
    },
    {
      level: 'A1', topic: 'Articles and nouns',
      words: [w('Haus', 'house', 'haʊs', 'das'), w('Buch', 'book', 'buːx', 'das'), w('Tisch', 'table', 'tɪʃ', 'der'),
        w('Stuhl', 'chair', 'ʃtuːl', 'der'), w('Tür', 'door', 'tyːɐ̯', 'die'), w('Fenster', 'window', 'ˈfɛnstɐ', 'das'),
        w('Zimmer', 'room', 'ˈtsɪmɐ', 'das'), w('Wohnung', 'flat', 'ˈvoːnʊŋ', 'die'),
        w('Universität', 'university', 'univɛʁziˈtɛːt', 'die'), w('Bibliothek', 'library', 'biblioˈteːk', 'die')],
      grammar: { title: 'der, die, das', body: 'Every noun has a gender and it is not negotiable. Two reliable patterns: nouns ending -ung, -heit, -keit, -schaft, -tät are die; nouns ending -chen and -ment are das.',
        examples: ['der Tisch → die Tische', 'die Wohnung → die Wohnungen', 'das Haus → die Häuser', 'All plurals take "die".'] },
      pronunciation: { focus: 'ü', tip: 'Say "ee" then round your lips without moving your tongue. That is ü.', words: ['Tür /tyːɐ̯/', 'für /fyːɐ̯/', 'müde /ˈmyːdə/'] },
      listening: { title: 'Nicos Weg A1 — Meine Wohnung', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg/c-36519789' },
      speaking: ['Das ist mein Zimmer.', 'Die Wohnung ist klein.', 'Der Tisch ist neu.', 'Ich lerne in der Bibliothek.', 'Die Universität ist groß.'],
      quiz: { q: 'Which article goes with "Wohnung"?', options: ['der', 'die', 'das'], answer: 1 },
      culture: 'German flats are advertised by room count excluding kitchen and bath. A "2-Zimmer-Wohnung" has two rooms in total.'
    },
    {
      level: 'A1', topic: 'Present tense verbs',
      words: [w('machen', 'to do', 'ˈmaxn̩'), w('arbeiten', 'to work', 'ˈaʁbaɪtn̩'), w('essen', 'to eat', 'ˈɛsn̩'),
        w('trinken', 'to drink', 'ˈtʁɪŋkn̩'), w('gehen', 'to go', 'ˈɡeːən'), w('fahren', 'to travel', 'ˈfaːʁən'),
        w('lesen', 'to read', 'ˈleːzn̩'), w('schreiben', 'to write', 'ˈʃʁaɪbn̩'),
        w('Arbeit', 'work', 'ˈaʁbaɪt', 'die'), w('Tag', 'day', 'taːk', 'der')],
      grammar: { title: 'Regular present tense endings', body: 'Take the stem and add the ending. This covers most verbs.',
        examples: ['ich mach-e', 'du mach-st', 'er mach-t', 'wir mach-en', 'ihr mach-t', 'sie mach-en'] },
      pronunciation: { focus: 'final -en', tip: 'Unstressed -en collapses to a soft "n". "machen" sounds like "MAKH-n".', words: ['machen /ˈmaxn̩/', 'gehen /ˈɡeːən/', 'lesen /ˈleːzn̩/'] },
      listening: { title: 'Easy German — Super Easy German', source: 'Easy German', url: 'https://www.youtube.com/@EasyGerman/playlists' },
      speaking: ['Ich arbeite am Computer.', 'Was machst du heute?', 'Ich lese ein Buch.', 'Wir gehen ins Kino.', 'Er trinkt Kaffee.'],
      quiz: { q: 'Complete: Du ___ Deutsch.', options: ['lerne', 'lernst', 'lernt'], answer: 1 },
      culture: 'Punctuality is a form of respect in Germany. Arriving five minutes early is arriving on time.'
    },
    {
      level: 'A1', topic: 'Food and shopping',
      words: [w('Brot', 'bread', 'bʁoːt', 'das'), w('Wasser', 'water', 'ˈvasɐ', 'das'), w('Milch', 'milk', 'mɪlç', 'die'),
        w('Apfel', 'apple', 'ˈapfl̩', 'der'), w('Käse', 'cheese', 'ˈkɛːzə', 'der'), w('kaufen', 'to buy', 'ˈkaʊfn̩'),
        w('kosten', 'to cost', 'ˈkɔstn̩'), w('billig', 'cheap', 'ˈbɪlɪç'), w('teuer', 'expensive', 'ˈtɔɪɐ'),
        w('Supermarkt', 'supermarket', 'ˈzuːpɐmaʁkt', 'der')],
      grammar: { title: 'Accusative case', body: 'The direct object changes only in masculine: der → den. Feminine, neuter and plural stay the same.',
        examples: ['Ich kaufe den Apfel.', 'Ich kaufe die Milch.', 'Ich kaufe das Brot.', 'Ich möchte einen Kaffee.'] },
      pronunciation: { focus: 'w and v', tip: '"w" = English v. "v" is usually "f".', words: ['Wasser /ˈvasɐ/', 'Wein /vaɪn/', 'viel /fiːl/'] },
      listening: { title: 'Nicos Weg A1 — Einkaufen', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg/c-36519789' },
      speaking: ['Ich möchte einen Kaffee, bitte.', 'Was kostet das Brot?', 'Das ist zu teuer.', 'Ich kaufe Milch und Käse.', 'Zahlen, bitte.'],
      quiz: { q: 'Complete: Ich kaufe ___ Apfel.', options: ['der', 'den', 'dem'], answer: 1 },
      culture: 'Bring your own bag and expect to bag groceries yourself, fast. German checkout speed is a sport.'
    },
    {
      level: 'A1', topic: 'Time and daily routine',
      words: [w('Uhr', "o'clock", 'uːɐ̯', 'die'), w('Morgen', 'morning', 'ˈmɔʁɡn̩', 'der'), w('Abend', 'evening', 'ˈaːbn̩t', 'der'),
        w('früh', 'early', 'fʁyː'), w('spät', 'late', 'ʃpɛːt'), w('aufstehen', 'to get up', 'ˈaʊfʃteːən'),
        w('schlafen', 'to sleep', 'ˈʃlaːfn̩'), w('anfangen', 'to begin', 'ˈanfaŋən'),
        w('Woche', 'week', 'ˈvɔxə', 'die'), w('Montag', 'Monday', 'ˈmoːntaːk', 'der')],
      grammar: { title: 'Separable verbs', body: 'The prefix detaches and moves to the end of the clause.',
        examples: ['aufstehen → Ich stehe um sieben Uhr auf.', 'anfangen → Der Kurs fängt um neun an.', 'einkaufen → Wir kaufen am Samstag ein.'] },
      pronunciation: { focus: 'sp and st', tip: 'At the start of a word or syllable, "sp" = "shp" and "st" = "sht".', words: ['spät /ʃpɛːt/', 'Student /ʃtuˈdɛnt/', 'aufstehen /ˈaʊfʃteːən/'] },
      listening: { title: 'Deutschtrainer — Tagesablauf', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/deutschtrainer/c-33269758' },
      speaking: ['Ich stehe um sieben Uhr auf.', 'Der Unterricht fängt um halb zehn an.', 'Am Abend lerne ich Deutsch.', 'Ich gehe um zwölf Uhr schlafen.', 'Wie spät ist es?'],
      quiz: { q: 'Correct sentence?', options: ['Ich aufstehe um sieben.', 'Ich stehe um sieben auf.', 'Ich stehe auf um sieben.'], answer: 1 },
      culture: '"Halb zehn" means 9:30, not 10:30. German half-hours look forward to the coming hour.'
    },
    {
      level: 'A1', topic: 'Family and people',
      words: [w('Familie', 'family', 'faˈmiːliə', 'die'), w('Mutter', 'mother', 'ˈmʊtɐ', 'die'), w('Vater', 'father', 'ˈfaːtɐ', 'der'),
        w('Schwester', 'sister', 'ˈʃvɛstɐ', 'die'), w('Bruder', 'brother', 'ˈbʁuːdɐ', 'der'), w('Freund', 'friend (m)', 'fʁɔɪnt', 'der'),
        w('verheiratet', 'married', 'fɛɐ̯ˈhaɪʁaːtət'), w('Kind', 'child', 'kɪnt', 'das'),
        w('Beruf', 'profession', 'bəˈʁuːf', 'der'), w('Name', 'name', 'ˈnaːmə', 'der')],
      grammar: { title: 'Possessive articles', body: 'mein, dein, sein, ihr take the gender of the thing owned, not the owner.',
        examples: ['mein Vater (der)', 'meine Mutter (die)', 'mein Kind (das)', 'meine Eltern (plural)'] },
      pronunciation: { focus: 'r at the end', tip: 'Final -er sounds like a soft "ah". Mutter is "MOO-tah".', words: ['Mutter /ˈmʊtɐ/', 'Vater /ˈfaːtɐ/', 'Bruder /ˈbʁuːdɐ/'] },
      listening: { title: 'Nicos Weg A1 — Familie', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg/c-36519789' },
      speaking: ['Das ist meine Familie.', 'Mein Vater arbeitet in Vadodara.', 'Ich habe eine Schwester.', 'Meine Mutter heißt …', 'Ich bin nicht verheiratet.'],
      quiz: { q: 'Complete: ___ Mutter ist Lehrerin.', options: ['Mein', 'Meine', 'Meinen'], answer: 1 },
      culture: 'Germans separate work and private life sharply. Colleagues may never learn your family details, and that is normal.'
    },
    {
      level: 'A1', topic: 'Modal verbs',
      words: [w('können', 'can', 'ˈkœnən'), w('müssen', 'must', 'ˈmʏsn̩'), w('wollen', 'to want', 'ˈvɔlən'),
        w('möchten', 'would like', 'ˈmœçtn̩'), w('dürfen', 'may', 'ˈdʏʁfn̩'), w('sollen', 'should', 'ˈzɔlən'),
        w('helfen', 'to help', 'ˈhɛlfn̩'), w('brauchen', 'to need', 'ˈbʁaʊxn̩'),
        w('Hilfe', 'help', 'ˈhɪlfə', 'die'), w('Problem', 'problem', 'pʁoˈbleːm', 'das')],
      grammar: { title: 'Modal verb + infinitive at the end', body: 'The modal is conjugated in position two, the main verb goes to the end unchanged.',
        examples: ['Ich kann Deutsch sprechen.', 'Ich muss heute lernen.', 'Ich möchte in Deutschland studieren.', 'Kannst du mir helfen?'] },
      pronunciation: { focus: 'ö', tip: 'Say "eh" and round your lips. That is ö in können.', words: ['können /ˈkœnən/', 'möchten /ˈmœçtn̩/', 'schön /ʃøːn/'] },
      listening: { title: 'Learn German with Anja — modal verbs', source: 'YouTube', url: 'https://www.youtube.com/@LearnGermanwithAnja' },
      speaking: ['Ich kann ein bisschen Deutsch sprechen.', 'Ich muss für IELTS lernen.', 'Ich möchte einen Master machen.', 'Kannst du langsamer sprechen?', 'Ich brauche Hilfe.'],
      quiz: { q: 'Correct word order?', options: ['Ich kann sprechen Deutsch.', 'Ich kann Deutsch sprechen.', 'Ich Deutsch kann sprechen.'], answer: 1 },
      culture: '"Ich möchte" is the polite default in shops and offices. "Ich will" sounds blunt to German ears.'
    },
    {
      level: 'A1', topic: 'City and directions',
      words: [w('Stadt', 'city', 'ʃtat', 'die'), w('Bahnhof', 'station', 'ˈbaːnhoːf', 'der'), w('Straße', 'street', 'ˈʃtʁaːsə', 'die'),
        w('links', 'left', 'lɪŋks'), w('rechts', 'right', 'ʁɛçts'), w('geradeaus', 'straight ahead', 'ɡəʁaːdəˈʔaʊs'),
        w('nah', 'near', 'naː'), w('weit', 'far', 'vaɪt'),
        w('Bus', 'bus', 'bʊs', 'der'), w('Zug', 'train', 'tsuːk', 'der')],
      grammar: { title: 'Dative after location prepositions', body: 'in, an, auf, bei, zu, mit take the dative when describing location.',
        examples: ['Ich bin in der Stadt.', 'Ich fahre mit dem Bus.', 'Ich gehe zum Bahnhof.', 'Die Bibliothek ist bei der Universität.'] },
      pronunciation: { focus: 'ß and s', tip: 'ß is always a sharp "s" and never doubles as "z".', words: ['Straße /ˈʃtʁaːsə/', 'groß /ɡʁoːs/', 'heißen /ˈhaɪsn̩/'] },
      listening: { title: 'Nicos Weg A1 — Orientierung', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg/c-36519789' },
      speaking: ['Wo ist der Bahnhof?', 'Gehen Sie geradeaus.', 'Ist es weit von hier?', 'Ich fahre mit dem Zug.', 'Die Straße heißt Hauptstraße.'],
      quiz: { q: 'Complete: Ich fahre mit ___ Bus.', options: ['der', 'den', 'dem'], answer: 2 },
      culture: 'Public transport works on trust and inspectors. A ticket you forgot to validate is treated exactly like no ticket.'
    },
    {
      level: 'A1', topic: 'University and study language',
      words: [w('Studium', 'studies', 'ˈʃtuːdiʊm', 'das'), w('Vorlesung', 'lecture', 'ˈfoːɐ̯leːzʊŋ', 'die'),
        w('Prüfung', 'exam', 'ˈpʁyːfʊŋ', 'die'), w('Note', 'grade', 'ˈnoːtə', 'die'), w('Semester', 'semester', 'zeˈmɛstɐ', 'das'),
        w('Bewerbung', 'application', 'bəˈvɛʁbʊŋ', 'die'), w('Zeugnis', 'certificate', 'ˈtsɔɪknɪs', 'das'),
        w('Frist', 'deadline', 'fʁɪst', 'die'), w('Antrag', 'formal application', 'ˈantʁaːk', 'der'),
        w('Unterlagen', 'documents', 'ˈʊntɐlaːɡn̩', 'die')],
      grammar: { title: 'Question words', body: 'W-questions put the question word first and the verb second.',
        examples: ['Wann ist die Frist?', 'Wo studierst du?', 'Was brauchen Sie?', 'Warum Deutschland?', 'Wie lange dauert das Studium?'] },
      pronunciation: { focus: 'ung ending', tip: '-ung is "oong" with a nasal ending, always stressed on the syllable before it.', words: ['Vorlesung /ˈfoːɐ̯leːzʊŋ/', 'Prüfung /ˈpʁyːfʊŋ/', 'Bewerbung /bəˈvɛʁbʊŋ/'] },
      listening: { title: 'Deutschlandlabor — Studieren', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/deutschlandlabor/c-38446272' },
      speaking: ['Ich möchte einen Master in Deutschland machen.', 'Meine Unterlagen sind fertig.', 'Wann ist die Bewerbungsfrist?', 'Ich habe einen Bachelor in Informatik.', 'Ich lerne Deutsch für mein Studium.'],
      quiz: { q: 'What does "Frist" mean?', options: ['grade', 'deadline', 'lecture'], answer: 1 },
      culture: 'German universities run on formal deadlines and complete document sets. An incomplete application is simply not reviewed.'
    },
    {
      level: 'A1', topic: 'Weather and small talk',
      words: [w('Wetter', 'weather', 'ˈvɛtɐ', 'das'), w('Regen', 'rain', 'ˈʁeːɡn̩', 'der'), w('Schnee', 'snow', 'ʃneː', 'der'),
        w('warm', 'warm', 'vaʁm'), w('kalt', 'cold', 'kalt'), w('Sonne', 'sun', 'ˈzɔnə', 'die'),
        w('Wind', 'wind', 'vɪnt', 'der'), w('scheinen', 'to shine', 'ˈʃaɪnən'),
        w('Winter', 'winter', 'ˈvɪntɐ', 'der'), w('Sommer', 'summer', 'ˈzɔmɐ', 'der')],
      grammar: { title: 'Impersonal "es"', body: 'Weather sentences use "es" as an empty subject.',
        examples: ['Es regnet.', 'Es ist kalt.', 'Es schneit im Winter.', 'Es gibt viel Wind heute.'] },
      pronunciation: { focus: 'ch after a/o/u', tip: 'Hard "ch" from the throat, like clearing it gently: Buch, machen, Nacht.', words: ['machen /ˈmaxn̩/', 'Buch /buːx/', 'Nacht /naxt/'] },
      listening: { title: 'Easy German — street interviews', source: 'Easy German', url: 'https://www.youtube.com/@EasyGerman/playlists' },
      speaking: ['Heute ist es kalt.', 'Es regnet viel im Juli.', 'Im Winter schneit es in Deutschland.', 'Die Sonne scheint.', 'Wie ist das Wetter bei dir?'],
      quiz: { q: 'Complete: ___ regnet.', options: ['Er', 'Es', 'Das'], answer: 1 },
      culture: 'Weather is the safest small talk in Germany. Complaining about it together is a small social ritual.'
    },
    {
      level: 'A1', topic: 'Perfekt — talking about the past',
      words: [w('gestern', 'yesterday', 'ˈɡɛstɐn'), w('heute', 'today', 'ˈhɔɪtə'), w('gemacht', 'done', 'ɡəˈmaxt'),
        w('gegangen', 'gone', 'ɡəˈɡaŋən'), w('gelernt', 'learned', 'ɡəˈlɛʁnt'), w('gesehen', 'seen', 'ɡəˈzeːən'),
        w('gehabt', 'had', 'ɡəˈhapt'), w('gewesen', 'been', 'ɡəˈveːzn̩'),
        w('Woche', 'week', 'ˈvɔxə', 'die'), w('Wochenende', 'weekend', 'ˈvɔxn̩ˌʔɛndə', 'das')],
      grammar: { title: 'haben / sein + past participle', body: 'Most verbs use haben. Verbs of movement and change of state use sein.',
        examples: ['Ich habe Deutsch gelernt.', 'Ich habe einen Film gesehen.', 'Ich bin nach Ahmedabad gefahren.', 'Ich bin müde gewesen.'] },
      pronunciation: { focus: 'ge- prefix', tip: 'Unstressed "ge-" is quick and dull, almost "guh": gemacht, gelernt.', words: ['gemacht /ɡəˈmaxt/', 'gelernt /ɡəˈlɛʁnt/', 'gesehen /ɡəˈzeːən/'] },
      listening: { title: 'Nicos Weg A2 — Perfekt', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg-a2/c-40760437' },
      speaking: ['Gestern habe ich Deutsch gelernt.', 'Ich habe einen Test gemacht.', 'Am Wochenende bin ich zu Hause gewesen.', 'Ich habe viel gelesen.', 'Wir sind ins Kino gegangen.'],
      quiz: { q: 'Complete: Ich ___ nach Berlin gefahren.', options: ['habe', 'bin', 'ist'], answer: 1 },
      culture: 'In spoken German the Perfekt does the work of the English simple past. Präteritum is mostly written.'
    },
    {
      level: 'A1', topic: 'Negation — nicht vs kein',
      words: [w('nicht', 'not', 'nɪçt'), w('kein', 'no / not any (m/n)', 'kaɪn'), w('keine', 'no / not any (f/pl)', 'ˈkaɪnə'),
        w('nichts', 'nothing', 'nɪçts'), w('nie', 'never', 'niː'), w('Geld', 'money', 'ɡɛlt', 'das'),
        w('Zeit', 'time', 'tsaɪt', 'die'), w('Lust', 'desire / mood', 'lʊst', 'die'),
        w('verstehen', 'to understand', 'fɛɐ̯ˈʃteːən'), w('wissen', 'to know (a fact)', 'ˈvɪsn̩')],
      grammar: { title: 'nicht vs kein', body: 'Use "kein/keine" to negate nouns that take "ein" or have no article. Use "nicht" to negate verbs, adjectives, specific nouns with "der/die/das", and entire clauses.',
        examples: ['Ich habe kein Geld. (noun with zero article)', 'Das ist nicht mein Buch. (definite noun)', 'Ich verstehe das nicht. (verb negation)', 'Er ist nicht müde. (adjective)'] },
      pronunciation: { focus: 'soft ch in nicht', tip: 'Whisper a gentle "sh" sound while keeping the tongue flat against the palate.', words: ['nicht /nɪçt/', 'nichts /nɪçts/', 'ich /ɪç/'] },
      listening: { title: 'Easy German — Negation in German', source: 'Easy German', url: 'https://www.youtube.com/@EasyGerman/playlists' },
      speaking: ['Ich verstehe das nicht.', 'Ich habe heute keine Zeit.', 'Ich habe keine Lust.', 'Das ist nicht teuer.', 'Ich weiß es nicht.'],
      quiz: { q: 'Complete: Ich habe ___ Auto.', options: ['nicht', 'kein', 'keine'], answer: 1 },
      culture: 'Directness is valued in Germany. Saying "Nein, ich habe keine Zeit" is seen as polite clarity, not rudeness.'
    },
    {
      level: 'A1', topic: 'Travel and transport',
      words: [w('Fahrkarte', 'ticket', 'ˈfaːɐ̯kaʁtə', 'die'), w('Gleis', 'platform / track', 'ɡlaɪs', 'das'),
        w('Abfahrt', 'departure', 'ˈapfaːɐ̯t', 'die'), w('Ankunft', 'arrival', 'ˈankʊnft', 'die'),
        w('Flughafen', 'airport', 'ˈfluːkhaːfn̩', 'der'), w('Flugzeug', 'airplane', 'ˈfluːktsɔɪk', 'das'),
        w('Koffer', 'suitcase', 'ˈkɔfɐ', 'der'), w('Reise', 'journey / trip', 'ˈʁaɪzə', 'die'),
        w('einsteigen', 'to get on / board', 'ˈaɪnʃtaɪɡn̩'), w('umsteigen', 'to transfer / change trains', 'ˈʊmʃtaɪɡn̩')],
      grammar: { title: 'Prepositions of travel (nach, in, zu)', body: 'Use "nach" for cities and countries without articles (nach Berlin, nach Deutschland). Use "in" with accusative for countries with articles (in die Schweiz, in die USA). Use "zu" for people and specific buildings (zum Bahnhof).',
        examples: ['Ich fahre nach München.', 'Ich gehe zum Flughafen.', 'Der Zug fährt von Gleis vier ab.', 'Wir müssen in Frankfurt umsteigen.'] },
      pronunciation: { focus: 'ei in Gleis and Reise', tip: '"ei" is always "eye". Gleis sounds like "glyce", Reise like "RYE-zuh".', words: ['Gleis /ɡlaɪs/', 'Reise /ˈʁaɪzə/', 'einsteigen /ˈaɪnʃtaɪɡn̩/'] },
      listening: { title: 'Nicos Weg A1 — Am Bahnhof', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg/c-36519789' },
      speaking: ['Eine Fahrkarte nach Berlin, bitte.', 'Von welchem Gleis fährt der Zug ab?', 'Muss ich umsteigen?', 'Wann ist die Ankunft?', 'Gute Reise!'],
      quiz: { q: 'Complete: Der Zug fährt ___ Berlin.', options: ['zu', 'nach', 'in'], answer: 1 },
      culture: 'Deutsche Bahn platform displays announce train compositions by sector (A, B, C). Look at the board to know where your carriage stops.'
    },
    {
      level: 'A2', topic: 'Opinions and reasons',
      words: [w('meinen', 'to think', 'ˈmaɪnən'), w('glauben', 'to believe', 'ˈɡlaʊbn̩'), w('weil', 'because', 'vaɪl'),
        w('deshalb', 'therefore', 'ˈdɛshalp'), w('obwohl', 'although', 'ɔpˈvoːl'), w('Meinung', 'opinion', 'ˈmaɪnʊŋ', 'die'),
        w('wichtig', 'important', 'ˈvɪçtɪç'), w('Grund', 'reason', 'ɡʁʊnt', 'der'),
        w('Vorteil', 'advantage', 'ˈfoːɐ̯taɪl', 'der'), w('Nachteil', 'disadvantage', 'ˈnaːxtaɪl', 'der')],
      grammar: { title: 'weil sends the verb to the end', body: 'Subordinating conjunctions (weil, dass, obwohl, wenn) push the verb to final position.',
        examples: ['Ich lerne Deutsch, weil ich in Deutschland studieren möchte.', 'Ich glaube, dass Deutsch schwer ist.', 'Obwohl es schwer ist, lerne ich jeden Tag.'] },
      pronunciation: { focus: 'ich-Laut', tip: 'Soft "ch" after i and e: wichtig ends like a whispered "sh" with the tongue high.', words: ['wichtig /ˈvɪçtɪç/', 'ich /ɪç/', 'nicht /nɪçt/'] },
      listening: { title: 'Nicos Weg A2 — Meinungen', source: 'Deutsche Welle', url: 'https://learngerman.dw.com/en/nicos-weg-a2/c-40760437' },
      speaking: ['Meiner Meinung nach ist Deutsch wichtig.', 'Ich lerne Deutsch, weil ich in Deutschland studieren will.', 'Ein Vorteil ist die kostenlose Bildung.', 'Ein Nachteil ist die Sprache.', 'Ich glaube, dass ich B1 schaffen kann.'],
      quiz: { q: 'Correct: Ich lerne Deutsch, weil ich Deutschland ___.', options: ['mag', 'mag ich', 'ich mag'], answer: 0 },
      culture: 'German discussion style is direct. Disagreement with your argument is not disagreement with you.'
    },
    {
      level: 'A2', topic: 'Formal writing and emails',
      words: [w('Sehr geehrte', 'Dear (formal)', 'zeːɐ̯ ɡəˈʔeːɐ̯tə'), w('Anlage', 'attachment', 'ˈanlaːɡə', 'die'),
        w('bitten', 'to request', 'ˈbɪtn̩'), w('mitteilen', 'to inform', 'ˈmɪttaɪlən'), w('Rückmeldung', 'reply', 'ˈʁʏkmɛldʊŋ', 'die'),
        w('freundlich', 'kind', 'ˈfʁɔɪntlɪç'), w('Grüße', 'regards', 'ˈɡʁyːsə'), w('beifügen', 'to enclose', 'ˈbaɪfyːɡn̩'),
        w('Bescheinigung', 'confirmation', 'bəˈʃaɪnɪɡʊŋ', 'die'), w('Termin', 'appointment', 'tɛʁˈmiːn', 'der')],
      grammar: { title: 'Formal register', body: 'Use Sie, subjunctive politeness and full sentences. No contractions.',
        examples: ['Sehr geehrte Damen und Herren,', 'Ich möchte mich für den Masterstudiengang bewerben.', 'Könnten Sie mir bitte mitteilen, …', 'Mit freundlichen Grüßen, Pratham Sukhadia'] },
      pronunciation: { focus: 'stress in long compounds', tip: 'Compounds stress the first element: BEscheinigung, RÜCKmeldung.', words: ['Bescheinigung', 'Rückmeldung', 'Bewerbungsfrist'] },
      listening: { title: 'Goethe-Institut B1 sample materials', source: 'Goethe-Institut', url: 'https://www.goethe.de/en/spr/kup/prf/prf/gzb1.html' },
      speaking: ['Sehr geehrte Damen und Herren, ich habe eine Frage zur Bewerbung.', 'Ich füge meine Unterlagen bei.', 'Könnten Sie mir bitte einen Termin geben?', 'Ich bitte um eine kurze Rückmeldung.', 'Mit freundlichen Grüßen.'],
      quiz: { q: 'Formal closing?', options: ['Tschüss', 'Mit freundlichen Grüßen', 'Bis dann'], answer: 1 },
      culture: 'German administrative email is short, formal and factual. Warmth is signalled by correctness, not friendliness.'
    }
  ];

  /* ---------------- curated initial vocabulary seeds ---------------- */
  const IELTS_SEED_VOCAB = [
    { word: 'significant', meaning: 'sufficiently great or important to be worthy of attention', pos: 'adjective', synonyms: 'substantial, notable, considerable', antonyms: 'minor, negligible', topic: 'Academic', example: 'There was a significant increase in urban population over the decade.' },
    { word: 'degradation', meaning: 'the process in which the quality of something is destroyed or spoiled', pos: 'noun', synonyms: 'deterioration, degeneration', antonyms: 'restoration, improvement', topic: 'Environment', example: 'Industrial emissions have contributed to severe environmental degradation.' },
    { word: 'substantiate', meaning: 'to provide evidence to support or prove the truth of an argument', pos: 'verb', synonyms: 'corroborate, verify, validate', antonyms: 'refute, disprove', topic: 'Writing Task 2', example: 'Candidates must substantiate their claims with concrete examples.' },
    { word: 'prevalent', meaning: 'widespread in a particular area or at a particular time', pos: 'adjective', synonyms: 'common, ubiquitous, pervasive', antonyms: 'rare, uncommon', topic: 'Society', example: 'Sedentary lifestyles are increasingly prevalent among office workers.' },
    { word: 'fluctuate', meaning: 'to rise and fall irregularly in number or amount', pos: 'verb', synonyms: 'oscillate, vary, alternate', antonyms: 'stabilize, remain steady', topic: 'Writing Task 1', example: 'Oil prices fluctuated widely throughout the second half of the year.' },
    { word: 'paramount', meaning: 'more important than anything else; supreme', pos: 'adjective', synonyms: 'vital, crucial, quintessential', antonyms: 'trivial, secondary', topic: 'Education', example: 'Ensuring equitable access to education is of paramount importance.' },
    { word: 'detrimental', meaning: 'tending to cause harm or damage', pos: 'adjective', synonyms: 'harmful, adverse, damaging', antonyms: 'beneficial, advantageous', topic: 'Health', example: 'Excessive screen exposure has a detrimental impact on sleep quality.' },
    { word: 'mitigate', meaning: 'to make something bad less severe, serious, or painful', pos: 'verb', synonyms: 'alleviate, reduce, diminish', antonyms: 'aggravate, exacerbate', topic: 'Environment', example: 'Governments must implement renewable policies to mitigate climate change.' },
    { word: 'ubiquitous', meaning: 'present, appearing, or found everywhere', pos: 'adjective', synonyms: 'omnipresent, pervasive, universal', antonyms: 'scarce, rare', topic: 'Technology', example: 'Smartphones have become ubiquitous across all demographics.' },
    { word: 'disparity', meaning: 'a great difference or inequality', pos: 'noun', synonyms: 'imbalance, divergence, gap', antonyms: 'parity, equality', topic: 'Society', example: 'The income disparity between urban and rural areas has widened.' }
  ];

  const GERMAN_SEED_VOCAB = [
    { word: 'Universität', article: 'die', meaning: 'university', plural: 'die Universitäten', ipa: '/univɛʁziˈtɛːt/', topic: 'Education', level: 'A1', example: 'Ich möchte an einer Universität in Deutschland studieren.' },
    { word: 'Bewerbung', article: 'die', meaning: 'application', plural: 'die Bewerbungen', ipa: '/bəˈvɛʁbʊŋ/', topic: 'University', level: 'A1', example: 'Meine Bewerbung für den Master ist fertig.' },
    { word: 'Frist', article: 'die', meaning: 'deadline', plural: 'die Fristen', ipa: '/fʁɪst/', topic: 'University', level: 'A1', example: 'Die Bewerbungsfrist endet am 15. Juli.' },
    { word: 'Wohnung', article: 'die', meaning: 'apartment / flat', plural: 'die Wohnungen', ipa: '/ˈvoːnʊŋ/', topic: 'Living', level: 'A1', example: 'Ich suche eine kleine Wohnung in Berlin.' },
    { word: 'Bahnhof', article: 'der', meaning: 'railway station', plural: 'die Bahnhöfe', ipa: '/ˈbaːnhoːf/', topic: 'Travel', level: 'A1', example: 'Der Zug fährt am Hauptbahnhof ab.' },
    { word: 'Fahrkarte', article: 'die', meaning: 'ticket', plural: 'die Fahrkarten', ipa: '/ˈfaːɐ̯kaʁtə/', topic: 'Travel', level: 'A1', example: 'Ich brauche eine Fahrkarte nach München.' },
    { word: 'Arbeit', article: 'die', meaning: 'work / job', plural: 'die Arbeiten', ipa: '/ˈaʁbaɪt/', topic: 'Work', level: 'A1', example: 'Er fängt seine neue Arbeit am Montag an.' },
    { word: 'Termin', article: 'der', meaning: 'appointment', plural: 'die Termine', ipa: '/tɛʁˈmiːn/', topic: 'Daily Life', level: 'A1', example: 'Ich habe einen Termin bei der Botschaft.' },
    { word: 'Sprache', article: 'die', meaning: 'language', plural: 'die Sprachen', ipa: '/ˈʃpʁaːxə/', topic: 'Learning', level: 'A1', example: 'Deutsch ist eine interessante Sprache.' },
    { word: 'Unterlagen', article: 'die', meaning: 'documents / paperwork', plural: 'die Unterlagen', ipa: '/ˈʊntɐlaːɡn̩/', topic: 'University', level: 'A1', example: 'Alle Unterlagen müssen beglaubigt sein.' }
  ];

  const GERMAN_IDIOMS = [
    { expr: 'Daumen drücken', lit: 'Press thumbs', meaning: 'To cross fingers / wish someone good luck', example: 'Ich drücke dir die Daumen für deine IELTS-Prüfung!' },
    { expr: 'Schwein haben', lit: 'To have a pig', meaning: 'To be lucky / have a stroke of good fortune', example: 'Er hat Schwein gehabt und den letzten Zug noch bekommen.' },
    { expr: 'Alles in Butter', lit: 'Everything in butter', meaning: 'Everything is in order / completely fine', example: 'Keine Sorge, alles ist in Butter!' },
    { expr: 'Das ist mir Wurst', lit: 'That is sausage to me', meaning: 'It does not matter to me / I don\'t mind', example: 'Ob wir heute oder morgen lernen, ist mir Wurst.' },
    { expr: 'Nur Bahnhof verstehen', lit: 'To only understand train station', meaning: 'To not understand a single word', example: 'Wenn er schnell spricht, verstehe ich nur Bahnhof.' }
  ];

  /* ---------------- German sound guide ---------------- */
  const SOUNDS = [
    ['ä', '/ɛː/', 'like "e" in bed, held longer — Käse'],
    ['ö', '/øː/', 'say "eh", then round the lips — schön'],
    ['ü', '/yː/', 'say "ee", then round the lips — Tür'],
    ['ei', '/aɪ/', 'like English "eye" — mein'],
    ['ie', '/iː/', 'like English "ee" — wie'],
    ['eu / äu', '/ɔɪ/', 'like "oy" in boy — Freund'],
    ['ch (soft)', '/ç/', 'after e, i, ä, ö, ü — ich, nicht'],
    ['ch (hard)', '/x/', 'after a, o, u — Buch, machen'],
    ['sch', '/ʃ/', 'English "sh" — schön'],
    ['sp / st', '/ʃp/, /ʃt/', 'at word start becomes shp / sht — Student'],
    ['w', '/v/', 'English "v" — Wasser'],
    ['v', '/f/', 'usually English "f" — viel'],
    ['z', '/ts/', 'always "ts" — zwei'],
    ['ß', '/s/', 'sharp s, never "z" — Straße'],
    ['r (final)', '/ɐ/', 'softens to "ah" — Mutter'],
    ['-ig', '/ɪç/', 'ends like soft ch — wichtig']
  ];

  /* ---------------- English → German cross-links ---------------- */
  const CROSSLINK = {
    people: 'die Bevölkerung', population: 'die Bevölkerung', government: 'die Regierung',
    environment: 'die Umwelt', education: 'die Bildung', research: 'die Forschung',
    university: 'die Universität', student: 'der Student', economy: 'die Wirtschaft',
    development: 'die Entwicklung', society: 'die Gesellschaft', technology: 'die Technologie',
    health: 'die Gesundheit', work: 'die Arbeit', money: 'das Geld', city: 'die Stadt',
    country: 'das Land', language: 'die Sprache', knowledge: 'das Wissen', science: 'die Wissenschaft',
    problem: 'das Problem', solution: 'die Lösung', reason: 'der Grund', advantage: 'der Vorteil',
    disadvantage: 'der Nachteil', opinion: 'die Meinung', experience: 'die Erfahrung',
    industry: 'die Industrie', transport: 'der Verkehr', climate: 'das Klima',
    energy: 'die Energie', water: 'das Wasser', food: 'das Essen', family: 'die Familie',
    child: 'das Kind', school: 'die Schule', teacher: 'der Lehrer', company: 'die Firma',
    job: 'der Beruf', future: 'die Zukunft', history: 'die Geschichte', culture: 'die Kultur',
    law: 'das Gesetz', freedom: 'die Freiheit', growth: 'das Wachstum', change: 'die Veränderung',
    increase: 'die Zunahme', decrease: 'der Rückgang', result: 'das Ergebnis', effect: 'die Wirkung',
    cause: 'die Ursache', example: 'das Beispiel', decision: 'die Entscheidung', quality: 'die Qualität',
    quantity: 'die Menge', building: 'das Gebäude', traffic: 'der Verkehr', pollution: 'die Verschmutzung'
  };

  /* ---------------- academic alternatives fallback ---------------- */
  const ACADEMIC = {
    people: ['the population', 'individuals', 'members of society', 'residents', 'citizens', 'the public'],
    big: ['substantial', 'considerable', 'significant', 'extensive'],
    small: ['minor', 'marginal', 'limited', 'modest'],
    good: ['beneficial', 'favourable', 'advantageous', 'positive'],
    bad: ['detrimental', 'adverse', 'harmful', 'unfavourable'],
    important: ['crucial', 'vital', 'significant', 'pivotal'],
    increase: ['rise', 'grow', 'surge', 'climb', 'escalate'],
    decrease: ['decline', 'fall', 'drop', 'diminish', 'dwindle'],
    show: ['demonstrate', 'illustrate', 'indicate', 'reveal'],
    think: ['argue', 'contend', 'maintain', 'assert'],
    problem: ['issue', 'challenge', 'obstacle', 'drawback'],
    money: ['funding', 'capital', 'financial resources', 'expenditure'],
    children: ['young people', 'minors', 'youngsters', 'the younger generation'],
    a_lot: ['a considerable amount', 'a substantial proportion', 'a significant share']
  };

  /* ---------------- achievements ---------------- */
  const ACHIEVEMENTS = [
    { id: 'firstFlt', title: 'First FLT', desc: 'Completed your first full length test.' },
    { id: 'readingBreak', title: 'Reading breakthrough', desc: 'Reached 6.5 in Reading.' },
    { id: 'reading7', title: 'Band 7 Reading', desc: 'Reached 7.0 in Reading.' },
    { id: 'writingBreak', title: 'Writing breakthrough', desc: 'Reached 7.0 in Writing.' },
    { id: 'listening8', title: 'Listening 8.0', desc: 'Reached 8.0 in Listening.' },
    { id: 'overall7', title: 'Overall 7.0', desc: 'Logged an overall band of 7.0 or higher.' },
    { id: 'streak7', title: '7-day consistency', desc: 'Studied seven consecutive days.' },
    { id: 'streak30', title: '30-day discipline', desc: 'Held a 30-day study streak.' },
    { id: 'a1done', title: 'A1 complete', desc: 'Completed all A1 lessons in the lesson bank.' },
    { id: 'vocab500', title: 'Vocabulary 500', desc: 'Logged 500 vocabulary items.' },
    { id: 'german300', title: 'German 300', desc: 'Logged 300 German words.' },
    { id: 'mistakes50', title: 'Honest logger', desc: 'Recorded 50 mistakes with analysis.' },
    { id: 'hours100', title: '100 study hours', desc: 'Logged 100 hours of study.' },
    { id: 'uni5', title: 'Shortlist built', desc: 'Researched five universities.' },
    { id: 'docsHalf', title: 'Paperwork moving', desc: 'Half the document checklist completed.' }
  ];

  return {
    PROFILE, CLASSES, SCHEDULE, MODES, PHASES, SCHEMAS, MASTERY,
    READING_TYPES, LISTENING_ERRORS, WRITING_ERRORS,
    DOCS_SEED, RES_SEED, CEFR, TIPS, LESSONS, SOUNDS, CROSSLINK, ACADEMIC, ACHIEVEMENTS,
    IELTS_SEED_VOCAB, GERMAN_SEED_VOCAB, GERMAN_IDIOMS
  };
})();
