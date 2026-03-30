export async function POST(request: Request) {
  const { prompt } = await request.json();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not set. Add it to your .env.local file." },
      { status: 500 }
    );
  }

  if (!prompt || typeof prompt !== "string") {
    return Response.json({ error: "prompt is required." }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: prompt.slice(0, 4000), // DALL-E 3 hard limit
        n: 1,
        size: "1024x1024",
        quality: "standard",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: { message?: string } }).error?.message ?? `OpenAI returned ${res.status}`;
      return Response.json({ error: msg }, { status: res.status });
    }

    const data = (await res.json()) as { data?: { url?: string }[] };
    const url = data.data?.[0]?.url;
    if (!url) {
      return Response.json({ error: "No image URL in OpenAI response." }, { status: 500 });
    }

    return Response.json({ url });
  } catch {
    return Response.json(
      { error: "Network error — could not reach OpenAI. Check your connection." },
      { status: 500 }
    );
  }
}
