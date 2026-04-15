export interface FetchHtmlResult {
  url: string
  status: number
  html: string
}

export class FetchError extends Error {
  constructor(public readonly url: string, public readonly status: number) {
    super(`HTTP ${status} from ${url}`)
    this.name = 'FetchError'
  }
}

export async function fetchHtml(url: string): Promise<FetchHtmlResult> {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      pragma: 'no-cache',
      'cache-control': 'no-cache',
    },
  })

  if (!response.ok) {
    throw new FetchError(url, response.status)
  }

  return {
    url,
    status: response.status,
    html: await response.text(),
  }
}
