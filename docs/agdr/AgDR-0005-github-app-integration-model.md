---
id: AgDR-0005
timestamp: 2026-06-07T10:51:00Z
agent: claude
model: claude-opus-4-8
trigger: user-prompt
status: executed
---

# GitHub App integration model — per-install App via the Manifest flow

> In the context of connecting each self-hosted Marsa install to GitHub for both operator login (#22) and pulling/deploying operator code (#23), facing the fact that a single central GitHub App cannot serve installs on arbitrary operator-chosen domains, we decided that **each install provisions its own GitHub App via the GitHub App Manifest flow**, used for **both** user-OAuth login and installation-token repo access, to keep operator setup to ~2 clicks and avoid routing customer webhooks through Marsa-team infra, accepting that we build the manifest + installation + webhook flow (~3–4 days) and that air-gapped installs need a future polling fallback.

## Context

- **#22 (login)** and **#23 (pull code)** both need GitHub. **One GitHub App can serve both**: its user-OAuth flow yields identity (login); its installation tokens grant repo/clone/webhook access (deploy).
- **Self-hosted ⇒ arbitrary domains.** A GitHub App's webhook + OAuth-callback URLs are **fixed at registration**, but each install runs on a different operator-chosen domain (e.g. `demo.marsa.cc`, `api.demo.marsa.cc`). A single shared central App therefore cannot serve many installs without routing every customer's webhooks through a Marsa-team relay — a SaaS dependency we don't want baked into a self-hosted product.
- **Push-to-deploy** needs GitHub to reach the install's webhook endpoint.
- This decision is **independent of the IdP choice** ([AgDR-0004](AgDR-0004-authentication-and-idp-strategy.md)) and survives the v0.1 → v0.2 Zitadel migration unchanged — only the _login_ portion later moves behind Zitadel; the deploy/repo App is permanent.

## Options Considered

| Option                                                      | Pros                                                                                                                                                                        | Cons                                                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Central GitHub App** (Marsa-team-owned, one registration) | Simplest for a SaaS single-domain deployment                                                                                                                                | Fixed callback/webhook URL **can't serve arbitrary self-hosted domains** without a central relay carrying every customer's webhooks           |
| **OAuth App per install**                                   | Simple OAuth handshake                                                                                                                                                      | No fine-grained per-repo permissions; lower rate limits; no installation model — weak fit for a deploy platform                               |
| **Per-install GitHub App via the Manifest flow**            | Fits self-hosted (each install owns an App on its own domain); fine-grained repo perms; installation tokens; **~2-click** operator setup; **one App serves login + deploy** | We build the manifest + conversion-callback + installation-token + webhook receiver (~3–4 days); chicken-and-egg with domain/TLS at first run |

## Decision

Chosen: **per-install GitHub App created via the GitHub App Manifest flow**, dual-purpose for login (#22) and repo access (#23), because it is the only model that fits self-hosted-on-arbitrary-domains without a central relay, while keeping operator setup near one-click and giving a deploy platform the fine-grained perms + installation tokens it needs.

## Consequences

- **Operator setup ≈ 2 click-throughs** — (1) manifest "Create App" (pre-filled permissions/webhook/callback for _their_ domain; pick owner; Create), (2) "Install" on chosen repos. No secret copy-pasting; Marsa auto-fetches App id, private key, client secret, webhook secret from the conversion callback.
- **First-run wizard** runs the GitHub-connect step _after_ the operator's domain + TLS are configured (resolves the callback chicken-and-egg). The operator who completes it becomes the **first admin** (ties into [AgDR-0004](AgDR-0004-authentication-and-idp-strategy.md)'s allowlist bootstrap).
- **Webhook reachability** is satisfied by the operator's **publicly-resolvable domain + public-ingress TLS** (the chosen domain, e.g. `demo.marsa.cc`). The requirement is public DNS + reachable ingress + TLS, not TLS alone. **Air-gapped / LAN-only installs** with no public DNS would need a **polling fallback** — out of scope for v0.1, noted here so it isn't forgotten.
- **Installation access tokens** (App JWT signed with the private key → installation token, ~1 h TTL) are minted on demand and cached; the App private key is stored securely per install.
- **Developers:** each dev creates a throwaway test GitHub App (~15 min, once) and needs a **public tunnel** (ngrok / cloudflared) so GitHub webhooks reach localhost — the tunnel is the only recurring local-dev friction.

## Artifacts

- Issues: marsa-cloud/marsa#22 (login), marsa-cloud/marsa#23 (GitHub repo access)
- Related: [AgDR-0004](AgDR-0004-authentication-and-idp-strategy.md) (auth/IdP strategy)
