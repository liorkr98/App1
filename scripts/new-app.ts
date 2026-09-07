/**
 * Clone the template into a new app.
 *
 *   npm run new-app -- --name "מתווך פרו" --slug broker-pro --bundle com.lior.brokerpro
 *
 * Run with Node's native TypeScript support (Node 22.6+ strips types), so
 * there is no build step and no extra dependency.
 *
 * What it does NOT do, on purpose: create the App Store Connect record, the
 * RevenueCat project, or the Supabase project. Those need decisions and
 * credentials, so the script prints them as a checklist instead of guessing.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Options {
  name: string;
  slug: string;
  bundle: string;
  dir: string;
}

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      fail(`Missing value for --${key}`);
    }
    values.set(key, next);
    i += 1;
  }

  const name = values.get('name');
  const slug = values.get('slug');
  const bundle = values.get('bundle');

  if (!name || !slug || !bundle) {
    fail(
      'Usage: npm run new-app -- --name "<display name>" --slug <slug> --bundle <com.example.app> [--dir <path>]',
    );
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    fail(`Invalid slug "${slug}". Use lowercase letters, digits and hyphens.`);
  }

  // Both stores reject identifiers that are not reverse-DNS.
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(bundle)) {
    fail(`Invalid bundle identifier "${bundle}". Expected reverse-DNS, e.g. com.example.app`);
  }

  const templateRoot = process.cwd();
  const target = values.get('dir') ?? path.join(path.dirname(templateRoot), slug);

  return { name, slug, bundle, dir: target };
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * Never copied.
 *
 * `.env` is excluded deliberately: the new app gets its own Supabase and
 * RevenueCat projects, and silently inheriting the template's credentials
 * would be worse than an obvious missing file.
 */
const EXCLUDED = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'ios',
  'android',
  'coverage',
  '.env',
  'package-lock.json',
]);

function copyTemplate(from: string, to: string): void {
  fs.cpSync(from, to, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(from, source);
      if (relative === '') return true;
      const [top] = relative.split(path.sep);
      return !EXCLUDED.has(top) && !EXCLUDED.has(path.basename(source));
    },
  });
}

// ---------------------------------------------------------------------------
// Rewrites
// ---------------------------------------------------------------------------

function rewriteAppConfig(root: string, options: Options): void {
  const file = path.join(root, 'app.config.ts');
  let source = fs.readFileSync(file, 'utf8');

  const replacements: [RegExp, string][] = [
    [/(\bname:\s*)'[^']*'/, `$1'${options.name}'`],
    [/(\bslug:\s*)'[^']*'/, `$1'${options.slug}'`],
    [/(\bscheme:\s*)'[^']*'/, `$1'${options.slug.replace(/-/g, '')}'`],
    [/(\bbundleIdentifier:\s*)'[^']*'/, `$1'${options.bundle}'`],
    [/(\bandroidPackage:\s*)'[^']*'/, `$1'${options.bundle}'`],
    // Cleared rather than carried over: pointing a new app at the template's
    // EAS project would push its builds into the wrong dashboard.
    [/(\beasProjectId:\s*)'[^']*'/, `$1''`],
    [/(\bversion:\s*)'[^']*'/, `$1'1.0.0'`],
  ];

  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(source)) {
      fail(`Could not rewrite ${pattern} in app.config.ts — has its identity block changed?`);
    }
    source = source.replace(pattern, replacement);
  }

  fs.writeFileSync(file, source);
}

function rewritePackageJson(root: string, options: Options): void {
  const file = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  pkg.name = options.slug;
  pkg.version = '1.0.0';
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

/** Namespaces every app shares. Anything else was app-specific. */
const SHARED_NAMESPACES = ['common', 'errors', 'empty', 'language', 'auth', 'paywall', 'settings'];

function clearLocales(root: string): void {
  for (const locale of ['he', 'en']) {
    const file = path.join(root, 'locales', `${locale}.json`);
    if (!fs.existsSync(file)) continue;

    const all = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    const kept = Object.fromEntries(
      Object.entries(all).filter(([key]) => SHARED_NAMESPACES.includes(key)),
    );
    fs.writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`);
  }
}

function resetFeatures(root: string): void {
  const features = path.join(root, 'src', 'features');
  fs.rmSync(features, { recursive: true, force: true });
  fs.mkdirSync(features, { recursive: true });
  fs.writeFileSync(path.join(features, '.gitkeep'), '');

  // settings is shared across the portfolio, so it is restored rather than
  // dropped — every app needs the compliance screen (CLAUDE.md §7).
  const settingsDir = path.join(features, 'settings');
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.cpSync(
    path.join(process.cwd(), 'src', 'features', 'settings', 'SettingsScreen.tsx'),
    path.join(settingsDir, 'SettingsScreen.tsx'),
  );
}

const TABS_LAYOUT = `import { Tabs } from 'expo-router';

import { useTheme } from '@/core/ui';

/**
 * Minimal tab layout. Add tabs as the app grows.
 *
 * No flexDirection or directional padding here: the tab bar mirrors itself
 * under RTL automatically (CLAUDE.md §4.2).
 */
export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}
    />
  );
}
`;

const TABS_INDEX = `import { Empty, Screen } from '@/core/ui';

/** Home tab. Replace with the app's first real screen. */
export default function Home() {
  return (
    <Screen>
      <Empty />
    </Screen>
  );
}
`;

function resetRoutes(root: string): void {
  const app = path.join(root, 'src', 'app');

  // The placeholder home route is replaced by the tab group.
  fs.rmSync(path.join(app, 'index.tsx'), { force: true });

  const tabs = path.join(app, '(tabs)');
  fs.mkdirSync(tabs, { recursive: true });
  fs.writeFileSync(path.join(tabs, '_layout.tsx'), TABS_LAYOUT);
  fs.writeFileSync(path.join(tabs, 'index.tsx'), TABS_INDEX);

  // _dev/ is kept on purpose: the kitchen sink is how CLAUDE.md §4.6 gets
  // satisfied for each new app, and it is already gated behind __DEV__.
}

function writePrdStub(root: string, options: Options): void {
  const content = `# ${options.name} — PRD

Claude Code reads this alongside CLAUDE.md. Write it before asking for any
feature work (CLAUDE.md §9).

## Problem

Who has this problem, and what do they do today instead?

## User

Primary user. Be specific — "real estate agents in Israel who work alone"
beats "professionals".

## Core loop

The one thing the user does repeatedly. If there is more than one, the app is
too big for a first version.

## Scope for v1

### In
-

### Out
-

Being explicit about what is out is what keeps v1 shippable.

## Screens

List them. Each one has to survive the §4.6 check: long Hebrew, mixed
Hebrew+English, a price, a phone number, a date.

## Data model

Tables, and who may read or write each row. Every table needs an RLS policy
before it holds data (CLAUDE.md §8).

## Monetisation

What is free, what is behind the \`pro\` entitlement, and why someone pays.

## Not doing

Ideas explicitly deferred, so they stop coming up.
`;

  fs.writeFileSync(path.join(root, 'PRD.md'), content);
}

function resetGitHistory(root: string, options: Options): void {
  const run = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });

  fs.rmSync(path.join(root, '.git'), { recursive: true, force: true });
  run('init', '-q');
  run('branch', '-M', 'main');
  run('add', '-A');
  run('commit', '-q', '-m', `chore: initialise ${options.name} from the Hebrew app template`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const templateRoot = process.cwd();

  if (!fs.existsSync(path.join(templateRoot, 'app.config.ts'))) {
    fail('Run this from the template repo root (app.config.ts not found).');
  }

  if (fs.existsSync(options.dir)) {
    fail(`Target already exists: ${options.dir}`);
  }

  console.log(`\n  Creating ${options.name}`);
  console.log(`  ${options.dir}\n`);

  copyTemplate(templateRoot, options.dir);
  rewriteAppConfig(options.dir, options);
  rewritePackageJson(options.dir, options);
  clearLocales(options.dir);
  resetFeatures(options.dir);
  resetRoutes(options.dir);
  writePrdStub(options.dir, options);
  resetGitHistory(options.dir, options);

  console.log('  Done. Manual steps left, in order:\n');
  console.log('   1. Supabase   create a project in eu-central-1 (closest to Israel),');
  console.log('                 then apply supabase/migrations and deploy');
  console.log('                 supabase/functions/delete-account.');
  console.log('   2. RevenueCat create a project, add the "pro" entitlement, and copy');
  console.log('                 the iOS and Android PUBLIC SDK keys.');
  console.log('   3. Expo       create the project, connect the GitHub repo, then put');
  console.log('                 its id into easProjectId in app.config.ts.');
  console.log('   4. Apple      create the App Store Connect record with the bundle id');
  console.log(`                 ${options.bundle}, and enable Sign in with Apple.`);
  console.log('   5. Sentry     create a project and copy the DSN.');
  console.log('   6. .env       copy .env.example to .env and fill in every value.');
  console.log('                 It was NOT copied from the template, on purpose.');
  console.log('   7. Legal      replace the example.com URLs and the support address');
  console.log('                 in app.config.ts with live Hebrew pages.');
  console.log('   8. PRD.md     write it before asking for feature work.\n');
  console.log('  Then: npm install && npm run typecheck && npm run lint\n');
  console.log('  Before submitting, work through docs/STORE-CHECKLIST.md.\n');
}

main();
