// Общий сид состояния для снимков и замеров экрана наград.
// Формат — тот, что пишет js/app.js (localStorage "savelyState").
(function () {
  const days = {};
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    days[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`] = 40;
  }
  const st = {
    user: { name: "Мила", id: 1 },
    level: "B1", vocabEstimate: 2100, xp: 1420, goal: 50,
    activity: days,
    blitzBest: 180,
    dictionary: Array.from({ length: 160 }, (_, i) => ({
      w: "word" + i, t: "слово" + i, ex: "", level: "A2",
      status: i < 150 ? "learned" : "learning", knew: 2, forgot: 0,
    })),
    achievements: [
      "first-word", "first-lesson", "level-known",
      "words-10", "words-50", "words-150", "collector-50",
      "xp-100", "xp-1000",
      "streak-3", "streak-7", "streak-30", "goal-1",
      "perfect-1", "exercises-25",
      "blitz-100",
      "hw-1", "chat-10",
      "early-bird",
    ],
    counters: { exercises: 30, perfect: 3, homework: 3, chat: 14, goalsHit: 3, earlyBird: 1 },
    modesTried: ["flashcards", "picture", "matching", "mcq", "spelling", "blitz", "oddone", "scramble"],
    folders: [], trainFolders: [], trainWords: [], recommendSeen: [],
    leaderboard: [], taskResults: {}, levelStats: {},
  };
  localStorage.setItem("savelyState", JSON.stringify(st));
  const theme = new URLSearchParams(location.search).get("theme");
  if (theme) localStorage.setItem("savelyTheme", theme);
})();
