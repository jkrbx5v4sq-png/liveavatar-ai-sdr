import { API_KEY, API_URL, AVATAR_ID, VOICE_ID } from "../secrets";

// Use Jina AI Reader API for better content extraction (handles JavaScript-rendered sites)
async function fetchWithJina(url: string, timeout = 10000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Jina Reader API - converts any URL to clean markdown/text
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetch(jinaUrl, {
      headers: {
        "Accept": "text/plain",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      return await res.text();
    }
    return null;
  } catch {
    return null;
  }
}

// Fallback: Simple HTML fetch for sites that block Jina
async function fetchPageDirect(url: string, timeout = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const html = await res.text();
      return extractTextFromHtml(html);
    }
    return null;
  } catch {
    return null;
  }
}

// Simple function to extract text content from HTML (fallback)
function extractTextFromHtml(html: string): string {
  // Remove script and style tags and their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

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

// Extract title from Jina response (usually first line with #)
function extractTitleFromJina(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
    if (trimmed.startsWith("Title:")) {
      return trimmed.slice(6).trim();
    }
  }
  return "";
}

// Fetch website content using Jina AI Reader for better extraction
async function fetchWebsiteContent(baseUrl: string): Promise<{ content: string; title: string; description: string }> {
  console.log(`Fetching content from ${baseUrl} using Jina AI Reader...`);

  // Try Jina Reader first (handles JS-rendered content)
  let mainContent = await fetchWithJina(baseUrl);

  // Fallback to direct fetch if Jina fails
  if (!mainContent || mainContent.length < 200) {
    console.log("Jina Reader returned insufficient content, trying direct fetch...");
    mainContent = await fetchPageDirect(baseUrl);
  }

  if (!mainContent) {
    return { content: "", title: "", description: "" };
  }

  const title = extractTitleFromJina(mainContent);

  // Also try to fetch a products/about page for more context
  const additionalPaths = ["/iphone", "/products", "/about", "/features"];
  const baseUrlObj = new URL(baseUrl);
  const origin = baseUrlObj.origin;

  // Fetch one additional page that's likely to have product info
  for (const path of additionalPaths) {
    const additionalUrl = `${origin}${path}`;
    const additionalContent = await fetchWithJina(additionalUrl);
    if (additionalContent && additionalContent.length > 500) {
      mainContent += `\n\n--- ${path} page ---\n${additionalContent}`;
      console.log(`Added content from ${path} page (${additionalContent.length} chars)`);
      break; // Only add one additional page to avoid too much content
    }
  }

  console.log(`Total content fetched: ${mainContent.length} chars`);

  return {
    content: mainContent,
    title,
    description: "", // Jina doesn't separate description, it's in the content
  };
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
function generateSalesPrompt(
  userName: string,
  businessName: string,
  websiteContent: string,
  title: string,
  description: string
): string {
  // Use more content - up to 10000 chars for richer context
  const truncatedContent = websiteContent.slice(0, 10000);

  return `You are a friendly and knowledgeable AI sales representative for ${businessName}. Your name is ${userName}'s AI Assistant.

Company Overview:
- Company: ${businessName}
${title ? `- Title: ${title}` : ""}
${description ? `- Description: ${description}` : ""}

Your role is to:
- Welcome visitors warmly and learn about their needs
- Answer questions about ${businessName}'s products, services, and offerings
- Provide accurate, up-to-date information about ${businessName}
- Help potential customers understand how ${businessName} can solve their problems
- Guide interested visitors toward taking the next step (booking a demo, contacting sales, signing up, etc.)

CRITICAL RULES - YOU MUST FOLLOW THESE:
1. ONLY use information from the website content provided below. Do NOT use any prior knowledge about ${businessName}.
2. If the content mentions specific product names, models, versions, or prices - use EXACTLY what is written, do not substitute with older information.
3. If asked about something not in the provided content, say "I don't have that specific information, but I'd be happy to connect you with our team who can help."
4. NEVER make up or guess product details, prices, features, or specifications not explicitly stated in the content below.

Here is detailed information about ${businessName} from their website:

${truncatedContent}

Communication style:
- Be conversational and approachable, not salesy or pushy
- Listen actively and ask clarifying questions
- Provide helpful, accurate information based ONLY on what's provided above
- If you don't know something specific, offer to connect them with a human team member
- Keep responses concise and natural for voice conversation (2-3 sentences max)
- Be enthusiastic about ${businessName}'s offerings

Remember: You're having a real-time voice conversation, so keep your responses brief and conversational.`;
}

// NOTE: Context caching removed - each session creates a fresh context
// This ensures content is always up-to-date from the website

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

    // Step 1: Fetch website content from multiple pages
    console.log(`Fetching content from ${businessUrl}...`);
    const { content: websiteContent, title, description } = await fetchWebsiteContent(businessUrl);

    if (!websiteContent) {
      return new Response(
        JSON.stringify({
          error: `Could not access the website "${businessUrl}". Please double-check the URL and make sure the website is accessible.`
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const businessName = extractBusinessName(businessUrl, websiteContent);
    console.log(`Extracted business name: ${businessName}, content length: ${websiteContent.length} chars`);

    // Step 2: Generate the sales representative prompt
    const systemPrompt = generateSalesPrompt(userName, businessName, websiteContent, title, description);

    // Step 3: Create context via LiveAvatar API
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
    console.log(`Created context with ID: ${contextId}`);

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
