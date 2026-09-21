import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../config/env.js";
import { pool } from "../../../db/pool.js";
import { signInWithEmail } from "../../auth/__tests__/helpers.js";
import { attachRealtime } from "../../../realtime/index.js";
import {
  createLink,
  inviteByEmail,
  listAccessForOwner,
  redeemShareLink,
  removeCollaborator,
  revokeLink,
} from "../sharing.service.js";
import { getUserRole } from "../../../db/queries/documents.js";

describe("sharing", () => {
  let server: HttpServer;
  let baseUrl: string;
  let documentId: string;
  let ownerId: string;
  const userIds: string[] = [];
  const emails: string[] = [];
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const owner = await pool.query<{ id: string }>(
      "INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id",
      ["sharing-owner@test.local", "Sharing Owner"],
    );
    ownerId = owner.rows[0]!.id;
    userIds.push(ownerId);
    emails.push("sharing-owner@test.local");

    const doc = await pool.query<{ id: string }>(
      "INSERT INTO documents (owner_id) VALUES ($1) RETURNING id",
      [ownerId],
    );
    documentId = doc.rows[0]!.id;

    server = createServer();
    attachRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.query("DELETE FROM documents WHERE id = $1", [documentId]);
    await pool.query("DELETE FROM users WHERE id = ANY($1)", [userIds]);
  });

  function tokenFor(userId: string): string {
    return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "5m" });
  }

  function connectAndJoin(userId: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = ioClient(baseUrl, { auth: { token: tokenFor(userId) } });
      sockets.push(socket);
      socket.on("connect_error", reject);
      socket.on("connect", () => socket.emit("document:join", { documentId }));
      socket.once("document:joined", () => resolve(socket));
      socket.once("document:error", (payload) => reject(new Error(payload.message)));
    });
  }

  it("FR-19: invites a not-yet-registered email, then resolves on registration", async () => {
    const email = "sharing-pending@test.local";
    emails.push(email);

    const invited = await inviteByEmail(documentId, ownerId, email, "editor");
    expect(invited.pending).toBe(true);
    expect(invited.userId).toBeNull();

    const listBefore = await listAccessForOwner(documentId, ownerId);
    expect(listBefore.find((a) => a.email === email)?.pending).toBe(true);

    const user = (await signInWithEmail(email)).user;
    userIds.push(user.id);

    const role = await getUserRole(documentId, user.id);
    expect(role).toBe("editor");

    const listAfter = await listAccessForOwner(documentId, ownerId);
    const resolved = listAfter.find((a) => a.email === email);
    expect(resolved?.pending).toBe(false);
    expect(resolved?.userId).toBe(user.id);
  });

  it("FR-18/FR-21: a share link grants the role it was created with on redeem", async () => {
    const email = "sharing-linkredeem@test.local";
    emails.push(email);
    const user = (await signInWithEmail(email)).user;
    userIds.push(user.id);

    const link = await createLink(documentId, ownerId, "viewer");
    const summary = await redeemShareLink(link.token, user.id);
    expect(summary.role).toBe("viewer");

    const role = await getUserRole(documentId, user.id);
    expect(role).toBe("viewer");
  });

  it("FR-20/FR-22: revoking a link invalidates it with a distinct error, not a generic one", async () => {
    const email = "sharing-revoked@test.local";
    emails.push(email);
    const user = (await signInWithEmail(email)).user;
    userIds.push(user.id);

    const link = await createLink(documentId, ownerId, "viewer");
    await revokeLink(documentId, ownerId, link.token);

    await expect(redeemShareLink(link.token, user.id)).rejects.toMatchObject({ code: "SHARE_LINK_REVOKED" });
    await expect(redeemShareLink("not-a-real-token", user.id)).rejects.toMatchObject({
      code: "SHARE_LINK_INVALID",
    });
  });

  it("FR-14: removing a collaborator disconnects their live session within one round trip", async () => {
    const email = "sharing-kicked@test.local";
    emails.push(email);
    const user = (await signInWithEmail(email)).user;
    userIds.push(user.id);

    await inviteByEmail(documentId, ownerId, email, "editor");
    const socket = await connectAndJoin(user.id);

    const revokedEvent = new Promise((resolve) => socket.once("document:access-revoked", resolve));
    const disconnected = new Promise((resolve) => socket.once("disconnect", resolve));

    await removeCollaborator(documentId, ownerId, user.id);

    await revokedEvent;
    await disconnected;
    expect(socket.connected).toBe(false);

    const role = await getUserRole(documentId, user.id);
    expect(role).toBeNull();
  });

  it("non-owner cannot manage sharing", async () => {
    const email = "sharing-nonowner@test.local";
    emails.push(email);
    const user = (await signInWithEmail(email)).user;
    userIds.push(user.id);
    await inviteByEmail(documentId, ownerId, email, "viewer");

    await expect(inviteByEmail(documentId, user.id, "someone@test.local", "editor")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
