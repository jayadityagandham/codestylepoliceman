// AR-COM-001: Discord Bot implementation
// This module provides a Discord bot that connects to Discord via WebSocket,
// ingests messages from designated channels, and forwards them to our webhook endpoint.

// NOTE: In production, run this as a separate process (e.g., `npx ts-node src/lib/discord-bot.ts`)
// or deploy as a separate service. It cannot run inside Next.js serverless functions.

interface DiscordMessage {
  id: string
  channel_id: string
  author: { id: string; username: string; bot?: boolean }
  content: string
  timestamp: string
  guild_id?: string
}

interface ChannelMapping {
  workspace_id: string
  discord_channel_id: string
}

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// AR-COM-002: Channel designations - map Discord channel IDs to workspace IDs
let channelMappings: ChannelMapping[] = []

export function setChannelMappings(mappings: ChannelMapping[]) {
  channelMappings = mappings
}

// AR-COM-005: Normalize Discord message to internal schema
export function normalizeMessage(msg: DiscordMessage, channelName?: string) {
  return {
    message_id: msg.id,
    channel_id: msg.channel_id,
    channel_name: channelName ?? msg.channel_id,
    author_discord_id: msg.author.id,
    author_username: msg.author.username,
    content: msg.content.trim(),
    sent_at: msg.timestamp,
  }
}

// AR-COM-007: Only process messages from designated public channels
function isDesignatedChannel(channelId: string): ChannelMapping | undefined {
  return channelMappings.find((m) => m.discord_channel_id === channelId)
}

// Forward message to our webhook endpoint for processing
async function forwardToWebhook(workspaceId: string, normalizedMsg: ReturnType<typeof normalizeMessage>) {
  try {
    const res = await fetch(`${APP_URL}/api/webhooks/discord`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({ workspace_id: workspaceId, ...normalizedMsg }),
    })
    if (!res.ok) {
      console.error(`Discord webhook forward failed: ${res.status}`)
    }
  } catch (err) {
    console.error('Failed to forward Discord message:', err)
  }
}

// AR-COM-003/004: Record message author identity and timestamp
export async function handleIncomingMessage(msg: DiscordMessage) {
  // Ignore bot messages
  if (msg.author.bot) return

  const mapping = isDesignatedChannel(msg.channel_id)
  if (!mapping) return

  const normalized = normalizeMessage(msg)
  await forwardToWebhook(mapping.workspace_id, normalized)
}

// Simple Discord Gateway client using fetch-based approach
// For production, use discord.js library instead
export class DiscordBotClient {
  private token: string
  private ws: WebSocket | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private sequenceNumber: number | null = null

  constructor(token: string) {
    this.token = token
  }

  async start() {
    // Get gateway URL
    const res = await fetch('https://discord.com/api/v10/gateway/bot', {
      headers: { Authorization: `Bot ${this.token}` },
    })
    const { url } = (await res.json()) as { url: string }

    this.ws = new WebSocket(`${url}?v=10&encoding=json`)

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string) as { op: number; d: unknown; s: number | null; t: string | null }
      this.sequenceNumber = data.s

      switch (data.op) {
        case 10: // Hello
          this.startHeartbeat((data.d as { heartbeat_interval: number }).heartbeat_interval)
          this.identify()
          break
        case 0: // Dispatch
          if (data.t === 'MESSAGE_CREATE') {
            handleIncomingMessage(data.d as DiscordMessage).catch(console.error)
          }
          break
      }
    }

    this.ws.onerror = (err) => console.error('Discord WS error:', err)
    this.ws.onclose = () => {
      console.log('Discord WS closed, reconnecting in 5s...')
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
      setTimeout(() => this.start(), 5000)
    }
  }

  private identify() {
    this.ws?.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        intents: 1 << 9 | 1 << 15, // GUILD_MESSAGES | MESSAGE_CONTENT
        properties: { os: 'linux', browser: 'orchids-bot', device: 'orchids-bot' },
      },
    }))
  }

  private startHeartbeat(intervalMs: number) {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    this.heartbeatInterval = setInterval(() => {
      this.ws?.send(JSON.stringify({ op: 1, d: this.sequenceNumber }))
    }, intervalMs)
  }

  stop() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    this.ws?.close()
  }
}
