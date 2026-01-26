// LiveAvatar Configuration
// Values can be overridden via environment variables

// API Key - REQUIRED: Set via LIVEAVATAR_API_KEY env var in .env.local
// Get your API key from https://app.heygen.com/settings/api
export const API_KEY = process.env.LIVEAVATAR_API_KEY || "";
export const API_URL = "https://api.liveavatar.com";

// Avatar: Ann Therapist - Professional female avatar
export const AVATAR_ID = "513fd1b7-7ef9-466d-9af2-344e51eeb833";

// When true, we will call everything in Sandbox mode.
// Useful for integration and development (uses minimal credits).
export const IS_SANDBOX = false;

// FULL MODE Customizations
// Voice: Ann - IA (matches the avatar)
export const VOICE_ID = "de5574fc-009e-4a01-a881-9919ef8f5a0c";

// Context ID - using the existing Wayne context for now
// The skill will create custom contexts for specific personas
export const CONTEXT_ID = "5b9dba8a-aa31-11f0-a6ee-066a7fa2e369";

export const LANGUAGE = "en";

// CUSTOM MODE Customizations (optional)
export const ELEVENLABS_API_KEY = "";
export const OPENAI_API_KEY = "";
