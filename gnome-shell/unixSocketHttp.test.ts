import { describe, expect, it } from "vitest";

import {
  createGioUnixSocketAxiosAdapter,
  type GioUnixHttpToolkit,
  parseGioUnixHttpResponse,
  serializeGioUnixHttpRequest,
} from "./unixSocketHttp";

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function fakeToolkit(response: string): { requests: string[]; toolkit: GioUnixHttpToolkit } {
  const requests: string[] = [];

  class FakeBytes {
    private readonly value: Uint8Array;

    constructor(value: Uint8Array) {
      this.value = value;
    }

    get_size() {
      return this.value.length;
    }

    toArray() {
      return this.value;
    }
  }

  class FakeInputStream {
    private didRead = false;

    read_bytes_async(
      _count: number,
      _priority: number,
      _cancellable: unknown,
      callback: (source: this, result: unknown) => void,
    ) {
      queueMicrotask(() => callback(this, null));
    }

    read_bytes_finish() {
      if (this.didRead) {
        return new FakeBytes(new Uint8Array());
      }
      this.didRead = true;
      return new FakeBytes(bytes(response));
    }
  }

  class FakeOutputStream {
    flush_async(_priority: number, _cancellable: unknown, callback: (source: this, result: unknown) => void) {
      queueMicrotask(() => callback(this, null));
    }

    flush_finish() {
      return true;
    }

    write_bytes_async(
      value: unknown,
      _priority: number,
      _cancellable: unknown,
      callback: (source: this, result: unknown) => void,
    ) {
      requests.push(text((value as FakeBytes).toArray()));
      queueMicrotask(() => callback(this, null));
    }

    write_bytes_finish() {
      return 1;
    }
  }

  class FakeConnection {
    close_async(_priority: number, _cancellable: unknown, callback: (source: this, result: unknown) => void) {
      queueMicrotask(() => callback(this, null));
    }

    close_finish() {
      return true;
    }

    get_input_stream() {
      return new FakeInputStream();
    }

    get_output_stream() {
      return new FakeOutputStream();
    }
  }

  return {
    requests,
    toolkit: {
      Gio: {
        SocketClient: class {
          connect_async(
            _address: unknown,
            _cancellable: unknown,
            callback: (source: unknown, result: unknown) => void,
          ) {
            queueMicrotask(() => callback(this, null));
          }

          connect_finish() {
            return new FakeConnection();
          }
        },
        UnixSocketAddress: {
          new: (path: string) => ({ path }),
        },
      },
      GLib: {
        Bytes: {
          new: (value: Uint8Array) => new FakeBytes(value),
        },
        PRIORITY_DEFAULT: 0,
      },
    },
  };
}

describe("Gio Unix socket HTTP adapter", () => {
  it("serializes HTTP requests without Node or browser transports", () => {
    const request = serializeGioUnixHttpRequest({
      body: { all: true },
      headers: { Authorization: "Bearer test" },
      method: "post",
      path: "containers/json",
      socketPath: "/run/user/1000/podman/podman.sock",
    });

    expect(text(request.bytes)).toBe(
      [
        "POST /containers/json HTTP/1.1",
        "authorization: Bearer test",
        "content-type: application/json",
        "content-length: 12",
        "host: localhost",
        "connection: close",
        "accept: application/json, text/plain, */*",
        "",
        '{"all":true}',
      ].join("\r\n"),
    );
    expect(request.bodyLength).toBe(12);
  });

  it("parses JSON and chunked HTTP responses", () => {
    const response = parseGioUnixHttpResponse(
      bytes(
        [
          "HTTP/1.1 200 OK",
          "Content-Type: application/json",
          "Transfer-Encoding: chunked",
          "",
          "7",
          '{"ok":1',
          "1",
          "}",
          "0",
          "",
          "",
        ].join("\r\n"),
      ),
    );

    expect(response.status).toBe(200);
    expect(response.statusText).toBe("OK");
    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.data).toEqual({ ok: 1 });
  });

  it("maps Axios-style config to a Gio Unix socket HTTP request", async () => {
    const { requests, toolkit } = fakeToolkit(
      ["HTTP/1.1 201 Created", "Content-Type: application/json", "Content-Length: 13", "", '{"ready":true}'].join(
        "\r\n",
      ),
    );
    const adapter = createGioUnixSocketAxiosAdapter(toolkit, { socketPath: "/tmp/app.sock" });

    const response = await adapter({
      data: "hello",
      headers: { "X-Test": "yes" },
      method: "put",
      params: { verbose: true },
      responseType: "json",
      url: "/v1/state",
    });

    expect(response.status).toBe(201);
    expect(response.data).toEqual({ ready: true });
    expect(response.request.socketPath).toBe("/tmp/app.sock");
    expect(requests[0]).toContain("PUT /v1/state?verbose=true HTTP/1.1");
    expect(requests[0]).toContain("x-test: yes");
    expect(requests[0]).toContain("\r\n\r\nhello");
  });

  it("rejects invalid statuses when validateStatus returns false", async () => {
    const { toolkit } = fakeToolkit(["HTTP/1.1 500 Broken", "Content-Length: 0", "", ""].join("\r\n"));
    const adapter = createGioUnixSocketAxiosAdapter(toolkit, { socketPath: "/tmp/app.sock" });

    await expect(
      adapter({
        url: "/broken",
        validateStatus: (status) => status < 500,
      }),
    ).rejects.toMatchObject({
      code: "ERR_BAD_RESPONSE",
      response: { status: 500 },
    });
  });
});
