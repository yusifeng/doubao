export type AssistantDisplaySegment = {
  text: string;
  narration: boolean;
};

const SENTENCE_REGEX = /[^。！？!?]+[。！？!?]?/g;
const NARRATION_PREFIX_REGEX =
  /^(手指|指尖|瞳孔|眼神|目光|嘴角|神情|表情|呼吸|眉头|侧头|抬手|低声|压低声音|背在身后|双手|沉默|顿了顿|轻咳|微微|扶了下|扶了扶|指尖轻|瞳孔微|背在身后)/;

export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?;；:：'"“”‘’（）()【】\[\]<>《》…—-]/g, '');
}

function normalizeForLooseComparison(text: string): string {
  return normalizeForComparison(text).replace(/[的了吧啊呢嘛呀]/g, '');
}

function containsAsSubsequence(source: string, target: string, minRatio = 0.9): boolean {
  if (!source || !target) {
    return false;
  }
  let matched = 0;
  let sourceIndex = 0;
  let targetIndex = 0;
  while (sourceIndex < source.length && targetIndex < target.length) {
    if (source[sourceIndex] === target[targetIndex]) {
      matched += 1;
      targetIndex += 1;
    }
    sourceIndex += 1;
  }
  return matched / target.length >= minRatio;
}

function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const segments = trimmed
    .match(SENTENCE_REGEX)
    ?.map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (!segments || segments.length === 0) {
    return [trimmed];
  }
  return segments;
}

function splitClauses(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const clauses = trimmed
    .match(/[^，,。！？!?]+[，,。！？!?]?/g)
    ?.map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (!clauses || clauses.length === 0) {
    return [trimmed];
  }
  return clauses;
}

function dedupeConsecutiveSentences(sentences: string[]): string[] {
  const result: string[] = [];
  let lastNormalized = '';
  for (const sentence of sentences) {
    const normalized = normalizeForComparison(sentence);
    if (!normalized) {
      continue;
    }
    if (normalized === lastNormalized) {
      continue;
    }
    result.push(sentence);
    lastNormalized = normalized;
  }
  return result;
}

function dedupeTailBlocks(sentences: string[]): string[] {
  const output = [...sentences];
  const normalized = output.map((sentence) => normalizeForComparison(sentence));
  if (output.length < 2) {
    return output;
  }

  while (output.length >= 2) {
    let removed = false;
    for (let blockSize = Math.floor(output.length / 2); blockSize >= 1; blockSize -= 1) {
      const start = output.length - blockSize * 2;
      if (start < 0) {
        continue;
      }
      let same = true;
      let enoughSignal = false;
      for (let i = 0; i < blockSize; i += 1) {
        const left = normalized[start + i];
        const right = normalized[start + blockSize + i];
        if (left.length >= 4 || right.length >= 4) {
          enoughSignal = true;
        }
        if (left !== right) {
          same = false;
          break;
        }
      }
      if (same && enoughSignal) {
        output.splice(start + blockSize, blockSize);
        normalized.splice(start + blockSize, blockSize);
        removed = true;
        break;
      }
    }
    if (!removed) {
      break;
    }
  }

  return output;
}

function dropVerboseFirstClause(clauses: string[]): string[] {
  if (clauses.length < 2) {
    return clauses;
  }
  const first = clauses[0];
  const rest = clauses.slice(1).join('');
  const firstLoose = normalizeForLooseComparison(first);
  const restLoose = normalizeForLooseComparison(rest);
  if (firstLoose.length < 40 || restLoose.length < 24) {
    return clauses;
  }
  if (
    firstLoose.includes(restLoose) ||
    containsAsSubsequence(firstLoose, restLoose, 0.88)
  ) {
    return clauses.slice(1);
  }
  return clauses;
}

function preferPunctuatedSuffix(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 80) {
    return trimmed;
  }

  let bestStart = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let start = Math.floor(trimmed.length * 0.35); start <= Math.floor(trimmed.length * 0.85); start += 1) {
    const prefix = trimmed.slice(0, start).trim();
    const suffix = trimmed.slice(start).trim();
    if (suffix.length < 24) {
      continue;
    }
    if (!/[，。！？!?]/.test(suffix)) {
      continue;
    }
    const prefixNormalized = normalizeForComparison(prefix);
    const suffixNormalized = normalizeForComparison(suffix);
    const prefixLooseNormalized = normalizeForLooseComparison(prefix);
    const suffixLooseNormalized = normalizeForLooseComparison(suffix);
    if (suffixNormalized.length < 24) {
      continue;
    }
    if (
      !prefixNormalized.includes(suffixNormalized) &&
      !(
        suffixLooseNormalized.length >= 20 &&
        (
          prefixLooseNormalized.includes(suffixLooseNormalized) ||
          containsAsSubsequence(prefixLooseNormalized, suffixLooseNormalized)
        )
      )
    ) {
      continue;
    }
    const punctuationCount = (suffix.match(/[，。！？!?]/g) ?? []).length;
    const score = suffixNormalized.length * 2 + punctuationCount * 5 - Math.abs(trimmed.length - suffix.length);
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  if (bestStart >= 0) {
    return trimmed.slice(bestStart).trim();
  }
  return trimmed;
}

function trimRunOnPrefix(text: string): string {
  const trimmed = text.trim();
  const firstPunctuationIndex = trimmed.search(/[，。！？!?]/);
  if (firstPunctuationIndex < 50) {
    return trimmed;
  }
  const punctuationCount = (trimmed.match(/[，。！？!?]/g) ?? []).length;
  if (punctuationCount < 2) {
    return trimmed;
  }
  const searchStart = Math.max(0, firstPunctuationIndex - 24);
  const windowText = trimmed.slice(searchStart, firstPunctuationIndex);
  const markers = ['我', '你', '他', '她', '它', '这', '那', '嗯', '啊', '好', '先', '别'];
  let bestOffset = -1;
  for (const marker of markers) {
    const index = windowText.lastIndexOf(marker);
    if (index > bestOffset) {
      bestOffset = index;
    }
  }
  if (bestOffset < 0) {
    return trimmed;
  }
  const candidate = trimmed.slice(searchStart + bestOffset).trim();
  if ((candidate.match(/[，。！？!?]/g) ?? []).length < 2) {
    return trimmed;
  }
  return candidate;
}

function isNarrationSentence(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return false;
  }
  if (
    (trimmed.startsWith('（') && trimmed.endsWith('）')) ||
    (trimmed.startsWith('(') && trimmed.endsWith(')'))
  ) {
    return true;
  }
  if (/[“”"「」]/.test(trimmed)) {
    return false;
  }
  if (/[？?]/.test(trimmed)) {
    return false;
  }
  return NARRATION_PREFIX_REGEX.test(trimmed);
}

function wrapNarration(sentence: string): string {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return '';
  }
  if (
    (trimmed.startsWith('（') && trimmed.endsWith('）')) ||
    (trimmed.startsWith('(') && trimmed.endsWith(')'))
  ) {
    return trimmed;
  }
  return `（${trimmed}）`;
}

export function sanitizeAssistantText(raw: string): string {
  // Keep all assistant-text cleanup flowing through one entrypoint so
  // runtime/UI dedupe behavior stays consistent across the app.
  const initial = raw.trim();
  if (!initial) {
    return '';
  }

  let clauses = splitClauses(initial);
  if (clauses.length > 1) {
    clauses = dedupeConsecutiveSentences(clauses);
    clauses = dedupeTailBlocks(clauses);
    clauses = dropVerboseFirstClause(clauses);
  }

  let merged = clauses.join('');
  merged = preferPunctuatedSuffix(merged);
  merged = trimRunOnPrefix(merged);
  clauses = splitClauses(merged);
  if (clauses.length > 1) {
    clauses = dedupeConsecutiveSentences(clauses);
    clauses = dedupeTailBlocks(clauses);
    clauses = dropVerboseFirstClause(clauses);
  }
  return clauses.join('').trim();
}

export function isSameAssistantText(left: string, right: string): boolean {
  const normalizedLeft = normalizeForComparison(left);
  const normalizedRight = normalizeForComparison(right);
  return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
}

export function extractAssistantDisplaySegments(content: string): AssistantDisplaySegment[] {
  const cleaned = sanitizeAssistantText(content);
  if (!cleaned) {
    return [{ text: '', narration: false }];
  }
  const sentences = splitSentences(cleaned);
  if (sentences.length === 0) {
    return [{ text: cleaned, narration: false }];
  }
  return sentences.map((sentence) => {
    const narration = isNarrationSentence(sentence);
    return {
      text: narration ? wrapNarration(sentence) : sentence,
      narration,
    };
  });
}
