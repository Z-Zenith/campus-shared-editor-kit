/**
 * SEK-04 — runtime tests for the image-search's pure logic helpers.
 *
 * Uses Node's built-in test runner directly against TypeScript sources
 * (Node 22+ type stripping) rather than adding a new test-framework
 * dependency — same rationale as tests/code-editor.logic.test.ts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildImageMarkdown } from '../src/image-search/logic.ts';

test('buildImageMarkdown embeds the stable embeddedUrl, never a source URL', () => {
  const markdown = buildImageMarkdown({
    embeddedUrl: 'https://cdn.example.com/materials/img-abc123.jpg',
    altText: 'A campus courtyard',
    width: 800,
    height: 600,
    attribution: 'CC-BY / Jane Doe',
  });

  assert.match(markdown, /!\[A campus courtyard\]\(https:\/\/cdn\.example\.com\/materials\/img-abc123\.jpg\)/);
  assert.doesNotMatch(markdown, /sourceUrl/);
});

test('buildImageMarkdown renders attribution as visible text, not just alt text', () => {
  const markdown = buildImageMarkdown({
    embeddedUrl: 'https://cdn.example.com/x.jpg',
    altText: 'x',
    width: 1,
    height: 1,
    attribution: 'CC-BY / Jane Doe',
  });

  assert.match(markdown, /CC-BY \/ Jane Doe/);
});
