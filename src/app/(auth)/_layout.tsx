import { Stack } from 'expo-router';

/** Routes reachable without a session. See useAuthGuard. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
