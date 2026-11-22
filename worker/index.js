const MODEL = 'openai/gpt-oss-20b';
const SYSTEM_PROMPT = `You are Morrowmesh, a helpful AI assistant. If asked your name, say Morrowmesh. Use recent conversation messages to understand follow-up questions. Understand clear spelling mistakes and informal wording without criticizing them. Start with a direct answer. Use clear Markdown headings, with main headings larger than subheadings. Keep paragraphs short, use bullets and numbered steps where helpful, and explain technical ideas simply. For programming questions, include definition, purpose, syntax, code, output, line-by-line explanation, and practical use. Avoid unnecessary introductions and decorative asterisks. Be accurate and concise.`;

function allowedOrigin(origin) {
  return origin === 'http://localhost:4173'
    || origin === 'http://127.0.0.1:4173'
    || /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin || '');
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = allowedOrigin(origin) ? corsHeaders(origin) : {};
    if (request.method === 'OPTIONS') {
      if (!allowedOrigin(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors });
    }
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/chat') {
      return json({ error: 'Not found. Send a POST request to /chat.' }, 404, cors);
    }
    if (!allowedOrigin(origin)) return json({ error: 'This site is not allowed to use Morrowmesh.' }, 403, {});
    if (!env.GROQ_API_KEY) return json({ error: 'The Morrowmesh owner has not configured the Groq key yet.' }, 503, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'Request body must be valid JSON.' }, 400, cors); }
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 13) {
      return json({ error: 'Send between 1 and 13 recent chat messages.' }, 400, cors);
    }
    const messages = [];
    let totalLength = 0;
    for (const message of body.messages) {
      if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
        return json({ error: 'A chat message is malformed.' }, 400, cors);
      }
      const content = message.content.trim();
      if (!content || content.length > 24000) return json({ error: 'A message is empty or too long.' }, 400, cors);
      totalLength += content.length;
      if (totalLength > 65000) return json({ error: 'This conversation is too long. Start a new chat.' }, 413, cors);
      messages.push({ role: message.role, content });
    }

    let upstream;
    try {
      upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          max_completion_tokens: 600,
          temperature: 0.65,
          stream: true
        })
      });
    } catch {
      return json({ error: 'Could not connect to Groq. Check the Worker logs and try again.' }, 502, cors);
    }
    if (!upstream.ok) {
      if (upstream.status === 429) return json({ error: 'Groq Free limit reached. Please wait and try again later.' }, 429, cors);
      if (upstream.status === 401 || upstream.status === 403) return json({ error: 'The Groq key is invalid or unavailable. The site owner should check the Worker secret.' }, 502, cors);
      return json({ error: `Groq could not complete the request (HTTP ${upstream.status}).` }, 502, cors);
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no'
      }
    });
  }
};
