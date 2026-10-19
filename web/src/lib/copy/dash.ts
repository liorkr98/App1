import copy from '@locales/he.json?copy=dash';

import { addCopy } from '../i18n';

/** This page reads dash.* (integrations/client-copy.mjs PAGE_NAMESPACES). Import it first. */
addCopy('dash', (copy as Record<string, unknown>).dash);
