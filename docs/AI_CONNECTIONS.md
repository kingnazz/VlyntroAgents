# Connect your AI

Open `/connect` or **Brain → Connect your AI** in Agent HQ. Choose ChatGPT, Codex, Claude, Claude Code, Grok, Muse or another MCP client. Copy the MCP URL or setup prompt and follow that client's instructions. Complete Agent HQ browser sign-in and consent, then ask the client to call `get_brain_connection` and `search_brain`.

The setup prompt can guide an AI that can configure its environment. A chat prompt or skill alone cannot grant access. Browser-only clients may require manual connector settings, a compatible account plan, developer mode or an administrator. The application offers setup instructions; it does not install itself into third-party accounts or import all conversations.

## Access and identity

Each connection receives a separate system agent identity, workspace binding and audit attribution. These identities are excluded from the operational agent directory and worker heartbeat configuration. Connecting an external Claude app does not configure Muse's Anthropic provider key.

Owners/admins approve read access and optionally capture submission. Connected clients expose only Brain tools. A supplied different workspace is rejected, and no task, approval, state-writing or administration tools are exposed. Read-only connections cannot discover the capture tool. Existing Brain visibility rules continue to protect sensitive memories and restricted sources. Captures retain their contributing identity; a successful capture can still require processing or human review. Existing decisions and preferences cannot be silently overwritten.

Connection status reports real authenticated use. Before the first authentication it reads “Awaiting first use.” This does not certify that a third-party app imported a plugin or that every future chat will invoke it.

## OAuth

The existing API hosts the MCP SDK's OAuth handlers, mounted through a scoped Express application using Fastify Middie:

| Endpoint                                    | Purpose                                          |
| ------------------------------------------- | ------------------------------------------------ |
| `/.well-known/oauth-authorization-server`   | Issuer and endpoint metadata                     |
| `/.well-known/oauth-protected-resource/mcp` | MCP resource metadata                            |
| `/oauth/register`                           | Dynamic public-client registration               |
| `/oauth/authorize`                          | S256 PKCE authorization request                  |
| `/connect/authorize`                        | Authenticated human consent screen               |
| `/oauth/token`                              | Authorization-code exchange and rotating refresh |
| `/oauth/revoke`                             | Credential/connection revocation                 |

Only public clients with `token_endpoint_auth_method=none` are supported. Registration accepts HTTPS callbacks and HTTP loopback callbacks, without credentials or fragments. The SDK enforces callback matching, including native loopback port matching. Caller-provided metadata URLs are never fetched. Client names are unverified; the consent screen shows the callback origin/path for recognition.

Scopes are `brain.read`, optional `brain.propose`, and optional `offline_access`. Consent can narrow capture and renewable access. Pending requests expire after 10 minutes and codes after 2 minutes. Codes are single-use and bound to client, redirect, resource and PKCE challenge. Access tokens expire after one hour; rotating refresh tokens expire after 30 days. Both are bounded by the connection's 90-day expiry. Refresh cannot expand scopes. Reusing an already consumed refresh token revokes the connection and all credentials. Removing the granting user's owner/admin role also invalidates access.

OAuth tokens are resource-bound to the canonical `APP_BASE_URL` plus `/mcp`; they cannot be used against REST. MCP permits explicit bearer authentication from external origins, with credential-free CORS. Existing dashboard Origin/CSRF protection remains in force. No cookie-based MCP access is granted. Bearer credentials, authorization codes, refresh tokens and pending-request nonces are hashed at rest. Protocol and private connection responses are not cached.

Rate limits apply to registration, authorization and token exchange in addition to the API's existing limiter. Proxy headers are not trusted for client identity; behind the existing proxy these limits are shared. Registration is capped at 1,000 stored public clients. This is intended for the existing private workspace, not a public multi-tenant OAuth service.

## Skills and local plugins

The UI downloads credential-free ZIP files:

- `/api/v1/connections/skill.zip`: portable `vlyntro-brain/SKILL.md`.
- `/api/v1/connections/plugin.zip`: portable root `plugin.json`/`mcp.json` with OAuth DCR configuration, Codex/Claude compatibility manifests, remote HTTP `.mcp.json`, and the skill under `skills/vlyntro-brain/`.
- `/api/v1/connections/setup/:client`: public plain-text installation guidance.

Install in the user skill directory or use the local-plugin mechanism supported by the client. No marketplace listing or universal one-click installer is claimed. The files contain instructions/configuration only, with the canonical MCP endpoint and no executable installer or credentials. The skill instructs clients to retrieve relevant evidence, preserve attribution, capture only authorized durable outcomes, and accurately report pending review or processing.

For Codex, the setup page provides `codex mcp add vlyntro-brain --url <MCP URL>`, followed by `codex mcp login vlyntro-brain`. Claude Code uses `claude mcp add --transport http --scope user vlyntro-brain <MCP URL>` followed by authentication through `/mcp`.

## Advanced tokens

For a client supporting static bearer credentials, create a connection in the Advanced section. Choose read-only or read/capture access and an expiry of 1–90 days (default 30). Copy the token once into the client's secure connection settings as `Authorization: Bearer <token>`. The dashboard does not persist the plaintext token in browser storage. Replacing a token immediately revokes the previous credential. Revoking a connection invalidates all access and refresh credentials and disables its identity. OAuth clients reconnect through their sign-in flow instead of manual rotation.

## Deployment and rollback

Migration `003_ai_connections.sql` adds five connection/OAuth tables and three nullable columns to `agent_tokens`. Existing migrations and operational grants are unchanged. Back up and verify a nonempty dump before applying this migration. Apply it before starting the new API/worker images. The credential-free skill source is copied with `packages/` into the runtime image.

Both Caddy configurations route `/oauth/*` and `/.well-known/oauth-*` to the API. Validate and reload the existing Caddy container after updating the configuration. Keep `APP_BASE_URL` equal to the public HTTPS origin; changing it changes the OAuth issuer/resource and requires reconnecting clients. No new provider secrets or services are required for reading existing Brain context or submitting raw captures.

Rollback uses the previous application image tags and previous Caddy config. Retain migration 003 and its data; do not drop tables or restore a stale full database merely to roll back code. Old application code does not understand connection lifecycles: before rolling back to an older version, revoke all connection tokens, since old token authentication does not enforce their expiry/resource binding.

## Verification and limits

`tests/connections.test.ts` exercises real HTTP OAuth handlers and SDK MCP clients, owner consent, workspace isolation, token/connection expiry, read-only inventory, rotation/replay/revocation, resource binding, credential-free ZIP integrity and safe login return paths. Existing core and Brain tests verify compatibility. Browser acceptance covers the new setup screen, consent, one-time credentials, downloads and phone/tablet/desktop layouts. Third-party account installation still requires the account owner's action and has not been certified merely by these server tests.

Client documentation: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [OpenAI authentication](https://developers.openai.com/plugins/build/auth), [Claude connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Grok connectors](https://docs.x.ai/grok/connectors).
