import copy from '@locales/he.json?copy=phoneUpload';

import { addCopy } from '../i18n';

/** This page reads phoneUpload.* (integrations/client-copy.mjs PAGE_NAMESPACES). Import it first. */
addCopy('phoneUpload', (copy as Record<string, unknown>).phoneUpload);
