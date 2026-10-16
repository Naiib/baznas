import { NextRequest, NextResponse } from 'next/server';

const TARGET_HOST = process.env.INTERNAL_API_URL || 'http://localhost:3001';

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const subpath = path.join('/');
  const search = req.nextUrl.search;
  const targetUrl = `${TARGET_HOST}/api/${subpath}${search}`;

  const headers = new Headers(req.headers);
  headers.delete('host');

  try {
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const body = hasBody ? await req.arrayBuffer() : undefined;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const responseHeaders = new Headers(response.headers);

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`[API Proxy Error] Failed to proxy to ${targetUrl}:`, error);
    return NextResponse.json(
      {
        success: false,
        message: 'Backend API BAZNAS belum berjalan di port 3001. Pastikan Anda sudah menjalankan "npm run server" di terminal root.',
        code: 'BACKEND_UNAVAILABLE',
      },
      { status: 503 }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
export const HEAD = handler;
