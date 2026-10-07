import type { AreaClientStatus } from '../../lib/area-request';
import { Message } from './Message';

interface Props {
  status: AreaClientStatus | undefined;
  /** Named places found, when `ready`. */
  count?: number | undefined;
}

/**
 * One line saying where the neighbourhood lookup stands.
 *
 * The map, the walking minutes, the Walk route and the area paragraph all
 * come from this one lookup. It used to fail in silence, so an agent could
 * publish a listing with no map and no way to know why — or that the street
 * was simply spelled differently on the map.
 */
export function AreaLine({ status, count }: Props) {
  if (!status || status === 'no_address') return null;
  return (
    <p className={`area-line is-${status}`} role="status">
      {status === 'ready' && count ? (
        <Message path="editor.area.ready" values={{ count }} />
      ) : (
        <Message path={`editor.area.${status === 'ready' ? 'none' : status}`} />
      )}
    </p>
  );
}
