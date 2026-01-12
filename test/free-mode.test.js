import { test, describe } from 'node:test';
import assert from 'node:assert';
import { OpenRouterClient } from '../src/free-mode/openrouter-client.js';
import { FreeModePipeline } from '../src/free-mode/pipeline.js';

const DEFAULT_CATEGORIES = {
  github: { match: ['github.com'], action: 'file', folder: './knowledge/tools', template: 'tool', description: 'GitHub repositories' },
  article: { match: ['medium.com', 'substack.com'], action: 'file', folder: './knowledge/articles', template: 'article', description: 'Articles' },
  youtube: { match: ['youtube.com', 'youtu.be'], action: 'transcribe', folder: './knowledge/videos', template: 'video', description: 'Videos' },
  podcast: { match: ['podcasts.apple.com'], action: 'transcribe', folder: './knowledge/podcasts', template: 'podcast', description: 'Podcasts' },
  tweet: { match: [], action: 'capture', folder: null, template: null, description: 'Tweets' }
};

const DEFAULT_CONFIG = {
  outputDir: './test-bookmarks',
  openrouter: { apiKey: 'test-key', model: 'anthropic/claude-3.5-sonnet' }
};

describe('Free Mode - Category Matching', () => {
  let pipeline;

  test.beforeEach(() => {
    pipeline = new FreeModePipeline(DEFAULT_CONFIG, DEFAULT_CATEGORIES);
  });

  test('handles empty category string', () => {
    const result = pipeline._matchCategory({}, { category: '', title: 'Test', summary: 'Test' });
    assert.ok(result, 'Should return a valid category object');
    assert.ok(result.action, 'Should have an action property');
  });

  test('handles category with extra spaces', () => {
    const result = pipeline._matchCategory({}, { category: '  GitHub  ', title: 'Test', summary: 'Test' });
    assert.ok(result, 'Should return a valid category object');
    assert.strictEqual(result.action, 'file', 'GitHub category should have file action');
  });

  test('handles null reasoning object', () => {
    const result = pipeline._matchCategory({}, null);
    assert.ok(result, 'Should return a valid category object');
    assert.ok(result.action, 'Should have an action property');
  });

  test('handles undefined reasoning object', () => {
    const result = pipeline._matchCategory({}, undefined);
    assert.ok(result, 'Should return a valid category object');
    assert.ok(result.action, 'Should have an action property');
  });

  test('handles unknown category with github keyword in title', () => {
    const result = pipeline._matchCategory({}, { category: 'Unknown', title: 'GitHub Bot Exploits', summary: 'Test summary' });
    assert.ok(result, 'Should return a valid category object');
    assert.strictEqual(result.action, 'file', 'Should map to github category with file action');
  });

  test('handles unknown category with article keyword in title', () => {
    const result = pipeline._matchCategory({}, { category: 'Unknown', title: 'Comprehensive Guide', summary: 'Test summary' });
    assert.ok(result, 'Should return a valid category object');
    assert.strictEqual(result.action, 'file', 'Should map to article category with file action');
  });

  test('maps standard categories correctly', () => {
    assert.strictEqual(pipeline._matchCategory({}, { category: 'GitHub', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'Article', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'Video', title: 'Test', summary: 'Test' }).action, 'transcribe');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'Podcast', title: 'Test', summary: 'Test' }).action, 'transcribe');
  });

  test('maps expanded category synonyms', () => {
    assert.strictEqual(pipeline._matchCategory({}, { category: 'repo', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'tutorial', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'course', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'resource', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'automation', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'mcp', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'techstack', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'deal', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'student', title: 'Test', summary: 'Test' }).action, 'file');
    assert.strictEqual(pipeline._matchCategory({}, { category: 'comprehensive', title: 'Test', summary: 'Test' }).action, 'file');
  });

  test('returns fallback tweet category for unrecognized content', () => {
    const result = pipeline._matchCategory({}, { category: 'Unknown', title: 'Random thoughts', summary: 'Just thinking' });
    assert.ok(result, 'Should return a valid category object');
    assert.strictEqual(result.action, 'capture', 'Unknown content should map to tweet category with capture action');
  });

  test('maps failing case: millionaire to article', () => {
    const result = pipeline._matchCategory({}, { category: 'Millionaire', title: 'Rise of Automation Millionaires', summary: 'Test summary' });
    assert.ok(result, 'Should return a valid category object');
    assert.strictEqual(result.action, 'file', 'Millionaire content should map to article category with file action');
  });

  test('maps failing case: 3D generation to article', () => {
    const result = pipeline._matchCategory({}, { category: '3D Generation', title: '3D Scene Generation', summary: 'Test summary' });
    assert.ok(result, 'Should return a valid category object');
    assert.strictEqual(result.action, 'file', '3D generation should map to article category with file action');
  });

  test('maps failing case: chat history to article', () => {
    const result = pipeline._matchCategory({}, { category: 'Chat History', title: 'AI Chat History', summary: 'Test summary' });
    assert.ok(result, 'Should return a valid category object');
    assert.strictEqual(result.action, 'file', 'Chat history should map to article category with file action');
  });

  test('maps failing case: vision to article', () => {
    const result = pipeline._matchCategory({}, { category: 'Vision', title: 'Personal AI Vision', summary: 'Test summary' });
    assert.ok(result, 'Should return a valid category object');
    assert.strictEqual(result.action, 'file', 'Vision content should map to article category with file action');
  });

  test('maps failing case: personal AI OS to article', () => {
    const result = pipeline._matchCategory({}, { category: 'Personal AI OS', title: 'Personal AI Operating System', summary: 'Test summary' });
    assert.ok(result, 'Should return a valid category object');
    assert.strictEqual(result.action, 'file', 'Personal AI OS should map to article category with file action');
  });

  test('maps failing case: Y Combinator deals to article', () => {
    const result = pipeline._matchCategory({}, { category: 'Y Combinator', title: 'Y Combinator Student Deals for AI Credits', summary: 'Test summary' });
    assert.ok(result, 'Should return a valid category object');
    assert.strictEqual(result.action, 'file', 'Y Combinator should map to article category with file action');
  });
});

describe('Free Mode - OpenRouter Client', () => {
  test('throws error without API key', async () => {
    const client = new OpenRouterClient({});

    await assert.rejects(
      () => client.getReasoning('test'),
      /OPENROUTER_API_KEY not configured/
    );
  });

  test('parses valid JSON output', () => {
    const client = new OpenRouterClient({ openrouter: { apiKey: 'test' } });
    const input = '{"title": "Test", "summary": "Test summary", "tags": ["test"], "category": "Test"}';

    const result = client._parseOutput(input);

    assert.strictEqual(result.title, 'Test');
    assert.strictEqual(result.summary, 'Test summary');
    assert.deepStrictEqual(result.tags, ['test']);
    assert.strictEqual(result.category, 'Test');
  });

  test('extracts JSON from markdown code blocks', () => {
    const client = new OpenRouterClient({ openrouter: { apiKey: 'test' } });
    const input = '```json\n{"title": "Test", "summary": "Test", "tags": [], "category": "Test"}\n```';

    const result = client._parseOutput(input);

    assert.strictEqual(result.title, 'Test');
    assert.strictEqual(result.summary, 'Test');
    assert.deepStrictEqual(result.tags, []);
    assert.strictEqual(result.category, 'Test');
  });

  test('validates required fields', () => {
    const client = new OpenRouterClient({ openrouter: { apiKey: 'test' } });

    assert.throws(() => {
      client._parseOutput('{"title": "Test"}');
    }, /Missing or invalid "summary" field/);

    assert.throws(() => {
      client._parseOutput('{"summary": "Test"}');
    }, /Missing or invalid "title" field/);

    assert.throws(() => {
      client._parseOutput('{"title": "Test", "summary": "Test", "tags": "test"}');
    }, /Missing or invalid "category" field/);

    assert.throws(() => {
      client._parseOutput('{"title": "Test", "summary": "Test", "category": "Test", "tags": "test"}');
    }, /Invalid "tags" field: must be array/);
  });

  test('handles missing required fields', () => {
    const client = new OpenRouterClient({ openrouter: { apiKey: 'test' } });

    assert.throws(() => {
      client._parseOutput('{"title": "Test", "summary": "Test"}');
    }, /Missing or invalid "category" field/);
  });
});
