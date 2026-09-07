import { Link } from 'expo-router';

import { Button, Empty, Screen } from '@/core/ui';

/**
 * Placeholder home route.
 *
 * Renders the shared Empty state (whose copy comes from locales/) so the app
 * shows real Hebrew from first launch. In development it also links to the
 * kitchen sink — that label is a developer affordance, not shipped copy.
 *
 * Stage 7's clone script resets this to a minimal tab layout per app.
 */
export default function Index() {
  return (
    <Screen>
      <Empty />

      {__DEV__ ? (
        <Link href="/_dev/kitchen-sink" asChild>
          <Button label="Kitchen Sink (dev)" variant="secondary" block />
        </Link>
      ) : null}
    </Screen>
  );
}
