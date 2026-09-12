import { SeriesArcScreen } from '../(you)/series-detail';

/** Study tab root — the current series' arc, with no back caret. */
export default function StudyIndexScreen() {
  return <SeriesArcScreen hostTab="(study)" chrome="tabRoot" />;
}
