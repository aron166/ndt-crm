import net from "node:net";

export interface FakeSmtp {
  port: number;
  messages: { from: string; to: string[]; data: string }[];
  authUsers: string[];
  close(): Promise<void>;
}

/** Minimal SMTP server on 127.0.0.1 for tests. No STARTTLS, no real network. */
export async function startFakeSmtp(opts: { rejectAuth?: boolean; dropAfterData?: boolean } = {}): Promise<FakeSmtp> {
  const messages: FakeSmtp["messages"] = [];
  const authUsers: string[] = [];
  const sockets = new Set<net.Socket>();

  const b64 = (s: string) => Buffer.from(s, "base64").toString("utf8");
  const authDone = (sock: net.Socket, user: string) => {
    if (opts.rejectAuth) return sock.write("535 5.7.8 Authentication failed\r\n");
    authUsers.push(user);
    sock.write("235 2.7.0 OK\r\n");
  };

  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => {});
    let buf = "";
    let mode: "cmd" | "data" | "login-user" | "login-pass" = "cmd";
    let loginUser = "";
    let cur: { from: string; to: string[] } = { from: "", to: [] };
    let dataLines: string[] = [];
    sock.write("220 fake ESMTP\r\n");

    const handle = (line: string) => {
      if (mode === "data") {
        if (line === ".") {
          messages.push({ ...cur, data: dataLines.join("\r\n") });
          dataLines = [];
          mode = "cmd";
          if (opts.dropAfterData) return void sock.destroy(); // accepted the data, never says 250
          sock.write("250 2.0.0 queued\r\n");
        } else {
          dataLines.push(line.startsWith("..") ? line.slice(1) : line);
        }
        return;
      }
      if (mode === "login-user") {
        loginUser = b64(line);
        mode = "login-pass";
        return void sock.write("334 UGFzc3dvcmQ6\r\n");
      }
      if (mode === "login-pass") {
        mode = "cmd";
        return authDone(sock, loginUser);
      }
      const up = line.toUpperCase();
      if (up.startsWith("EHLO")) sock.write("250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n");
      else if (up.startsWith("HELO")) sock.write("250 fake\r\n");
      else if (up.startsWith("AUTH PLAIN")) {
        const arg = line.slice(10).trim();
        // PLAIN: authzid NUL user NUL pass
        authDone(sock, b64(arg).split("\0")[1] ?? "");
      } else if (up.startsWith("AUTH LOGIN")) {
        mode = "login-user";
        sock.write("334 VXNlcm5hbWU6\r\n");
      } else if (up.startsWith("MAIL FROM")) {
        cur = { from: /<([^>]*)>/.exec(line)?.[1] ?? "", to: [] };
        sock.write("250 OK\r\n");
      } else if (up.startsWith("RCPT TO")) {
        cur.to.push(/<([^>]*)>/.exec(line)?.[1] ?? "");
        sock.write("250 OK\r\n");
      } else if (up === "DATA") {
        mode = "data";
        sock.write("354 go ahead\r\n");
      } else if (up === "RSET" || up === "NOOP") sock.write("250 OK\r\n");
      else if (up === "QUIT") sock.end("221 bye\r\n");
      else sock.write("502 unsupported\r\n");
    };

    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i: number;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        handle(line);
      }
    });
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    messages,
    authUsers,
    close: () =>
      new Promise<void>((r) => {
        for (const s of sockets) s.destroy();
        server.close(() => r());
      }),
  };
}
