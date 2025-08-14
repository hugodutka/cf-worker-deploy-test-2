import { DurableObject } from 'cloudflare:workers';

export interface Env {
	WS_DO: DurableObjectNamespace;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/websocket') {
			const upgradeHeader = request.headers.get('Upgrade');
			if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
				return new Response('Expected Upgrade: websocket', { status: 426 });
			}
			const id = env.WS_DO.idFromName('singleton');
			const stub = env.WS_DO.get(id);
			return stub.fetch(request);
		}

		return new Response('OK', { status: 200 });
	},
};

const sendMessage = (ws: WebSocket, message: string) => {
	try {
		ws.send(JSON.stringify({ version: WebSocketHibernationServer.version, echo: message }));
	} catch (err) {
		console.log('Failed to send over WebSocket:', err);
		try {
			ws.close(1011, 'internal error');
		} catch {}
	}
};

export class WebSocketHibernationServer extends DurableObject {
	static version: number;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		if (typeof WebSocketHibernationServer.version !== 'number') {
			WebSocketHibernationServer.version = 1;
		}

		// Reattach hibernated websockets
		this.ctx.getWebSockets().forEach((ws) => {
			// Restore any previously attached state if provided by attachments
			const attachment = ws.deserializeAttachment();
			if (attachment) {
				// no-op for now, but shows how to restore
			}
		});

		// Optional: auto-respond to ping without waking the DO
		this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	async fetch(request: Request): Promise<Response> {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		// Accept with hibernation semantics
		this.ctx.acceptWebSocket(server);

		// Optionally attach metadata so it survives hibernation
		server.serializeAttachment({});

		return new Response(null, { status: 101, webSocket: client });
	}

	// Hibernation API handlers
	async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
		let resolvePromise!: () => void;
		const promise = new Promise<void>((res) => {
			resolvePromise = res;
		});
		this.ctx.waitUntil(promise);
		try {
			const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
			console.log(`DO received message: ${text}`);

			sendMessage(ws, `got message: ${text}`);

			// Sleep 120s, logging every 5s
			for (let i = 5; i <= 30; i += 5) {
				await this.sleep(5000);
				sendMessage(ws, `sleeping... ${i}s elapsed (version=${WebSocketHibernationServer.version})`);
				console.log(`Sleeping... ${i}s elapsed (version=${WebSocketHibernationServer.version})`);
			}

			// Send current version after 30s
			sendMessage(ws, `done sleeping (version=${WebSocketHibernationServer.version})`);
		} finally {
			resolvePromise();
			console.log('end of webSocketMessage');
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		console.log(`WebSocket closed code=${code} reason=${reason} clean=${wasClean}`);
	}

	async webSocketError(ws: WebSocket, error: unknown) {
		console.log('WebSocket error:', error);
	}

	private sleep(ms: number) {
		return new Promise((res) => setTimeout(res, ms));
	}
}
