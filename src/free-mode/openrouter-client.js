/**
 * OpenRouter API Client for Free Mode
 *
 * Uses OpenRouter for reasoning with paid API.
 * AI is used as a pure function: input(text) -> output(JSON)
 */

const SYSTEM_PROMPT = `You are a bookmark categorization expert. Analyze tweets to determine best category for organizing bookmarks.

CATEGORIES (YOU MUST CHOOSE EXACTLY ONE OF THESE SIX):
- GitHub: Code repositories, open source projects, libraries, tools, npm packages, APIs, frameworks, automation tools, SDKs (URL contains github.com, npmjs.com, or mentions repo, library, framework, tool, automation, scene, blender)
- Article: Blog posts, tutorials, guides, documentation, courses, learning resources, tips, deals, student benefits, comprehensive lists, AI/ML content, vision systems, chat applications, RAG content, operating systems, millionaire stories, personal AI projects, 3D content (URL contains medium.com, substack.com, dev.to, or mentions article, tutorial, guide, course, resource, learning, tip, deal, free, comprehensive, ultimate, vision, personal, chat, history, conversations, millionaire, 3d)
- Video: YouTube videos, tutorials, conference talks, screencasts (URL contains youtube.com, youtu.be, or mentions video, watch, talk)
- Podcast: Audio content, interviews, discussions (URL contains podcasts.apple.com, spotify.com/episode, overcast.fm, or mentions podcast, episode, audio)
- Tool: Utilities, apps, services, libraries, frameworks, npm packages, APIs (URL contains npmjs.com, pypi.org, or mentions library, framework, app, utility)
- General: Anything that does not fit above - ideas, thoughts, announcements, memes, news without specific content links

CRITICAL CATEGORIZATION RULES (FOLLOW STRICTLY):
1. YOU MUST ALWAYS RETURN A VALID CATEGORY - never return empty, None, N/A, or undefined
2. If unsure between GitHub and Article, prefer Article for content that is educational/discussion-focused
3. For AI/Tech content: use GitHub for actual tools/repos/libraries, use Article for concepts, visions, discussions, news
4. Specific pattern mappings: Chat History/Vision -> Article, Millionaire/Millionaires -> Article, 3D Generation/Scene -> Article (unless it's a specific tool), Personal AI OS -> Article
5. For comprehensive lists, resources, deals, guides - prefer Article
6. Check URL patterns FIRST - github.com -> GitHub, youtube.com -> Video, medium.com -> Article
7. If no URL, analyze tweet content for keywords indicating content type
8. When AI returns None or similar, default to Article for anything tech/education related

QUALITY GUIDELINES:
- Ensure category matches the primary content type
- Do not over-categorize simple discussions as tools
- Educational/learning content should prefer Article
- Vision, Chat, History, Conversations concepts should be Article
- Millionaire, RAG, Personal AI stories should be Article
- 3D content typically Article unless it's a specific 3D tool repository

Return ONLY valid JSON object with keys: title, summary, tags, category.
No markdown formatting, no code blocks, no explanations.`;

export class OpenRouterClient {
  constructor(config) {
    this.apiKey = config?.openrouter?.apiKey || process.env.OPENROUTER_API_KEY;
    this.model = config?.openrouter?.model || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
    this.baseUrl = config?.openrouter?.baseUrl || 'https://openrouter.ai/api/v1';
  }

  async getReasoning(prompt, options = {}) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const timeout = options.timeout || 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/alexknowshtml/smaug',
          'X-Title': 'Smaug Bookmark Archiver'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 1000,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenRouter API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      return this._parseOutput(content);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`OpenRouter timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  _parseOutput(rawOutput) {
    let cleaned = rawOutput.trim();

    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      cleaned = jsonMatch[1].trim();
    }

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(cleaned);

    if (!parsed.title || typeof parsed.title !== 'string') {
      throw new Error('Missing or invalid "title" field');
    }
    if (!parsed.summary || typeof parsed.summary !== 'string') {
      throw new Error('Missing or invalid "summary" field');
    }
    if (!parsed.category || typeof parsed.category !== 'string') {
      throw new Error('Missing or invalid "category" field');
    }
    if (!Array.isArray(parsed.tags)) {
      throw new Error('Invalid "tags" field: must be array');
    }

    return {
      title: parsed.title.trim(),
      summary: parsed.summary.trim(),
      tags: parsed.tags.map(t => t.trim()).filter(Boolean),
      category: parsed.category.trim()
    };
  }
}
