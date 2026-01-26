import { API_KEY, API_URL, AVATAR_ID, VOICE_ID } from "../secrets";

// Simple function to extract text content from HTML
function extractTextFromHtml(html: string): string {
  // Remove script and style tags and their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

// Extract business name from URL or content
function extractBusinessName(url: string, content: string): string {
  // Try to get from URL hostname
  try {
    const hostname = new URL(url).hostname;
    // Remove www. and common TLDs
    let name = hostname
      .replace(/^www\./, "")
      .replace(/\.(com|org|net|io|co|ai|app)$/, "");

    // Capitalize first letter of each word
    name = name
      .split(/[.-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return name;
  } catch {
    return "the company";
  }
}

// Generate a sales representative prompt based on website content
function generateSalesPrompt(userName: string, businessName: string, websiteContent: string): string {
  // Truncate content if too long (keep first ~2000 chars for context)
  const truncatedContent = websiteContent.slice(0, 2000);

  return `You are a friendly and knowledgeable AI sales representative for ${businessName}. Your name is ${userName}'s AI Assistant.

Your role is to:
- Welcome visitors warmly and learn about their needs
- Answer questions about ${businessName}'s products and services
- Help potential customers understand how ${businessName} can solve their problems
- Guide interested visitors toward taking the next step (booking a demo, contacting sales, etc.)

Here is information about the business from their website:
${truncatedContent}

Communication style:
- Be conversational and approachable, not salesy or pushy
- Listen actively and ask clarifying questions
- Provide helpful, accurate information based on what you know
- If you don't know something specific, offer to connect them with a human team member
- Keep responses concise and natural for voice conversation

Remember: You're having a real-time voice conversation, so keep your responses brief and conversational.`;
}

// Search for an existing context by business name
async function findExistingContext(businessName: string): Promise<string | null> {
  try {
    // Fetch contexts and look for one that matches this business
    const res = await fetch(`${API_URL}/v1/contexts?page=1&page_size=100`, {
      headers: {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const contexts = data.data?.results || [];

    // Look for a context that starts with "{businessName} Sales Rep"
    const searchPrefix = `${businessName} Sales Rep`;
    const matching = contexts.find((ctx: { name: string; id: string }) =>
      ctx.name.startsWith(searchPrefix)
    );

    if (matching) {
      console.log(`Found existing context for ${businessName}: ${matching.id}`);
      return matching.id;
    }

    return null;
  } catch (error) {
    console.error("Error searching for existing context:", error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { userName, businessUrl, avatarId, voiceId } = await request.json();

    if (!userName || !businessUrl) {
      return new Response(
        JSON.stringify({ error: "Missing userName or businessUrl" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use provided avatarId/voiceId or fall back to defaults
    const selectedAvatarId = avatarId || AVATAR_ID;
    const selectedVoiceId = voiceId || VOICE_ID;

    // Step 1: Fetch website content
    let websiteContent = "";
    let businessName = "";
    let websiteFetchFailed = false;

    try {
      const websiteRes = await fetch(businessUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LiveAvatarBot/1.0)",
        },
      });

      if (websiteRes.ok) {
        const html = await websiteRes.text();
        websiteContent = extractTextFromHtml(html);
        businessName = extractBusinessName(businessUrl, websiteContent);
      } else {
        websiteFetchFailed = true;
        console.error(`Website returned status ${websiteRes.status} for ${businessUrl}`);
      }
    } catch (fetchError) {
      websiteFetchFailed = true;
      console.error("Error fetching website:", fetchError);
    }

    // If we couldn't fetch the website, return an error
    if (websiteFetchFailed) {
      return new Response(
        JSON.stringify({
          error: `Could not access the website "${businessUrl}". Please double-check the URL and make sure the website is accessible.`
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 2: Check if we already have a context for this business
    const existingContextId = await findExistingContext(businessName);
    if (existingContextId) {
      console.log(`Reusing existing context for ${businessName}`);
      return new Response(
        JSON.stringify({
          contextId: existingContextId,
          businessName,
          reused: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 3: Generate the sales representative prompt
    const systemPrompt = generateSalesPrompt(userName, businessName, websiteContent);

    // Step 4: Create context via LiveAvatar API
    const timestamp = Date.now();
    const contextRes = await fetch(`${API_URL}/v1/contexts`, {
      method: "POST",
      headers: {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `${businessName} Sales Rep - ${userName} (${timestamp})`,
        avatar_id: selectedAvatarId,
        voice_id: selectedVoiceId,
        prompt: systemPrompt,
        opening_text: `Hi there! I'm the AI sales assistant for ${businessName}. How can I help you today?`,
      }),
    });

    if (!contextRes.ok) {
      const errorData = await contextRes.json();
      console.error("LiveAvatar API error:", errorData);
      return new Response(
        JSON.stringify({
          error: errorData.data?.[0]?.message || "Failed to create context"
        }),
        { status: contextRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const contextData = await contextRes.json();
    const contextId = contextData.data?.context_id || contextData.data?.id;

    return new Response(
      JSON.stringify({
        contextId,
        businessName,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating context:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
