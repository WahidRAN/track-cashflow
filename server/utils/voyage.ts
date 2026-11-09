import { VoyageAIClient } from 'voyageai'

let _client: VoyageAIClient | null = null

export function useVoyageClient() {
  if (!_client) {
    const config = useRuntimeConfig()
    _client = new VoyageAIClient({ apiKey: config.voyageApiKey })
  }
  return _client
}
