import { View } from 'react-native';

/**
 * Placeholder route so expo-router has an entry point and `npm run start`
 * boots. Renders nothing on purpose.
 *
 * There is no text here because CLAUDE.md §10 forbids hardcoding a
 * user-facing string outside locales/, and i18n does not exist until Stage 1.
 * Stage 2 replaces this with the kitchen-sink route.
 */
export default function Index() {
  return <View style={{ flex: 1 }} />;
}
