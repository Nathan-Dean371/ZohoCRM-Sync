import { ProxyAgent } from 'undici';

interface ProxyAwareRequestInit extends RequestInit {
    dispatcher?: unknown;
}

const buildProxyAgent = (): ProxyAgent | undefined => {
    const proxyUrl = process.env.WEBSHARE_URL;
    if (!proxyUrl) {
        return undefined;
    }

    return new ProxyAgent(proxyUrl);
};

const normalizeHeaders = (headers: HeadersInit | undefined): Record<string, string> => {
    if (!headers) {
        return {};
    }

    if (headers instanceof Headers) {
        return Object.fromEntries(headers.entries());
    }

    if (Array.isArray(headers)) {
        return Object.fromEntries(headers);
    }

    return { ...(headers as Record<string, string>) };
};

export async function wetravelFetch(input: string, init: ProxyAwareRequestInit = {}): Promise<Response> {
    const proxyAgent = buildProxyAgent();
    const headers = normalizeHeaders(init.headers);

    if (!headers['User-Agent'] && !headers['user-agent']) {
        headers['User-Agent'] = 'OCTOtoCRM-Integration/1.0 (+https://octotocrm-production.up.railway.app)';
    }

    if (!headers.Accept && !headers.accept) {
        headers.Accept = 'application/json';
    }

    if (!headers['Content-Type'] && !headers['content-type'] && !(init.method && /^(GET|HEAD)$/i.test(init.method))) {
        headers['Content-Type'] = 'application/json';
    }

    return fetch(input, {
        ...init,
        dispatcher: proxyAgent,
        headers
    } as any);
}
