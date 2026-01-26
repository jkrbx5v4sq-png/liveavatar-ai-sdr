import { API_KEY, API_URL, AVATAR_ID, VOICE_ID } from "../secrets";

// Simple function to extract text content from HTML
function extractTextFromHtml(html: string): string {
  // Remove script and style tags and their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");

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

// Extract page title from HTML
function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : "";
}

// Extract meta description from HTML
function extractMetaDescription(html: string): string {
  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (metaMatch) return metaMatch[1].trim();

  // Try og:description
  const ogMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  return ogMatch ? ogMatch[1].trim() : "";
}

// Fetch a single page with timeout
async function fetchPage(url: string, timeout = 5000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LiveAvatarBot/1.0)",
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

// Fetch multiple pages from a website to gather more context
async function fetchWebsiteContent(baseUrl: string): Promise<{ content: string; title: string; description: string }> {
  // Common paths to check for additional content
  const additionalPaths = [
    "/about",
    "/about-us",
    "/products",
    "/services",
    "/features",
    "/pricing",
    "/solutions",
  ];

  const baseUrlObj = new URL(baseUrl);
  const origin = baseUrlObj.origin;

  // Fetch homepage first
  const homepageHtml = await fetchPage(baseUrl);
  if (!homepageHtml) {
    return { content: "", title: "", description: "" };
  }

  const title = extractTitle(homepageHtml);
  const description = extractMetaDescription(homepageHtml);
  let allContent = `Homepage:\n${extractTextFromHtml(homepageHtml)}\n\n`;

  // Fetch additional pages in parallel (limit to 3 to avoid rate limiting)
  const pagePromises = additionalPaths.slice(0, 3).map(async (path) => {
    const pageUrl = `${origin}${path}`;
    const html = await fetchPage(pageUrl, 3000);
    if (html) {
      const pageContent = extractTextFromHtml(html);
      // Only include if we got meaningful content (at least 100 chars)
      if (pageContent.length > 100) {
        return `${path.replace("/", "").replace("-", " ")} page:\n${pageContent}\n\n`;
      }
    }
    return "";
  });

  const additionalContents = await Promise.all(pagePromises);
  allContent += additionalContents.filter(c => c).join("");

  return { content: allContent, title, description };
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
  // Use more content - up to 6000 chars for richer context
  const truncatedContent = websiteContent.slice(0, 6000);

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

IMPORTANT: Base your answers ONLY on the information provided below. If asked about something not covered in the content below, say you'd be happy to connect them with someone who can help with that specific question.

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
    const systemPrompt = generateSalesPrompt(userName, businessName, websiteContent, title, description);

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
