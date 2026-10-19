import copy from '@locales/he.json?copy=auth';

import { addCopy } from '../i18n';

/** This page reads auth.* (integrations/client-copy.mjs PAGE_NAMESPACES). Import it first. */
addCopy('auth', (copy as Record<string, unknown>).auth);
