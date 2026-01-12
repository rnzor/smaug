/**
 * Free Mode Pipeline - Deterministic Bookmark Processing
 *
 * This pipeline processes bookmarks without autonomous agents.
 * AI is used ONLY for reasoning (metadata extraction).
 * All file operations are deterministic JavaScript code.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { OpenRouterClient } from './openrouter-client.js';

export class FreeModePipeline {
  constructor(config, categories) {
    this.config = config;
    this.categories = categories;
    this.reasoner = this._createReasoner(config);
    this.outputDir = config.outputDir || './bookmarks';
    this.archiveFile = path.join(this.outputDir, 'bookmarks.md');
    this.toolsDir = path.join(this.outputDir, 'knowledge/tools');
    this.articlesDir = path.join(this.outputDir, 'knowledge/articles');
    this.podcastsDir = path.join(this.outputDir, 'knowledge/podcasts');
    this.videosDir = path.join(this.outputDir, 'knowledge/videos');

    this._ensureDir(this.outputDir);
    this._ensureDir(path.join(this.outputDir, 'knowledge'));
    this._ensureDir(this.toolsDir);
    this._ensureDir(this.articlesDir);
    this._ensureDir(this.podcastsDir);
    this._ensureDir(this.videosDir);
  }

  _createReasoner(config) {
    return new OpenRouterClient(config);
  }

  async process(bookmarks) {
    console.log(`\n🐉 Free Mode: Processing ${bookmarks.length} bookmark(s)...`);
    
    const results = [];
    const existingIds = this._loadExistingIds();
    
    for (const bookmark of bookmarks) {
      if (existingIds.has(bookmark.id)) {
        console.log(`  ⏭️  Skipping duplicate: @${bookmark.author} (${bookmark.id})`);
        continue;
      }

      try {
        const result = await this._processBookmark(bookmark);
        results.push(result);
        existingIds.add(bookmark.id);
      } catch (error) {
        console.error(`  ❌ Error processing ${bookmark.id}: ${error.message}`);
      }
    }

    return {
      processed: results.length,
      total: bookmarks.length,
      results
    };
  }

  async _processBookmark(bookmark) {
    console.log(`\n  📖 Processing: @${bookmark.author}`);

    const reasoning = await this._getReasoning(bookmark);
    console.log(`    💭 AI Reasoning: ${reasoning.title}`);

    const category = this._matchCategory(bookmark, reasoning);
    const slug = this._generateSlug(reasoning.title, bookmark.author);
    const filePath = await this._writeBookmark(bookmark, reasoning, category, slug);

    if (filePath) {
      this._appendToArchive(bookmark, reasoning, category, slug);
      console.log(`    ✅ Wrote: ${filePath}`);
    } else {
      console.log(`    ⏭️  Skipped (no file action for category: ${category.key})`);
    }

    return {
      id: bookmark.id,
      title: reasoning.title,
      slug,
      category: category.key,
      filePath
    };
  }

  async _getReasoning(bookmark) {
    const prompt = this._buildPrompt(bookmark);

    const contextLength = prompt.length;
    if (contextLength > 3000) {
      console.warn(`    ⚠️  Context too long (${contextLength} chars), using defaults`);
      return this._generateDefaultMetadata(bookmark);
    }

    try {
      return await this.reasoner.getReasoning(prompt, { timeout: 20000 });
    } catch (error) {
      console.warn(`    ⚠️  AI reasoning failed: ${error.message}, using defaults`);
      return this._generateDefaultMetadata(bookmark);
    }
  }

  _buildPrompt(bookmark) {
    const linkInfo = bookmark.links?.length > 0
      ? `\n\nLinks: ${bookmark.links.map(l => l.expanded).join('\n')}`
      : '';

    const replyInfo = bookmark.replyContext
      ? `\n\nReplying to @${bookmark.replyContext.author}: "${bookmark.replyContext.text.slice(0, 120)}"`
      : '';

    const quoteInfo = bookmark.quoteContext
      ? `\n\nQuoting @${bookmark.quoteContext.author}: "${bookmark.quoteContext.text.slice(0, 120)}"`
      : '';

    return `Analyze this tweet and extract metadata for bookmark organization.

Tweet by: @${bookmark.author}
Tweet text: ${bookmark.text}${linkInfo}${replyInfo}${quoteInfo}

Return JSON object with:
- title: Clean, concise title (max 60 chars, no hashtags)
- summary: 1-2 sentence summary of the content
- tags: Array of 2-4 relevant tags (lowercase, hyphenated)
- category: One of: GitHub, Article, Video, Podcast, Tool, General`;
  }

  _generateDefaultMetadata(bookmark) {
    const firstLink = bookmark.links?.[0];
    let title = bookmark.text.slice(0, 50);
    let category = 'General';
    const textLower = bookmark.text.toLowerCase();

    if (firstLink) {
      const expandedUrl = firstLink.expanded || '';

      if (expandedUrl.includes('github.com') || expandedUrl.includes('npmjs.com') || expandedUrl.includes('pypi.org') || 
          expandedUrl.includes('gitlab.com') || expandedUrl.includes('bitbucket.org')) {
        category = 'GitHub';
        title = firstLink.content?.name || firstLink.content?.title || title;
      } else if (expandedUrl.includes('medium.com') || expandedUrl.includes('substack.com') || expandedUrl.includes('dev.to') || 
                 expandedUrl.includes('blog.') || expandedUrl.includes('hackernoon.com') || expandedUrl.includes('freecodecamp.org')) {
        category = 'Article';
        title = firstLink.content?.title || title;
      } else if (expandedUrl.includes('youtube.com') || expandedUrl.includes('youtu.be')) {
        category = 'Video';
        title = firstLink.content?.title || title;
      } else if (expandedUrl.includes('podcasts.apple.com') || expandedUrl.includes('spotify.com/episode') || 
                 expandedUrl.includes('overcast.fm') || expandedUrl.includes('pocketcasts.com')) {
        category = 'Podcast';
        title = firstLink.content?.title || title;
      } else if (expandedUrl.includes('loom.com') || expandedUrl.includes('vimeo.com') || expandedUrl.includes('twitch.tv')) {
        category = 'Video';
        title = firstLink.content?.title || title;
      } else if (textLower.includes('github') || textLower.includes('repo') || textLower.includes('npm ')) {
        category = 'GitHub';
      } else if (textLower.includes('video') || textLower.includes('youtube') || textLower.includes('watch')) {
        category = 'Video';
      } else if (textLower.includes('article') || textLower.includes('blog') || textLower.includes('post') || 
                 textLower.includes('guide') || textLower.includes('tutorial') || textLower.includes('course') ||
                 textLower.includes('resource') || textLower.includes('learning')) {
        category = 'Article';
      } else if (textLower.includes('podcast') || textLower.includes('episode')) {
        category = 'Podcast';
      } else if (textLower.includes('library') || textLower.includes('framework') || textLower.includes('tool') || 
                 textLower.includes('app') || textLower.includes('stack') || textLower.includes('tech')) {
        category = 'Tool';
      }
    } else {
      if (textLower.includes('github') || textLower.includes('repo') || textLower.includes('npm ')) {
        category = 'GitHub';
      } else if (textLower.includes('video') || textLower.includes('youtube') || textLower.includes('watch')) {
        category = 'Video';
      } else if (textLower.includes('article') || textLower.includes('blog') || textLower.includes('post') || 
                 textLower.includes('guide') || textLower.includes('tutorial') || textLower.includes('course') ||
                 textLower.includes('resource') || textLower.includes('learning') || textLower.includes('free')) {
        category = 'Article';
      } else if (textLower.includes('podcast') || textLower.includes('episode')) {
        category = 'Podcast';
      } else if (textLower.includes('library') || textLower.includes('framework') || textLower.includes('tool') || 
                 textLower.includes('app') || textLower.includes('stack') || textLower.includes('tech')) {
        category = 'Tool';
      } else if (textLower.includes('deal') || textLower.includes('offer') || textLower.includes('discount') ||
                 textLower.includes('student') || textLower.includes('developer')) {
        category = 'Article';
      }
    }

    return {
      title: title + (bookmark.text.length > 50 ? '...' : ''),
      summary: bookmark.text.slice(0, 150),
      tags: bookmark.tags || [],
      category
    };
  }

  _matchCategory(bookmark, reasoning) {
    const rawCategory = reasoning?.category;
    const aiCategory = (rawCategory || '').toLowerCase().trim();

    const titleLower = (reasoning?.title || '').toLowerCase();
    const summaryLower = (reasoning?.summary || '').toLowerCase();
    const textLower = (bookmark?.text || '').toLowerCase();
    const combinedText = `${titleLower} ${summaryLower} ${textLower}`;

    const categoryMap = {
      'github': 'github', 'repo': 'github', 'repository': 'github', 'code': 'github', 'source': 'github',
      'article': 'article', 'blog': 'article', 'post': 'article', 'guide': 'article', 'tutorial': 'article', 'docs': 'article', 'documentation': 'article',
      'video': 'youtube', 'youtube': 'youtube', 'screencast': 'youtube', 'talk': 'youtube', 'presentation': 'youtube',
      'podcast': 'podcast', 'audio': 'podcast', 'episode': 'podcast', 'interview': 'podcast',
      'tool': 'github', 'utility': 'github', 'library': 'github', 'framework': 'github', 'app': 'github', 'service': 'github', 'api': 'github', 'package': 'github', 'module': 'github',
      'general': 'tweet', 'misc': 'tweet', 'note': 'tweet', 'announcement': 'tweet', 'news': 'tweet', 'thought': 'tweet', 'idea': 'tweet',
      'resource': 'article', 'resources': 'article', 'list': 'article', 'collection': 'article',
      'deal': 'article', 'deals': 'article', 'offer': 'article', 'offers': 'article', 'discount': 'article', 'free': 'article',
      'stack': 'github', 'techstack': 'github', 'tech': 'github', 'toolset': 'github', 'setup': 'github',
      'course': 'article', 'courses': 'article', 'learning': 'article', 'learn': 'article', 'education': 'article',
      'student': 'article', 'students': 'article', 'developer': 'article', 'dev': 'article', 'programming': 'article',
      'comprehensive': 'article', 'complete': 'article', 'ultimate': 'article', 'guide': 'article',
      'ai': 'article', 'ml': 'article', 'llm': 'article', 'model': 'article', 'claude': 'article', 'gemini': 'article',
      'mcp': 'github', 'automation': 'github', 'blender': 'github', 'concept': 'article', 'os': 'github',
      'operating': 'github', 'system': 'github', 'tip': 'article', 'tips': 'article', 'millionaires': 'article',
      'shipping': 'github', 'products': 'github', 'scene': 'github', 'generation': 'article',
      'benefits': 'article', 'benefits': 'article', 'storage': 'github', 'backend': 'github',
      'guided': 'article', 'feature': 'article', 'hacking': 'article', 'beginners': 'article',
      'layer': 'github', 'version': 'github', 'v3': 'github', 'intelligence': 'article',
      'fundamental': 'article', 'advanced': 'article', 'concepts': 'article', 'automation': 'github',
      'unlimited': 'github', 'cloud': 'github', 'telegram': 'github', 'backend': 'github',
      'message': 'github', 'commit': 'github', 'message': 'github', 'vibe': 'article',
      'chat': 'article', 'history': 'article', 'conversations': 'article', 'ragging': 'article', 'rag': 'article',
      'vision': 'article', 'personal': 'article', '3d': 'article',
      'y combinator': 'article', 'yc': 'article', 'combinator': 'article', 'student deals': 'article',
      'credits': 'article', 'startup': 'article', 'funding': 'article', 'accelerator': 'article'
    };

    let matchedKey = categoryMap[aiCategory];

    if (!matchedKey) {
      if (combinedText.includes('github') || combinedText.includes(' repo') || combinedText.includes('npm') || 
          combinedText.includes('mcp') || combinedText.includes('automation') || combinedText.includes('/commit') ||
          combinedText.includes('backend') || combinedText.includes('storage') || combinedText.includes('cloud') ||
          combinedText.includes('layer') || combinedText.includes('version') || combinedText.includes('blender')) {
        matchedKey = 'github';
      } else if (combinedText.includes('video') || combinedText.includes('youtube') || combinedText.includes('watch') || combinedText.includes('talk')) {
        matchedKey = 'youtube';
      } else if (combinedText.includes('podcast') || combinedText.includes('audio') || combinedText.includes('episode')) {
        matchedKey = 'podcast';
      } else if (combinedText.includes('article') || combinedText.includes('blog') || combinedText.includes('post') || 
                 combinedText.includes('guide') || combinedText.includes('tutorial') || combinedText.includes('course') ||
                 combinedText.includes('resource') || combinedText.includes('learning') || combinedText.includes('student') ||
                 combinedText.includes('developer') || combinedText.includes('free') || combinedText.includes('comprehensive') ||
                 combinedText.includes('ultimate') || combinedText.includes('deal') || combinedText.includes('tip') ||
                 combinedText.includes('feature') || combinedText.includes('hacking') || combinedText.includes('beginners') ||
                 combinedText.includes('generation') || combinedText.includes('fundamental') || combinedText.includes('advanced') ||
                 combinedText.includes('concept') || combinedText.includes('benefits') || combinedText.includes('intelligence') ||
                 combinedText.includes('vibe') || combinedText.includes('guided') || combinedText.includes('chat') ||
                 combinedText.includes('history') || combinedText.includes('conversations') || combinedText.includes('ragging') ||
                 combinedText.includes('vision') || combinedText.includes('personal') || combinedText.includes('3d') ||
                 combinedText.includes('millionaire')) {
        matchedKey = 'article';
      } else if (combinedText.includes('library') || combinedText.includes('framework') || combinedText.includes('tool') || 
                 combinedText.includes(' app') || combinedText.includes('stack') || combinedText.includes('tech') ||
                 combinedText.includes('products') || combinedText.includes('shipping') || combinedText.includes('operating') ||
                 combinedText.includes('system') || combinedText.includes('millionaires') || combinedText.includes('scene')) {
        matchedKey = 'github';
      }
    }

    if (!matchedKey || matchedKey === 'tweet') {
      const words = combinedText.split(/\s+/);
      for (const word of words) {
        if (categoryMap[word]) {
          matchedKey = categoryMap[word];
          break;
        }
      }
    }

    if (!matchedKey || matchedKey === 'tweet') {
      if (combinedText.includes('ai') || combinedText.includes('student') || combinedText.includes('deal') ||
          combinedText.includes('credit') || combinedText.includes('combinator') || combinedText.includes('y combinator') ||
          combinedText.includes('yc') || combinedText.includes('startup') || combinedText.includes('funding') ||
          combinedText.includes('accelerator')) {
        matchedKey = 'article';
      }
    }

    if (matchedKey === 'tweet') {
      for (const link of bookmark.links || []) {
        const matchedCategory = this._findCategoryByUrl(link.expanded);
        if (matchedCategory) {
          return this.categories[matchedCategory];
        }
      }
    }

    const result = this.categories[matchedKey];
    if (result) {
      return result;
    }

    return {
      key: 'tweet',
      action: 'capture',
      folder: null,
      match: [],
      template: null,
      description: 'Plain tweets'
    };
  }

  _findCategoryByUrl(url) {
    for (const [key, category] of Object.entries(this.categories)) {
      if (category.match?.some(pattern => url.includes(pattern))) {
        return key;
      }
    }
    return null;
  }

  _generateSlug(title, author) {
    let slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .substring(0, 60);

    const hash = crypto.createHash('md5')
      .update(`${title}-${author}`)
      .digest('hex')
      .substring(0, 8);

    return `${slug}-${hash}`;
  }

  async _writeBookmark(bookmark, reasoning, category, slug) {
    const action = category.action || 'capture';

    if (action !== 'file') {
      return null;
    }

    if (!slug || typeof slug !== 'string' || slug.trim() === '') {
      throw new Error(`Invalid slug computed: ${slug}`);
    }

    const folder = category.folder || this.toolsDir;
    const filePath = path.join(folder, `${slug}.md`);

    if (!filePath || typeof filePath !== 'string') {
      throw new Error(`Invalid filePath computed: ${filePath}`);
    }

    const content = this._generateFileContent(bookmark, reasoning, category);

    await this._ensureDir(folder);
    fs.writeFileSync(filePath, content + '\n');

    return filePath;
  }

  _generateFileContent(bookmark, reasoning, category) {
    const template = category.template || 'tool';
    const date = new Date().toISOString().split('T')[0];
    const link = bookmark.links?.[0]?.expanded || bookmark.tweetUrl;
    
    const frontmatter = `---
title: "${reasoning.title.replace(/"/g, '\\"')}"
type: ${template}
date_added: ${date}
source: "${link}"
tags: ${JSON.stringify([...reasoning.tags, ...(bookmark.tags || [])])}
via: "Twitter bookmark from @${bookmark.author}"
---

${reasoning.summary}

## Key Features

${bookmark.links?.[0]?.content?.description || 'See link for details'}

## Links

- [Original Tweet](${bookmark.tweetUrl})
${bookmark.links?.[0] ? `- [Link](${bookmark.links[0].expanded})` : ''}`;

    return frontmatter;
  }

  _appendToArchive(bookmark, reasoning, category, slug) {
    const date = bookmark.date || 'Unknown Date';
    const firstLink = bookmark.links?.[0];
    const link = firstLink?.expanded || '';
    
    let entry = `## @${bookmark.author} - ${reasoning.title}\n> ${bookmark.text}\n\n`;
    
    entry += `- **Tweet:** ${bookmark.tweetUrl}\n`;
    if (link) {
      entry += `- **Link:** ${link}\n`;
    }
    if (bookmark.tags?.length > 0) {
      entry += `- **Tags:** ${bookmark.tags.map(t => `[[${t}]]`).join(' ')}\n`;
    }
    
    if (category.action === 'file' && slug) {
      const folder = category.folder?.replace('./', '') || 'knowledge/tools';
      entry += `- **Filed:** [${slug}.md](./${folder}/${slug}.md)\n`;
    }
    
    entry += `- **What:** ${reasoning.summary}\n`;

    this._insertIntoArchive(date, entry);
  }

  _insertIntoArchive(date, entry) {
    let content = '';
    
    if (fs.existsSync(this.archiveFile)) {
      content = fs.readFileSync(this.archiveFile, 'utf8');
    }

    const dateHeader = `# ${date}`;
    const dateIndex = content.indexOf(dateHeader);

    if (dateIndex !== -1) {
      const insertPos = content.indexOf('\n', dateIndex) + 1;
      content = content.slice(0, insertPos) + entry + '\n' + content.slice(insertPos);
    } else {
      content = `${dateHeader}\n\n${entry}\n\n${content}`;
    }

    fs.writeFileSync(this.archiveFile, content);
  }

  _loadExistingIds() {
    const ids = new Set();
    
    if (!fs.existsSync(this.archiveFile)) {
      return ids;
    }

    const content = fs.readFileSync(this.archiveFile, 'utf8');
    const matches = content.matchAll(/x\.com\/\w+\/status\/(\d+)/g);
    
    for (const match of matches) {
      ids.add(match[1]);
    }
    
    return ids;
  }

  _ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
