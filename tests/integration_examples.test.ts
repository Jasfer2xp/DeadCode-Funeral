import { scan } from '../src/scanner/index';
import * as path from 'path';

test('scanner finds examples in example projects', () => {
  const root = path.resolve(__dirname, 'examples');
  const items = scan({ root });
  // should find at least one python buried item in examples
  const langs = new Set(items.map(i => i.language));
  expect(langs.has('python')).toBeTruthy();
});
