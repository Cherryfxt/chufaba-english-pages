// Display-only explanations. The original question, answer and source files stay unchanged.
const hasChinese = value => typeof value === 'string' && /[\u3400-\u9fff]/u.test(value);
const clean = value => typeof value === 'string' ? value.trim() : '';

function passageFor(q, station) {
  const passages = station?.passages;
  return Array.isArray(passages)
    ? passages.find(p => String(p.id) === String(q.passageId))
    : passages?.[q.passageId];
}

function evidenceZh(q, station) {
  const parallel = passageFor(q, station)?.parallelText;
  if (!Array.isArray(parallel)) return [];
  return (q.evidenceSentenceIndices || [])
    .filter(index => Number.isInteger(index) && index > 0)
    .map(index => ({ index, text: clean(parallel[index - 1]?.zh) }))
    .filter(item => hasChinese(item.text));
}

/** Chinese reasoning, with English retained only for the studied word/form/option.
 * All 3,024 current questions have their own authored Chinese parentExplanation;
 * use that evidence instead of guessing a translation from the general word list.
 */
export function explanationZh(q, station) {
  if (!q) return '这道题的中文解析暂未提供。';
  if (hasChinese(q.explanationZh)) return q.explanationZh.trim();

  let explanation = hasChinese(q.parentExplanation)
    ? q.parentExplanation.trim()
    : hasChinese(q.explanation) ? q.explanation.trim() : '';

  // Reword the existing word-meaning template for learners without translating
  // an arbitrary dictionary sense (the authored explanation owns the sense).
  const meaningTemplate = explanation.match(/^本题考查“([^”]+)”在本句中的用法；正确英文解释为“([^”]+)”。对应源表释义为“([^”]+)”。$/u);
  if (meaningTemplate) {
    const [, target, englishMeaning, chineseMeaning] = meaningTemplate;
    const context = q.kind === 'listening_sentence_meaning_choice'
      ? clean(q.translation?.listenScript)
      : q.kind === 'word_meaning_in_context'
        ? clean(q.translation?.stem).replace(/\s*这里“[^”]*”是什么意思？\s*$/u, '')
        : '';
    explanation = `${target} 在这里表示“${chineseMeaning}”。${hasChinese(context) ? `句子说的是：${context}` : ''}选项“${englishMeaning}”与这个意思相符。`;
  }

  // Replace a long English evidence quote with its already supplied Chinese
  // parallel sentence. Do not replace the contextual definition with a broad
  // source-word meaning (put on/pick up etc. can have multiple senses).
  const evidence = evidenceZh(q, station);
  if (q.kind === 'reading_vocabulary_in_context' && evidence.length) {
    explanation = explanation.replace(/；句子为“[^”]*”。?$/u, '。');
    const quote = evidence.map(item => `第${item.index}句：“${item.text}”`).join('；');
    explanation = `${explanation}${explanation ? '\n' : ''}语境依据：${quote}`;
  } else if (q.kind === 'reading_detail_integration' && evidence.length) {
    const quote = evidence.map(item => `第${item.index}句：“${item.text}”`).join('；');
    explanation = `${explanation}${explanation ? '\n' : ''}原文依据：${quote}`;
  }

  // Keep the exact expected inflected form visible. Reasoning remains the
  // question-specific authored grammar explanation, not a generic rule guess.
  if (q.kind === 'initial_letter_fill' && explanation && clean(q.answer)
      && !explanation.toLowerCase().includes(clean(q.answer).toLowerCase())) {
    explanation += ` 本题填写 ${q.answer}。`;
  }
  if (explanation) return explanation;

  // A future incomplete item must never silently fall back to English-only
  // reasoning or invent a causal explanation. Current-content tests forbid it.
  return '这道题的中文解析暂未提供，请联系家长核对题目。';
}
