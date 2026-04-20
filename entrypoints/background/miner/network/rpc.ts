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
  private readonly authHeader: string

  constructor(private readonly settings: LotusRpcSettings) {
    this.authHeader = `Basic ${btoa(`${settings.rpcUser}:${settings.rpcPassword}`)}`
  }

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
    const res = await fetch(this.settings.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
      },
      body: JSON.stringify({ method, params, id: 1 }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${method} HTTP ${res.status}: ${text}`)
    }

    return (await res.json()) as JsonRpcResponse<T>
  }
}
