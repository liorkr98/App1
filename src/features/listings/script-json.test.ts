import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scriptJson } from './script-json.js';

describe('scriptJson', () => {
  it('cannot close the script element it sits in', () => {
    const out = scriptJson({ name: 'דירה</script><script>alert(1)</script>' });
    assert.equal(out.includes('</script>'), false);
    assert.equal(out.includes('<'), false);
  });

  it('parses back to the same value', () => {
    const value = { name: 'a < b & c > d', list: ['\u2028', 'x'] };
    assert.deepEqual(JSON.parse(scriptJson(value)), value);
  });
});
