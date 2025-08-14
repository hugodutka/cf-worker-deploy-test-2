# cf-worker-deploy-test

Cloudflare Worker + Durable Object (hibernating WebSockets) to test behavior across deployments.

## What it does
- `GET /websocket` upgrades to WebSocket and connects to a Durable Object `WebSocketHibernationServer`.
- The DO uses the Hibernation WebSocket API. It maintains a class-level `version` number (initialized to 0). On each client message, it sleeps for 30s while logging every 5s, then sends back `{ version, echo }`.
- Edit the `version` static field and re-deploy to observe behavior during in-flight processing.

## Files
- `wrangler.toml`: Worker config + DO binding + migration
- `src/worker.ts`: Worker and DO
- `public/index.html`: Local test client (served via Python)

## Deploy
1. Install wrangler

```sh
npm i -g wrangler
```

2. Login

```sh
wrangler login
```

3. Deploy

```sh
wrangler deploy
```

Note: The Durable Object migration `v1` is included. First deploy creates the class.

## Test
1. Start a static server for the test page:

```sh
cd public
python3 -m http.server 8080
```

2. Open http://localhost:8080 in a browser.
3. Set WebSocket URL to: `wss://<your-worker-subdomain>.workers.dev/websocket` (or your custom domain route).
4. Click Connect, then Send test message. Observe logs every 5s and the reply after ~30s.

## Change version and re-deploy
- In `src/worker.ts`, change `WebSocketHibernationServer.version = 0;` to another integer.
- Re-deploy:

```sh
wrangler deploy
```

Observe whether the 30s wait completes or is interrupted, and what `version` is reported.

## Notes
- This DO uses the Hibernation WebSocket API (`compatibility_flags = ["durable_object_websocket"]`) and `acceptWebSocket`. When the DO is evicted (including during deploy), connected clients remain attached at the edge and are re-attached to the new DO instance on wake.
