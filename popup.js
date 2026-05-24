/**
 * IPL Live Score — Chrome Extension (Manifest V3)
 *
 * Fetches cricket match data from CricAPI and displays IPL scores.
 * Uses the browser SpeechSynthesis API for spoken commentary.
 *
 * FREE API KEY: Sign up at https://www.cricapi.com/ and paste your key below.
 * Without a key, demo sample data is shown so you can still test the UI.
 */

// ——— Configuration ———
// Replace with your free API key from https://www.cricapi.com/
const CRICAPI_KEY = "YOUR_API_KEY_HERE";

const CRICAPI_URL = "https://api.cricapi.com/v1/currentMatches";

// Demo data used when no API key is set or the request fails
const DEMO_MATCH = {
  name: "Mumbai Indians vs Chennai Super Kings",
  status: "Demo mode — add your CricAPI key in popup.js",
  venue: "Wankhede Stadium, Mumbai",
  isLive: true,
  scores: [
    { team: "Mumbai Indians", runs: 178, wickets: 4, overs: 20 },
    { team: "Chennai Super Kings", runs: 142, wickets: 6, overs: 17.3 },
  ],
};

// ——— DOM elements ———
const loadingEl = document.getElementById("loading");
const messageEl = document.getElementById("message");
const scoreCardEl = document.getElementById("score-card");
const matchNameEl = document.getElementById("match-name");
const matchStatusEl = document.getElementById("match-status");
const venueEl = document.getElementById("venue");
const scoresEl = document.getElementById("scores");
const refreshBtn = document.getElementById("refresh-btn");
const speakBtn = document.getElementById("speak-btn");

// Holds the latest match data for UI and speech
let currentMatch = null;

// ——— Startup ———
document.addEventListener("DOMContentLoaded", () => {
  loadScores();
  refreshBtn.addEventListener("click", loadScores);
  speakBtn.addEventListener("click", speakCommentary);
});

/**
 * Main flow: show loading, fetch data, update the popup.
 */
async function loadScores() {
  setLoading(true);
  hideMessage();
  scoreCardEl.hidden = true;
  speakBtn.disabled = true;
  currentMatch = null;

  try {
    const match = await fetchIplMatch();
    currentMatch = match;
    renderMatch(match);
    speakBtn.disabled = false;
  } catch (error) {
    showMessage(error.message || "Could not load scores.", "error");
  } finally {
    setLoading(false);
  }
}

/**
 * Fetch live matches from CricAPI and pick the first IPL-related match.
 * Falls back to demo data if no API key or network error.
 */
async function fetchIplMatch() {
  const hasApiKey =
    CRICAPI_KEY && CRICAPI_KEY !== "YOUR_API_KEY_HERE" && CRICAPI_KEY.trim();

  if (!hasApiKey) {
    showMessage(
      "Using demo data. Add your free CricAPI key in popup.js for live scores.",
      "info"
    );
    return normalizeMatch(DEMO_MATCH);
  }

  const url = `${CRICAPI_URL}?apikey=${encodeURIComponent(CRICAPI_KEY)}&offset=0`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API error (${response.status}). Check your API key.`);
  }

  const json = await response.json();

  if (json.status !== "success" && json.status !== "ok") {
    throw new Error(json.reason || json.message || "API returned an error.");
  }

  const matches = json.data || [];
  const iplMatch = findIplMatch(matches);

  if (!iplMatch) {
    showMessage("No live IPL match right now. Showing latest IPL fixture.", "info");
    const anyIpl = matches.find((m) => isIplMatch(m));
    if (anyIpl) {
      return normalizeCricApiMatch(anyIpl);
    }
    throw new Error("No IPL matches found in the current list.");
  }

  return normalizeCricApiMatch(iplMatch);
}

/**
 * True if match name or series mentions IPL / Indian Premier League.
 */
function isIplMatch(match) {
  const text = [
    match.name,
    match.series,
    match.series_id,
    match.teams?.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("ipl") || text.includes("indian premier league");
}

/**
 * Prefer a match that is in progress; otherwise any IPL match.
 */
function findIplMatch(matches) {
  const ipl = matches.filter(isIplMatch);
  const live = ipl.find((m) => isLiveStatus(m.status));
  return live || ipl[0] || null;
}

function isLiveStatus(status) {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s.includes("live") ||
    s.includes("progress") ||
    s.includes("innings") ||
    s.includes("stumps") ||
    s.includes("lunch") ||
    s.includes("tea") ||
    s.includes("drinks")
  );
}

/**
 * Convert CricAPI match object into our simple format for the UI.
 */
function normalizeCricApiMatch(match) {
  const scores = [];

  if (Array.isArray(match.score)) {
    for (const inning of match.score) {
      const teamLabel = inning.inning || inning.team || "Innings";
      scores.push({
        team: teamLabel.replace(/ innings.*/i, "").trim() || teamLabel,
        runs: inning.r ?? inning.runs ?? 0,
        wickets: inning.w ?? inning.wickets ?? 0,
        overs: inning.o ?? inning.overs ?? "—",
      });
    }
  }

  if (scores.length === 0 && match.teams?.length) {
    for (const team of match.teams) {
      scores.push({ team, runs: "—", wickets: "—", overs: "—" });
    }
  }

  return {
    name: match.name || "IPL Match",
    status: match.status || "Status unknown",
    venue: match.venue || "",
    isLive: isLiveStatus(match.status),
    scores,
  };
}

function normalizeMatch(data) {
  return {
    name: data.name,
    status: data.status,
    venue: data.venue,
    isLive: data.isLive,
    scores: data.scores || [],
  };
}

/**
 * Paint match data onto the popup.
 */
function renderMatch(match) {
  matchNameEl.textContent = match.name;
  matchStatusEl.textContent = match.status;
  matchStatusEl.classList.toggle("not-live", !match.isLive);
  venueEl.textContent = match.venue || "";
  venueEl.hidden = !match.venue;

  scoresEl.innerHTML = "";

  for (const row of match.scores) {
    const div = document.createElement("div");
    div.className = "score-row";

    const runs =
      typeof row.runs === "number"
        ? `${row.runs}/${row.wickets} (${row.overs} ov)`
        : `${row.runs}`;

    div.innerHTML = `
      <span class="score-team">${escapeHtml(row.team)}</span>
      <span class="score-detail">${escapeHtml(String(runs))}</span>
    `;
    scoresEl.appendChild(div);
  }

  scoreCardEl.hidden = false;
}

/**
 * Build a short commentary string and read it aloud with SpeechSynthesis.
 */
function speakCommentary() {
  if (!currentMatch) return;

  // Stop any ongoing speech before starting new commentary
  window.speechSynthesis.cancel();

  const text = buildCommentaryText(currentMatch);
  const utterance = new SpeechSynthesisUtterance(text);

  utterance.rate = 0.95;
  utterance.pitch = 1;
  utterance.volume = 1;

  // Prefer an English voice when available
  const voices = window.speechSynthesis.getVoices();
  const english =
    voices.find((v) => v.lang.startsWith("en") && v.localService) ||
    voices.find((v) => v.lang.startsWith("en"));
  if (english) {
    utterance.voice = english;
  }

  utterance.onstart = () => {
    speakBtn.disabled = true;
    speakBtn.textContent = "Speaking…";
  };

  utterance.onend = utterance.onerror = () => {
    speakBtn.disabled = false;
    speakBtn.textContent = "Speak Commentary";
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Create natural-language commentary from match data.
 */
function buildCommentaryText(match) {
  const parts = [
    "Welcome to IPL Live Score.",
    `Match: ${match.name}.`,
    `Status: ${match.status}.`,
  ];

  if (match.venue) {
    parts.push(`Venue: ${match.venue}.`);
  }

  for (const row of match.scores) {
    if (typeof row.runs === "number") {
      parts.push(
        `${row.team}: ${row.runs} for ${row.wickets} in ${row.overs} overs.`
      );
    } else {
      parts.push(`${row.team}: score not available yet.`);
    }
  }

  parts.push("That is your IPL update. Enjoy the match!");
  return parts.join(" ");
}

// ——— UI helpers ———

function setLoading(show) {
  loadingEl.hidden = !show;
  refreshBtn.disabled = show;
}

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.hidden = false;
}

function hideMessage() {
  messageEl.hidden = true;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Chrome may load voices asynchronously; refresh list when ready
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}
