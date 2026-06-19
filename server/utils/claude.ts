import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

export function useAnthropicClient() {
  if (!_client) {
    const config = useRuntimeConfig()
    _client = new Anthropic({ apiKey: config.anthropicApiKey })
  }
  return _client
}
