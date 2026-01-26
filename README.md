# AI SDR Agent - LiveAvatar Demo

Create an instant AI Sales Development Representative (SDR) for any website using HeyGen's LiveAvatar technology. This app lets you spin up a real-time video avatar that can have voice conversations about any business.

## Features

- Real-time video avatar with voice chat
- Automatically learns from any website URL
- Conversation transcript panel
- 2-minute demo session limit
- Custom avatar selection
- Context reuse for faster subsequent sessions

## Quick Start

### Prerequisites

- Node.js 18+
- LiveAvatar API key ([Get your free key here](https://app.liveavatar.com/developers) - sign in with HeyGen account)

### Installation

```bash
# Clone the repository
git clone https://github.com/eNNNo/liveavatar-ai-sdr.git
cd liveavatar-ai-sdr

# Install dependencies
npm install

# Configure your API key
cp .env.example .env.local
# Edit .env.local and add your LIVEAVATAR_API_KEY
```

### Running

```bash
npm run dev
```

Open http://localhost:3001 in your browser.

## Configuration

### Environment Variables

Create a `.env.local` file with:

```bash
# Required: Your HeyGen LiveAvatar API key
LIVEAVATAR_API_KEY=your-api-key-here

# Optional: Auto-start mode (skip the onboarding form)
NEXT_PUBLIC_AUTO_START=false
NEXT_PUBLIC_WEBSITE_URL=
NEXT_PUBLIC_USER_NAME=Visitor
```

### Auto-Start Mode

To skip the onboarding form and immediately start a session:

```bash
NEXT_PUBLIC_AUTO_START=true
NEXT_PUBLIC_WEBSITE_URL=https://example.com
NEXT_PUBLIC_USER_NAME=Demo User
```

## Using with Claude Code

### Quick Install (Recommended)

Install the skill globally with one command:

```bash
npx skills add eNNNo/liveavatar-ai-sdr
```

Then in any Claude Code session:
```
/ai-sdr-agent shopify.com
```

Claude will prompt you for your LiveAvatar API key and set everything up automatically.

### Manual Installation

If you prefer to set it up manually:

1. Open Claude Code in any project
2. Run: `/ai-sdr-agent shopify.com`
3. Claude will clone this repo, configure your API key, and run the app for you

## How It Works

1. **Website Analysis**: The app fetches and analyzes the target website's content
2. **Context Creation**: Creates a LiveAvatar context with a sales representative persona trained on the website
3. **Avatar Session**: Starts a real-time video session with voice chat capabilities
4. **Conversation**: Users can speak or type to interact with the AI SDR

## Tech Stack

- Next.js 15 with App Router
- HeyGen LiveAvatar SDK
- Tailwind CSS
- TypeScript

## License

MIT
