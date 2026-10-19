import copy from '@locales/he.json?copy=admin';

import { addCopy } from '../i18n';

/** This page reads admin.* (integrations/client-copy.mjs PAGE_NAMESPACES). Import it first. */
addCopy('admin', (copy as Record<string, unknown>).admin);
