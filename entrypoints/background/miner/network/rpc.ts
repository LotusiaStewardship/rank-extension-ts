import type { RawUnsolvedBlockAndTarget } from '@/entrypoints/background/miner/core'

type JsonRpcResponse<T> = {
  result: T | null
  error: string | null
}

export type LotusRpcSettings = {
  rpcUrl: string
  rpcUser: string
  rpcPassword: string
}

export class LotusRpcClient {
  constructor(private readonly settings: LotusRpcSettings) {}

  async getRawUnsolvedBlock(
    mineToAddress: string,
  ): Promise<RawUnsolvedBlockAndTarget | null> {
    const response = await this.request<RawUnsolvedBlockAndTarget>(
      'getrawunsolvedblock',
      [mineToAddress],
    )
    if (response.error) {
      throw new Error(`getrawunsolvedblock failed: ${response.error}`)
    }
    return response.result
  }

  async submitBlock(blockHex: string): Promise<string | null> {
    const response = await this.request<string>('submitblock', [blockHex])
    return response.result
  }

  private async request<T>(
    method: string,
    params: unknown[],
  ): Promise<JsonRpcResponse<T>> {
    const auth = btoa(`${this.settings.rpcUser}:${this.settings.rpcPassword}`)
    const res = await fetch(this.settings.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ method, params }),
    })

    const text = await res.text()
    if (!res.ok) {
      throw new Error(`${method} HTTP ${res.status}: ${text}`)
    }

    const parsed = JSON.parse(text) as JsonRpcResponse<T>
    return parsed
  }
}
