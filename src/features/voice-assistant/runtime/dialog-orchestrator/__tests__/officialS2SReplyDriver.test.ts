import {
  finalizeOfficialS2SReply,
  mergeOfficialS2SReplyDraft,
} from '../replyDrivers/officialS2SReplyDriver';

describe('officialS2S reply driver helpers', () => {
  it('merges aggregate partials without duplication', () => {
    const first = mergeOfficialS2SReplyDraft('', '我是');
    const second = mergeOfficialS2SReplyDraft(first, '我是柯南');

    expect(second).toBe('我是柯南');
  });

  it('finalizes with fallback order: event -> draft -> pending', () => {
    expect(finalizeOfficialS2SReply('最终', '草稿', '挂起')).toBe('最终');
    expect(finalizeOfficialS2SReply('', '草稿', '挂起')).toBe('草稿');
    expect(finalizeOfficialS2SReply('', '', '挂起')).toBe('挂起');
  });
});
