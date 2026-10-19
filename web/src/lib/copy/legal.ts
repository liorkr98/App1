import copy from '@locales/he.json?copy=legal';

import { addCopy } from '../i18n';

/** This page reads legal.* (integrations/client-copy.mjs PAGE_NAMESPACES). Import it first. */
addCopy('legal', (copy as Record<string, unknown>).legal);
