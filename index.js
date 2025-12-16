/**
 * Spotify Recent + Top Tracks Playlist Updater API
 * Author: Sandip Gurung
 */

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const qs = require("qs");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ==== ENV CONFIG ====
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
const API_KEY = process.env.API_KEY;
const PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID;
// ====================

let REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN || "";

// Spotify URLs
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const RECENT_URL =
  "https://api.spotify.com/v1/me/player/recently-played?limit=30";

// Middleware
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- Login Route ---
app.get("/login", (req, res) => {
  const scope =
    "user-read-recently-played user-top-read playlist-modify-private playlist-modify-public";

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope,
    redirect_uri: REDIRECT_URI,
  });

  res.redirect(authUrl.toString());
});

// --- Callback Route ---
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing authorization code.");

  try {
    const data = qs.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    });

    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    };

    const tokenResponse = await axios.post(TOKEN_URL, data, { headers });
    REFRESH_TOKEN = tokenResponse.data.refresh_token || REFRESH_TOKEN;

    console.log("\n✅ REFRESH TOKEN UPDATED:\n", REFRESH_TOKEN, "\n");

    res.send(`
      <html>
      <head>
        <link rel="stylesheet" href="/style.css">
        <title>Spotify Authorization</title>
      </head>
      <body>
        <div class="card">
          <h2>Spotify Authorization Successful ✅</h2>
          <p>Your refresh token has been securely updated in memory.</p>
          <p><a href="/recent-tracks">View Your Recently Played Tracks</a></p>
          <p><a href="/update-top-tracks">Update Your Top Tracks Playlist</a></p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("Failed to fetch refresh token.");
  }
});

// --- Get Access Token using Refresh Token ---
async function getAccessToken() {
  const data = qs.stringify({
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
  });

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization:
      "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
  };

  const response = await axios.post(TOKEN_URL, data, { headers });
  return response.data.access_token;
}

// --- Fetch Recently Played Tracks (Detailed) ---
app.get("/recent-tracks", async (req, res) => {
  try {
    const token = await getAccessToken();
    const response = await axios.get(RECENT_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const tracks = response.data.items.map((item) => {
      const t = item.track;
      return {
        played_at: item.played_at,
        id: t.id,
        track_name: t.name,
        artists: t.artists.map((a) => ({
          name: a.name,
          id: a.id,
          url: a.external_urls.spotify,
        })),
        album: {
          name: t.album.name,
          id: t.album.id,
          release_date: t.album.release_date,
          total_tracks: t.album.total_tracks,
          image: t.album.images[0]?.url,
          url: t.album.external_urls.spotify,
        },
        duration_ms: t.duration_ms,
        duration_min: (t.duration_ms / 60000).toFixed(2),
        explicit: t.explicit,
        popularity: t.popularity,
        preview_url: t.preview_url,
        external_url: t.external_urls.spotify,
        available_markets: t.available_markets?.length || 0,
      };
    });

    console.log(`✅ Fetched ${tracks.length} recently played tracks.`);
    res.json({ success: true, total: tracks.length, tracks });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ success: false, error: "Failed to fetch recent tracks" });
  }
});

// --- Update Top Tracks Playlist ---
app.get("/update-top-tracks", async (req, res) => {
  try {
    const token = await getAccessToken();

    const topResponse = await axios.get(
      "https://api.spotify.com/v1/me/top/tracks?limit=5&time_range=short_term",
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const trackUris = topResponse.data.items.map((t) => t.uri);

    await axios.put(
      `https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/tracks`,
      { uris: trackUris },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log(
      `🎵 Successfully updated playlist ${PLAYLIST_ID} with ${trackUris.length} top tracks`
    );

    res.json({
      success: true,
      message: "Top Tracks Playlist has been successfully updated!",
      playlist_id: PLAYLIST_ID,
      total_tracks: trackUris.length,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: "Failed to update top tracks playlist",
      playlist_id: PLAYLIST_ID,
    });
  }
});

// --- Root Route ---
app.get("/", (req, res) => {
  const providedKey = req.query.key;
  const isValidKey = providedKey === API_KEY;

  const displayToken = isValidKey
    ? REFRESH_TOKEN
    : REFRESH_TOKEN
      ? REFRESH_TOKEN.slice(0, 10) + "..."
      : "Not available";

  res.send(`
    <html>
    <head>
      <link rel="stylesheet" href="/style.css">
      <title>Sandip's Spotify API</title>
    </head>
    <body>
      <div class="card">
        <h1>Sandip's Spotify API</h1>
        <p>Welcome! Use the links below to interact with your Spotify account:</p>
        <ul>
          <li><a href="/login">Login with Spotify</a></li>
          <li><a href="/recent-tracks">View Your Recently Played Tracks</a></li>
          <li><a href="/update-top-tracks">Update Your Top Tracks Playlist</a></li>
        </ul>
        <p><strong>Playlist ID:</strong> ${PLAYLIST_ID}</p>
        <p><strong>Refresh Token:</strong> ${displayToken}</p>
        ${
          !isValidKey && REFRESH_TOKEN
            ? `<p><em>💡 Tip: Add <code>?key=YOUR_API_KEY</code> to view the full refresh token.</em></p>`
            : ""
        }
      </div>
    </body>
    </html>
  `);
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log("👉 Visit /login to authorize your Spotify account.");
  console.log("ℹ️ Refresh token will be updated automatically after first login.");
});
