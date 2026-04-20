import { Platform, requestUrl } from "obsidian";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_OAUTH_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "openid",
    "email",
].join(" ");

// Refresh 60 seconds before the real expiry to avoid close races.
const REFRESH_LEEWAY_MS = 60 * 1000;

export type GoogleOAuthClient = {
    clientId: string;
    clientSecret: string;
};

export type GoogleTokenSet = {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    email: string;
};

export type GoogleTokenRefresh = {
    accessToken: string;
    expiresAt: number;
};

export function hasGoogleCredentials(client: GoogleOAuthClient): boolean {
    return client.clientId.length > 0 && client.clientSecret.length > 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function randomUrlSafeString(byteLength: number): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
}

async function sha256Base64Url(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(input)
    );
    return base64UrlEncode(new Uint8Array(digest));
}

function buildAuthUrl(params: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
}): string {
    const q = new URLSearchParams({
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        response_type: "code",
        scope: GOOGLE_OAUTH_SCOPES,
        code_challenge: params.codeChallenge,
        code_challenge_method: "S256",
        state: params.state,
        access_type: "offline",
        prompt: "consent",
    });
    return `${GOOGLE_AUTH_URL}?${q.toString()}`;
}

type RedirectResult = { code: string; state: string };

/**
 * Ephemeral HTTP listener on 127.0.0.1 that resolves with the OAuth
 * authorization code when Google redirects the user back.
 */
async function startLoopbackListener(timeoutMs: number): Promise<{
    redirectUri: string;
    result: Promise<RedirectResult>;
}> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const http = require("http") as typeof import("http");

    const server = http.createServer();

    const result = new Promise<RedirectResult>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(
                new Error(
                    "Timed out waiting for Google authorization. Please try again."
                )
            );
            server.close();
        }, timeoutMs);

        server.on("request", (req, res) => {
            if (!req.url) {
                res.statusCode = 400;
                res.end();
                return;
            }
            if (!req.url.startsWith("/callback")) {
                res.statusCode = 404;
                res.end();
                return;
            }

            const url = new URL(req.url, "http://127.0.0.1");
            const code = url.searchParams.get("code");
            const state = url.searchParams.get("state");
            const error = url.searchParams.get("error");

            const send = (status: number, body: string) => {
                res.statusCode = status;
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                res.end(body);
            };

            if (error) {
                send(
                    400,
                    `<html><body style="font-family:sans-serif"><h2>Authorization denied</h2><p>${escapeHtml(
                        error
                    )}</p><p>You can close this tab.</p></body></html>`
                );
                clearTimeout(timer);
                server.close();
                reject(new Error(`Google returned error: ${error}`));
                return;
            }

            if (!code || !state) {
                send(
                    400,
                    `<html><body style="font-family:sans-serif"><h2>Missing authorization code</h2><p>You can close this tab.</p></body></html>`
                );
                return;
            }

            send(
                200,
                `<html><body style="font-family:sans-serif;text-align:center;padding-top:2rem"><h2>Connected to Google Calendar</h2><p>You can close this tab and return to Obsidian.</p></body></html>`
            );
            clearTimeout(timer);
            setTimeout(() => server.close(), 100);
            resolve({ code, state });
        });

        server.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });

    await new Promise<void>((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => resolve());
        server.on("error", reject);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
        server.close();
        throw new Error("Could not determine local auth server port.");
    }
    const redirectUri = `http://127.0.0.1:${address.port}/callback`;
    return { redirectUri, result };
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function openInBrowser(url: string): void {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require("electron");
        if (electron?.shell?.openExternal) {
            electron.shell.openExternal(url);
            return;
        }
    } catch (_) {
        /* not electron — fall through */
    }
    window.open(url, "_blank");
}

async function exchangeCodeForTokens(
    client: GoogleOAuthClient,
    params: {
        code: string;
        codeVerifier: string;
        redirectUri: string;
    }
): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}> {
    const body = new URLSearchParams({
        code: params.code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code_verifier: params.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: params.redirectUri,
    });
    const resp = await requestUrl({
        url: GOOGLE_TOKEN_URL,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        throw: false,
    });
    if (resp.status < 200 || resp.status >= 300) {
        throw new Error(
            `Google token exchange failed (${resp.status}): ${resp.text}`
        );
    }
    const json = resp.json as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
    };
    if (!json.access_token || !json.refresh_token || !json.expires_in) {
        throw new Error(
            "Google token response missing access_token / refresh_token."
        );
    }
    return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresIn: json.expires_in,
    };
}

async function fetchUserEmail(accessToken: string): Promise<string> {
    const resp = await requestUrl({
        url: GOOGLE_USERINFO_URL,
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        throw: false,
    });
    if (resp.status < 200 || resp.status >= 300) {
        throw new Error(
            `Failed to fetch Google user profile (${resp.status}): ${resp.text}`
        );
    }
    const data = resp.json as { email?: string };
    return data.email || "";
}

/**
 * Run the full OAuth PKCE flow end-to-end. Opens the user's default browser,
 * waits for the redirect, exchanges the code, and returns a token set
 * including the account email.
 */
export async function runGoogleOAuthFlow(
    client: GoogleOAuthClient
): Promise<GoogleTokenSet> {
    if (Platform.isMobile) {
        throw new Error(
            "Google Calendar sync is only supported on Obsidian desktop."
        );
    }
    if (!hasGoogleCredentials(client)) {
        throw new Error(
            "Google OAuth credentials are not configured. Set them in Full Calendar settings."
        );
    }

    const codeVerifier = randomUrlSafeString(32);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const state = randomUrlSafeString(16);

    // Allow up to 5 minutes for the user to complete the sign-in.
    const { redirectUri, result } = await startLoopbackListener(5 * 60 * 1000);

    const authUrl = buildAuthUrl({
        clientId: client.clientId,
        redirectUri,
        codeChallenge,
        state,
    });
    openInBrowser(authUrl);

    const { code, state: returnedState } = await result;
    if (returnedState !== state) {
        throw new Error(
            "OAuth state mismatch — aborting to prevent CSRF replay."
        );
    }

    const tokens = await exchangeCodeForTokens(client, {
        code,
        codeVerifier,
        redirectUri,
    });
    const email = await fetchUserEmail(tokens.accessToken);

    return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        email,
    };
}

/**
 * Exchange a refresh token for a new access token.
 */
export async function refreshGoogleAccessToken(
    client: GoogleOAuthClient,
    refreshToken: string
): Promise<GoogleTokenRefresh> {
    if (!hasGoogleCredentials(client)) {
        throw new Error(
            "Google OAuth credentials are not configured. Set them in Full Calendar settings."
        );
    }
    const body = new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
    });
    const resp = await requestUrl({
        url: GOOGLE_TOKEN_URL,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        throw: false,
    });
    if (resp.status < 200 || resp.status >= 300) {
        throw new Error(
            `Google token refresh failed (${resp.status}): ${resp.text}`
        );
    }
    const json = resp.json as {
        access_token?: string;
        expires_in?: number;
    };
    if (!json.access_token || !json.expires_in) {
        throw new Error("Google refresh response missing access_token.");
    }
    return {
        accessToken: json.access_token,
        expiresAt: Date.now() + json.expires_in * 1000,
    };
}

export function accessTokenIsFresh(expiresAt: number | undefined): boolean {
    if (!expiresAt) return false;
    return expiresAt - Date.now() > REFRESH_LEEWAY_MS;
}
