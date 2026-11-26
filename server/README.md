# Cardroom account server

Run with Node.js 24 from the repository root.

```sh
node server/cardroom.mjs
```

Open http://localhost:3000/cardroom/. In production, put the server behind an HTTPS reverse proxy, set `CARDROOM_ORIGIN` to the exact public origin, and set `CARDROOM_DB` to a file on a persistent volume writable by the process. Use one deployment with access to that SQLite database. Serve the frontend and API on the same origin. GitHub Pages cannot run this server.

Friend requests require an exact nickname and acceptance. Friends can send room invitations from the lobby. Invitations expire after an hour. Game connections still use PeerJS and require the host's room to be open.
