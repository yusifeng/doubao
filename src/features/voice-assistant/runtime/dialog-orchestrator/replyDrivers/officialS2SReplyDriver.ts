export function mergeOfficialS2SReplyDraft(currentDraft: string, incomingText: string): string {
  if (!incomingText) {
    return currentDraft;
  }
  if (!currentDraft) {
    return incomingText;
  }
  if (incomingText.startsWith(currentDraft) || incomingText.includes(currentDraft)) {
    return incomingText;
  }
  if (currentDraft.startsWith(incomingText) || currentDraft.includes(incomingText)) {
    return currentDraft;
  }

  const maxOverlap = Math.min(currentDraft.length, incomingText.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (currentDraft.slice(-overlap) === incomingText.slice(0, overlap)) {
      return `${currentDraft}${incomingText.slice(overlap)}`;
    }
  }

  return `${currentDraft}${incomingText}`;
}

export function finalizeOfficialS2SReply(
  eventText: string,
  draftText: string,
  pendingText: string,
): string {
  const finalText = (eventText || draftText || pendingText || '').trim();
  return finalText;
}
