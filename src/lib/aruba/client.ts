/**
 * Aruba Fatturazione Elettronica API Client
 *
 * Official docs: https://fatturazioneelettronica.aruba.it/apidoc/docs.html
 *
 * Environments:
 * - Demo:  auth=https://demoauth.fatturazioneelettronica.aruba.it  ws=https://demows.fatturazioneelettronica.aruba.it
 * - Prod:  auth=https://auth.fatturazioneelettronica.aruba.it      ws=https://ws.fatturazioneelettronica.aruba.it
 */

export interface ArubaConfig {
  username: string;
  password: string;
  env: 'demo' | 'production';
}

interface ArubaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface ArubaUploadResponse {
  errorCode: string;
  errorDescription: string;
  uploadFileName: string;
}

export interface ArubaInvoiceStatus {
  invoiceId: string;
  filename: string;
  status: string;
  statusCode: number;
  sdiIdentifier: string | null;
  sender: { description: string; countryCode: string; vatCode: string } | null;
  receiver: { description: string; countryCode: string; vatCode: string } | null;
  invoiceDate: string | null;
  invoiceNumber: string | null;
  docType: string | null;
}

const URLS = {
  demo: {
    auth: 'https://demoauth.fatturazioneelettronica.aruba.it',
    ws: 'https://demows.fatturazioneelettronica.aruba.it',
  },
  production: {
    auth: 'https://auth.fatturazioneelettronica.aruba.it',
    ws: 'https://ws.fatturazioneelettronica.aruba.it',
  },
};

// SDI status code mapping
export const SDI_STATUS_MAP: Record<number, { label: string; status: string }> = {
  1: { label: 'Presa in carico', status: 'sent_to_sdi' },
  3: { label: 'Inviata a SDI', status: 'sent_to_sdi' },
  4: { label: 'Scartata', status: 'rejected' },
  7: { label: 'Consegnata', status: 'delivered' },
  8: { label: 'Accettata', status: 'delivered' },
  9: { label: 'Rifiutata', status: 'rejected' },
  10: { label: 'Impossibilita di recapito', status: 'not_delivered' },
};

let cachedTokens: ArubaTokens | null = null;

function getUrls(env: 'demo' | 'production') {
  return URLS[env];
}

/**
 * Authenticate with Aruba and get access token.
 */
async function signIn(config: ArubaConfig): Promise<ArubaTokens> {
  const urls = getUrls(config.env);

  const res = await fetch(`${urls.auth}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=password&username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Aruba auth failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  const tokens: ArubaTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000, // 60s margin
  };

  cachedTokens = tokens;
  return tokens;
}

/**
 * Get a valid access token, refreshing if needed.
 */
async function getToken(config: ArubaConfig): Promise<string> {
  if (cachedTokens && cachedTokens.expires_at > Date.now()) {
    return cachedTokens.access_token;
  }

  // Try refresh if we have a refresh token
  if (cachedTokens?.refresh_token) {
    try {
      const urls = getUrls(config.env);
      const res = await fetch(`${urls.auth}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(cachedTokens.refresh_token)}`,
      });

      if (res.ok) {
        const data = await res.json();
        cachedTokens = {
          access_token: data.access_token,
          refresh_token: data.refresh_token || cachedTokens.refresh_token,
          expires_at: Date.now() + (data.expires_in - 60) * 1000,
        };
        return cachedTokens.access_token;
      }
    } catch {
      // Fall through to full sign-in
    }
  }

  const tokens = await signIn(config);
  return tokens.access_token;
}

/**
 * Upload an unsigned invoice XML to Aruba for SDI transmission.
 */
export async function uploadInvoice(
  config: ArubaConfig,
  xmlBase64: string,
  senderPIVA: string,
): Promise<ArubaUploadResponse> {
  const token = await getToken(config);
  const urls = getUrls(config.env);

  const res = await fetch(`${urls.ws}/services/invoice/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dataFile: xmlBase64,
      credential: '',
      domain: '',
      senderPIVA: senderPIVA,
      skipExtraSchema: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Aruba upload failed (${res.status}): ${text}`);
  }

  const data = await res.json() as ArubaUploadResponse;

  if (data.errorCode !== '0000') {
    throw new Error(`Aruba errore ${data.errorCode}: ${data.errorDescription}`);
  }

  return data;
}

/**
 * Get the status of a sent invoice by filename.
 */
export async function getInvoiceStatus(
  config: ArubaConfig,
  username: string,
  filename: string,
): Promise<ArubaInvoiceStatus | null> {
  const token = await getToken(config);
  const urls = getUrls(config.env);

  const params = new URLSearchParams({
    username,
    filename,
  });

  const res = await fetch(`${urls.ws}/services/invoice/out/getByFilename?${params}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const text = await res.text();
    throw new Error(`Aruba status check failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  return {
    invoiceId: data.invoiceId || '',
    filename: data.filename || filename,
    status: data.status || '',
    statusCode: data.statusCode || 0,
    sdiIdentifier: data.idSdi || null,
    sender: data.sender || null,
    receiver: data.receiver || null,
    invoiceDate: data.invoiceDate || null,
    invoiceNumber: data.invoiceNumber || null,
    docType: data.docType || null,
  };
}

/**
 * Search sent invoices.
 */
export async function searchSentInvoices(
  config: ArubaConfig,
  username: string,
  options?: { page?: number; size?: number; startDate?: string; endDate?: string },
): Promise<ArubaInvoiceStatus[]> {
  const token = await getToken(config);
  const urls = getUrls(config.env);

  const params = new URLSearchParams({ username });
  if (options?.page !== undefined) params.set('page', String(options.page));
  if (options?.size !== undefined) params.set('size', String(options.size));
  if (options?.startDate) params.set('startDate', options.startDate);
  if (options?.endDate) params.set('endDate', options.endDate);

  const res = await fetch(`${urls.ws}/services/invoice/out/findByUsername?${params}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Aruba search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return (data.content || data || []) as ArubaInvoiceStatus[];
}

/**
 * Build ArubaConfig from environment variables or stored settings.
 */
export function getArubaConfigFromEnv(): ArubaConfig | null {
  const username = process.env.ARUBA_FE_USERNAME;
  const password = process.env.ARUBA_FE_PASSWORD;
  const env = (process.env.ARUBA_FE_ENV as 'demo' | 'production') || 'demo';

  if (!username || !password) return null;

  return { username, password, env };
}
