# Unix Socket HTTP

GNOME Shell extensions run in GJS, not Node. That means Axios' built-in
`socketPath` option cannot be used through its Node HTTP adapter inside Shell:
there is no Node `http`, `https`, `net`, or `http.Agent` runtime.

`react-linux` provides a Shell-side Gio transport adapter for HTTP over Unix
sockets:

```ts
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import axios from "axios";
import { createGioUnixSocketAxiosAdapter } from "react-linux/gnome-shell/unix-socket-http";

const api = axios.create({
  adapter: createGioUnixSocketAxiosAdapter({ Gio, GLib }, { socketPath: "/run/user/1000/app.sock" }),
});

const response = await api.get("/v1/state");
```

The adapter is intentionally small and runtime-explicit:

- the extension passes `{ Gio, GLib }`;
- the package does not import `gi://` modules at package load time;
- no browser `fetch`, `Request`, `Response`, `URL`, or Node APIs are required;
- the transport uses `Gio.SocketClient` and `Gio.UnixSocketAddress`.

## Axios Usage

Create one Axios instance per socket:

```ts
const engineApi = axios.create({
  adapter: createGioUnixSocketAxiosAdapter({ Gio, GLib }, { socketPath: "/run/user/1000/podman/podman.sock" }),
  timeout: 5000,
});

const { data } = await engineApi.get("/v5.0.0/libpod/containers/json", {
  params: { all: true },
});
```

Per-request `socketPath` also works:

```ts
const api = axios.create({
  adapter: createGioUnixSocketAxiosAdapter({ Gio, GLib }),
});

await api.get("/v1/state", {
  socketPath: "/run/user/1000/app.sock",
});
```

Supported request options:

- `url`
- `baseURL`
- `method`
- `headers`
- `data`
- `params`
- `paramsSerializer`
- `responseType`: `json`, `text`, `bytes`, or `arraybuffer`
- `socketPath`
- `timeout`
- `validateStatus`

The adapter returns the normal Axios response shape:

```ts
{
  data,
  headers,
  status,
  statusText,
  config,
  request,
}
```

## Direct Usage

If Shell bundle size matters, use the transport without Axios:

```ts
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { requestGioUnixHttp } from "react-linux/gnome-shell/unix-socket-http";

const response = await requestGioUnixHttp({ Gio, GLib }, {
  socketPath: "/run/user/1000/app.sock",
  method: "POST",
  path: "/v1/action",
  body: { id: "example" },
});
```

## Limits

This is an HTTP/1.1 client for local Unix sockets. It is meant for small Shell
integration calls, not for a general HTTP stack.

Supported response bodies:

- `Content-Length`
- connection-close bodies
- `Transfer-Encoding: chunked`

Not supported yet:

- redirects;
- proxy settings;
- TLS;
- streaming progress callbacks;
- multipart/form-data helpers;
- Axios' Node-only options such as `httpAgent`, `httpsAgent`, `maxRedirects`,
  `maxRate`, or Node stream response bodies.

For application-heavy API clients, prefer keeping the larger client on the
Node/Electron side and expose a small Shell integration surface over DBus or a
purpose-built Unix socket endpoint.
