import { useTranslation } from 'react-i18next';
import { failureHintKey, failureMessageKey, type YouTubeFailure } from '../lib/youtubeFailure';

// src/components/YouTubeFailureMessage.tsx
//
// One renderer for every YouTube failure, so the four screens that can show one do not each invent
// their own phrasing and their own length.
//
// Two design decisions worth stating, because both were bugs before:
//
//   1. **The message is short; the hint is separate.** The old copy put the diagnosis, the reason
//      and the remedy in one 100+ character sentence. On a phone that is unreadable, and the part
//      the user needs (what to do) was at the end. Now the first line is one clause and the hint is
//      a quieter second line that can be dropped when there is no room - which is what `compact`
//      does.
//   2. **Detail is appended, never composed into.** Google's `reason` string is evidence, not prose.
//      It is shown in a monospace aside, so it never reads as part of the sentence.

export type YouTubeFailureMessageProps = {
  failure: YouTubeFailure | null;
  /** Drops the hint line. For tight surfaces like the player overlay. */
  compact?: boolean;
  className?: string;
};

export default function YouTubeFailureMessage({ failure, compact = false, className = '' }: YouTubeFailureMessageProps) {
  const { t } = useTranslation();
  if (!failure) return null;

  const message = t(failureMessageKey(failure.code));
  const hintKey = failureHintKey(failure.code);
  // A numeric detail is a status code; anything else is a reason string worth showing verbatim.
  const detail = failure.detail;

  return (
    <div className={className}>
      <p className="font-medium">{message}</p>
      {!compact && hintKey && (
        <p className="mt-1 text-[11px] leading-relaxed opacity-75">{t(hintKey)}</p>
      )}
      {detail && (
        <p className="mt-1 font-mono text-[10px] leading-relaxed opacity-50 break-all">{detail}</p>
      )}
    </div>
  );
}
