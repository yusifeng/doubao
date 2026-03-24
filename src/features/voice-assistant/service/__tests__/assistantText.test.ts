import {
  extractAssistantDisplaySegments,
  isSameAssistantText,
  sanitizeAssistantText,
} from '../assistantText';

describe('assistantText helpers', () => {
  it('dedupes obvious repeated tail in assistant text', () => {
    const raw =
      '你还挺博学的嘛，连柯南道尔都知道。其实我很喜欢侦探小说，所以才起了这个名字。你还挺博学的嘛，连柯南道尔都知道。其实我很喜欢侦探小说，所以才起了这个名字。';
    expect(sanitizeAssistantText(raw)).toBe(
      '你还挺博学的嘛，连柯南道尔都知道。其实我很喜欢侦探小说，所以才起了这个名字。',
    );
  });

  it('dedupes repeated sentence blocks in A+B+A+B form', () => {
    const raw =
      '嗯，我在听。你可以继续说。嗯，我在听。你可以继续说。';
    expect(sanitizeAssistantText(raw)).toBe('嗯，我在听。你可以继续说。');
  });

  it('prefers punctuated suffix when prefix already contains it', () => {
    const raw =
      '扶了下眼镜嘴角扬起不易察觉的弧度你还挺博学嘛连柯南道尔都知道其实我很喜欢侦探小说所以才这个名字怎么样是不是有感觉你还挺博学的嘛，连柯南道尔都知道。其实我很喜欢侦探小说，所以才起了这个名字，怎么样，是不是很有侦探的感觉？';
    expect(sanitizeAssistantText(raw)).toBe(
      '你还挺博学的嘛，连柯南道尔都知道。其实我很喜欢侦探小说，所以才起了这个名字，怎么样，是不是很有侦探的感觉？',
    );
  });

  it('preserves punctuation while deduping overlapping clauses', () => {
    const raw =
      '其实，最重要的是冷静一点，好吗？其实，最重要的是冷静一点，好吗？';
    expect(sanitizeAssistantText(raw)).toBe('其实，最重要的是冷静一点，好吗？');
  });

  it('marks narration sentences for display and wraps with parentheses', () => {
    const segments = extractAssistantDisplaySegments(
      '手指下意识抵着下巴，镜片反光遮住眼神。嗯，我知道了。',
    );
    expect(segments).toEqual([
      { text: '（手指下意识抵着下巴，镜片反光遮住眼神。）', narration: true },
      { text: '嗯，我知道了。', narration: false },
    ]);
  });

  it('treats punctuation-only differences as same content', () => {
    expect(isSameAssistantText('你好，我在。', '你好我在')).toBe(true);
  });
});
