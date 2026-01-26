"use client";

import { useState, useEffect, useRef } from "react";
import { LiveAvatarSession } from "./LiveAvatarSession";

type SetupStep = "form" | "generating" | "session" | "ended";

// Auto-start configuration from environment variables
const AUTO_START = process.env.NEXT_PUBLIC_AUTO_START === "true";
const AUTO_WEBSITE_URL = process.env.NEXT_PUBLIC_WEBSITE_URL || "";
const AUTO_USER_NAME = process.env.NEXT_PUBLIC_USER_NAME || "Visitor";

interface GenerationStatus {
  step: string;
  detail: string;
}

interface Avatar {
  id: string;
  name: string;
  preview_url?: string;
  default_voice?: {
    id: string;
    name: string;
  };
  is_custom?: boolean;
}

export const LiveAvatarDemo = () => {
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [setupStep, setSetupStep] = useState<SetupStep>("form");
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>({
    step: "",
    detail: "",
  });

  // Form fields - pre-fill from env vars if auto-start is enabled
  const [userName, setUserName] = useState(AUTO_USER_NAME);
  const [businessUrl, setBusinessUrl] = useState(AUTO_WEBSITE_URL);

  // Track context for embed code
  const [currentContextId, setCurrentContextId] = useState<string | null>(null);
  const [currentBusinessName, setCurrentBusinessName] = useState<string>("");
  const [embedCopied, setEmbedCopied] = useState(false);

  // Track if auto-start has been triggered
  const autoStartTriggered = useRef(false);

  // Avatar selection
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar | null>(null);
  const [loadingAvatars, setLoadingAvatars] = useState(true);

  // Fetch avatars on mount
  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        const res = await fetch("/api/get-avatars");
        if (res.ok) {
          const data = await res.json();
          setAvatars(data.avatars || []);
          // Select the first avatar by default
          if (data.avatars?.length > 0) {
            setSelectedAvatar(data.avatars[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch avatars:", err);
      } finally {
        setLoadingAvatars(false);
      }
    };
    fetchAvatars();
  }, []);

  // Auto-start session if configured via environment variables
  useEffect(() => {
    if (
      AUTO_START &&
      AUTO_WEBSITE_URL &&
      !autoStartTriggered.current &&
      !loadingAvatars &&
      selectedAvatar
    ) {
      autoStartTriggered.current = true;
      // Trigger the form submission programmatically
      startSession();
    }
  }, [loadingAvatars, selectedAvatar]);

  // Extracted session start logic for reuse
  const startSession = async () => {
    setError(null);
    setSetupStep("generating");

    const normalizedUrl = normalizeUrl(businessUrl);

    try {
      // Step 1: Generate context
      setGenerationStatus({
        step: "Analyzing website",
        detail: `Fetching content from ${normalizedUrl}...`,
      });

      const contextRes = await fetch("/api/generate-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName,
          businessUrl: normalizedUrl,
          avatarId: selectedAvatar?.id,
          voiceId: selectedAvatar?.default_voice?.id,
        }),
      });

      if (!contextRes.ok) {
        const errorData = await contextRes.json();
        throw new Error(errorData.error || "Failed to generate context");
      }

      const { contextId, businessName } = await contextRes.json();

      // Store context info for embed code
      setCurrentContextId(contextId);
      setCurrentBusinessName(businessName);

      setGenerationStatus({
        step: "Creating your AI representative",
        detail: `Setting up sales agent for ${businessName}...`,
      });

      // Step 2: Start session with the new context
      const sessionRes = await fetch("/api/start-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextId,
          avatarId: selectedAvatar?.id,
          voiceId: selectedAvatar?.default_voice?.id,
        }),
      });

      if (!sessionRes.ok) {
        const errorData = await sessionRes.json();
        throw new Error(errorData.error || "Failed to start session");
      }

      const { session_token } = await sessionRes.json();
      setSessionToken(session_token);
      setSetupStep("session");
    } catch (err: unknown) {
      setError((err as Error).message);
      setSetupStep("form");
    }
  };

  // Normalize URL - add https:// if missing
  const normalizeUrl = (url: string): string => {
    let normalized = url.trim();
    if (!normalized.match(/^https?:\/\//i)) {
      normalized = `https://${normalized}`;
    }
    return normalized;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await startSession();
  };

  const onSessionStopped = () => {
    setSessionToken("");
    // Show embed screen if we have a context, otherwise go back to form
    if (currentContextId) {
      setSetupStep("ended");
    } else {
      setSetupStep("form");
    }
  };

  const handleStartOver = () => {
    setCurrentContextId(null);
    setCurrentBusinessName("");
    setEmbedCopied(false);
    setSetupStep("form");
  };

  const handleCopyEmbed = () => {
    const embedCode = `<iframe src="https://embed.liveavatar.com/v1/${currentContextId}" allow="microphone" title="LiveAvatar - ${currentBusinessName}" style="width: 100%; aspect-ratio: 16/9; border: none;"></iframe>`;
    navigator.clipboard.writeText(embedCode);
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  };

  // Form screen
  if (setupStep === "form") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4">
        <div className="w-full max-w-md flex flex-col items-center gap-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-2">
              AI Sales Representative
            </h1>
            <p className="text-gray-400">
              Create a personalized AI avatar that knows your business and can
              talk to your customers
            </p>
          </div>

          {error && (
            <div className="w-full text-red-400 bg-red-900/30 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div>
              <label
                htmlFor="userName"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Your Name
              </label>
              <input
                type="text"
                id="userName"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g., John Smith"
                required
                className="w-full bg-white/10 text-white placeholder-gray-500 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
              />
            </div>

            <div>
              <label
                htmlFor="businessUrl"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Business Website URL
              </label>
              <input
                type="text"
                id="businessUrl"
                value={businessUrl}
                onChange={(e) => setBusinessUrl(e.target.value)}
                placeholder="e.g., liveavatar.com"
                required
                className="w-full bg-white/10 text-white placeholder-gray-500 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 border border-white/10"
              />
              <p className="text-xs text-gray-500 mt-1">
                We&apos;ll analyze your website to train the AI on your products and
                services
              </p>
            </div>

            {/* Avatar selection */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Choose Avatar
              </label>
              {loadingAvatars ? (
                <div className="text-gray-400 text-sm">Loading avatars...</div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {avatars.map((avatar) => (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => setSelectedAvatar(avatar)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        selectedAvatar?.id === avatar.id
                          ? "border-blue-500 ring-2 ring-blue-500/50"
                          : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      {avatar.preview_url ? (
                        <img
                          src={avatar.preview_url}
                          alt={avatar.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                          <span className="text-gray-400 text-xs text-center px-1">
                            {avatar.name.slice(0, 10)}
                          </span>
                        </div>
                      )}
                      {avatar.is_custom && (
                        <div className="absolute top-1 right-1 bg-blue-500 text-white text-[10px] px-1 rounded">
                          Custom
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {selectedAvatar && (
                <p className="text-xs text-gray-400 mt-2">
                  Selected: {selectedAvatar.name}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium transition-colors mt-6"
            >
              Create My AI Sales Rep
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Generating screen
  if (setupStep === "generating") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-4">
        <div className="flex flex-col items-center gap-4">
          {/* Loading spinner */}
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-500/30 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
          </div>

          <div className="text-center">
            <h2 className="text-xl font-semibold text-white mb-2">
              {generationStatus.step}
            </h2>
            <p className="text-gray-400 text-sm">{generationStatus.detail}</p>
          </div>
        </div>

        <div className="max-w-sm text-center">
          <p className="text-gray-500 text-xs">
            This may take a moment while we analyze your website and create a
            personalized AI representative
          </p>
        </div>
      </div>
    );
  }

  // Session ended screen with embed code
  if (setupStep === "ended") {
    const embedCode = `<iframe src="https://embed.liveavatar.com/v1/${currentContextId}" allow="microphone" title="LiveAvatar - ${currentBusinessName}" style="width: 100%; aspect-ratio: 16/9; border: none;"></iframe>`;

    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-4">
        <div className="w-full max-w-2xl flex flex-col items-center gap-6">
          {/* Success header */}
          <div className="text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Your AI Sales Rep is Ready!
            </h1>
            <p className="text-gray-400">
              Add this AI avatar to your website with the embed code below
            </p>
          </div>

          {/* Embed preview */}
          <div className="w-full bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="text-sm text-gray-400 mb-2">Preview</div>
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <iframe
                src={`https://embed.liveavatar.com/v1/${currentContextId}`}
                allow="microphone"
                title={`LiveAvatar - ${currentBusinessName}`}
                className="w-full h-full border-none"
              />
            </div>
          </div>

          {/* Embed code */}
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Embed Code</span>
              <button
                onClick={handleCopyEmbed}
                className={`text-sm px-3 py-1 rounded transition-colors ${
                  embedCopied
                    ? "bg-green-500/20 text-green-400"
                    : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                }`}
              >
                {embedCopied ? "Copied!" : "Copy Code"}
              </button>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-gray-300 overflow-x-auto">
              <code>{embedCode}</code>
            </div>
          </div>

          {/* Instructions */}
          <div className="w-full bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
            <h3 className="text-sm font-medium text-blue-400 mb-2">
              How to add to your website:
            </h3>
            <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
              <li>Copy the embed code above</li>
              <li>Paste it into your website&apos;s HTML where you want the avatar to appear</li>
              <li>The avatar will automatically start when visitors load the page</li>
            </ol>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={handleStartOver}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            >
              Create Another
            </button>
            <button
              onClick={() => startSession()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Chat Again
            </button>
          </div>

          {/* LiveAvatar branding */}
          <div className="text-center text-gray-500 text-xs">
            Powered by{" "}
            <a
              href="https://liveavatar.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              LiveAvatar
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Session screen
  return (
    <LiveAvatarSession
      sessionAccessToken={sessionToken}
      onSessionStopped={onSessionStopped}
    />
  );
};
