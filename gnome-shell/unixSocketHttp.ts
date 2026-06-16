type HeaderInputValue = boolean | number | string | readonly (boolean | number | string)[] | null | undefined;
type HeaderInput =
  | Record<string, HeaderInputValue>
  | { toJSON?: (asStrings?: boolean) => Record<string, HeaderInputValue> };

export type GioUnixHttpToolkit = {
  Gio: {
    Cancellable?: new () => { cancel?: () => void };
    SocketClient: new () => {
      connect_async: (
        address: unknown,
        cancellable: unknown,
        callback: (source: unknown, result: unknown) => void,
      ) => void;
      connect_finish: (result: unknown) => GioUnixHttpConnection;
    };
    UnixSocketAddress: {
      new: (path: string) => unknown;
    };
  };
  GLib: {
    Bytes: {
      new: (bytes: Uint8Array) => unknown;
    };
    PRIORITY_DEFAULT?: number;
    SOURCE_CONTINUE?: boolean;
    SOURCE_REMOVE?: boolean;
    Source?: {
      remove?: (sourceId: number) => void;
    };
    timeout_add?: (priority: number, intervalMs: number, callback: () => boolean) => number;
  };
};

export type GioUnixHttpConnection = {
  close?: (cancellable: unknown) => void;
  close_async?: (
    priority: number,
    cancellable: unknown,
    callback: (source: GioUnixHttpConnection, result: unknown) => void,
  ) => void;
  close_finish?: (result: unknown) => boolean;
  get_input_stream: () => GioUnixHttpInputStream;
  get_output_stream: () => GioUnixHttpOutputStream;
};

export type GioUnixHttpInputStream = {
  read_bytes_async: (
    count: number,
    priority: number,
    cancellable: unknown,
    callback: (source: GioUnixHttpInputStream, result: unknown) => void,
  ) => void;
  read_bytes_finish: (result: unknown) => { get_size: () => number; toArray: () => Uint8Array };
};

export type GioUnixHttpOutputStream = {
  flush_async?: (
    priority: number,
    cancellable: unknown,
    callback: (source: GioUnixHttpOutputStream, result: unknown) => void,
  ) => void;
  flush_finish?: (result: unknown) => boolean;
  write_bytes_async: (
    bytes: unknown,
    priority: number,
    cancellable: unknown,
    callback: (source: GioUnixHttpOutputStream, result: unknown) => void,
  ) => void;
  write_bytes_finish: (result: unknown) => number;
};

export type GioUnixHttpBody =
  | ArrayBuffer
  | Uint8Array
  | Record<string, unknown>
  | readonly unknown[]
  | string
  | null
  | undefined;

export type GioUnixHttpResponseType = "arraybuffer" | "bytes" | "json" | "text";

export type GioUnixHttpRequest = {
  body?: GioUnixHttpBody;
  headers?: HeaderInput;
  host?: string;
  method?: string;
  path?: string;
  responseType?: GioUnixHttpResponseType;
  socketPath: string;
  timeoutMs?: number;
  validateStatus?: (status: number) => boolean;
};

export type GioUnixHttpResponse<T = unknown> = {
  data: T;
  headers: Record<string, string>;
  rawBody: Uint8Array;
  request: {
    bodyLength: number;
    method: string;
    path: string;
    socketPath: string;
  };
  status: number;
  statusText: string;
};

export type GioUnixAxiosAdapterConfig = {
  baseURL?: string;
  data?: GioUnixHttpBody;
  headers?: HeaderInput;
  method?: string;
  params?: Record<string, unknown>;
  paramsSerializer?:
    | ((params: Record<string, unknown>) => string)
    | { serialize?: (params: Record<string, unknown>) => string };
  responseType?: GioUnixHttpResponseType;
  socketPath?: string;
  timeout?: number;
  url?: string;
  validateStatus?: (status: number) => boolean;
};

export type GioUnixAxiosAdapterDefaults = {
  socketPath?: string;
};

const CRLF = "\r\n";
const HEADER_END = "\r\n\r\n";
const DEFAULT_HOST = "localhost";
const READ_CHUNK_SIZE = 64 * 1024;

export function createGioUnixSocketAxiosAdapter(
  toolkit: GioUnixHttpToolkit,
  defaults: GioUnixAxiosAdapterDefaults = {},
) {
  return async function gioUnixSocketAxiosAdapter(config: GioUnixAxiosAdapterConfig) {
    const socketPath = config.socketPath ?? defaults.socketPath;
    if (!socketPath) {
      throw Object.assign(new Error("Gio Unix socket Axios adapter requires config.socketPath."), {
        code: "ERR_REACT_LINUX_SOCKET_PATH",
        config,
      });
    }

    const response = await requestGioUnixHttp(toolkit, {
      body: config.data,
      headers: config.headers,
      method: config.method,
      path: pathFromAxiosConfig(config),
      responseType: config.responseType,
      socketPath,
      timeoutMs: config.timeout,
      validateStatus: config.validateStatus,
    });

    return {
      config,
      data: response.data,
      headers: response.headers,
      request: response.request,
      status: response.status,
      statusText: response.statusText,
    };
  };
}

export async function requestGioUnixHttp<T = unknown>(
  toolkit: GioUnixHttpToolkit,
  request: GioUnixHttpRequest,
): Promise<GioUnixHttpResponse<T>> {
  const method = normalizeMethod(request.method);
  const path = normalizePath(request.path);
  const cancellable = toolkit.Gio.Cancellable ? new toolkit.Gio.Cancellable() : null;
  let timedOut = false;
  const timeoutSourceId =
    cancellable && request.timeoutMs && request.timeoutMs > 0 && toolkit.GLib.timeout_add
      ? toolkit.GLib.timeout_add(priority(toolkit), request.timeoutMs, () => {
          timedOut = true;
          cancellable.cancel?.();
          return toolkit.GLib.SOURCE_REMOVE ?? false;
        })
      : 0;

  let connection: GioUnixHttpConnection | null = null;
  try {
    connection = await connectUnix(toolkit, request.socketPath, cancellable);
    const serialized = serializeGioUnixHttpRequest({
      body: request.body,
      headers: request.headers,
      host: request.host,
      method,
      path,
      socketPath: request.socketPath,
    });

    const output = connection.get_output_stream();
    await writeBytes(toolkit, output, serialized.bytes, cancellable);
    await flush(output, toolkit, cancellable);

    const rawResponse = await readAll(connection.get_input_stream(), toolkit, cancellable);
    const response = parseGioUnixHttpResponse<T>(rawResponse, request.responseType);
    const result = {
      ...response,
      request: {
        bodyLength: serialized.bodyLength,
        method,
        path,
        socketPath: request.socketPath,
      },
    };

    if (request.validateStatus && !request.validateStatus(result.status)) {
      throw Object.assign(new Error(`Request failed with status code ${result.status}`), {
        code: "ERR_BAD_RESPONSE",
        response: result,
      });
    }

    return result;
  } catch (error) {
    if (timedOut) {
      throw Object.assign(new Error(`Gio Unix socket request timed out after ${request.timeoutMs}ms.`), {
        cause: error,
        code: "ETIMEDOUT",
      });
    }
    throw error;
  } finally {
    if (timeoutSourceId) {
      toolkit.GLib.Source?.remove?.(timeoutSourceId);
    }
    if (connection) {
      await closeConnection(connection, toolkit, cancellable);
    }
  }
}

export function serializeGioUnixHttpRequest(
  request: Omit<GioUnixHttpRequest, "responseType" | "timeoutMs" | "validateStatus">,
): {
  bodyLength: number;
  bytes: Uint8Array;
} {
  const headers = normalizeHeaders(request.headers);
  const { bodyBytes, contentType } = encodeBody(request.body);
  if (contentType && !hasHeader(headers, "content-type")) {
    headers["content-type"] = contentType;
  }
  if (bodyBytes.length > 0 && !hasHeader(headers, "content-length")) {
    headers["content-length"] = String(bodyBytes.length);
  }
  if (!hasHeader(headers, "host")) {
    headers.host = request.host ?? DEFAULT_HOST;
  }
  if (!hasHeader(headers, "connection")) {
    headers.connection = "close";
  }
  if (!hasHeader(headers, "accept")) {
    headers.accept = "application/json, text/plain, */*";
  }

  const head = [
    `${normalizeMethod(request.method)} ${normalizePath(request.path)} HTTP/1.1`,
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    "",
    "",
  ].join(CRLF);
  const headBytes = encodeText(head);
  return {
    bodyLength: bodyBytes.length,
    bytes: concatBytes([headBytes, bodyBytes]),
  };
}

export function parseGioUnixHttpResponse<T = unknown>(
  bytes: Uint8Array,
  responseType: GioUnixHttpResponseType = "json",
): Omit<GioUnixHttpResponse<T>, "request"> {
  const headerEnd = indexOfBytes(bytes, encodeText(HEADER_END));
  if (headerEnd < 0) {
    throw new Error("Invalid HTTP response from Unix socket: missing header terminator.");
  }

  const head = decodeText(bytes.slice(0, headerEnd));
  const lines = head.split(CRLF);
  const statusLine = lines.shift() ?? "";
  const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s+(.*))?$/i.exec(statusLine);
  if (!statusMatch) {
    throw new Error(`Invalid HTTP response status line: ${statusLine}`);
  }

  const headers = parseHeaders(lines);
  const encodedBody = bytes.slice(headerEnd + HEADER_END.length);
  const rawBody = headers["transfer-encoding"]?.toLowerCase().includes("chunked")
    ? decodeChunkedBody(encodedBody)
    : encodedBody;

  return {
    data: decodeResponseBody<T>(rawBody, headers, responseType),
    headers,
    rawBody,
    status: Number(statusMatch[1]),
    statusText: statusMatch[2] ?? "",
  };
}

function pathFromAxiosConfig(config: GioUnixAxiosAdapterConfig): string {
  const url = config.url ?? "/";
  const joined = config.baseURL && !isAbsoluteUrl(url) && !url.startsWith("/") ? joinUrlPath(config.baseURL, url) : url;
  const path = stripOrigin(joined);
  const query = paramsToQuery(config.params, config.paramsSerializer);
  if (!query) {
    return path;
  }
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

function paramsToQuery(
  params: Record<string, unknown> | undefined,
  serializer: GioUnixAxiosAdapterConfig["paramsSerializer"],
): string {
  if (!params) {
    return "";
  }
  if (typeof serializer === "function") {
    return trimQueryPrefix(serializer(params));
  }
  if (serializer?.serialize) {
    return trimQueryPrefix(serializer.serialize(params));
  }

  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
    }
  }
  return pairs.join("&");
}

function trimQueryPrefix(query: string): string {
  return query.startsWith("?") ? query.slice(1) : query;
}

function joinUrlPath(baseURL: string, url: string): string {
  return `${baseURL.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(url);
}

function stripOrigin(url: string): string {
  const withoutHash = url.split("#", 1)[0] || "/";
  const schemeIndex = withoutHash.indexOf("://");
  if (schemeIndex < 0) {
    return normalizePath(withoutHash);
  }

  const pathIndex = withoutHash.indexOf("/", schemeIndex + 3);
  return pathIndex < 0 ? "/" : normalizePath(withoutHash.slice(pathIndex));
}

function normalizePath(path: string | undefined): string {
  if (!path) {
    return "/";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeMethod(method: string | undefined): string {
  return (method ?? "GET").toUpperCase();
}

function normalizeHeaders(headers: HeaderInput | undefined): Record<string, string> {
  const raw = typeof headers?.toJSON === "function" ? headers.toJSON(true) : headers;
  const normalized: Record<string, string> = {};
  if (!raw || typeof raw !== "object") {
    return normalized;
  }

  for (const [name, value] of Object.entries(raw as Record<string, HeaderInputValue>)) {
    if (value === null || value === undefined) {
      continue;
    }
    normalized[name.toLowerCase()] = Array.isArray(value) ? value.map(String).join(", ") : String(value);
  }
  return normalized;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.hasOwn(headers, name.toLowerCase());
}

function encodeBody(body: GioUnixHttpBody): { bodyBytes: Uint8Array; contentType: string | null } {
  if (body === null || body === undefined) {
    return { bodyBytes: new Uint8Array(), contentType: null };
  }
  if (typeof body === "string") {
    return { bodyBytes: encodeText(body), contentType: "text/plain;charset=utf-8" };
  }
  if (body instanceof Uint8Array) {
    return { bodyBytes: body, contentType: null };
  }
  if (body instanceof ArrayBuffer) {
    return { bodyBytes: new Uint8Array(body), contentType: null };
  }
  if (ArrayBuffer.isView(body)) {
    return {
      bodyBytes: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
      contentType: null,
    };
  }
  return { bodyBytes: encodeText(JSON.stringify(body)), contentType: "application/json" };
}

function parseHeaders(lines: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const name = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  return headers;
}

function decodeResponseBody<T>(
  body: Uint8Array,
  headers: Record<string, string>,
  responseType: GioUnixHttpResponseType,
): T {
  if (responseType === "bytes") {
    return body as T;
  }
  if (responseType === "arraybuffer") {
    return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as T;
  }

  const text = decodeText(body);
  if (responseType === "text") {
    return text as T;
  }

  if (!text.trim()) {
    return null as T;
  }
  if (responseType === "json" || headers["content-type"]?.toLowerCase().includes("json")) {
    return JSON.parse(text) as T;
  }
  return text as T;
}

function decodeChunkedBody(bytes: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const lineEnd = indexOfBytes(bytes, encodeText(CRLF), offset);
    if (lineEnd < 0) {
      throw new Error("Invalid chunked HTTP response: missing chunk size terminator.");
    }

    const chunkSizeText = decodeText(bytes.slice(offset, lineEnd)).split(";", 1)[0].trim();
    const chunkSize = Number.parseInt(chunkSizeText, 16);
    if (!Number.isFinite(chunkSize)) {
      throw new Error(`Invalid chunked HTTP response size: ${chunkSizeText}`);
    }

    offset = lineEnd + CRLF.length;
    if (chunkSize === 0) {
      return concatBytes(chunks);
    }
    chunks.push(bytes.slice(offset, offset + chunkSize));
    offset += chunkSize + CRLF.length;
  }

  throw new Error("Invalid chunked HTTP response: missing final chunk.");
}

async function connectUnix(
  toolkit: GioUnixHttpToolkit,
  socketPath: string,
  cancellable: unknown,
): Promise<GioUnixHttpConnection> {
  const client = new toolkit.Gio.SocketClient();
  const address = toolkit.Gio.UnixSocketAddress.new(socketPath);
  return new Promise((resolve, reject) => {
    client.connect_async(address, cancellable, (_source, result) => {
      try {
        resolve(client.connect_finish(result));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function writeBytes(
  toolkit: GioUnixHttpToolkit,
  output: GioUnixHttpOutputStream,
  bytes: Uint8Array,
  cancellable: unknown,
): Promise<void> {
  const glibBytes = toolkit.GLib.Bytes.new(bytes);
  await new Promise<void>((resolve, reject) => {
    output.write_bytes_async(glibBytes, priority(toolkit), cancellable, (source, result) => {
      try {
        source.write_bytes_finish(result);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function flush(
  output: GioUnixHttpOutputStream,
  toolkit: GioUnixHttpToolkit,
  cancellable: unknown,
): Promise<void> {
  if (!output.flush_async || !output.flush_finish) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    output.flush_async?.(priority(toolkit), cancellable, (source, result) => {
      try {
        source.flush_finish?.(result);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function readAll(
  input: GioUnixHttpInputStream,
  toolkit: GioUnixHttpToolkit,
  cancellable: unknown,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await new Promise<Uint8Array>((resolve, reject) => {
      input.read_bytes_async(READ_CHUNK_SIZE, priority(toolkit), cancellable, (source, result) => {
        try {
          const bytes = source.read_bytes_finish(result);
          resolve(bytes.toArray());
        } catch (error) {
          reject(error);
        }
      });
    });
    if (chunk.length === 0) {
      return concatBytes(chunks);
    }
    chunks.push(chunk);
  }
}

async function closeConnection(
  connection: GioUnixHttpConnection,
  toolkit: GioUnixHttpToolkit,
  cancellable: unknown,
): Promise<void> {
  if (connection.close_async && connection.close_finish) {
    await new Promise<void>((resolve) => {
      connection.close_async?.(priority(toolkit), cancellable, (source, result) => {
        try {
          source.close_finish?.(result);
        } catch (_error) {
          // The request already completed or failed; close errors are not actionable here.
        }
        resolve();
      });
    });
    return;
  }
  connection.close?.(cancellable);
}

function priority(toolkit: GioUnixHttpToolkit): number {
  return toolkit.GLib.PRIORITY_DEFAULT ?? 0;
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, fromIndex = 0): number {
  if (needle.length === 0) {
    return fromIndex;
  }
  for (let index = fromIndex; index <= haystack.length - needle.length; index += 1) {
    let matches = true;
    for (let needleIndex = 0; needleIndex < needle.length; needleIndex += 1) {
      if (haystack[index + needleIndex] !== needle[needleIndex]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return index;
    }
  }
  return -1;
}
