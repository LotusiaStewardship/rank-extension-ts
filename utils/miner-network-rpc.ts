/**
 * Generic JSON-RPC response shape returned by Lotus daemon endpoints.
 */
type JsonRpcResponse<T> = {
  result: T | null
  error: string | null
}

/** Connection settings for Lotus JSON-RPC. */
export type LotusRpcSettings = {
  /** Full node RPC endpoint URL. */
  rpcUrl: string
  /** Username for HTTP basic authentication. */
  rpcUser: string
  /** Password for HTTP basic authentication. */
  rpcPassword: string
}

/**
 * Thin Lotus JSON-RPC client used by the mining service.
 */
export class LotusRpcClient {
  /** Precomputed Authorization header to avoid rebuilding per call. */
  private readonly authHeader: string

  constructor(private readonly settings: LotusRpcSettings) {
    this.authHeader = `Basic ${btoa(`${settings.rpcUser}:${settings.rpcPassword}`)}`
  }

  /**
   * Request a fresh unsolved block template from the node.
   */
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

  /**
   * Submit a solved block as full block hex.
   * Returns `null` on acceptance, or an error string from the node.
   */
  async submitBlock(blockHex: string): Promise<string | null> {
    const response = await this.request<string>('submitblock', [blockHex])
    return response.result
  }

  /**
   * Perform a generic JSON-RPC POST request.
   */
  private async request<T>(
    method: string,
    params: unknown[],
  ): Promise<JsonRpcResponse<T>> {
    const res = await fetch(this.settings.rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.authHeader,
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
