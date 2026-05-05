/**
 * Minimal OpenAI chat for WhatsApp replies.
 */
async function getAiReply(userText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[openai] OPENAI_API_KEY not set — using fallback reply');
    return (
      'Thanks for your message. Our AI assistant is not configured yet. ' +
      'Please contact support or try again later.'
    );
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [
          {
            role: 'system',
            content:
              process.env.OPENAI_SYSTEM_PROMPT ||
              'You are a helpful assistant for an e-learning platform. Reply concisely and clearly in the same language as the user.',
          },
          { role: 'user', content: String(userText || '').slice(0, 12000) },
        ],
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[openai] API error', res.status, data);
      return 'Sorry, I had trouble processing that. Please try again in a moment.';
    }

    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || 'I could not generate a reply.';
  } catch (err) {
    console.error('[openai]', err.message);
    return 'Sorry, something went wrong. Please try again later.';
  }
}

module.exports = { getAiReply };
