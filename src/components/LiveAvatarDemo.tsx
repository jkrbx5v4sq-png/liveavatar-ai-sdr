"use client";

import { useState, useEffect, useRef } from "react";
import { LiveAvatarSession } from "./LiveAvatarSession";

type SetupStep = "form" | "generating" | "session";

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
    setSetupStep("form");
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
                placeholder="e.g., mycompany.com"
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

  // Session screen
  return (
    <LiveAvatarSession
      sessionAccessToken={sessionToken}
      onSessionStopped={onSessionStopped}
    />
  );
};
