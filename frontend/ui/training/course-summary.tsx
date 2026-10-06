import { Fragment } from 'react';
import { TRAINING_COURSE } from '@/shared/contracts/training';

/**
 * The course summary copy, shared verbatim by the homepage card and the apply
 * page so the two surfaces can never drift. It is the description followed by
 * the trainer/hours/sessions lines, with the key facts emphasized.
 */
const SUMMARY_LINES = [
  ...TRAINING_COURSE.description.split('\n'),
  `المدرِّب: ${TRAINING_COURSE.trainer}`,
  `عدد السَّاعات: ${TRAINING_COURSE.duration}`,
  `عدد الجلسات: ${TRAINING_COURSE.sessions}`,
];

const EMPHASIS_PHRASES = [
  'Online',
  TRAINING_COURSE.trainer,
  TRAINING_COURSE.duration,
  TRAINING_COURSE.sessions,
  'توفُّر الإنترنت واللابتوب وخلفيَّة تقنيَّة',
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EMPHASIS_PATTERN = new RegExp(`(${EMPHASIS_PHRASES.map(escapeRegExp).join('|')})`, 'g');

function emphasize(line: string) {
  return line.split(EMPHASIS_PATTERN).map((part, index) =>
    EMPHASIS_PHRASES.includes(part) ? (
      <strong key={index} className="font-bold">
        {part}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  );
}

export function CourseSummaryText() {
  return SUMMARY_LINES.map((line, index) => (
    <Fragment key={index}>
      {index > 0 && '\n'}
      {emphasize(line)}
    </Fragment>
  ));
}
