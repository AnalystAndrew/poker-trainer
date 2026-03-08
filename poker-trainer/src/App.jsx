import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];
const RANK_VAL = { A:14,K:13,Q:12,J:11,T:10,9:9,8:8,7:7,6:6,5:5,4:4,3:3,2:2 };
const isRed = s => s === "♥" || s === "♦";
const HAND_NAMES = ["High Card","One Pair","Two Pair","Three of a Kind","Straight","Flush","Full House","Four of a Kind","Straight Flush"];

// ─── Card Logic ───────────────────────────────────────────────────────────────
function buildDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d;
}
function shuffle(d) {
  const a = [...d];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function choose5(cards) {
  const result = [];
  const n = cards.length;
  for (let a = 0; a < n-4; a++)
    for (let b = a+1; b < n-3; b++)
      for (let c = b+1; c < n-2; c++)
        for (let d = c+1; d < n-1; d++)
          for (let e = d+1; e < n; e++)
            result.push([cards[a],cards[b],cards[c],cards[d],cards[e]]);
  return result;
}
function isStraight(vals) {
  const u = [...new Set(vals)];
  if (u.length < 5) return false;
  if (u[0] - u[4] === 4) return true;
  if (u[0]===14&&u[1]===5&&u[2]===4&&u[3]===3&&u[4]===2) return true;
  return false;
}
function score5(cards) {
  const vals = cards.map(c => RANK_VAL[c.rank]).sort((a,b) => b-a);
  const suits = cards.map(c => c.suit);
  const flush = suits.every(s => s === suits[0]);
  const straight = isStraight(vals);
  const counts = {};
  for (const v of vals) counts[v] = (counts[v]||0)+1;
  const groups = Object.entries(counts).sort((a,b) => b[1]-a[1] || b[0]-a[0]);
  const grouped = groups.map(g => parseInt(g[0]));
  const freqs = groups.map(g => g[1]);
  let handRank;
  if (flush && straight) handRank = 8;
  else if (freqs[0]===4) handRank = 7;
  else if (freqs[0]===3 && freqs[1]===2) handRank = 6;
  else if (flush) handRank = 5;
  else if (straight) handRank = 4;
  else if (freqs[0]===3) handRank = 3;
  else if (freqs[0]===2 && freqs[1]===2) handRank = 2;
  else if (freqs[0]===2) handRank = 1;
  else handRank = 0;
  const tb = grouped.slice(0,5);
  while (tb.length < 5) tb.push(0);
  return handRank * 1e10 + tb[0]*1e8 + tb[1]*1e6 + tb[2]*1e4 + tb[3]*100 + tb[4];
}
function getBestHand(hole, board) {
  const all = [...hole, ...board];
  if (all.length < 5) return null;
  const combos = choose5(all);
  let best = -1, bestRank = -1;
  for (const c of combos) {
    const s = score5(c);
    if (s > best) { best = s; bestRank = Math.floor(s / 1e10); }
  }
  return { name: HAND_NAMES[bestRank], rank: bestRank, score: best };
}

// ─── Draw Detection ───────────────────────────────────────────────────────────
function detectDraws(hole, board) {
  const all = [...hole, ...board];
  const draws = [];
  // Flush draw: 4 cards of same suit
  for (const suit of SUITS) {
    const count = all.filter(c => c.suit === suit).length;
    const holeCount = hole.filter(c => c.suit === suit).length;
    if (count === 4 && holeCount >= 1) draws.push("flush draw");
  }
  // Open-ended straight draw: 4 consecutive ranks
  const vals = [...new Set(all.map(c => RANK_VAL[c.rank]))].sort((a,b) => b-a);
  for (let i = 0; i < vals.length - 3; i++) {
    if (vals[i] - vals[i+3] === 3) { draws.push("open-ended straight draw"); break; }
  }
  return [...new Set(draws)];
}

// ─── Monte Carlo (lightweight, 3000 iters for speed) ─────────────────────────
function quickOdds(hole, board, opponents=1) {
  const dead = [...hole, ...board];
  const remaining = buildDeck().filter(c => !dead.some(d => d.rank===c.rank && d.suit===c.suit));
  const needed = 5 - board.length;
  let wins = 0, total = 0;
  const iters = 3000;
  for (let i = 0; i < iters; i++) {
    const deck = shuffle(remaining);
    let idx = 0;
    const runBoard = [...board, ...deck.slice(idx, idx+needed)];
    idx += needed;
    const myScore = score5Best([...hole, ...runBoard]);
    let lost = false;
    for (let o = 0; o < opponents; o++) {
      const oh = deck.slice(idx, idx+2); idx += 2;
      if (oh.length < 2) break;
      if (score5Best([...oh, ...runBoard]) > myScore) { lost = true; break; }
    }
    if (!lost) wins++;
    total++;
  }
  return Math.round((wins/total)*100);
}
function score5Best(cards) {
  if (cards.length < 5) return -1;
  const combos = choose5(cards);
  let best = -1;
  for (const c of combos) { const s = score5(c); if (s > best) best = s; }
  return best;
}

// ─── Question Generators ──────────────────────────────────────────────────────
// Each returns { hole, board, question, options, correctIndex, explanation, concept }

function genHandRecognition() {
  const deck = shuffle(buildDeck());
  const hole = deck.slice(0,2);
  const board = deck.slice(2,5);
  const result = getBestHand(hole, board);
  // Generate 3 wrong answers from the same tier
  const allHands = [...HAND_NAMES];
  const wrong = allHands.filter(h => h !== result.name);
  const shuffledWrong = shuffle(wrong).slice(0,3);
  const options = shuffle([result.name, ...shuffledWrong]);
  return {
    hole, board,
    question: "What is your best hand with these cards?",
    options,
    correctIndex: options.indexOf(result.name),
    explanation: `Your hole cards plus the board make a ${result.name}. In Hold'em you always use the best 5-card combination from your 2 hole cards and 5 board cards.`,
    concept: "Hand Recognition",
    difficulty: "beginner",
  };
}

function genShouldYouCall() {
  const deck = shuffle(buildDeck());
  const hole = deck.slice(0,2);
  const board = deck.slice(2,5);

  const opponentCounts = [
    { n: 1, label: "heads-up (1 opponent remaining)" },
    { n: 2, label: "3-handed (2 opponents remaining)" },
    { n: 4, label: "5-handed (4 opponents remaining)" },
  ];
  const oppChoice = opponentCounts[Math.floor(Math.random() * opponentCounts.length)];
  const winPct = quickOdds(hole, board, oppChoice.n);

  const scenarios = [
    { potOdds: 20, callAmt: 20, potBefore: 80 },
    { potOdds: 33, callAmt: 50, potBefore: 100 },
    { potOdds: 15, callAmt: 15, potBefore: 85 },
    { potOdds: 40, callAmt: 40, potBefore: 60 },
    { potOdds: 25, callAmt: 25, potBefore: 75 },
  ];
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  const draws = detectDraws(hole, board);
  const handResult = getBestHand(hole, board);
  const hasDraw = draws.length > 0;
  const isMadeHand = handResult && handResult.rank >= 1;
  const isStrongMade = handResult && handResult.rank >= 2;
  const hasNothing = !isMadeHand && !hasDraw;

  // Board analysis
  const boardRanks = board.map(c => c.rank);
  const boardRankCounts = {};
  for (const r of boardRanks) boardRankCounts[r] = (boardRankCounts[r] || 0) + 1;
  const boardPaired = new Set(boardRanks).size < board.length;
  const boardHasAce = boardRanks.includes("A");
  const boardHasHighCard = boardRanks.includes("K") || boardRanks.includes("Q");
  const dangerousBoard = boardPaired || boardHasAce;

  // Detect if our "trips" are actually just playing a paired board (everyone has the same pair)
  // e.g. board is A-A-Q and we hold K-2 — we have "trip aces" but so does everyone else
  // True trips = we hold a card that matches a single board pair (e.g. we hold A on an A-x-x board)
  const boardPairRank = Object.entries(boardRankCounts).find(([r, c]) => c >= 2)?.[0];
  const holeRanks = hole.map(c => c.rank);
  const weHoldBoardPairCard = boardPairRank && holeRanks.includes(boardPairRank);
  // Playing-the-board trips: our best hand is trips but we don't hold the paired rank ourselves
  const isPlayingBoardTrips = handResult && handResult.rank === 3 && boardPairRank && !weHoldBoardPairCard;
  // True trips or better: we personally contributed to the hand (hold the pair card, or have straight/flush/boat/quads)
  const isTrueTripsOrBetter = handResult && handResult.rank >= 3 && !isPlayingBoardTrips;
  // Full house or better always strong regardless
  const isFullHouseOrBetter = handResult && handResult.rank >= 6;

  const raiseTo = scenario.callAmt * 3;
  const raiseToLow = Math.round(scenario.callAmt * 2.5);

  const equityCaveat = `Important: this ${winPct}% is raw card equity — it assumes your opponent holds random cards. In reality, a player who bets likely has a strong range. Your true equity against a betting opponent is often lower than the simulation shows.`;

  let correctAnswer, explanation, options, difficulty;

  if (isPlayingBoardTrips && boardPaired && (boardHasAce || boardHasHighCard)) {
    // Key scenario: board is paired with high cards, everyone plays the same "trips"
    // A bettor here almost always has a full house, better kicker, or the actual trips
    correctAnswer = "Fold";
    options = ["Call", "Raise", "Fold"];
    difficulty = "advanced";
    explanation = `This is a trap hand. You have trip ${boardPairRank}s, but so does every opponent — it's the board's pair, not yours. On a board like this, when someone bets, they're almost never doing it with just a kicker — they're representing a full house (e.g. holding a ${boardPairRank} themselves for quads, or a matching card for a boat) or a better kicker than yours. Your K kicker is strong, but it loses to anyone holding an ${boardPairRank}, and full houses beat trips entirely. Fold to a bet on this board unless you have a read that your opponent is bluffing. ${equityCaveat}`;

  } else if (hasNothing && dangerousBoard) {
    correctAnswer = "Fold";
    options = ["Call", "Raise", "Fold"];
    difficulty = "intermediate";
    explanation = `Despite the ${winPct}% raw equity, fold here. You have no pair and no draw on a board that strongly favors a betting opponent. A bet on a paired high-card board almost always represents a real hand. ${equityCaveat}`;

  } else if (hasNothing && winPct < scenario.potOdds) {
    correctAnswer = "Fold";
    options = ["Call", "Raise", "Fold"];
    difficulty = "intermediate";
    explanation = `No pair and no draw — fold. You're below the ${scenario.potOdds}% breakeven threshold with nothing to improve toward. ${equityCaveat}`;

  } else if (isTrueTripsOrBetter) {
    // Real trips or better (we hold the card): raise
    correctAnswer = "Raise";
    options = ["Call", "Raise", "Fold"];
    difficulty = "advanced";
    explanation = `With a ${handResult.name}, raise regardless of the raw equity number. Trips or better is strong enough to build the pot — raise to $${raiseToLow}–$${raiseTo} (2.5–3x the bet). Raw equity can understate trips on a paired board because the simulation doesn't account for a betting opponent's narrowed range.${hasDraw ? ` You also have a ${draws[0]} as a bonus if called.` : ""} ${equityCaveat}`;

  } else if (winPct < scenario.potOdds) {
    correctAnswer = "Fold";
    options = ["Call", "Raise", "Fold"];
    difficulty = "intermediate";
    explanation = `You need ${scenario.potOdds}% equity to break even ($${scenario.callAmt} to win $${scenario.potBefore + scenario.callAmt}), but you only have ${winPct}% against ${oppChoice.n} opponent${oppChoice.n > 1 ? "s" : ""}. Folding is correct. ${equityCaveat}`;

  } else if (winPct >= 60 && isStrongMade) {
    correctAnswer = "Raise";
    options = ["Call", "Raise", "Fold"];
    difficulty = "advanced";
    explanation = `With ${winPct}% equity and a strong ${handResult.name}, raising is correct — you want more money in when you're ahead. Standard post-flop raise: 2.5–3x the bet, so raise to $${raiseToLow}–$${raiseTo}. ${equityCaveat}`;

  } else if (winPct >= 45 && hasDraw && !isMadeHand) {
    correctAnswer = "Raise";
    options = ["Call", "Raise", "Fold"];
    difficulty = "advanced";
    explanation = `With ${winPct}% equity and a ${draws[0]}, this is a semi-bluff spot. Two ways to win: opponent folds now, or you hit your draw. Raise to $${raiseToLow}–$${raiseTo} (2.5–3x). ${equityCaveat}`;

  } else if (winPct >= scenario.potOdds && isStrongMade && hasDraw) {
    correctAnswer = "Raise";
    options = ["Call", "Raise", "Fold"];
    difficulty = "advanced";
    explanation = `With a ${handResult.name} AND a ${draws[0]}, you have a made hand with upside — raise to $${raiseToLow}–$${raiseTo}. You're getting value now and have outs if called. ${equityCaveat}`;

  } else if (winPct >= scenario.potOdds && isMadeHand) {
    correctAnswer = "Call";
    options = ["Call", "Raise", "Fold"];
    difficulty = "intermediate";
    explanation = `With ${winPct}% equity and a ${handResult.name}, you clear the ${scenario.potOdds}% breakeven threshold — calling is profitable. Raising isn't warranted here; your equity is solid but not dominant enough to build the pot aggressively. ${equityCaveat}`;

  } else if (winPct >= scenario.potOdds && hasDraw) {
    correctAnswer = "Call";
    options = ["Call", "Raise", "Fold"];
    difficulty = "intermediate";
    explanation = `You have a ${draws[0]} and enough equity (${winPct}% vs ${scenario.potOdds}% needed) to call profitably. Not strong enough to raise, but chasing this draw is mathematically justified. ${equityCaveat}`;

  } else {
    correctAnswer = "Fold";
    options = ["Call", "Raise", "Fold"];
    difficulty = "intermediate";
    explanation = `With ${winPct}% equity against a betting opponent and nothing strong to work with, folding is the disciplined move. ${equityCaveat}`;
  }

  const shuffledOptions = shuffle(options);
  return {
    hole, board,
    question: `You're playing ${oppChoice.label}. Raw card equity: ${winPct}%. An opponent bets $${scenario.callAmt} into a $${scenario.potBefore} pot. What do you do?`,
    options: shuffledOptions,
    correctIndex: shuffledOptions.indexOf(correctAnswer),
    explanation,
    concept: "Pot Odds & Action",
    difficulty,
  };
}

function genDrawOrMade() {
  const deck = shuffle(buildDeck());
  const hole = deck.slice(0,2);
  const board = deck.slice(2,5);
  const result = getBestHand(hole, board);
  const draws = detectDraws(hole, board);

  // A "made hand" requires your hole cards to contribute.
  // Board pairs everyone shares don't count — if the board is 2-2-T
  // and you hold 4-9, you haven't made anything with YOUR cards.
  const holeRanks = hole.map(c => c.rank);
  const boardRanks = board.map(c => c.rank);

  // Check if at least one hole card pairs with the board or the other hole card
  const holePairsBoard = holeRanks.some(r => boardRanks.includes(r));
  const holePairsSelf  = holeRanks[0] === holeRanks[1];
  // Board pair only (neither hole card matches anything) — not your made hand
  const onlyBoardPaired = result.rank >= 1 && !holePairsBoard && !holePairsSelf && result.rank < 3;

  // Effective rank: treat pure board pairs as rank 0 (no hand for player)
  const effectiveRank = onlyBoardPaired ? 0 : result.rank;

  const options = ["Made hand", "Drawing hand", "Both (made hand with draw)", "Neither"];
  let correct, explanation;
  if (effectiveRank >= 2 && draws.length > 0) {
    correct = "Both (made hand with draw)";
    explanation = `You have a ${result.name} using your hole cards AND a ${draws[0]}. Strong position — value now with potential to improve.`;
  } else if (effectiveRank >= 2) {
    correct = "Made hand";
    explanation = `You have a ${result.name} using your hole cards. A "made hand" means your cards have connected with the board — you have something right now.`;
  } else if (effectiveRank === 1 && draws.length > 0) {
    correct = "Both (made hand with draw)";
    explanation = `You have a pair using your hole cards AND a ${draws[0]}. You have value now and a chance to improve further.`;
  } else if (effectiveRank === 1) {
    correct = "Made hand";
    explanation = `You have a pair using your hole cards. A "made hand" means your cards connected with the board — you're not relying purely on future cards. Note: if the board itself is paired (e.g. 2-2) but neither of your cards is a 2, that board pair doesn't belong to you any more than to anyone else.`;
  } else if (onlyBoardPaired && draws.length > 0) {
    correct = "Drawing hand";
    explanation = `The board is paired but neither of your hole cards matches — that pair belongs to everyone equally and doesn't strengthen your hand. You do have a ${draws[0]} though, so you're drawing.`;
  } else if (onlyBoardPaired) {
    correct = "Neither";
    explanation = `The board is paired but neither of your hole cards matches it. A board pair is a community card — it's shared by everyone and doesn't give you a made hand. You have no pair with your own cards and no strong draw. High card only.`;
  } else if (draws.length > 0) {
    correct = "Drawing hand";
    explanation = `You have a ${draws[0]} but no pair yet. You're hoping a future card completes your hand. Drawing hands need good pot odds to justify calling bets.`;
  } else {
    correct = "Neither";
    explanation = `Just a high card — your hole cards don't pair the board and you have no strong draw. Usually better to fold unless it's very cheap to continue.`;
  }
  return {
    hole, board,
    question: "After the flop, how would you classify your hand?",
    options,
    correctIndex: options.indexOf(correct),
    explanation,
    concept: "Hand Classification",
    difficulty: "beginner",
  };
}

// genBoardTexture (original) replaced by expanded version below

// ─── Opening Range Tables ─────────────────────────────────────────────────────
// Low-stakes ranges informed by BlackRain79 / Sethy Poker fundamentals.
// Designed for recreational/micro-stakes players learning solid TAG strategy.
//
// Tiers are table-size aware — the same hand can be Tier 1 at 3-handed
// but Tier 3 at 9-max. classifyHand returns a base tier; genPreflopDecision
// adjusts playability based on actual table size.
//
// Base tiers assume a 6-max context (the most common low-stakes format):
//   Tier 1 — Premium: raise from any position, any table size
//   Tier 2 — Solid: open at 6-max from any position; 9-max late position only
//   Tier 3 — Speculative: open at 6-max late position or 3-handed+; 9-max fold
//   Tier 4 — Short-handed only: playable 3-handed or heads-up, fold otherwise
//   Tier 5 — Trash: fold at any table size

// ── 9-MAX RANGE (tightest, ~15% of hands) ─────────────────────────────────
// 22+, A5s+, KTs+, QJs, JTs, AJo+, KQo
// Drops weaker suited aces (A2s-A4s), weaker suited kings/queens,
// and most offsuit broadway below AJ.

// ── 6-MAX RANGE (standard, ~20% of hands) ─────────────────────────────────
// 22+, A2s+, K9s+, Q9s+, JTs, T9s, 98s, A9o+, KTo+, QJo
// Opens up all suited aces, more suited kings/queens, suited connectors down to 98s,
// and more offsuit broadway.

// ── 3-HANDED RANGE (loose, ~30% of hands) ─────────────────────────────────
// All 6-max hands + K8s+, Q8s+, J9s+, 87s, 76s, A7o+, KJo+, QJo
// Short-handed means you're in every pot frequently — playing tighter bleeds blinds.

// ── HEADS-UP RANGE (~40%+ of hands) ──────────────────────────────────────
// Any pair, any ace, any two broadway, most suited connectors, most suited kings
// HU poker is a different game — nearly any hand with equity is playable.

function classifyHand(r1, r2, suited) {
  const hi = RANK_VAL[r1] >= RANK_VAL[r2] ? r1 : r2;
  const lo = RANK_VAL[r1] < RANK_VAL[r2] ? r1 : r2;
  const isPair = r1 === r2;
  const gap = RANK_VAL[hi] - RANK_VAL[lo];
  const hiV = RANK_VAL[hi], loV = RANK_VAL[lo];

  // ── TIER 1: Premium — raise from any position, any table size ─────────────
  // 9-max: these are your bread-and-butter opens from UTG
  if (isPair && hiV >= 10) return 1;        // TT, JJ, QQ, KK, AA
  if (hi==="A" && lo==="K") return 1;        // AKo — always premium
  if (hi==="A" && lo==="K" && suited) return 1; // AKs
  if (hi==="A" && loV >= 11 && suited) return 1; // AJs+
  if (hi==="A" && loV >= 11) return 1;       // AJo, AQo
  if (hi==="K" && lo==="Q" && suited) return 1; // KQs

  // ── TIER 2: Solid — open 6-max any position; 9-max from middle/late only ──
  // 6-max playbook: raise these from anywhere. 9-max: raise cutoff/button/blinds.
  if (isPair && hiV >= 7) return 2;          // 77, 88, 99
  if (hi==="A" && suited && loV >= 5) return 2; // A5s-ATs (A2s-A4s go to tier 3 — wheel draws)
  if (hi==="A" && loV >= 10) return 2;       // ATo — solid offsuit ace
  if (hi==="A" && lo==="K") return 1;        // already tier 1 above, belt-and-suspenders
  if (hi==="K" && loV >= 10 && suited) return 2; // KTs, KJs
  if (hi==="K" && lo==="Q") return 2;        // KQo
  if (hi==="K" && lo==="J") return 2;        // KJo — playable at 6-max
  if (hi==="Q" && lo==="J" && suited) return 2; // QJs
  if (hi==="Q" && lo==="J") return 2;        // QJo
  if (suited && gap === 1 && hiV >= 10) return 2; // JTs, T9s — strong suited connectors
  if (hi==="J" && lo==="T") return 2;        // JTo broadway

  // ── TIER 3: Speculative — 6-max late position or 3-handed+; fold 9-max ────
  // These hands need good position or a short table to be profitable.
  // Small pairs: always at least call for set-mining — never fold preflop.
  if (isPair) return 3;                       // 22-66 — set mining, call any table
  if (hi==="A" && suited && loV >= 2) return 3; // A2s-A4s — wheel/flush potential
  if (hi==="K" && loV >= 9 && suited) return 3; // K9s
  if (hi==="Q" && loV >= 9 && suited) return 3; // Q9s, QTs
  if (hi==="J" && loV >= 9 && suited) return 3; // J9s
  if (suited && gap === 1 && hiV >= 9) return 3; // 98s, 87s — suited connectors
  if (hi==="A" && loV >= 9) return 3;         // A9o — borderline 6-max open
  if (hi==="K" && loV >= 10) return 3;        // KTo — lower offsuit kings

  // ── TIER 4: Short-handed only — 3-handed or heads-up; fold 6-max+ ─────────
  if (hi==="K" && loV >= 8 && suited) return 4; // K8s, K7s, K6s
  if (hi==="Q" && loV >= 8 && suited) return 4; // Q8s
  if (suited && gap === 1 && hiV >= 7) return 4; // 76s, 65s — low suited connectors
  if (suited && gap === 2 && hiV >= 9) return 4; // T8s, 97s, 86s — suited one-gappers
  if (hi==="A" && loV >= 7) return 4;         // A7o-A8o — weak offsuit aces
  if (hi==="K" && loV >= 9) return 4;         // K9o
  if (hi==="J" && lo==="T" && !suited) return 4; // JTo at short tables only... wait already tier 2
  // Weaker broadway offsuit — heads-up territory
  if (hiV >= 10 && loV >= 9) return 4;        // T9o and similar

  // ── TIER 5: Trash — fold at any table size ─────────────────────────────────
  return 5;
}

function genPreflopDecision() {
  const deck = shuffle(buildDeck());
  const hole = deck.slice(0,2);
  const [r1, r2] = [hole[0].rank, hole[1].rank];
  const suited = hole[0].suit === hole[1].suit;
  const hi = RANK_VAL[r1] >= RANK_VAL[r2] ? r1 : r2;
  const lo = RANK_VAL[r1] < RANK_VAL[r2] ? r1 : r2;
  const isPair = r1 === r2;
  const tier = classifyHand(r1, r2, suited);
  const handLabel = `${hi}${lo !== hi ? `-${lo}` : ""}${suited ? "s" : isPair ? "" : "o"}`;

  const tableSizes = [
    { players: 9, label: "9-player full table" },
    { players: 6, label: "6-player table" },
    { players: 3, label: "3-player short-handed game" },
    { players: 2, label: "heads-up (2 players)" },
  ];
  const table = tableSizes[Math.floor(Math.random() * tableSizes.length)];
  const n = table.players;

  // Determine correct action based on tier + table size
  // Logic: each tier has a minimum table size where it becomes playable
  // Tier 1 → always raise
  // Tier 2 → raise at 9-max from late position; raise freely at 6-max or shorter
  // Tier 3 → fold 9-max; raise/call 6-max late position or shorter
  // Tier 4 → only at 3-handed or heads-up
  // Tier 5 → fold always
  // Small pairs (tier 3, isPair) → always at least call/limp for set-mining

  let action, explanation, options;

  if (tier === 1) {
    action = "Raise";
    explanation = `${handLabel} is a premium hand — raise from any position at any table size. Build the pot, thin the field. Standard sizing: 3x the big blind, plus 1bb for each player who limped before you.`;

  } else if (tier === 2) {
    if (n <= 6) {
      action = "Raise";
      explanation = `At a ${table.label}, ${handLabel} is a solid raising hand from any position. Fewer players means less chance someone has you dominated. Raise to 3x the big blind.`;
    } else {
      // 9-max: raise from late position (cutoff/button), fold from early
      action = "Raise from late position, fold from early position";
      explanation = `At a full ${table.label}, ${handLabel} plays well from late position (cutoff or button) where you act last and have information. From early position, the 6+ players behind you increase the chance someone holds a dominating hand. Raise on the button, fold from UTG.`;
    }

  } else if (tier === 3 && isPair) {
    // Small pairs: set-mining at any table, raise short-handed
    if (n <= 3) {
      action = "Raise or Call";
      explanation = `Short-handed with ${n} players, pocket ${hi}s gain significant value. You can raise or call depending on the action. Short-handed, pairs play well as value hands — not just set-mining.`;
    } else {
      action = "Call (limp to set-mine)";
      explanation = `Pocket ${hi}s are a set-mining hand. Don't fold them — call cheaply and hope to flop three of a kind, which happens about 12% of the time. A flopped set is very disguised and can win a big pot. Fold if facing a large raise (4x+ big blind) that kills your implied odds.`;
    }

  } else if (tier === 3) {
    if (n <= 6) {
      action = "Raise from late position, fold from early position";
      explanation = `At a ${table.label}, ${handLabel} is playable but position-dependent. From the cutoff or button you have the table covered — raise and take control. From early position, too many players can wake up with something better. Fold from the first 2-3 seats.`;
    } else {
      action = "Fold";
      explanation = `At a full ${table.label}, ${handLabel} falls outside the 9-max opening range. With 6+ players yet to act, you risk being dominated or playing out of position. Solid 9-max play means folding speculative hands from most seats and waiting for better spots.`;
    }

  } else if (tier === 4) {
    if (n <= 3) {
      action = "Raise or Call";
      explanation = `${n === 2 ? "Heads-up" : "3-handed"} poker widens your playable range considerably. ${handLabel} has enough equity short-handed to open or call. With ${n} players, ranges invert — playing tight bleeds your stack to the blinds.`;
    } else {
      action = "Fold";
      explanation = `${handLabel} is a short-handed-only hand — it needs a 3-handed or heads-up context to be profitable. At a ${table.label} with ${n} players, this hand is too weak to open: likely dominated, likely out of position, with limited upside. Save your chips for a better spot.`;
    }

  } else {
    // Tier 5: trash
    action = "Fold";
    explanation = `${handLabel} is a fold at any table size. You won't connect with the board often enough to justify the investment, and when you do, you risk being dominated. Fold and wait for a playable hand.`;
  }

  // Build options set that always includes the correct action
  const allOptions = [
    "Raise",
    "Fold",
    "Call (limp to set-mine)",
    "Raise or Call",
    "Raise from late position, fold from early position",
  ];
  // Pick 3 wrong options that aren't the correct answer
  const wrong = shuffle(allOptions.filter(o => o !== action)).slice(0, 2);
  const opts = shuffle([action, ...wrong]);

  return {
    hole, board: [],
    question: `You're at a ${table.label}. What's the right preflop move with ${handLabel}?`,
    options: opts,
    correctIndex: opts.indexOf(action),
    explanation,
    concept: "Preflop Ranges",
    difficulty: tier <= 2 ? "intermediate" : "advanced",
  };
}

// ─── Bet Sizing Generator ─────────────────────────────────────────────────────
function genBetSizing() {
  const deck = shuffle(buildDeck());
  const hole = deck.slice(0,2);
  const [r1, r2] = [hole[0].rank, hole[1].rank];
  const suited = hole[0].suit === hole[1].suit;
  const tier = classifyHand(r1, r2, suited);

  // Only show aggressive sizing scenarios for hands that actually warrant them
  const isPremium = tier === 1;
  const isSolid = tier === 2;
  const isWeak = tier >= 3;

  if (isWeak) {
    // Weak hands: teach the fold/check discipline
    const options = ["Fold preflop — don't invest chips", "Raise 3x big blind", "Limp in (just call)"];
    return {
      hole, board: [],
      question: `Before the flop, how should you approach this hand?`,
      options,
      correctIndex: 0,
      explanation: `This is a Tier ${tier} weak hand — the correct move is to fold before the flop. Investing chips with this hand means you'll often be dominated (an opponent holds something that has you beat and keeps you beat). Saving those chips for a better spot is always the right play.`,
      concept: "Bet Sizing",
      difficulty: "beginner",
    };
  }

  // For premium/solid hands, show bet sizing scenarios
  const bb = [1, 2, 5][Math.floor(Math.random() * 3)];
  const limpers = [0, 1, 2][Math.floor(Math.random() * 3)];
  const pot = [20, 40, 60, 80, 100][Math.floor(Math.random() * 5)];

  const scenarios = [
    {
      type: "preflop_open",
      question: `The big blind is $${bb}. ${limpers > 0 ? `${limpers} player${limpers > 1 ? "s have" : " has"} already limped (just called). ` : ""}You're holding this hand. How much should you raise to?`,
      correct: `$${bb * 3 + limpers * bb}`,
      wrongOptions: [`$${bb}`, `$${bb * 2}`, `$${bb * 5}`, `$${bb * 3}`]
        .filter(o => o !== `$${bb * 3 + limpers * bb}`).slice(0, 3),
      explanation: `Standard preflop raise is 3x the big blind ($${bb * 3})${limpers > 0 ? `, plus $${bb} for each player who limped. With ${limpers} limper${limpers > 1 ? "s" : ""}, that's $${bb * 3 + limpers * bb} total` : ""}. This hand is strong enough to raise — you want to build the pot and reduce the number of players who see the flop.`,
    },
    ...(isPremium ? [{
      type: "continuation_bet",
      question: `You raised preflop with this hand and are first to act on the flop. The pot is $${pot}. You want to make draws unprofitable. What's a good c-bet size?`,
      correct: `$${Math.round(pot * 0.67)} (about 2/3 pot)`,
      wrongOptions: [
        `$${Math.round(pot * 0.25)} (1/4 pot)`,
        `$${Math.round(pot * 1.5)} (1.5x pot)`,
        `$${pot} (full pot)`,
      ],
      explanation: `A continuation bet (c-bet) of 50–75% of the pot is standard after raising preflop. At a $${pot} pot, betting $${Math.round(pot * 0.67)} charges flush and straight draws more than they're getting paid to call. Too small and draws come along cheaply; too large wastes chips when opponents fold anyway.`,
    }] : []),
    ...(isPremium ? [{
      type: "value_bet_river",
      question: `The river card is down. Assume you've made the best hand — the pot is $${pot}. You're first to act. What's the right bet size to extract maximum value?`,
      correct: `$${Math.round(pot * 0.75)} (about 3/4 pot)`,
      wrongOptions: [
        `$${Math.round(pot * 0.2)} (small — leaves money on the table)`,
        `$${Math.round(pot * 2)} (overbet — folds out worse hands)`,
        `$0 (check — misses value)`,
      ],
      explanation: `When you have the best hand on the river, bet 66–100% of the pot for maximum value. At a $${pot} pot, $${Math.round(pot * 0.75)} (75%) is large enough that second-best hands will still call, but not so large it folds everyone out. The two most common river mistakes are checking (hoping opponent bets) or betting too small — both leave chips behind. This sizing concept applies regardless of which specific hand you made.`,
    }] : []),
  ];

  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const options = shuffle([s.correct, ...s.wrongOptions]);

  return {
    hole,
    board: s.type === "continuation_bet" ? deck.slice(2, 5) : s.type === "value_bet_river" ? deck.slice(2, 7).slice(0, 5) : [],
    question: s.question,
    options,
    correctIndex: options.indexOf(s.correct),
    explanation: s.explanation,
    concept: "Bet Sizing",
    difficulty: s.type === "preflop_open" ? "intermediate" : "advanced",
  };
}

// ─── Constructed Scenario Builders ───────────────────────────────────────────
// These build specific hand types by construction, guaranteeing variety.
// Each returns a { hole, board, ... } scenario object.

function pickSuit() { return SUITS[Math.floor(Math.random() * SUITS.length)]; }
function pickRank() { return RANKS[Math.floor(Math.random() * RANKS.length)]; }
function pickRankExcluding(excluded) {
  const pool = RANKS.filter(r => !excluded.includes(r));
  return pool[Math.floor(Math.random() * pool.length)];
}
function pickSuitExcluding(excluded) {
  const pool = SUITS.filter(s => !excluded.includes(s));
  return pool[Math.floor(Math.random() * pool.length)];
}
function c(rank, suit) { return { rank, suit }; }

// Guarantee a flush — 2 hole cards + 3 board cards all same suit, plus 2 offsuit board cards
// Board shows all 5 cards (flop + turn + river) so all 5 flush cards are visible
// buildFlushScenario: hole cards are BOTH flush suit, board has exactly 3 flush + 2 offsuit.
// All 13 ranks are distinct — we pick 7 unique ranks total (2 hole, 3 board flush, 2 board offsuit).
function buildFlushScenario() {
  const suit = pickSuit();
  const allRanks = shuffle([...RANKS]); // 13 unique ranks in random order
  // Slots: 0-1 = hole flush, 2-4 = board flush, 5-6 = board offsuit
  const holeR1 = allRanks[0], holeR2 = allRanks[1];
  const bFlush1 = allRanks[2], bFlush2 = allRanks[3], bFlush3 = allRanks[4];
  const bOff1 = allRanks[5], bOff2 = allRanks[6];
  const os1 = pickSuitExcluding([suit]);
  const os2 = pickSuitExcluding([suit]);
  const hole = [c(holeR1, suit), c(holeR2, suit)];
  const board = [
    c(bFlush1, suit), c(bFlush2, suit), c(bFlush3, suit),
    c(bOff1, os1), c(bOff2, os2),
  ];
  const wrongHands = shuffle(["Straight", "Two Pair", "One Pair", "Full House"]);
  const options = shuffle(["Flush", ...wrongHands.slice(0, 3)]);
  return {
    hole, board,
    question: "What is your best hand?",
    options,
    correctIndex: options.indexOf("Flush"),
    explanation: `You have a flush — five cards of the same suit (${suit}). Your two hole cards plus three board cards all share the same suit. Flushes are the 4th strongest hand, beating straights, trips, two pair, and one pair. They lose to full houses, four of a kind, and straight flushes.`,
    concept: "Hand Recognition — Flush",
    difficulty: "beginner",
  };
}

// buildNutFlushQuestionScenario: both hole cards are flush suit, board has 3 flush + 2 offsuit.
// All ranks strictly unique. Asks: do you have the nut flush?
function buildNutFlushQuestionScenario() {
  const suit = pickSuit();
  const isNut = Math.random() > 0.5;
  // For nut: hole must include Ace. For non-nut: hole must NOT include Ace.
  // Pick 7 unique ranks for: hole1, hole2, bFlush1, bFlush2, bFlush3, bOff1, bOff2
  // Nut case: fix hole1 = A, shuffle remaining 12 ranks for the rest
  // Non-nut case: shuffle ranks excluding A for hole cards, A stays unassigned (could be "out there")
  let hole1Rank, hole2Rank, bF1, bF2, bF3, bO1, bO2;
  if (isNut) {
    hole1Rank = "A";
    const rest = shuffle(RANKS.filter(r => r !== "A")); // 12 remaining ranks
    hole2Rank = rest[0];
    bF1 = rest[1]; bF2 = rest[2]; bF3 = rest[3];
    bO1 = rest[4]; bO2 = rest[5];
  } else {
    // Non-nut: hole cards are NOT Ace, and board doesn't have Ace either (so A is clearly "out there")
    const nonAce = shuffle(RANKS.filter(r => r !== "A" && r !== "K")); // avoid top cards in hole
    hole1Rank = nonAce[0]; hole2Rank = nonAce[1];
    bF1 = nonAce[2]; bF2 = nonAce[3]; bF3 = nonAce[4];
    bO1 = nonAce[5]; bO2 = nonAce[6];
  }
  const os1 = pickSuitExcluding([suit]);
  const os2 = pickSuitExcluding([suit]);
  const hole = [c(hole1Rank, suit), c(hole2Rank, suit)];
  const board = [
    c(bF1, suit), c(bF2, suit), c(bF3, suit),
    c(bO1, os1), c(bO2, os2),
  ];
  const correct = isNut
    ? "Yes — I have the nut flush"
    : "No — someone with a higher card of this suit beats me";
  const options = shuffle([
    "Yes — I have the nut flush",
    "No — someone with a higher card of this suit beats me",
    "It doesn't matter — all flushes are equal",
    "I need to check if the board pairs to know",
  ]);
  return {
    hole, board,
    question: `You have a flush in ${suit}. Is it the nut (best possible) flush?`,
    options,
    correctIndex: options.indexOf(correct),
    explanation: isNut
      ? (() => {
          const boardRanks = board.map(c => c.rank);
          const boardPaired = new Set(boardRanks).size < boardRanks.length;
          return boardPaired
            ? `Yes — you hold the Ace of ${suit}, the highest possible flush card. No other ${suit} flush can beat you. The board is paired though, so a full house or quads is possible — bet for value but slow down if you face a big raise.`
            : `Yes — you hold the Ace of ${suit}, the highest possible flush card. On this unpaired board the nut flush is the absolute nuts — nothing beats it. A full house requires a paired board, which this isn't. Bet for maximum value and don't slow-play.`;
        })()
      : `No — you don't hold the Ace of ${suit}, meaning anyone holding a higher ${suit} card has a better flush than you. With a non-nut flush, check or call rather than raise — you could be up against the nut flush and drawing dead.`,
    concept: "Hand Strength — Nut Flush",
    difficulty: "intermediate",
  };
}

// Guarantee a straight
function buildStraightScenario() {
  const startIdx = Math.floor(Math.random() * 8); // gives room for 5 consecutive
  const straightRanks = RANKS.slice(startIdx, startIdx + 5); // e.g. ["A","K","Q","J","T"]
  const suits = [pickSuit(), pickSuit(), pickSuit(), pickSuit(), pickSuit()];
  // Make sure no flush (all different suits where possible)
  const usedSuits = [];
  const cards = straightRanks.map((r, i) => {
    let s = SUITS[i % 4];
    return c(r, s);
  });
  const hole = [cards[0], cards[1]];
  const board = [cards[2], cards[3], cards[4]];
  const wrongHands = shuffle(HAND_NAMES.filter(h => h !== "Straight")).slice(0, 3);
  const options = shuffle(["Straight", ...wrongHands]);
  return {
    hole, board,
    question: "What is your best hand?",
    options,
    correctIndex: options.indexOf("Straight"),
    explanation: `You have a straight — five consecutive ranks. Straights beat trips, two pair, and one pair, but lose to flushes, full houses, quads, and straight flushes. The straight here runs ${straightRanks[4]}-${straightRanks[0]}.`,
    concept: "Hand Recognition — Straight",
    difficulty: "beginner",
  };
}

// Guarantee a full house
function buildFullHouseScenario() {
  const tripRank = pickRank();
  const pairRank = pickRankExcluding([tripRank]);
  const s1 = SUITS[0], s2 = SUITS[1], s3 = SUITS[2], s4 = SUITS[3];
  // Hole: two of trip rank. Board: one trip rank + two of pair rank
  const hole = [c(tripRank, s1), c(tripRank, s2)];
  const board = [c(tripRank, s3), c(pairRank, s1), c(pairRank, s2)];
  const wrongHands = shuffle(["Flush", "Straight", "Three of a Kind", "Two Pair"]);
  const options = shuffle(["Full House", ...wrongHands.slice(0,3)]);
  return {
    hole, board,
    question: "What is your best hand?",
    options,
    correctIndex: options.indexOf("Full House"),
    explanation: `You have a full house — three of a kind plus a pair (${tripRank}s full of ${pairRank}s). Full houses beat flushes and everything below, and only lose to four of a kind and straight flushes. This is the 3rd strongest hand in poker.`,
    concept: "Hand Recognition — Full House",
    difficulty: "beginner",
  };
}

// Guarantee two pair
function buildTwoPairScenario() {
  const rank1 = pickRank();
  const rank2 = pickRankExcluding([rank1]);
  const rank3 = pickRankExcluding([rank1, rank2]); // kicker/board filler
  const hole = [c(rank1, SUITS[0]), c(rank2, SUITS[1])];
  const board = [c(rank1, SUITS[2]), c(rank2, SUITS[2]), c(rank3, SUITS[3])];
  const hi = RANK_VAL[rank1] >= RANK_VAL[rank2] ? rank1 : rank2;
  const lo = RANK_VAL[rank1] < RANK_VAL[rank2] ? rank1 : rank2;
  const wrongHands = shuffle(["One Pair", "Three of a Kind", "Flush", "Straight"]);
  const options = shuffle(["Two Pair", ...wrongHands.slice(0,3)]);
  return {
    hole, board,
    question: "What is your best hand?",
    options,
    correctIndex: options.indexOf("Two Pair"),
    explanation: `You have two pair — ${hi}s and ${lo}s. Two pair beats one pair and high card, but loses to trips, straights, flushes, full houses, and better. With two pair on a non-paired board, watch for opponents who might have trips if they hold a matching card.`,
    concept: "Hand Recognition — Two Pair",
    difficulty: "beginner",
  };
}

// Three of a kind (set — pocket pair + board card)
function buildTripsScenario() {
  const pairRank = pickRank();
  const board1 = pickRankExcluding([pairRank]);
  const board2 = pickRankExcluding([pairRank, board1]);
  const hole = [c(pairRank, SUITS[0]), c(pairRank, SUITS[1])];
  const board = [c(pairRank, SUITS[2]), c(board1, SUITS[3]), c(board2, SUITS[0])];
  const wrongHands = shuffle(["One Pair", "Two Pair", "Full House", "Flush"]);
  const options = shuffle(["Three of a Kind", ...wrongHands.slice(0,3)]);
  return {
    hole, board,
    question: "You have a pocket pair and hit the board. What is your best hand?",
    options,
    correctIndex: options.indexOf("Three of a Kind"),
    explanation: `You flopped a set — three of a kind using your pocket pair plus a matching board card. Sets are extremely powerful because they're well-disguised (opponents see only one ${pairRank} on board, not knowing you hold two). Sets win big pots and only lose to straights, flushes, full houses, or quads.`,
    concept: "Hand Recognition — Set",
    difficulty: "beginner",
  };
}

// Flush draw decision — do you have the nuts?
// Flush draw: exactly 4 cards of the same suit visible (1 hole + 3 board), need 1 more to complete.
// Layout: hole = [flushCard, offCard], board = [flushCard, flushCard, flushCard, offCard, offCard... up to 5]
// We show the flop (3 board cards: 3 flush suit) so the draw is clear on the flop.
function buildFlushDrawScenario() {
  const suit = pickSuit();
  // Pick 7 unique ranks: slot 0 = hole flush, slots 1-3 = board flush, slots 4-6 = offsuit
  const allRanks = shuffle([...RANKS]);
  const holeFlushRank  = allRanks[0];
  const bFlush1 = allRanks[1], bFlush2 = allRanks[2], bFlush3 = allRanks[3];
  const holeOtherRank  = allRanks[4];
  const os1 = pickSuitExcluding([suit]);
  const os2 = pickSuitExcluding([suit]);
  const hole  = [c(holeFlushRank, suit), c(holeOtherRank, os1)];
  // Board shows the flop only — 3 flush cards so the draw is immediately visible
  const board = [c(bFlush1, suit), c(bFlush2, suit), c(bFlush3, suit)];
  // Nut flush draw = holding the highest flush card NOT already on the board.
  // The board's flush cards are community cards — everyone shares them.
  // So if the Ace is on the board, the nut draw belongs to whoever holds the King.
  const boardFlushRanks = [bFlush1, bFlush2, bFlush3];
  const allFlushRanks = [...boardFlushRanks, holeFlushRank].map(r => RANK_VAL[r]).sort((a, b) => b - a);
  // Highest rank NOT on the board that could be held as a hole card
  const topBoardFlushVal = Math.max(...boardFlushRanks.map(r => RANK_VAL[r]));
  const aceOnBoard = boardFlushRanks.includes("A");
  const nutHoleRank = aceOnBoard ? "K" : "A"; // if A is on board, K is the nut draw card
  const isNut = holeFlushRank === nutHoleRank;
  // All 4 flush cards visible: hole + 3 board. Need 1 more of suit = 9 outs remaining.
  const options = ["Call — flush draws are worth chasing", "Fold — draws are too risky", "It depends on pot odds", "Raise as a semi-bluff"];
  const correct = "It depends on pot odds";
  const nutDrawExplainer = isNut
    ? `You hold the ${nutHoleRank}${suit} — the highest ${suit} card not already on the board, giving you the nut flush draw. If you hit, no opponent with a single ${suit} card can beat your flush. Semi-bluff raises are more attractive here.`
    : aceOnBoard
      ? `The Ace of ${suit} is already on the board — it's a community card, so everyone shares it. The nut flush draw belongs to whoever holds the King of ${suit}. You hold the ${holeFlushRank}${suit}, so anyone with a higher ${suit} card (${nutHoleRank} down to ${holeFlushRank === "K" ? "Q" : holeFlushRank}) beats your flush if they hit. Factor that into how aggressively you chase.`
      : `You don't hold the Ace of ${suit}, so anyone holding a higher ${suit} card would beat your flush. Factor that risk into how aggressively you pursue this draw.`;
  return {
    hole, board,
    question: `You have a flush draw — you hold one ${suit} and there are three ${suit}s on the board. One more ${suit} gives you a flush. What's your general approach?`,
    options,
    correctIndex: options.indexOf(correct),
    explanation: `You have 4 cards of the same suit (your ${holeFlushRank}${suit} plus three on the board) and need one more to complete the flush. There are 9 remaining ${suit} cards in the deck, giving you roughly 35% equity with two cards to come or 19% on the river alone. The right play depends entirely on pot odds — if calling is cheap relative to the pot size, it's profitable long-term. ${nutDrawExplainer} Never call a large bet with a draw unless the pot odds or implied odds justify it.`,
    concept: "Draw Decision — Flush Draw",
    difficulty: "intermediate",
  };
}

// Open-ended straight draw vs gutshot
function buildStraightDrawScenario() {
  const type = Math.random() > 0.5 ? "oesd" : "gutshot";
  const deck = shuffle(buildDeck());
  let hole, board, question, explanation, correct;

  // OESD: hole cards are two adjacent ranks, board contains the two ranks just above or below them.
  // Example: hole 8-9, board 6-7-K. Four connected cards: 6-7-8-9. Need 5 or T = 8 outs.
  // Gutshot: hole cards have a gap, board fills part of a 5-card window but leaves one gap in middle.
  // Example: hole 7-T, board 8-K-2. You have 7-8-T — need specifically a 9 = 4 outs.

  // Concrete OESD templates: [hole1, hole2, board1, board2] all consecutive, board3 is offcard
  const oesdTemplates = [
    { h: ["5","6"], b: ["7","8"] },
    { h: ["6","7"], b: ["8","9"] },
    { h: ["7","8"], b: ["9","T"] },
    { h: ["8","9"], b: ["T","J"] },
    { h: ["9","T"], b: ["J","Q"] },
    { h: ["T","J"], b: ["Q","K"] },
    // hole in middle of sequence
    { h: ["7","8"], b: ["5","6"] },
    { h: ["8","9"], b: ["6","7"] },
    { h: ["9","T"], b: ["7","8"] },
    { h: ["J","Q"], b: ["9","T"] },
  ];

  // Concrete gutshot templates: [hole1, hole2, board1] where one rank is missing in the middle
  // hole 7+T with board 8 = 7-8-_-T, need 9
  // hole 6+9 with board 7 = 6-7-_-9, need 8
  const gutTemplates = [
    { h: ["5","9"], b: ["6","7"], missing: "8" },
    { h: ["6","T"], b: ["7","8"], missing: "9" },
    { h: ["7","J"], b: ["8","9"], missing: "T" },
    { h: ["8","Q"], b: ["9","T"], missing: "J" },
    { h: ["9","K"], b: ["T","J"], missing: "Q" },
    { h: ["5","8"], b: ["6","7"], missing: "not-quite" }, // skip this one
    { h: ["7","T"], b: ["8","9"], missing: "J or 6" }, // actually OESD — use safer ones
    { h: ["6","9"], b: ["7","8"], missing: "5 or T" },  // also OESD
  ];
  // Only use clean single-missing gutshots
  const cleanGut = [
    { h: ["5","9"], b: ["6","7"], missing: "8" },
    { h: ["6","T"], b: ["7","8"], missing: "9" },
    { h: ["7","J"], b: ["8","9"], missing: "T" },
    { h: ["8","Q"], b: ["9","T"], missing: "J" },
    { h: ["9","K"], b: ["T","J"], missing: "Q" },
    { h: ["T","A"], b: ["J","Q"], missing: "K" },
  ];

  if (type === "oesd") {
    const tmpl = oesdTemplates[Math.floor(Math.random() * oesdTemplates.length)];
    const suitAssign = shuffle([...SUITS]);
    hole = [c(tmpl.h[0], suitAssign[0]), c(tmpl.h[1], suitAssign[1])];
    const offcard = pickRankExcluding([...tmpl.h, ...tmpl.b]);
    board = [c(tmpl.b[0], suitAssign[2]), c(tmpl.b[1], suitAssign[3]), c(offcard, suitAssign[0])];
    // Figure out what completes it
    const allFour = [...tmpl.h, ...tmpl.b].map(r => RANK_VAL[r]).sort((a,b) => a-b);
    const loComplete = RANKS.find(r => RANK_VAL[r] === allFour[0] - 1) || null;
    const hiComplete = RANKS.find(r => RANK_VAL[r] === allFour[3] + 1) || null;
    const completers = [loComplete, hiComplete].filter(Boolean).join(" or ");
    correct = "Open-ended straight draw (8 outs)";
    question = "How would you classify your straight draw?";
    explanation = `You have an open-ended straight draw. Your four connected cards (${[...tmpl.h, ...tmpl.b].sort((a,b) => RANK_VAL[b]-RANK_VAL[a]).join("-")}) can be completed on either end${completers ? " — a " + completers + " finishes the straight" : ""}. That's 8 outs and roughly a 31% chance to hit with two cards to come. Strong enough to semi-bluff or call reasonable bets.`;
  } else {
    const tmpl = cleanGut[Math.floor(Math.random() * cleanGut.length)];
    const suitAssign = shuffle([...SUITS]);
    hole = [c(tmpl.h[0], suitAssign[0]), c(tmpl.h[1], suitAssign[1])];
    const offcard = pickRankExcluding([...tmpl.h, ...tmpl.b, tmpl.missing]);
    board = [c(tmpl.b[0], suitAssign[2]), c(tmpl.b[1], suitAssign[3]), c(offcard, suitAssign[0])];
    correct = "Gutshot straight draw (4 outs)";
    question = "How would you classify your straight draw?";
    explanation = `You have a gutshot (inside straight draw). You hold ${tmpl.h[0]} and ${tmpl.h[1]}, with ${tmpl.b[0]}-${tmpl.b[1]} on the board — that's four cards toward a straight but with a gap in the middle. Only a ${tmpl.missing} completes it, giving you just 4 outs (roughly 17% by the river). Gutshots are weaker draws — you need very favorable pot odds or strong implied odds to justify calling, and semi-bluffing with 4 outs is usually too thin.`;
  }

  const options = shuffle(["Open-ended straight draw (8 outs)", "Gutshot straight draw (4 outs)", "No straight draw", "Flush draw"]);
  return {
    hole, board,
    question,
    options,
    correctIndex: options.indexOf(correct),
    explanation,
    concept: "Draw Decision — Straight Draw",
    difficulty: "intermediate",
  };
}

// Full house vs trips — constructed correctly
// Board is genuinely paired. Hole cards: one matches the board pair (giving real trips),
// plus one other card that pairs something on the board = full house.
function buildFullHouseVsTripsScenario() {
  // Step 1: pick the rank that will be paired on the board
  const boardPairRank = pickRank();
  // Step 2: pick a different rank for the third board card
  const boardThirdRank = pickRankExcluding([boardPairRank]);
  // Step 3: hole card 1 matches the board pair (giving trips)
  // Step 4: hole card 2 matches the third board card (turning trips+pair into full house)
  const hole = [c(boardPairRank, SUITS[0]), c(boardThirdRank, SUITS[1])];
  const board = [c(boardPairRank, SUITS[2]), c(boardPairRank, SUITS[3]), c(boardThirdRank, SUITS[2])];
  // Verify: best hand should be full house
  const result = getBestHand(hole, board);
  const handName = result ? result.name : "Full House";
  const options = shuffle(["Full House", "Three of a Kind", "Two Pair", "One Pair"]);
  return {
    hole, board,
    question: "The board is paired. You hold one card matching the board pair and one card matching the third board card. What is your best hand?",
    options,
    correctIndex: options.indexOf("Full House"),
    explanation: `You have a full house — ${boardPairRank}s full of ${boardThirdRank}s. Here's how: the board has two ${boardPairRank}s and a ${boardThirdRank}. You hold a ${boardPairRank} (giving you three ${boardPairRank}s — trips) and a ${boardThirdRank} (giving you a pair of ${boardThirdRank}s). Trips + a pair = full house. This is the 3rd strongest hand. On paired boards, always check whether your hole cards combine with board pairs to make a boat.`,
    concept: "Hand Recognition — Full House",
    difficulty: "intermediate",
  };
}

// True counterfeit scenario:
// Hole: 6-7. Flop: 6-7-K (two pair — 7s and 6s). Turn: 7 (board now 6-7-K-7).
// The board pairing your 7 means everyone plays 7-7 from the board.
// Your best hand drops from two pair (7s+6s) to just one pair (6s, with 7-7 on board).
// The 6 in your hand is now just a one-pair hand — your two pair was counterfeited.
function buildCounterfeitScenario() {
  // Use low pairs so the counterfeit is unambiguous (no chance of full house)
  // Hole: loRank + loRank2. Flop: loRank, loRank2, highKicker. Turn: loRank2 again.
  // After turn: board has loRank2 pair. Your loRank2 hole card now gives you trips of loRank2
  // + pair of loRank = full house. Wait — that's improvement, not counterfeit.
  // True counterfeit needs: board pairs something you DON'T hold.
  // Classic: hole 6-7. Flop 6-K-Q. Turn 6. Board 6-K-Q-6.
  // On flop you had one pair (6s). On turn board has pair of 6s — your 6 gives you trips,
  // but the board 6-6 means everyone plays a pair of 6s. You have trips but...
  // Actually best counterfeit: hole 5-8, flop 5-8-K (two pair), turn 8 (board 5-8-K-8).
  // Now you hold 8 and board has two 8s = three 8s (trips) + 5s pair = full house. Still improvement.
  // The ONLY true counterfeit is when board pairs a card you do NOT hold:
  // Hole: 7-J. Flop: 7-J-2 (two pair). Turn: 2 (board 7-J-2-2).
  // Board now has pair of 2s. You don't hold a 2.
  // Your best hand: J-J (hole+board) + 7-7... wait, no board 7. Board: 7-J-2-2.
  // hole J+7, board J+7+2+2. Best 5: JJ+77+2 = two pair (Js and 7s) — unchanged.
  // The "counterfeit" here is that 2-2 on board is higher than... no, 2s are low.
  // TRUE counterfeit from classic poker: hole 6-7, board 8-9-K, turn K (board 8-9-K-K).
  // On flop you had nothing (no pair). Not a counterfeit setup.
  // The REAL classic: hole A-4, board 4-5-6 (one pair of 4s). Turn: 4 (board 4-5-6-4).
  // Board pairs your 4. You now have trips of 4s. Better, not worse.
  // ---
  // Definitive counterfeit: hole 6-7, flop 6-7-K (two pair 7s+6s), turn K (board 6-7-K-K).
  // Board pairs K. You don't hold K. Your 6 and 7 are still relevant:
  // Best hand: KK (board) + 77 (hole+board) + 6 kicker = two pair (Ks and 7s).
  // On the flop your two pair was 7s+6s. On the turn your two pair is now Ks+7s.
  // Your 6 was part of your two pair and is now just a kicker — THAT is counterfeit.
  // The lower pair (6s) got knocked out and replaced by the board's K pair.

  const loRanks = ["6","7","8","9","T"];
  const idx = Math.floor(Math.random() * 4); // leave room for lo+1
  const lo = loRanks[idx];       // e.g. "6" — the card that gets counterfeited
  const mid = loRanks[idx + 1];  // e.g. "7" — stays in two pair after counterfeit
  // High kicker on flop that will pair on turn
  const hiOptions = ["A","K","Q","J"].filter(r => RANK_VAL[r] > RANK_VAL[mid]);
  const hi = hiOptions[Math.floor(Math.random() * hiOptions.length)];
  // Flop: lo, mid, hi — hole has lo+mid giving two pair
  // Turn: hi pairs — board becomes lo, mid, hi, hi
  const hole = [c(lo, SUITS[0]), c(mid, SUITS[1])];
  const board = [
    c(lo, SUITS[2]),   // pairs lo
    c(mid, SUITS[2]),  // pairs mid
    c(hi, SUITS[3]),   // high kicker
    c(hi, SUITS[0]),   // turn: hi pairs — counterfeits lo
  ];
  // On flop: two pair — mid+lo. On turn: two pair — hi+mid (lo got replaced by hi pair).
  // Your lo hole card no longer contributes to two pair — it's been counterfeited.
  const correct = `Still two pair, but now ${hi}s and ${mid}s — my ${lo} was counterfeited`;
  const opts = shuffle([
    correct,
    `Still two pair — ${mid}s and ${lo}s, nothing changed`,
    `Full house — the board pair helps me`,
    `Three of a Kind`,
  ]);
  return {
    hole, board,
    question: `On the flop you had two pair (${mid}s and ${lo}s). The ${hi} paired on the turn. What happened to your hand?`,
    options: opts,
    correctIndex: opts.indexOf(correct),
    explanation: `This is a counterfeit. On the flop your two pair was ${mid}s and ${lo}s — both your hole cards were active contributors. When the ${hi} paired on the turn, the board's ${hi}-${hi} outranked your ${lo}s and took over as the higher pair in your best 5-card hand. Your two pair is now ${hi}s and ${mid}s — your ${lo} hole card went from being part of your hand to an irrelevant kicker. You still have two pair, but a weaker version of it, and your ${lo} no longer gives you any edge over opponents.`,
    concept: "Board Interaction — Counterfeit",
    difficulty: "advanced",
  };
}

// Overpair scenarios — two versions depending on whether you're first to act or facing a bet
function buildOverpairScenario() {
  const pairs = ["A","K","Q","J","T"];
  const pairRank = pairs[Math.floor(Math.random() * pairs.length)];
  // Board pair rank must be lower than pocket pair
  const lowerRanks = RANKS.filter(r => RANK_VAL[r] < RANK_VAL[pairRank]);
  const boardPairRank = lowerRanks[Math.floor(Math.random() * lowerRanks.length)];
  const boardOther = pickRankExcluding([pairRank, boardPairRank]);
  const hole = [c(pairRank, SUITS[0]), c(pairRank, SUITS[1])];
  const board = [c(boardPairRank, SUITS[2]), c(boardPairRank, SUITS[3]), c(boardOther, SUITS[0])];

  const scenario = Math.random() > 0.5 ? "first_to_act" : "facing_bet";

  if (scenario === "first_to_act") {
    // You act first — leading with a bet is often correct
    const correct = "Bet around half pot — charge draws and weak pairs";
    const opts = shuffle([
      correct,
      "Check and give up — paired boards are too dangerous",
      "Go all-in immediately — overpair is the nuts",
      "Only bet if board pair is an Ace",
    ]);
    return {
      hole, board,
      question: `You have an overpair of ${pairRank}s and act first on a paired board. What's your play?`,
      options: opts,
      correctIndex: opts.indexOf(correct),
      explanation: `When you're first to act with an overpair, betting is usually correct — around 40-60% of the pot. You want to charge hands that beat you (like someone who holds the board pair rank) to continue, and fold out hands that have equity against you (underpairs, overcards, draws). The paired board IS a warning sign — if you face a large raise after betting, that's when you slow down. But leading out here is not a mistake. Passively checking gives free cards and looks weak.`,
      concept: "Hand Reading — Overpair vs Paired Board",
      difficulty: "advanced",
    };
  } else {
    // Facing a bet — the opponent's range is now weighted toward trips or better
    const correct = "Call — but keep the pot small and be ready to fold to a second big bet";
    const opts = shuffle([
      correct,
      "Raise — overpair is strong, punish their bet",
      "Fold immediately — paired board always means trips",
      "Go all-in — they're probably bluffing",
    ]);
    return {
      hole, board,
      question: `You have an overpair of ${pairRank}s. An opponent bets into you on this paired board. What do you do?`,
      options: opts,
      correctIndex: opts.indexOf(correct),
      explanation: `Facing a bet on a paired board narrows the picture significantly. Players don't often bluff into paired boards — a bet here typically represents a real hand: trips (holding a ${boardPairRank}), a full house, or at minimum a strong pair. Your ${pairRank}s are still ahead of bluffs and underpairs, so folding immediately is too tight. Calling is correct — but don't raise and bloat the pot, because when your opponent has trips you're drawing slim. If they fire again on the turn, strongly consider folding. One call is fine; building a huge pot with only an overpair is a leak.`,
      concept: "Hand Reading — Overpair vs Paired Board",
      difficulty: "advanced",
    };
  }
}

// Nut flush vs second-nut flush — action question
function buildNutFlushScenario() {
  const suit = pickSuit();
  const isNut = Math.random() > 0.5;
  let hole1Rank, hole2Rank, bF1, bF2, bF3, bO1, bO2;
  if (isNut) {
    hole1Rank = "A";
    const rest = shuffle(RANKS.filter(r => r !== "A"));
    hole2Rank = rest[0]; bF1 = rest[1]; bF2 = rest[2]; bF3 = rest[3];
    bO1 = rest[4]; bO2 = rest[5];
  } else {
    const nonAce = shuffle(RANKS.filter(r => r !== "A" && r !== "K"));
    hole1Rank = nonAce[0]; hole2Rank = nonAce[1];
    bF1 = nonAce[2]; bF2 = nonAce[3]; bF3 = nonAce[4];
    bO1 = nonAce[5]; bO2 = nonAce[6];
  }
  const hole = [c(hole1Rank, suit), c(hole2Rank, suit)];
  const board = [
    c(bF1, suit), c(bF2, suit), c(bF3, suit),
    c(bO1, pickSuitExcluding([suit])), c(bO2, pickSuitExcluding([suit])),
  ];
  const options = [
    "Raise — always bet your flush hard",
    isNut ? "Raise — you have the nut flush, bet for max value" : "Check/call — you have a flush but not the nuts",
    "Fold — three of a suit on board is scary",
    "All-in — flush always wins",
  ];
  const correct = isNut
    ? "Raise — you have the nut flush, bet for max value"
    : "Check/call — you have a flush but not the nuts";
  return {
    hole, board,
    question: `The board has three ${suit} cards and you have a flush. How should you play it?`,
    options,
    correctIndex: options.indexOf(correct),
    explanation: (() => {
      const boardRanks = board.map(c => c.rank);
      const boardPaired = new Set(boardRanks).size < boardRanks.length;
      if (isNut) {
        return boardPaired
          ? `You have the nut flush — the best possible flush with the Ace of ${suit}. No other flush can beat you. However, the board is paired, which means a full house or quads is possible. Bet for value but be cautious if you face a large raise — on a paired board, a raising opponent often has a boat.`
          : `You have the nut flush — the best possible flush with the Ace of ${suit}. On this unpaired board, the nut flush is the absolute nuts. No hand can beat you — a full house or quads requires a paired board, which this isn't. Bet for maximum value around 75% of the pot and don't slow-play. You cannot lose to a better hand.`;
      } else {
        return `You have a flush, but not the nut flush — anyone holding a higher ${suit} card has a better flush and beats you. On a three-flush board, proceed with caution. Check or call rather than raising, since a raise puts you in a tough spot if someone holds a higher ${suit} card. Always confirm whether your flush is the nut flush before committing chips.`;
      }
    })(),
    concept: "Hand Strength — Nut vs Non-Nut Flush",
    difficulty: "advanced",
  };
}

// ─── Scenario Queue for Guaranteed Variety ────────────────────────────────────
// Instead of pure random, rotate through categories ensuring variety
const SCENARIO_POOL = [
  buildFlushScenario,
  buildStraightScenario,
  buildFullHouseScenario,
  buildTwoPairScenario,
  buildTripsScenario,
  buildFlushDrawScenario,
  buildStraightDrawScenario,
  buildNutFlushQuestionScenario,
  buildFullHouseVsTripsScenario,
  buildCounterfeitScenario,
  buildOverpairScenario,
  buildNutFlushScenario,
  genHandRecognition,
  genDrawOrMade,
  genShouldYouCall,
  genBoardTexture,
  genPreflopDecision,
  genBetSizing,
];
// Parse a hand/board string like "8♥ 8♦" or "A♠ K♣ Q♦" into card objects
function parseCards(str) {
  if (!str) return [];
  const SUIT_MAP = { "♠":"♠","♥":"♥","♦":"♦","♣":"♣" };
  const tokens = str.trim().split(/\s+/);
  return tokens.map(t => {
    const suit = t.slice(-1);
    const rank = t.slice(0, -1);
    return SUIT_MAP[suit] ? { rank, suit } : null;
  }).filter(Boolean);
}

// Combined pool built lazily after all builders are defined
function getAllPatternBuilders() {
  return [...SCENARIO_POOL, ...EXPANDED_SCENARIO_BUILDERS];
}

// Weighted queue — ensures each category appears before repeating

let scenarioQueue = [];
function getNextScenario(filter) {
  let pool = getAllPatternBuilders();
  if (filter === "beginner") pool = [
    // Beginner: pure hand recognition only — no decisions
    buildFlushScenario, buildStraightScenario, buildFullHouseScenario,
    buildTwoPairScenario, buildTripsScenario, buildFullHouseScenario,
    genHandRecognition, genHandRecognition, genDrawOrMade,
  ];
  else if (filter === "intermediate") pool = [
    // Intermediate: draws, basic decisions, pot odds, preflop ranges
    buildFlushDrawScenario, buildStraightDrawScenario, buildNutFlushQuestionScenario,
    buildFullHouseVsTripsScenario, buildOverpairScenario,
    genShouldYouCall, genPreflopDecision, genBetSizing,
    genPotOdds, genCBet, genStackDepth, genMultiway, genSpotMistake, genPositionAdvantage,
  ];
  else if (filter === "advanced") pool = [
    // Advanced: board reading, nuanced strategy, non-obvious decisions
    buildCounterfeitScenario, buildNutFlushScenario, buildOverpairScenario,
    buildNutFlushQuestionScenario, buildFullHouseVsTripsScenario,
    genBoardTexture, genShouldYouCall, genBetSizing,
    genCheckRaise, genValueBetSizing, genBluffCatch, genSpotMistake,
  ];

  // Refill queue when empty (shuffle to avoid same order each cycle)
  if (scenarioQueue.length === 0) scenarioQueue = shuffle([...pool]);
  const gen = scenarioQueue.pop();
  try { return gen(); }
  catch(e) { return genHandRecognition(); } // fallback if builder throws
}

const GENERATORS = [genHandRecognition, genDrawOrMade, genShouldYouCall, genBoardTexture, genPreflopDecision, genBetSizing];
const DIFF_COLOR = { beginner: "#4ade80", intermediate: "#f59e0b", advanced: "#f87171" };

// ─── UI Components ────────────────────────────────────────────────────────────
function Card({ rank, suit, faceDown = false, size = "md" }) {
  const w  = size === "lg" ? 64  : size === "md" ? 50 : 40;
  const h  = size === "lg" ? 90  : size === "md" ? 70 : 56;
  const fs = size === "lg" ? 25  : size === "md" ? 19 : 15;  // rank: +1pt
  const ss = size === "lg" ? 22  : size === "md" ? 17 : 13;  // suit: 3pt smaller keeps visual balance
  if (faceDown) return (
    <div style={{
      width: w, height: h, borderRadius: 8,
      background: "repeating-linear-gradient(45deg, #0d2040, #0d2040 4px, #0a1628 4px, #0a1628 8px)",
      border: "2px solid #1e3a5f", boxShadow: "0 4px 12px #00000066",
    }} />
  );
  return (
    <div style={{
      width: w, height: h, borderRadius: 8,
      background: "linear-gradient(135deg, #f8f4e8 0%, #ede8d4 100%)",
      border: "2px solid #c8b97a",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      boxShadow: "0 4px 16px #00000066, inset 0 1px 0 #ffffff44",
      position: "relative",
    }}>
      <span style={{ fontSize: fs, fontWeight: 900, color: isRed(suit) ? "#c0392b" : "#1a1a2e", fontFamily: "'Playfair Display', serif", lineHeight: 1, marginBottom: 5 }}>{rank}</span>
      <span style={{ fontSize: ss, color: isRed(suit) ? "#c0392b" : "#1a1a2e", lineHeight: 1 }}>{suit}</span>
    </div>
  );
}

function ScoreBar({ correct, total, streak }) {
  const pct = total > 0 ? Math.round((correct/total)*100) : 0;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#e2e8f0", fontFamily: "'Playfair Display', serif" }}>{correct}/{total}</div>
        <div style={{ fontSize: 9, color: "#475569", letterSpacing: 2 }}>CORRECT</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ height: 6, background: "#0f1f35", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pct >= 70 ? "#4ade80" : pct >= 40 ? "#f59e0b" : "#f87171", transition: "width 0.5s ease", borderRadius: 3 }} />
        </div>
        <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>{pct}% accuracy</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: streak >= 3 ? "#f59e0b" : "#e2e8f0", fontFamily: "'Playfair Display', serif" }}>{streak}</div>
        <div style={{ fontSize: 9, color: "#475569", letterSpacing: 2 }}>STREAK</div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

// ─── Monte Carlo Simulation ───────────────────────────────────────────────────
function removeDead(deck, dead) {
  const keys = new Set(dead.map(c => c.rank + c.suit));
  return deck.filter(c => !keys.has(c.rank + c.suit));
}

// evaluate: best 5-card score from any number of cards (used by Monte Carlo)
function evaluate(cards) {
  const combos = choose5(cards);
  let best = -1;
  for (const combo of combos) {
    const s = score5(combo);
    if (s > best) best = s;
  }
  return best;
}

function monteCarlo(hole, board, opponents = 1, iters = 8000) {
  const dead = [...hole, ...board];
  const remaining = removeDead(buildDeck(), dead);
  const needed = 5 - board.length;
  let wins = 0, ties = 0, total = 0;
  for (let i = 0; i < iters; i++) {
    const deck = shuffle(remaining);
    let idx = 0;
    const runBoard = [...board, ...deck.slice(idx, idx + needed)];
    idx += needed;
    const myScore = evaluate([...hole, ...runBoard]);
    let best = myScore;
    let oppScores = [];
    for (let o = 0; o < opponents; o++) {
      const oppHole = deck.slice(idx, idx + 2);
      idx += 2;
      if (oppHole.length < 2) break;
      const s = evaluate([...oppHole, ...runBoard]);
      oppScores.push(s);
      if (s > best) best = s;
    }
    if (myScore === best) {
      const allBest = oppScores.filter(s => s === myScore).length === oppScores.length;
      if (allBest) ties++; else wins++;
    }
    total++;
  }
  return {
    win: Math.round((wins / total) * 1000) / 10,
    tie: Math.round((ties / total) * 1000) / 10,
    lose: Math.round(((total - wins - ties) / total) * 1000) / 10,
  };
}

function getHandName(hole, board) {
  if (board.length === 0) return null;
  const all = [...hole, ...board];
  const combos = choose5(all);
  let best = -1;
  for (const c of combos) { const s = score5(c); if (s > best) best = s; }
  return HAND_NAMES[Math.floor(best / 1e10)];
}

function preflopStrength(r1, r2, suited) {
  const hi = RANK_VAL[r1] >= RANK_VAL[r2] ? r1 : r2;
  const lo = RANK_VAL[r1] < RANK_VAL[r2] ? r1 : r2;
  const isPair = r1 === r2;
  const gap = RANK_VAL[hi] - RANK_VAL[lo];
  const hiV = RANK_VAL[hi], loV = RANK_VAL[lo];

  // Derive the tier so stars and label always agree with recommendations
  const tier = classifyHand(r1, r2, suited);

  // Stars map directly to tier — no exceptions
  // Tier 1 = 5★  Tier 2 = 4★  Tier 3 = 3★  Tier 4 = 2★  Tier 5 = 1★
  const stars = [0, 5, 4, 3, 2, 1][tier] ?? 1;

  // Descriptive label — explains the hand type, not the star rating
  let label;
  if (isPair) {
    if (["A","K","Q","J","T"].includes(hi)) label = "Premium Pair";
    else if (["9","8","7"].includes(hi))    label = "Strong Pair";
    else                                     label = "Small Pair";
  } else if (hi === "A" && lo === "K")       label = "Ace-King (Big Slick)";
  else if (hi === "A" && ["Q","J"].includes(lo)) label = suited ? "Suited Big Ace" : "Big Ace";
  else if (hi === "A" && loV >= 9)           label = suited ? "Suited Ace (Mid)" : "Ace-High (Borderline)";
  else if (hi === "A" && loV >= 7)           label = suited ? "Suited Ace (Low)" : "Weak Ace";
  else if (hi === "A" && loV >= 5)           label = suited ? "Suited Ace (Wheel)" : "Ace-Low";
  else if (hi === "A")                       label = suited ? "Suited Ace" : "Ace-Low";
  else if (hi === "K" && loV >= 11)          label = suited ? "Suited King (High)" : "King-Queen";
  else if (hi === "K" && loV >= 9)           label = suited ? "Suited King (Mid)" : "King-High (Marginal)";
  else if (hi === "K")                       label = suited ? "Suited King (Low)" : "Weak King";
  else if (suited && gap <= 1 && hiV >= 10)  label = "Suited Connector (High)";
  else if (suited && gap <= 1)               label = "Suited Connector (Low)";
  else if (gap <= 1 && hiV >= 10)            label = "Broadway Connector";
  else if (gap <= 1)                         label = "Low Connector";
  else if (suited && hiV >= 10)              label = "Suited Broadway";
  else if (suited)                           label = "Suited Hand (Low)";
  else if (hiV >= 10 && loV >= 10)           label = "Broadway Cards";
  else                                       label = "Weak Hand";

  return { label, stars };
}

function potOddsAdvice(winPct, potOdds) {
  if (!potOdds || potOdds <= 0) return null;
  const needed = (potOdds / (100 + potOdds)) * 100;
  if (winPct >= needed + 10) return { verdict: "Strong Call", color: "#4ade80", detail: `You need ${needed.toFixed(0)}% equity to break even. You have ${winPct}% — this is a profitable call.` };
  if (winPct >= needed) return { verdict: "Marginal Call", color: "#f59e0b", detail: `You need ${needed.toFixed(0)}% to break even. You have ${winPct}% — close call, consider position and opponent tendencies.` };
  return { verdict: "Fold Likely", color: "#f87171", detail: `You need ${needed.toFixed(0)}% to break even but only have ${winPct}%. Folding is mathematically correct unless you have strong reads.` };
}

// ─── Shared UI Primitives ──────────────────────────────────────────────────────
function MiniCard({ rank, suit, onClick, selected, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 26, height: 36, borderRadius: 4, border: `2px solid ${selected ? "#f59e0b" : "#1e3a5f"}`,
      background: selected ? "#1e3a5f" : disabled ? "#080e1a" : "#0d1f35",
      color: isRed(suit) ? "#f87171" : "#e2e8f0",
      cursor: disabled ? "not-allowed" : "pointer",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontSize: 10, fontWeight: 700, fontFamily: "'Playfair Display', serif",
      opacity: disabled ? 0.25 : 1,
      boxShadow: selected ? "0 0 8px #f59e0b66" : "none",
      transition: "all 0.12s", transform: selected ? "translateY(-2px)" : "none",
      padding: 0, flexShrink: 0, gap: 2,
    }}>
      <span style={{ lineHeight: 1, fontSize: 11, fontWeight: 800, marginBottom: 2 }}>{rank}</span>
      <span style={{ lineHeight: 1, fontSize: 9 }}>{suit}</span>
    </button>
  );
}

function BigCard({ rank, suit, onRemove, placeholder }) {
  if (!rank) return (
    <div style={{
      width: 56, height: 78, borderRadius: 8, border: "2px dashed #1a3050",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#1e3a5f", fontSize: 9, textAlign: "center", padding: 4, background: "#060d1a",
    }}>{placeholder}</div>
  );
  return (
    <div onClick={onRemove} title="Tap to remove" style={{
      width: 56, height: 78, borderRadius: 8, border: "2px solid #f59e0b",
      background: "linear-gradient(135deg, #0f2744 0%, #0a1628 100%)",
      boxShadow: "0 0 16px #f59e0b33, 0 4px 16px #00000088",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      cursor: "pointer", position: "relative", gap: 4,
    }}>
      <span style={{ fontSize: 21, fontWeight: 900, color: isRed(suit) ? "#f87171" : "#e2e8f0", fontFamily: "'Playfair Display', serif", lineHeight: 1, marginBottom: 5 }}>{rank}</span>
      <span style={{ fontSize: 18, color: isRed(suit) ? "#f87171" : "#e2e8f0", lineHeight: 1 }}>{suit}</span>
      <div style={{ position: "absolute", top: 3, right: 5, fontSize: 9, color: "#475569" }}>✕</div>
    </div>
  );
}

function OddsBar({ win, tie, lose }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 12, marginBottom: 6 }}>
        <div style={{ width: `${win}%`, background: "linear-gradient(90deg,#16a34a,#4ade80)", transition: "width 0.6s ease" }} />
        <div style={{ width: `${tie}%`, background: "#f59e0b", transition: "width 0.6s ease" }} />
        <div style={{ width: `${lose}%`, background: "linear-gradient(90deg,#dc2626,#f87171)", transition: "width 0.6s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ color: "#4ade80" }}>WIN {win}%</span>
        {tie > 0.5 && <span style={{ color: "#f59e0b" }}>TIE {tie}%</span>}
        <span style={{ color: "#f87171" }}>LOSE {lose}%</span>
      </div>
    </div>
  );
}

function StarRow({ stars }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize: 14, color: i <= stars ? "#f59e0b" : "#1e3a5f" }}>★</span>
      ))}
    </div>
  );
}

// ─── Screen: Hand Analyzer (Phase 1) ──────────────────────────────────────────
function AnalyzerScreen() {
  const [holeCards, setHoleCards] = useState([]);
  const allDead = [...holeCards];
  const isDeadCard = (r, s) => allDead.some(c => c.rank === r && c.suit === s);

  const handleCard = (rank, suit) => {
    if (holeCards.length >= 2 || isDeadCard(rank, suit)) return;
    setHoleCards([...holeCards, { rank, suit }]);
  };
  const removeCard = (i) => setHoleCards(holeCards.filter((_, idx) => idx !== i));
  const reset = () => setHoleCards([]);

  const r1 = holeCards[0]?.rank, r2 = holeCards[1]?.rank;
  const suited = holeCards.length === 2 && holeCards[0].suit === holeCards[1].suit;
  const strength = holeCards.length === 2 ? preflopStrength(r1, r2, suited) : null;
  const tier = holeCards.length === 2 ? classifyHand(r1, r2, suited) : null;

  const tierInfo = tier === 1 ? { label: "Premium — Raise Any Table", color: "#4ade80" }
    : tier === 2 ? { label: "Solid — Raise 6-max, Late at 9-max", color: "#a3e635" }
    : tier === 3 ? { label: "Speculative — Position Dependent", color: "#f59e0b" }
    : tier === 4 ? { label: "Short-handed Only", color: "#fb923c" }
    : tier === 5 ? { label: "Fold", color: "#f87171" }
    : null;

  return (
    <div style={{ padding: "12px 6px", maxWidth: 600, margin: "0 auto", boxSizing: "border-box" }}>

      {/* Hole cards display */}
      <div style={{ background: "#0a1628", border: "1px solid #0f2033", borderRadius: 14, padding: "20px", marginBottom: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "#475569", marginBottom: 12 }}>YOUR HOLE CARDS</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {[0, 1].map(i => (
            <BigCard key={i}
              rank={holeCards[i]?.rank} suit={holeCards[i]?.suit}
              onRemove={() => removeCard(i)}
              placeholder={i === 0 ? "Card 1" : "Card 2"}
            />
          ))}
          {holeCards.length < 2 && (
            <div style={{ display: "flex", alignItems: "center", color: "#1e3a5f", fontSize: 12, marginLeft: 8 }}>
              ← Select from grid below
            </div>
          )}
        </div>

        {strength && tierInfo && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 }}>{strength.label}</div>
                <StarRow stars={strength.stars} />
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, color: tierInfo.color, fontWeight: 700, letterSpacing: 1 }}>
                  {tierInfo.label}
                </div>
              </div>
            </div>
            <div style={{ borderTop: "1px solid #0f2033", paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontSize: 12, color: "#475569", letterSpacing: 2, marginBottom: 10 }}>BY TABLE SIZE</div>
              {[
                { n: 9, label: "9-max Full Ring" },
                { n: 6, label: "6-max" },
                { n: 3, label: "3-handed" },
                { n: 2, label: "Heads-up" },
              ].map(({ n, label }) => {
                const isPair = r1 === r2;
                const rec =
                  tier === 1 ? { action: "Raise", color: "#4ade80" }
                  : tier === 2 && n <= 3 ? { action: "Raise", color: "#4ade80" }
                  : tier === 2 && n <= 6 ? { action: "Raise", color: "#4ade80" }
                  : tier === 2 ? { action: "Raise cutoff/button, fold early", color: "#a3e635" }
                  : tier === 3 && isPair && n <= 3 ? { action: "Raise or Call", color: "#60a5fa" }
                  : tier === 3 && isPair ? { action: "Call to set-mine, fold to 4x+ raise", color: "#f59e0b" }
                  : tier === 3 && n <= 3 ? { action: "Raise or Call", color: "#60a5fa" }
                  : tier === 3 && n <= 6 ? { action: "Raise cutoff/button, fold early", color: "#f59e0b" }
                  : tier === 3 ? { action: "Fold", color: "#f87171" }
                  : tier === 4 && n <= 2 ? { action: "Raise or Call", color: "#60a5fa" }
                  : tier === 4 && n <= 3 ? { action: "Call or fold — borderline", color: "#fb923c" }
                  : { action: "Fold", color: "#f87171" };
                return (
                  <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #0a1220" }}>
                    <span style={{ fontSize: 13, color: "#94a3b8" }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: rec.color }}>{rec.action}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!strength && (
          <div style={{ color: "#1e3a5f", fontSize: 12, textAlign: "center", padding: "12px 0" }}>
            Select two hole cards to analyze
          </div>
        )}
      </div>

      {/* Card picker grid — 13 cols, 4 rows, fits any phone */}
      <div style={{ background: "#0a1628", border: "1px solid #0f2033", borderRadius: 12, padding: "10px 8px" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: "#475569", marginBottom: 10 }}>SELECT CARDS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(13, 1fr)", gap: 2 }}>
          {SUITS.map(suit => RANKS.map(rank => (
            <MiniCard key={rank+suit} rank={rank} suit={suit}
              selected={isDeadCard(rank, suit)}
              disabled={isDeadCard(rank, suit) || holeCards.length >= 2}
              onClick={() => handleCard(rank, suit)}
            />
          )))}
        </div>
        <div style={{ display:"flex", gap:8, marginTop:8, justifyContent:"center" }}>
          {SUITS.map(s => (
            <span key={s} style={{ fontSize:11, color: isRed(s)?"#f87171":"#94a3b8" }}>{s === "♠" ? "♠ Spades" : s === "♥" ? "♥ Hearts" : s === "♦" ? "♦ Diamonds" : "♣ Clubs"}</span>
          ))}
        </div>
      </div>

      {holeCards.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 12, marginBottom: 4 }}>
          <button onClick={reset} style={{
            padding: "10px 32px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: 1,
            border: "1px solid #f8717166", background: "linear-gradient(135deg,#2a0a0a,#1a0a0a)",
            color: "#f87171", boxShadow: "0 0 14px #f8717122",
          }}>↺ Reset Hand</button>
        </div>
      )}
    </div>
  );
}

// ─── Claude API helper — works on web and mobile ─────────────────────────────
async function callClaude(prompt, systemPrompt) {
  try {
    const body = { prompt, systemPrompt };
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data;
    try { data = await res.json(); } catch (_) { data = null; }
    if (data && data.text) return { ok: true, text: data.text };
    if (data && data.error) return { ok: false, text: `Error: ${data.error}` };
  } catch (e) {
    return { ok: false, text: "Network error — please check your connection." };
  }
  return { ok: false, text: "Something went wrong. Please try again." };
}

// ─── Screen: Odds + AI Coach (Phases 2 & 3) ───────────────────────────────────
function OddsScreen() {
  const [phase, setPhase] = useState("select");
  const [holeCards, setHoleCards] = useState([]);
  const [boardCards, setBoardCards] = useState([]);
  const [boardSlot, setBoardSlot] = useState(null);
  const [opponents, setOpponents] = useState(1);
  const [potOddsInput, setPotOddsInput] = useState("");
  const [odds, setOdds] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [activeTab, setActiveTab] = useState("odds");
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const allDead = [...holeCards, ...boardCards.filter(Boolean)];
  const isDeadCard = (r, s) => allDead.some(c => c.rank === r && c.suit === s);
  const filledCount = boardCards.filter(Boolean).length;
  const boardStage = filledCount === 0 ? "Preflop" : filledCount <= 3 ? "Flop" : filledCount === 4 ? "Turn" : "River";

  const handleHoleCard = (rank, suit) => {
    if (holeCards.length >= 2 || isDeadCard(rank, suit)) return;
    const next = [...holeCards, { rank, suit }];
    setHoleCards(next);
    if (next.length === 2) setPhase("board");
  };

  const handleBoardCard = (rank, suit) => {
    if (isDeadCard(rank, suit) || boardSlot === null) return;
    const next = [...boardCards];
    next[boardSlot] = { rank, suit };
    setBoardCards(next);
    const newFlopFilled = next.filter((c, i) => i < 3 && c).length;
    if (boardSlot < 3 && newFlopFilled < 3) setBoardSlot(boardSlot + 1);
    else setBoardSlot(null);
  };

  const flopFilled = boardCards.filter((c, i) => i < 3 && c).length;
  const canSelectSlot = (i) => {
    if (i < 3) return i === flopFilled && flopFilled < 3;
    if (i === 3) return flopFilled === 3 && !boardCards[3];
    if (i === 4) return boardCards[3] && !boardCards[4];
    return false;
  };

  useEffect(() => {
    if (holeCards.length < 2) { setOdds(null); return; }
    setCalculating(true);
    const timer = setTimeout(() => {
      const result = monteCarlo(holeCards, boardCards.filter(Boolean), opponents, 8000);
      setOdds(result);
      setCalculating(false);
    }, 50);
    return () => clearTimeout(timer);
  }, [holeCards, boardCards, opponents]);

  const reset = () => {
    setHoleCards([]); setBoardCards([]); setOdds(null); setBoardSlot(null);
    setPotOddsInput(""); setPhase("select"); setAiAdvice(null); setAiError(null);
  };

  const handName = holeCards.length === 2 ? getHandName(holeCards, boardCards.filter(Boolean)) : null;
  const preflop = holeCards.length === 2 ? preflopStrength(holeCards[0].rank, holeCards[1].rank, holeCards[0].suit === holeCards[1].suit) : null;
  const potAdvice = odds ? potOddsAdvice(odds.win, parseFloat(potOddsInput)) : null;

  const getAiAdvice = async () => {
    if (!holeCards.length) return;
    setAiLoading(true); setAiError(null); setAiAdvice(null); setActiveTab("ai");
    const validBoard = boardCards.filter(Boolean);
    const cardStr = c => `${c.rank}${c.suit}`;
    const prompt = `You are a precise, knowledgeable poker coach. Give accurate, direct analysis — no filler phrases. Speak clearly to someone learning poker who is smart but new.

CRITICAL RULES:
Hand rankings strongest to weakest: Straight Flush, Four of a Kind, Full House (beats Flush), Flush, Straight, Three of a Kind, Two Pair, One Pair, High Card.

Threat analysis — verify against player's hole cards before flagging:
- If player holds a card that blocks a draw, do NOT mention that threat.
- If player holds flush suit cards, note as asset not threat.
- Only list threats genuinely dangerous given what opponent could hold that player does NOT block.

Current hand:
- Hole cards: ${holeCards.map(cardStr).join(" and ")}
- Board: ${validBoard.length > 0 ? validBoard.map(cardStr).join(", ") : "none (preflop)"}
- Street: ${boardStage}
- Best hand: ${handName || "none yet"}
- Win probability vs ${opponents} opponent(s): ${odds?.win ?? "?"}% win, ${odds?.tie ?? "?"}% tie, ${odds?.lose ?? "?"}% lose
- Hand type: ${preflop?.label || "unknown"}

Provide exactly:
1. Hand strength — how strong and why
2. What to watch for — only genuine threats
3. Recommendation — bet/raise, call, or fold with brief reason
4. Key concept — one poker principle this illustrates

150-200 words. No emojis. No motivational sign-offs.`;

    try {
      const result = await callClaude(prompt);
      if (result.ok) setAiAdvice(result.text);
      else setAiError(result.text);
    } catch (e) {
      setAiError("Something went wrong. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const clickable = phase === "select" ? holeCards.length < 2 : boardSlot !== null;

  return (
    <div style={{ padding: "12px 6px", maxWidth: 600, margin: "0 auto", boxSizing: "border-box" }}>

      {/* Combined hole cards + board in one section */}
      <div style={{ background: "#0a1628", border: "1px solid #0f2033", borderRadius: 14, padding: "14px", marginBottom: 10 }}>

        {/* Row: hole cards left, board slots right */}
        <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>

          {/* Hole cards column */}
          <div style={{ flexShrink:0 }}>
            <div style={{ fontSize:11,letterSpacing:2,color:"#475569",marginBottom:8 }}>HOLE</div>
            <div style={{ display:"flex",gap:5 }}>
              {[0,1].map(i => (
                <BigCard key={i} rank={holeCards[i]?.rank} suit={holeCards[i]?.suit}
                  onRemove={() => { setHoleCards(holeCards.filter((_,idx)=>idx!==i)); setBoardCards([]); setOdds(null); setBoardSlot(null); setPhase("select"); }}
                  placeholder={i===0?"C1":"C2"}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width:1,background:"#0f2033",alignSelf:"stretch",flexShrink:0,margin:"18px 0 0" }} />

          {/* Board slots column */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6 }}>
              <div style={{ fontSize:11,letterSpacing:2,color:"#475569" }}>
                {phase==="board" ? `BOARD — ${boardStage.toUpperCase()}` : "BOARD"}
              </div>
              {handName && <div style={{ fontSize:13,fontWeight:700,color:"#f59e0b" }}>{handName}</div>}
              {holeCards.length < 2 && <div style={{ fontSize:10,color:"#1e3a5f" }}>← pick hole cards first</div>}
            </div>
            <div style={{ display:"flex",gap:4,flexWrap:"nowrap" }}>
              {["F1","F2","F3","T","R"].map((label,i) => {
                const card = boardCards[i];
                const canClick = phase==="board" && canSelectSlot(i);
                const isSelected = boardSlot === i;
                if (card) return (
                  <div key={i} onClick={() => { const next=[...boardCards]; next[i]=undefined; setBoardCards(next.filter((_,idx)=>idx<i)); setOdds(null); setBoardSlot(null); }}
                    title="Click to remove" style={{ cursor:"pointer",position:"relative",flexShrink:0 }}>
                    <div style={{ width:44,height:62,borderRadius:7,border:`2px solid ${isSelected?"#f59e0b":"#4ade80"}`,
                      background:"linear-gradient(135deg,#0f2744,#0a1628)",
                      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
                      <span style={{ fontSize:16,fontWeight:900,color:isRed(card.suit)?"#f87171":"#e2e8f0",fontFamily:"'Playfair Display',serif",lineHeight:1,marginBottom:5 }}>{card.rank}</span>
                      <span style={{ fontSize:14,color:isRed(card.suit)?"#f87171":"#e2e8f0",lineHeight:1 }}>{card.suit}</span>
                    </div>
                    <div style={{ position:"absolute",top:2,right:4,fontSize:8,color:"#475569" }}>✕</div>
                  </div>
                );
                return (
                  <div key={i} onClick={() => canClick && setBoardSlot(i)} style={{
                    width:44,height:62,borderRadius:7,flexShrink:0,
                    border:`2px dashed ${isSelected?"#f59e0b":canClick?"#1e3a5f":"#0a1220"}`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    color:canClick?"#334155":"#0a1220",fontSize:9,textAlign:"center",
                    cursor:canClick?"pointer":"default",background:"#060d1a",
                    boxShadow:isSelected?"0 0 10px #f59e0b44":"none",
                  }}>{label}</div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Preflop label below, only when hole cards picked */}
        {preflop && (
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,paddingTop:8,borderTop:"1px solid #0f2033" }}>
            <div style={{ fontSize:14,fontWeight:700,color:"#e2e8f0" }}>{preflop.label}</div>
            <StarRow stars={preflop.stars} />
          </div>
        )}
        {holeCards.length < 2 && phase === "select" && (
          <div style={{ fontSize:12,color:"#1e3a5f",marginTop:8,textAlign:"center" }}>Select two hole cards from the grid below</div>
        )}
      </div>

      {/* Odds panel — show as soon as 2 hole cards selected */}
      {holeCards.length >= 2 && (
        <div style={{ background: "#0a1628", border: "1px solid #0f2033", borderRadius: 14, padding: "16px", marginBottom: 12 }}>
          <div style={{ display:"flex",gap:0,marginBottom:14,borderRadius:8,overflow:"hidden",border:"1px solid #0f2033" }}>
            {["odds","ai"].map((tab,i) => (
              <button key={tab} onClick={()=>setActiveTab(tab)} style={{
                flex:1,padding:"10px 0",fontSize:12,fontWeight:700,letterSpacing:2,
                background:activeTab===tab?"#0f2744":"transparent",
                color:activeTab===tab?"#f59e0b":"#334155",
                border:"none",cursor:"pointer",textTransform:"uppercase",
                borderRight:i===0?"1px solid #0f2033":"none",
              }}>{tab==="odds"?"Win Odds":"✦ AI Coach"}</button>
            ))}
          </div>

          {activeTab==="odds" && (
            <div>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                <div style={{ fontSize:11,letterSpacing:2,color:"#475569" }}>VS</div>
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={()=>setOpponents(n)} style={{
                    width:28,height:28,borderRadius:6,
                    background:opponents===n?"#f59e0b":"#0f1f35",
                    color:opponents===n?"#000":"#475569",
                    border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                  }}>{n}</button>
                ))}
                <div style={{ fontSize:12,color:"#334155" }}>opponents</div>
              </div>
              {calculating || !odds ? (
                <div style={{ color:"#334155",fontSize:13,padding:"14px 0" }}>Simulating 8,000 hands...</div>
              ) : (
                <>
                  <div style={{ display:"flex",gap:20,marginTop:4 }}>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:30,fontWeight:900,color:"#4ade80",fontFamily:"'Playfair Display',serif" }}>{odds.win}%</div>
                      <div style={{ fontSize:10,color:"#475569",letterSpacing:1 }}>WIN</div>
                    </div>
                    {odds.tie>0.5 && <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:30,fontWeight:900,color:"#f59e0b",fontFamily:"'Playfair Display',serif" }}>{odds.tie}%</div>
                      <div style={{ fontSize:10,color:"#475569",letterSpacing:1 }}>TIE</div>
                    </div>}
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:30,fontWeight:900,color:"#f87171",fontFamily:"'Playfair Display',serif" }}>{odds.lose}%</div>
                      <div style={{ fontSize:10,color:"#475569",letterSpacing:1 }}>LOSE</div>
                    </div>
                  </div>
                  <OddsBar win={odds.win} tie={odds.tie} lose={odds.lose} />
                  <div style={{ fontSize:12,color:"#334155",marginTop:8 }}>8,000 simulated runouts · {boardStage}</div>
                </>
              )}
              <div style={{ marginTop:14,paddingTop:12,borderTop:"1px solid #0f2033" }}>
                <div style={{ fontSize:11,letterSpacing:2,color:"#475569",marginBottom:10 }}>POT ODDS CALCULATOR</div>
                <div style={{ fontSize:12,color:"#334155",marginBottom:10,lineHeight:1.5 }}>
                  Enter what % of the pot you need to call. (e.g. pot $100, call $25 → enter 25)
                </div>
                <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap" }}>
                  <span style={{ fontSize:13,color:"#475569",whiteSpace:"nowrap" }}>Call-to-Pot %:</span>
                  <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                    <input type="number" min="1" max="100" placeholder="25"
                      value={potOddsInput} onChange={e=>setPotOddsInput(e.target.value)}
                      style={{ width:60,padding:"6px 8px",borderRadius:6,border:"1px solid #1e3a5f",background:"#060d1a",color:"#e2e8f0",fontSize:13,boxSizing:"border-box" }}
                    />
                    <span style={{ fontSize:12,color:"#475569" }}>%</span>
                  </div>
                </div>
                {potAdvice && (
                  <div style={{ padding:"10px 14px",borderRadius:10,background:potAdvice.color+"11",border:`1px solid ${potAdvice.color}44` }}>
                    <div style={{ fontSize:15,fontWeight:700,color:potAdvice.color,marginBottom:6 }}>{potAdvice.verdict}</div>
                    <div style={{ fontSize:13,color:"#94a3b8",lineHeight:1.6 }}>{potAdvice.detail}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab==="ai" && (
            <div>
              {!aiAdvice && !aiLoading && !aiError && (
                <div style={{ textAlign:"center",padding:"8px 0 12px" }}>
                  <div style={{ fontSize:13,color:"#475569",marginBottom:14,lineHeight:1.6 }}>
                    Get a breakdown of your hand — strength, threats, and what to do next.
                  </div>
                  <button onClick={getAiAdvice} style={{
                    padding:"11px 28px",borderRadius:10,border:"1px solid #f59e0b66",
                    background:"linear-gradient(135deg,#1a3a0f,#0f2033)",
                    color:"#f59e0b",cursor:"pointer",fontSize:13,fontWeight:700,letterSpacing:1,
                    boxShadow:"0 0 20px #f59e0b22",
                  }}>Ask the AI Coach</button>
                </div>
              )}
              {aiLoading && (
                <div style={{ textAlign:"center",padding:"20px 0" }}>
                  <div style={{ fontSize:22,marginBottom:6 }}>♠</div>
                  <div style={{ fontSize:11,color:"#475569",letterSpacing:2 }}>ANALYZING YOUR HAND...</div>
                </div>
              )}
              {aiError && <div style={{ padding:"10px 14px",borderRadius:8,background:"#f8717122",border:"1px solid #f8717144",fontSize:12,color:"#f87171" }}>{aiError}</div>}
              {aiAdvice && (
                <div>
                  <div style={{ padding:"14px",borderRadius:10,background:"linear-gradient(135deg,#0a1f0a,#060d1a)",border:"1px solid #1a3a1a",fontSize:13,color:"#94a3b8",lineHeight:1.8,whiteSpace:"pre-wrap" }}>
                    <div style={{ fontSize:10,letterSpacing:3,color:"#4ade80",marginBottom:8 }}>✦ AI COACH</div>
                    {aiAdvice}
                  </div>
                  <button onClick={getAiAdvice} style={{ marginTop:10,padding:"8px 18px",borderRadius:8,border:"1px solid #f59e0b88",background:"#1a2a1a",color:"#f59e0b",cursor:"pointer",fontSize:12,fontWeight:600,letterSpacing:1 }}>Ask Again</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Card picker — 13-col grid, fits mobile */}
      <div style={{ background:"#0a1628",border:"1px solid #0f2033",borderRadius:12,padding:"10px 8px" }}>
        <div style={{ fontSize:11,letterSpacing:3,color:"#475569",marginBottom:8 }}>
          {phase==="select" ? "SELECT HOLE CARDS" : boardSlot!==null ? `BOARD SLOT ${boardSlot+1}` : "TAP A BOARD SLOT FIRST"}
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(13,1fr)",gap:2 }}>
          {SUITS.map(suit => RANKS.map(rank => {
            const dead = isDeadCard(rank, suit);
            return (
              <MiniCard key={rank+suit} rank={rank} suit={suit}
                selected={dead} disabled={dead || !clickable}
                onClick={() => {
                  if (dead) return;
                  if (phase==="select") handleHoleCard(rank, suit);
                  else if (boardSlot!==null) handleBoardCard(rank, suit);
                }}
              />
            );
          }))}
        </div>
        <div style={{ display:"flex",gap:8,marginTop:8,justifyContent:"center" }}>
          {SUITS.map(s => (
            <span key={s} style={{ fontSize:11,color:isRed(s)?"#f87171":"#94a3b8" }}>{s === "♠" ? "♠ Spades" : s === "♥" ? "♥ Hearts" : s === "♦" ? "♦ Diamonds" : "♣ Clubs"}</span>
          ))}
        </div>
      </div>

      <div style={{ textAlign:"center",marginTop:12,marginBottom:4 }}>
        <button onClick={reset} style={{
          padding:"10px 32px",borderRadius:10,cursor:"pointer",fontSize:12,fontWeight:700,letterSpacing:1,
          border:"1px solid #f8717166",background:"linear-gradient(135deg,#2a0a0a,#1a0a0a)",
          color:"#f87171",boxShadow:"0 0 14px #f8717122",
        }}>↺ Reset Hand</button>
      </div>
    </div>
  );
}

// ─── Storage Layer ─────────────────────────────────────────────────────────────
// Persists lifetime stats across sessions using window.storage

const STORAGE_KEY = "poker-trainer-stats-v1";

const DEFAULT_STATS = {
  totalCorrect: 0,
  totalAnswered: 0,
  bestStreak: 0,
  byCategory: {}, // { "Pattern":{ correct, total }, "Position":{ correct, total } }
  byConcept: {},  // { "Flush Draw":{ correct, total }, ... }
  badges: [],     // array of earned badge ids
  sessions: 0,
  lastPlayed: null,
};

async function loadStats() {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    if (result && result.value) return { ...DEFAULT_STATS, ...JSON.parse(result.value) };
  } catch {}
  return { ...DEFAULT_STATS };
}

async function saveStats(stats) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(stats));
  } catch {}
}

function updateStats(prev, { category, concept, correct, streak }) {
  const next = { ...prev };
  next.totalAnswered = (prev.totalAnswered || 0) + 1;
  next.totalCorrect  = (prev.totalCorrect  || 0) + (correct ? 1 : 0);
  next.bestStreak    = Math.max(prev.bestStreak || 0, streak);
  next.lastPlayed    = new Date().toISOString();

  // by category
  const cat = next.byCategory[category] || { correct:0, total:0 };
  next.byCategory = { ...next.byCategory, [category]: { correct: cat.correct+(correct?1:0), total: cat.total+1 } };

  // by concept
  const con = next.byConcept[concept] || { correct:0, total:0 };
  next.byConcept = { ...next.byConcept, [concept]: { correct: con.correct+(correct?1:0), total: con.total+1 } };

  return next;
}

// ─── Badge Definitions ─────────────────────────────────────────────────────────
const BADGES = [
  { id:"fresh_dealt",    icon:"🃏", name:"Fresh Dealt",    desc:"Answer your first question",          check: s => s.totalAnswered >= 1 },
  { id:"sharp_eye",      icon:"🎯", name:"Sharp Eye",      desc:"Get 10 correct answers",              check: s => s.totalCorrect >= 10 },
  { id:"on_a_heater",    icon:"🔥", name:"On a Heater",    desc:"Hit a 5-question streak",             check: s => s.bestStreak >= 5 },
  { id:"table_reader",   icon:"📍", name:"Table Reader",   desc:"Get 10 correct on Positions",         check: s => (s.byCategory["Position"]?.correct || 0) >= 10 },
  { id:"pattern_pro",    icon:"🧠", name:"Pattern Pro",    desc:"Get 10 correct on Patterns",          check: s => (s.byCategory["Pattern"]?.correct  || 0) >= 10 },
  { id:"hot_streak",     icon:"⚡", name:"Hot Streak",     desc:"Hit a 10-question streak",            check: s => s.bestStreak >= 10 },
  { id:"grinder",        icon:"💰", name:"Grinder",        desc:"Get 50 correct answers",              check: s => s.totalCorrect >= 50 },
  { id:"poker_scholar",  icon:"🏆", name:"Poker Scholar",  desc:"Get 100 correct answers",             check: s => s.totalCorrect >= 100 },
  { id:"high_roller",    icon:"🎰", name:"High Roller",    desc:"Hit a 25-question streak",            check: s => s.bestStreak >= 25 },
  { id:"table_captain",  icon:"👑", name:"Table Captain",  desc:"Get 100 correct on Positions",        check: s => (s.byCategory["Position"]?.correct || 0) >= 100 },
  { id:"card_sharp",     icon:"🂠", name:"Card Sharp",     desc:"Get 100 correct on Patterns",         check: s => (s.byCategory["Pattern"]?.correct  || 0) >= 100 },
  { id:"well_rounded",   icon:"⭐", name:"Well Rounded",   desc:"10 correct in 5 different concepts",  check: s => Object.values(s.byConcept).filter(c => c.correct >= 10).length >= 5 },
];

function checkNewBadges(stats) {
  const earned = stats.badges || [];
  const newBadges = BADGES.filter(b => !earned.includes(b.id) && b.check(stats));
  return newBadges;
}

function applyNewBadges(stats, newBadges) {
  return { ...stats, badges: [...(stats.badges || []), ...newBadges.map(b => b.id)] };
}


// ─── Expanded Pattern Scenarios ───────────────────────────────────────────────

// ── Pot Odds Scenarios ────────────────────────────────────────────────────────
function genPotOdds() {
  const scenarios = [
    { pot:100, call:20, outs:9, draw:"flush draw", correct:"Call — you have the odds",
      reason:"You need to call $20 into a $120 pot (after call), giving you 6:1 pot odds. A flush draw has ~9 outs and roughly 36% equity on the flop — well above the ~17% equity needed to call. Easy call." },
    { pot:50, call:40, outs:4, draw:"inside straight draw", correct:"Fold — you don't have the odds",
      reason:"You need to call $40 into a $90 pot (after call), giving you roughly 2.25:1 odds. An inside straight draw has only 4 outs (~17% equity). You'd need about 3.9:1 to break even. Fold." },
    { pot:80, call:10, outs:8, draw:"open-ended straight draw", correct:"Call — you have the odds",
      reason:"You need to call $10 into a $90 pot (after call), giving you 9:1 pot odds. An open-ended straight draw has ~8 outs and ~32% equity on the flop. You only need ~11% equity here. Easy call." },
    { pot:60, call:30, outs:2, draw:"set draw (one card to hit trips)", correct:"Fold — you don't have the odds",
      reason:"You need to call $30 into a $90 pot (after call), giving you 3:1 pot odds. With only 2 outs (~8% equity), you'd need 11.5:1 to break even. Fold." },
    { pot:100, call:25, outs:15, draw:"flush draw + open-ended straight draw (combo draw)", correct:"Call — you have the odds",
      reason:"A combo draw with 15 outs has roughly 54% equity on the flop — you're actually a favourite to improve. Calling $25 into a $125 pot is very profitable. You can even consider raising." },
  ];
  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  return {
    type:"pattern", concept:"Pot Odds", difficulty:"intermediate",
    scenario:`The pot is $${s.pot}. Villain bets $${s.call}. You have a ${s.draw}.`,
    question:`Should you call $${s.call} to continue?`,
    options:["Call — you have the odds","Fold — you don't have the odds","Raise — to build the pot","Check — wait and see"],
    correctIndex:["Call — you have the odds","Fold — you don't have the odds","Raise — to build the pot","Check — wait and see"].indexOf(s.correct),
    explanation:s.reason,
  };
}

// ── Continuation Bet (C-Bet) Scenarios ───────────────────────────────────────
function genCBet() {
  const scenarios = [
    { board:"A♠ 7♦ 2♣", action:"C-bet — this board heavily favours your range", pos:"BTN",
      reason:"As the preflop raiser, an Ace-high dry board (no flush or straight draws) heavily favours your range — your opponents expect you to have an Ace. A small c-bet of 30–40% pot will take this down often." },
    { board:"K♥ Q♠ J♦", action:"Check — this board is dangerous to c-bet", pos:"BTN",
      reason:"KQJ is a highly connected, wet board that connects with many calling hands. Villain could have two pair, a straight, or strong draws. C-betting here risks getting check-raised off a bluff. Check and re-evaluate." },
    { board:"8♠ 6♥ 4♦", action:"C-bet — take advantage of your positional advantage", pos:"BTN",
      reason:"A low, rainbow board is often good to c-bet from the BTN. Your opponent will have missed this board a lot of the time, and you have a credible story whether you have a pair or are bluffing." },
    { board:"A♦ A♠ 7♥", action:"C-bet — you have a credible range advantage", pos:"CO",
      reason:"Paired Ace boards favour the preflop raiser heavily. Opponents will often check-fold medium-strength hands fearing you have an Ace. A c-bet here is close to a free money spot." },
    { board:"J♥ T♠ 9♦", action:"Check — too many strong hands for villain", pos:"BTN",
      reason:"JT9 is one of the most dangerous boards in poker. Villain could have a straight already, or strong two-pair/set combos. C-betting into this gets you in trouble often. Prefer checking and pot control." },
  ];
  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  return {
    type:"pattern", concept:"Continuation Betting", difficulty:"intermediate",
    board: parseCards(s.board),
    scenario:`You raised preflop from ${s.pos}. One caller. You're first to act.`,
    question:"What's your flop action?",
    options:["C-bet — this board heavily favours your range","Check — this board is dangerous to c-bet","C-bet — take advantage of your positional advantage","Check — too many strong hands for villain","C-bet — you have a credible range advantage"],
    correctIndex:["C-bet — this board heavily favours your range","Check — this board is dangerous to c-bet","C-bet — take advantage of your positional advantage","Check — too many strong hands for villain","C-bet — you have a credible range advantage"].indexOf(s.action),
    explanation:s.reason,
  };
}

// ── Check-Raise Scenarios ─────────────────────────────────────────────────────
function genCheckRaise() {
  const scenarios = [
    { hand:"8♥ 8♦", board:"8♠ 4♥ 2♣", correct:"Check-raise — trap with your monster",
      reason:"You flopped top set on a dry board. Villain almost certainly c-bets here as the preflop raiser. By checking, you induce their bet then raise to build a big pot while you're way ahead. This is a classic slow-play setup." },
    { hand:"A♥ K♠", board:"J♦ T♣ 2♥", correct:"Check — nothing worth protecting yet",
      reason:"You completely missed this board with AK. Check-raising as a bluff here is risky — if Villain fires again on the turn you're in a tough spot. Check, see what they do, and reassess." },
    { hand:"7♠ 6♠", board:"8♠ 5♥ 4♣", correct:"Check-raise — semi-bluff with a strong draw",
      reason:"You flopped the nuts (9-7-6-5-4... wait — 8-7-6-5-4 straight). Actually you have a straight already! Check-raise to build the pot. Even if you only had a draw, the check-raise semi-bluff is powerful here with so many outs." },
    { hand:"K♥ Q♦", board:"K♠ 9♣ 3♦", correct:"Check — allow villain to bluff into you",
      reason:"Top pair, good kicker on a dry board. You're ahead of most of villain's range. Checking here invites a c-bet bluff from villain that you can then raise or call. No need to protect your hand aggressively." },
  ];
  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const opts = ["Check-raise — trap with your monster","Check-raise — semi-bluff with a strong draw","Check — nothing worth protecting yet","Check — allow villain to bluff into you"];
  return {
    type:"pattern", concept:"Check-Raise Situations", difficulty:"advanced",
    hole: parseCards(s.hand), board: parseCards(s.board),
    scenario:`You're out of position against a player who raised preflop.`,
    question:"What's your best play?",
    options:opts,
    correctIndex:opts.indexOf(s.correct),
    explanation:s.reason,
  };
}

// ── Board Texture Reads ───────────────────────────────────────────────────────
function genBoardTexture() {
  const scenarios = [
    { board:"A♠ 7♥ 2♦", correct:"Dry — few draws possible",
      reason:"Three different suits, no connected cards. Almost no straight or flush draws possible. This is a 'dry' board — made hands are unlikely to face many scary turn or river cards." },
    { board:"9♥ 8♥ 7♠", correct:"Wet — many draws and made hands possible",
      reason:"Three connected cards with two of the same suit. Straights are already made (T-6), flush draws exist, and two-pair/set combos are common. This is a 'wet' board — hands change dramatically on later streets." },
    { board:"K♠ K♥ 2♣", correct:"Paired — one rank appears twice",
      reason:"A paired board means anyone holding a King has trips. Full houses are possible. This is distinct from a trips board — only two Kings are out, so one player could hold the third. Bluffing is riskier here since it's hard for anyone to have truly missed." },
    { board:"Q♦ J♦ T♦", correct:"Wet — many draws and made hands possible",
      reason:"Three of the same suit plus three connected cards is as wet as it gets. Flushes, straights, and straight-flushes are all possible or already made. Proceed carefully without a flush or strong made hand." },
    { board:"5♣ 5♥ 5♦", correct:"Trips on board — everyone shares three of a kind",
      reason:"Three of a kind is on the board as community cards, which means every player at the table effectively has trips. This isn't like flopping a set — no one 'has' it more than anyone else. The real battle is who has the best kicker, or who holds the case 5 for quads, or who can make a full house. High cards matter much more than usual here." },
    { board:"7♥ 6♥ 5♣", correct:"Wet — many draws and made hands possible",
      reason:"Three connected low cards with a flush draw. Straights are already made (8-4), more are possible, and the flush draw is live. A very wet board — your made hands are vulnerable to many turn and river cards." },
    { board:"A♦ A♣ A♥", correct:"Trips on board — everyone shares three of a kind",
      reason:"Three Aces on the board — the rarest and strangest texture in poker. Everyone has three Aces as community cards. The entire hand is decided by kicker: whoever holds the highest non-Ace card wins, unless someone holds the fourth Ace for quads or there's a better full house possible." },
  ];
  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const opts = [
    "Dry — few draws possible",
    "Wet — many draws and made hands possible",
    "Paired — one rank appears twice",
    "Trips on board — everyone shares three of a kind",
  ];
  return {
    type:"pattern", concept:"Board Texture", difficulty:"beginner",
    board: parseCards(s.board),
    scenario:null,
    question:"How would you classify this board texture?",
    options:opts,
    correctIndex:opts.indexOf(s.correct),
    explanation:s.reason,
  };
}

// ── Stack Depth Scenarios ─────────────────────────────────────────────────────
function genStackDepth() {
  const scenarios = [
    { stack:"15 BB", hand:"77", correct:"Push all-in preflop",
      reason:"With only 15 big blinds, a pocket pair is too strong to fold but your stack is too short to play postflop. Just move all-in preflop — you want to maximize fold equity and get it in as a favourite." },
    { stack:"200 BB", hand:"77", correct:"Call or raise — play for set value",
      reason:"Deep stacks with a medium pair means set-mining is very profitable. You can call or raise and play postflop — if you flop a set (roughly 12% chance) the pot can grow huge. Deep stacks make speculative hands worth more." },
    { stack:"8 BB", hand:"A♠ 2♣", correct:"Push all-in preflop",
      reason:"At 8 big blinds, almost any Ace is a push. You're in shove-or-fold territory — any raise commits too much of your stack to fold later. Ship it and hope to flip or find a fold." },
    { stack:"100 BB", hand:"A♠ 2♣", correct:"Fold or raise — position dependent",
      reason:"A2o at 100 BB is a positional hand. From late position with no action, it's worth raising as a steal. From early position facing a raise, fold. Stack depth amplifies both your positional advantage and your vulnerability." },
  ];
  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const opts = ["Push all-in preflop","Call or raise — play for set value","Fold — stack too short to gamble","Fold or raise — position dependent"];
  return {
    type:"pattern", concept:"Stack Depth Adjustments", difficulty:"intermediate",
    scenario:`You're in a tournament with ${s.stack} remaining. You hold ${s.hand}.`,
    question:"How does your stack depth affect your decision?",
    options:opts,
    correctIndex:opts.indexOf(s.correct),
    explanation:s.reason,
  };
}

// ── Multiway Pot Adjustments ──────────────────────────────────────────────────
function genMultiway() {
  const scenarios = [
    { hand:"A♠ J♣", board:"J♥ 7♦ 3♠", players:3,
      correct:"Play cautiously — top pair weakens in multiway pots",
      wrong:["Bet big — top pair is always strong","Fold — too dangerous multiway","Raise all-in — protect your hand"],
      reason:"Top pair is strong heads-up but in a 3-way pot you need to be more cautious. The chance that at least one of two opponents has two pair, a set, or a strong draw is significantly higher. Consider pot control." },
    { hand:"7♥ 6♥", board:"8♥ 5♠ 4♦", players:4,
      correct:"Bet for value — more players means more action for the nuts",
      wrong:["Check — slow-play to trap","Fold — draws are too dangerous","Play cautiously — too many opponents could beat you"],
      reason:"You flopped a straight in a 4-way pot. This is a strong hand — bet for value. More players means more chances someone has a piece of the board and will pay you off. Never slow-play the nuts multiway." },
    { hand:"Q♠ Q♣", board:"A♥ 8♦ 3♣", players:3,
      correct:"Play cautiously — the Ace likely connects with someone's range",
      wrong:["Bet big — overpairs are always strong","Fold immediately — any Ace beats you","Raise all-in — protect your overpair"],
      reason:"Overpair facing an Ace on a 3-way board is a tough spot. At least one of two opponents could easily have an Ace. Check or make a small bet and be ready to fold to significant resistance." },
    { hand:"K♠ K♥", board:"K♦ 7♠ 2♥", players:4,
      correct:"Bet for value — more players means more action for the nuts",
      wrong:["Check — slow-play top set","Play cautiously — paired boards are tricky","Fold — too many players could outdraw you"],
      reason:"You flopped top set in a multiway pot — this is a dream scenario. Bet and build the pot aggressively. More players means more money, and sets are strong enough to be comfortable playing a big pot." },
    { hand:"J♠ T♠", board:"J♥ T♦ 3♣", players:3,
      correct:"Bet for value — more players means more action for the nuts",
      wrong:["Check — two pair is not strong enough","Play cautiously — top pair weakens in multiway pots","Fold — too dangerous on this board"],
      reason:"Two pair (Jacks and Tens) on a relatively dry board is a strong hand. In multiway pots, bet for value — more opponents means more chances someone has top pair or a draw and will pay you off." },
    { hand:"A♦ 2♦", board:"K♣ 9♦ 5♦", players:4,
      correct:"Play cautiously — draws lose value multiway (harder to semi-bluff)",
      wrong:["Bet big — flush draws always justify aggression","Fold — never play draws multiway","Raise all-in — you have the nut flush draw"],
      reason:"A nut flush draw is strong but in a 4-way pot, semi-bluffing becomes riskier — someone is likely to have a made hand strong enough to call or raise. Play your draw passively here and hit it, rather than betting fold equity you don't have multiway." },
  ];
  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const opts = [s.correct, ...s.wrong].sort(() => Math.random() - 0.5);
  return {
    type:"pattern", concept:"Multiway Pot Play", difficulty:"intermediate",
    hole: parseCards(s.hand), board: parseCards(s.board),
    scenario:`${s.players}-way pot — multiple opponents still in the hand.`,
    question:"How should you adjust your strategy?",
    options:opts,
    correctIndex:opts.indexOf(s.correct),
    explanation:s.reason,
  };
}

// ── Spot the Mistake Scenarios ────────────────────────────────────────────────
function genSpotMistake() {
  const scenarios = [
    { situation:"Player limps UTG with A♠ K♦ at a 6-max table, hoping to trap.", mistake:"Limping with a premium hand",
      reason:"Limping AK is a classic beginner mistake. AK plays best in a raised pot — it's a hand that needs to win unimproved, and you want to isolate one or two opponents, not play multiway. Always raise AK." },
    { situation:"Player raises 10x the big blind with pocket Aces preflop.", mistake:"Over-raising with a strong hand (telegraphing strength)",
      reason:"Huge preflop raises with big hands are a tell. Everyone folds and you win the blinds with the best hand in poker. Use a consistent raise size (2.5–3x) regardless of hand strength so opponents can't read you." },
    { situation:"Player calls a 3-bet out of position with 7♠ 2♦ because 'it's suited'.", mistake:"Calling with a weak hand out of position",
      reason:"72 is not suited here (different suits shown). Even if it were, 72s has terrible equity and playability. Suited doesn't automatically make a hand playable — high card value, connectivity, and position all matter more." },
    { situation:"Player checks back the nuts on the river in a large pot, 'afraid to scare them off'.", mistake:"Slow-playing the nuts on the river",
      reason:"The river is the last chance to get money in. Checking back the nuts gives villain a free showdown — they can't call what you don't bet. Always bet the nuts for value on the river, sized to get called by their second-best hand." },
    { situation:"Player folds top pair on the flop to a single small c-bet without considering pot odds.", mistake:"Folding too easily to a c-bet",
      reason:"Many players auto-fold when they miss or face any bet. Top pair is a strong hand — evaluate the pot odds before folding. A small c-bet (30–40% pot) only needs to work a fraction of the time to be profitable for villain, meaning you should often continue." },
  ];
  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const allMistakes = ["Limping with a premium hand","Over-raising with a strong hand (telegraphing strength)","Calling with a weak hand out of position","Slow-playing the nuts on the river","Folding too easily to a c-bet"];
  const wrong = allMistakes.filter(m => m !== s.mistake).sort(() => Math.random()-0.5).slice(0,3);
  const opts = [s.mistake, ...wrong].sort(() => Math.random()-0.5);
  return {
    type:"pattern", concept:"Spot the Mistake", difficulty:"intermediate",
    scenario:s.situation,
    question:"What mistake is being made?",
    options:opts,
    correctIndex:opts.indexOf(s.mistake),
    explanation:s.reason,
  };
}

// ── Value Bet Sizing ──────────────────────────────────────────────────────────
function genValueBetSizing() {
  const scenarios = [
    { hand:"A♥ A♣", board:"A♠ 7♦ 2♣ 9♥ K♠", correct:"Bet large — 70–100% pot",
      reason:"You have top set on the river with a safe board. Villain likely has an Ace or a King and will pay a big bet. Size up on the river when you have the nuts and the board hasn't gotten scarier." },
    { hand:"Q♠ Q♦", board:"Q♥ 8♣ 3♦ A♠ 2♥", correct:"Bet small — 25–40% pot",
      reason:"You have a set but the Ace on the turn is a scare card. Villain may have connected with it. A small bet (1/4 to 1/3 pot) keeps in worse hands like sets of 8s or 3s, and limits the damage if villain has an Ace." },
    { hand:"K♦ Q♦", board:"K♠ K♥ 7♣ 2♦ 5♠", correct:"Bet large — 70–100% pot",
      reason:"Trips with a great kicker on a paired board. The board is dry and safe — no flush draws came in. Bet big and represent a bluff (which is hard for villain to tell apart from your actual strong hand)." },
    { hand:"T♠ 9♠", board:"J♠ 8♠ 7♦ 2♣ K♠", correct:"Bet large — 70–100% pot",
      reason:"You backdoored a flush AND flopped a straight. You have the stone cold nuts. Size up on the river — villain may have the King, a Jack, or a lower flush. Make them pay." },
  ];
  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const opts = ["Bet large — 70–100% pot","Bet small — 25–40% pot","Check — pot control","Bet medium — 50% pot"];
  return {
    type:"pattern", concept:"Value Bet Sizing", difficulty:"advanced",
    hole: parseCards(s.hand), board: parseCards(s.board),
    scenario:`River. Villain checks to you.`,
    question:"What's your ideal bet size?",
    options:opts,
    correctIndex:opts.indexOf(s.correct),
    explanation:s.reason,
  };
}

// ── Position Advantage Post-Flop ──────────────────────────────────────────────
function genPositionAdvantage() {
  const scenarios = [
    { situation:"You're in position (BTN) with a medium-strength hand. Villain checks to you.", correct:"Bet — use your position to take control",
      wrong:["Check back — medium hands play better as a check","Fold — medium hands are too risky to bet","Raise all-in — apply maximum pressure"],
      reason:"In position with a check in front of you, betting accomplishes two things: it often wins the pot immediately, and if called, your opponent has revealed weakness. Use your positional advantage to apply pressure." },
    { situation:"You're out of position (BB) with top pair on a dry board. The BTN bets half pot.", correct:"Call — your hand is strong enough to continue despite position",
      wrong:["Fold — out of position means you should never call","Raise — always re-raise with top pair","Check — you can't call out of position"],
      reason:"Top pair is a strong hand even out of position. Folding to a single half-pot bet would be far too exploitable. Call and re-evaluate the turn. Being out of position is a disadvantage but not a reason to give up strong hands." },
    { situation:"You're in position (CO). Both opponents check to you on a dry board. You missed the flop completely.", correct:"Bet — use your position and their weakness to take the pot",
      wrong:["Check — never bluff with nothing","Fold — you have no hand to play","Bet all-in — maximise the bluff"],
      reason:"Two checks on a dry board is a classic spot to stab in position. Your opponents have shown weakness. A bet of 40–50% pot will take this down a high percentage of the time even with nothing — this is a standard positional bluff." },
    { situation:"You're out of position (SB) with a flush draw. You bet the flop and the BTN raises.", correct:"Call — your draw equity justifies continuing despite position",
      wrong:["Fold — out of position draws are unplayable","Re-raise all-in — protect your draw","Check-fold — draws need position to be profitable"],
      reason:"A flush draw out of position facing a raise is tricky, but the equity is there. You have roughly 36% equity to improve and the pot is growing. Call and play fit-or-fold on the turn rather than three-bet bluffing or folding." },
  ];
  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const opts = [s.correct, ...s.wrong].sort(() => Math.random() - 0.5);
  return {
    type:"pattern", concept:"Positional Advantage", difficulty:"intermediate",
    scenario:s.situation,
    question:"What's the best play?",
    options:opts,
    correctIndex:opts.indexOf(s.correct),
    explanation:s.reason,
  };
}

// ── Bluff Catching ────────────────────────────────────────────────────────────
function genBluffCatch() {
  const scenarios = [
    { hand:"K♠ T♦", board:"K♥ 7♠ 2♦ 4♣ J♣", bet:"pot-sized", pos:"BB", raiser:"BTN",
      correct:"Call — you beat bluffs and have showdown value",
      wrong:["Fold — pot-sized bets always mean the nuts","Raise — turn your hand into a bluff","Check — wait and see"],
      reason:"K-T on a K-high board is a strong bluff catcher. The BTN's pot-sized river bet on a blank runout could easily be a busted draw representing strength. You have top pair — call and see the bluff." },
    { hand:"A♦ 2♥", board:"Q♠ J♦ T♣ 9♥ 8♠", bet:"large", pos:"BB", raiser:"BTN",
      correct:"Fold — the board makes your hand irrelevant",
      wrong:["Call — you have an Ace so you can't fold","Call — pot odds justify continuing","Raise — bluff the river"],
      reason:"The board ran out as a Broadway straight (Q-J-T-9-8) — anyone with a King or Seven has the nuts. Your Ace is irrelevant here; the board itself is the best hand. Fold to any large river bet on a fully-connected board like this." },
    { hand:"Q♦ Q♣", board:"A♠ 8♥ 3♦ 5♣ 2♠", bet:"small", pos:"CO", raiser:"BTN",
      correct:"Call — pocket pair is a strong bluff catcher here",
      wrong:["Fold — the Ace makes your hand worthless","Raise — represent the Ace","Fold — small bets always have value behind them"],
      reason:"Pocket Queens on an Ace-high dry board is a classic bluff catcher. The BTN's small river bet looks like a blocker bet from a hand they're unsure about. You beat all bluffs and most hands that aren't an Ace. Call." },
    { hand:"T♥ 9♥", board:"J♠ 8♦ 2♣ 3♥ 7♠", bet:"half-pot", pos:"BB", raiser:"CO",
      correct:"Call — you have a straight and strong showdown value",
      wrong:["Fold — missed draws shouldn't call","Raise — turn your hand into a bluff","Fold — half-pot bets are always value"],
      reason:"You backdoored a straight (J-T-9-8-7). This is a made hand with strong showdown value — not a bluff catcher at all. Call confidently. Half-pot on the river is a common sizing for both value and bluffs." },
  ];
  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const opts = [s.correct, ...s.wrong].sort(() => Math.random() - 0.5);
  return {
    type:"pattern", concept:"Bluff Catching", difficulty:"advanced",
    hole: parseCards(s.hand), board: parseCards(s.board),
    scenario:`You're in the ${s.pos}. ${s.raiser} makes a ${s.bet} river bet.`,
    question:"Do you call, fold, or raise?",
    options:opts,
    correctIndex:opts.indexOf(s.correct),
    explanation:s.reason,
  };
}

// ── Expanded Scenario Pool Registry ──────────────────────────────────────────
const EXPANDED_SCENARIO_BUILDERS = [
  genPotOdds,
  genCBet,
  genCheckRaise,
  genBoardTexture,
  genStackDepth,
  genMultiway,
  genSpotMistake,
  genValueBetSizing,
  genPositionAdvantage,
  genBluffCatch,
];


// ─── Badge Toast ──────────────────────────────────────────────────────────────
function BadgeToast({ badge, onDismiss, onViewAll }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [badge]);

  if (!badge) return null;
  return (
    <div onClick={onViewAll} style={{
      position:"fixed", top:16, left:"50%", transform:"translateX(-50%)",
      zIndex:100, cursor:"pointer",
      background:"linear-gradient(135deg,#1a2a00,#0f1f00)",
      border:"1px solid #f59e0b88",
      borderRadius:14, padding:"10px 18px",
      display:"flex", alignItems:"center", gap:12,
      boxShadow:"0 4px 24px #00000088, 0 0 20px #f59e0b22",
      animation:"toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1)",
      whiteSpace:"nowrap",
    }}>
      <style>{`
        @keyframes toastIn {
          from { opacity:0; transform:translateX(-50%) translateY(-16px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }
      `}</style>
      <span style={{ fontSize:24 }}>{badge.icon}</span>
      <div>
        <div style={{ fontSize:10, color:"#f59e0b", letterSpacing:2, fontWeight:700 }}>BADGE UNLOCKED</div>
        <div style={{ fontSize:14, fontWeight:800, color:"#e2e8f0" }}>{badge.name}</div>
      </div>
      <div style={{ fontSize:10, color:"#475569", marginLeft:4 }}>tap →</div>
    </div>
  );
}

// ─── Range Visualizer ─────────────────────────────────────────────────────────
const GRID_RANKS = ["A","K","Q","J","T","9","8","7","6","5","4","3","2"];

function rangeTierInfo(tier) {
  if (tier === 1) return { color:"#4ade80", bg:"#4ade8033" };
  if (tier === 2) return { color:"#84cc16", bg:"#84cc1633" };
  if (tier === 3) return { color:"#f59e0b", bg:"#f59e0b22" };
  if (tier === 4) return { color:"#f97316", bg:"#f9731622" };
  return           { color:"#1e3a5f",  bg:"#060d1a"    };
}

function positionAwareTier(r1, r2, suited, pos, tableSize) {
  const base = classifyHand(r1, r2, suited);
  const earlyPositions = tableSize === 9 ? ["UTG","UTG+1","UTG+2","MP"] : ["UTG","MP"];
  const isEarly = earlyPositions.includes(pos);
  const isBTN = pos === "BTN", isCO = pos === "CO";
  const isBlind = pos === "SB" || pos === "BB";
  if (base === 3 && isEarly && tableSize >= 6) return 5;
  if (base === 4 && !isBTN && !isCO && !isBlind && tableSize >= 6) return 5;
  if (base === 4 && isEarly && tableSize === 9) return 5;
  return base;
}

function RangeVisualizer({ defaultPos, defaultTableSize, onClose }) {
  const [pos, setPos] = useState(defaultPos || "BTN");
  const [tableSize, setTableSize] = useState(defaultTableSize || 6);
  const [hoverCell, setHoverCell] = useState(null);

  const positions6 = ["UTG","MP","CO","BTN","SB","BB"];
  const positions9 = ["UTG","UTG+1","UTG+2","MP","MP+1","CO","BTN","SB","BB"];
  const positions = tableSize === 9 ? positions9 : positions6;

  const counts = { 1:0,2:0,3:0,4:0,5:0 };
  GRID_RANKS.forEach((r1,ri) => GRID_RANKS.forEach((r2,ci) => {
    const tier = ri===ci ? positionAwareTier(r1,r2,false,pos,tableSize)
      : ri<ci ? positionAwareTier(r1,r2,true,pos,tableSize)
      : positionAwareTier(r1,r2,false,pos,tableSize);
    counts[tier]++;
  }));
  const playable = (counts[1]||0)+(counts[2]||0)+(counts[3]||0)+(counts[4]||0);

  return (
    <div style={{ position:"fixed",inset:0,zIndex:55,display:"flex",alignItems:"center",justifyContent:"center",padding:"12px",background:"#00000099" }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:16,
        padding:"16px",maxWidth:460,width:"100%",maxHeight:"90vh",overflowY:"auto",
      }}>
        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
          <div style={{ fontSize:13,fontWeight:800,color:"#4ade80",letterSpacing:2 }}>📊 RANGE CHART</div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18,lineHeight:1 }}>✕</button>
        </div>

        {/* Controls */}
        <div style={{ display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center" }}>
          <div style={{ display:"flex",borderRadius:8,overflow:"hidden",border:"1px solid #0f2033",flexShrink:0 }}>
            {[6,9].map(n => (
              <button key={n} onClick={()=>{ setTableSize(n); setPos("BTN"); }} style={{
                padding:"4px 10px",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                background:tableSize===n?"#0f2744":"transparent",
                color:tableSize===n?"#f59e0b":"#334155",
                borderRight:n===6?"1px solid #0f2033":"none",
              }}>{n}-max</button>
            ))}
          </div>
          <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
            {positions.map(p => (
              <button key={p} onClick={()=>setPos(p)} style={{
                padding:"3px 9px",borderRadius:12,fontSize:10,fontWeight:700,
                border:`1px solid ${pos===p?"#4ade80":"#0f2033"}`,
                background:pos===p?"#4ade8022":"transparent",
                color:pos===p?"#4ade80":"#334155",cursor:"pointer",
              }}>{p}</button>
            ))}
          </div>
        </div>

        {/* Subtitle */}
        <div style={{ fontSize:11,color:"#475569",marginBottom:10 }}>
          <span style={{ color:"#4ade80",fontWeight:700 }}>{pos}</span> at <span style={{ color:"#f59e0b",fontWeight:700 }}>{tableSize}-max</span>
          {" — "}{playable} playable hands ({Math.round(playable/169*100)}%)
        </div>

        {/* Grid */}
        <div style={{ overflowX:"auto" }}>
          <div style={{ display:"grid",gridTemplateColumns:"16px repeat(13,1fr)",gap:2,minWidth:260 }}>
            <div />
            {GRID_RANKS.map(r => (
              <div key={r} style={{ fontSize:8,color:"#334155",textAlign:"center",fontWeight:700,paddingBottom:2 }}>{r}</div>
            ))}
            {GRID_RANKS.map((r1,ri) => [
              <div key={`lbl-${r1}`} style={{ fontSize:8,color:"#334155",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center" }}>{r1}</div>,
              ...GRID_RANKS.map((r2,ci) => {
                const isPair=ri===ci, isSuited=ri<ci;
                const [hr1,hr2] = isSuited?[r1,r2]:[r2,r1];
                const tier = positionAwareTier(hr1,hr2,isSuited&&!isPair,pos,tableSize);
                const { color, bg } = rangeTierInfo(tier);
                const cellLabel = isPair?`${r1}${r2}`:isSuited?`${r1}${r2}s`:`${r2}${r1}o`;
                const isHov = hoverCell===cellLabel;
                return (
                  <div key={`${ri}-${ci}`}
                    onMouseEnter={()=>setHoverCell(cellLabel)}
                    onMouseLeave={()=>setHoverCell(null)}
                    title={cellLabel}
                    style={{
                      aspectRatio:"1",borderRadius:2,cursor:"default",userSelect:"none",
                      background:isHov?color+"66":bg,
                      border:`1px solid ${isHov?color:color+"55"}`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:6,fontWeight:800,color,
                      transition:"all 0.1s",
                    }}
                  >{isPair?r1:""}</div>
                );
              })
            ])}
          </div>
        </div>

        {/* Hover label */}
        <div style={{ height:20,marginTop:6,textAlign:"center" }}>
          {hoverCell && (()=>{
            const isSuited=hoverCell.endsWith("s");
            const isPair=hoverCell.length===2&&hoverCell[0]===hoverCell[1];
            const r1=hoverCell[0],r2=hoverCell[1];
            const tier=positionAwareTier(r1,r2,isSuited&&!isPair,pos,tableSize);
            const { color } = rangeTierInfo(tier);
            const action=tier===1?"Premium — raise any table":tier===2?"Solid raise":tier===3?"Speculative — position dependent":tier===4?"Short-handed only":"Fold";
            return <span style={{ fontSize:12,fontWeight:700,color }}>{hoverCell} — {action}</span>;
          })()}
        </div>

        {/* Legend */}
        <div style={{ display:"flex",gap:8,marginTop:6,flexWrap:"wrap",justifyContent:"center" }}>
          {[
            {tier:1,label:"Premium raise"},
            {tier:2,label:"Solid raise"},
            {tier:3,label:"Speculative"},
            {tier:4,label:"Short-handed"},
            {tier:5,label:"Fold"},
          ].map(({tier,label}) => {
            const {color,bg}=rangeTierInfo(tier);
            return (
              <div key={tier} style={{ display:"flex",alignItems:"center",gap:4 }}>
                <div style={{ width:11,height:11,borderRadius:2,background:bg,border:`1px solid ${color}` }} />
                <span style={{ fontSize:10,color:"#475569" }}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* Key */}
        <div style={{ marginTop:10,padding:"8px 10px",borderRadius:8,background:"#060d1a",border:"1px solid #0f2033",fontSize:10,color:"#334155",lineHeight:1.8,textAlign:"center" }}>
          Top-right = <span style={{ color:"#60a5fa" }}>suited (s)</span> &nbsp;·&nbsp;
          Diagonal = <span style={{ color:"#f59e0b" }}>pairs</span> &nbsp;·&nbsp;
          Bottom-left = <span style={{ color:"#94a3b8" }}>offsuit (o)</span>
        </div>
      </div>
    </div>
  );
}

// ─── Progress Dashboard Component ─────────────────────────────────────────────
function ProgressDashboard({ stats, newBadge, onClose }) {
  const earned = (stats.badges || []).map(id => BADGES.find(b => b.id === id)).filter(Boolean);
  const unearned = BADGES.filter(b => !(stats.badges || []).includes(b.id));
  const accuracy = stats.totalAnswered > 0 ? Math.round(stats.totalCorrect / stats.totalAnswered * 100) : 0;

  // Weakest concepts — bottom 3 by accuracy with at least 3 attempts
  const weakConcepts = Object.entries(stats.byConcept || {})
    .filter(([,v]) => v.total >= 3)
    .map(([k,v]) => ({ name:k, pct: Math.round(v.correct/v.total*100), total:v.total }))
    .sort((a,b) => a.pct - b.pct)
    .slice(0,3);

  return (
    <div style={{ position:"fixed",inset:0,zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:"#00000099" }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:16,
        padding:"20px",maxWidth:420,width:"100%",maxHeight:"85vh",overflowY:"auto",
        animation:"fadeIn 0.2s ease",
      }}>
        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16 }}>
          <div style={{ fontSize:13,fontWeight:800,color:"#f59e0b",letterSpacing:2 }}>🏆 YOUR PROGRESS</div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18 }}>✕</button>
        </div>

        {/* New badge flash */}
        {newBadge && (
          <div style={{ background:"linear-gradient(135deg,#1a2a00,#0f1f00)",border:"1px solid #f59e0b88",borderRadius:12,padding:"12px 16px",marginBottom:16,textAlign:"center",animation:"fadeIn 0.3s ease" }}>
            <div style={{ fontSize:28,marginBottom:4 }}>{newBadge.icon}</div>
            <div style={{ fontSize:13,fontWeight:800,color:"#f59e0b" }}>NEW BADGE UNLOCKED</div>
            <div style={{ fontSize:15,fontWeight:700,color:"#e2e8f0",marginTop:2 }}>{newBadge.name}</div>
            <div style={{ fontSize:11,color:"#94a3b8",marginTop:2 }}>{newBadge.desc}</div>
          </div>
        )}

        {/* Lifetime stats */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16 }}>
          {[
            { label:"CORRECT", value:stats.totalCorrect || 0, color:"#4ade80" },
            { label:"ACCURACY", value:`${accuracy}%`, color:"#f59e0b" },
            { label:"BEST STREAK", value:stats.bestStreak || 0, color:"#60a5fa" },
          ].map(({ label,value,color }) => (
            <div key={label} style={{ background:"#060d1a",border:"1px solid #0f2033",borderRadius:10,padding:"10px 8px",textAlign:"center" }}>
              <div style={{ fontSize:20,fontWeight:900,color }}>{value}</div>
              <div style={{ fontSize:9,color:"#334155",letterSpacing:1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Category breakdown */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10,letterSpacing:2,color:"#475569",marginBottom:8 }}>BY CATEGORY</div>
          {["Pattern","Position"].map(cat => {
            const d = stats.byCategory?.[cat] || { correct:0, total:0 };
            const pct = d.total > 0 ? Math.round(d.correct/d.total*100) : 0;
            return (
              <div key={cat} style={{ marginBottom:8 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
                  <span style={{ fontSize:12,color:"#94a3b8" }}>{cat} Trainer</span>
                  <span style={{ fontSize:12,color:"#475569" }}>{d.correct}/{d.total} ({pct}%)</span>
                </div>
                <div style={{ height:6,borderRadius:3,background:"#0f2033",overflow:"hidden" }}>
                  <div style={{ height:"100%",borderRadius:3,width:`${pct}%`,background:cat==="Pattern"?"#f59e0b":"#60a5fa",transition:"width 0.5s ease" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Weakest areas */}
        {weakConcepts.length > 0 && (
          <div style={{ marginBottom:16,padding:"10px 12px",borderRadius:10,background:"#1a0a0a",border:"1px solid #3a1a1a" }}>
            <div style={{ fontSize:10,letterSpacing:2,color:"#f87171",marginBottom:8 }}>NEEDS WORK</div>
            {weakConcepts.map(c => (
              <div key={c.name} style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                <span style={{ fontSize:12,color:"#94a3b8" }}>{c.name}</span>
                <span style={{ fontSize:12,color:"#f87171" }}>{c.pct}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Earned badges */}
        {earned.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:10,letterSpacing:2,color:"#475569",marginBottom:8 }}>EARNED BADGES</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
              {earned.map(b => (
                <div key={b.id} title={b.desc} style={{
                  display:"flex",alignItems:"center",gap:6,
                  padding:"5px 10px",borderRadius:20,
                  background:"#f59e0b22",border:"1px solid #f59e0b44",
                }}>
                  <span style={{ fontSize:16 }}>{b.icon}</span>
                  <span style={{ fontSize:11,fontWeight:700,color:"#f59e0b" }}>{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locked badges */}
        {unearned.length > 0 && (
          <div>
            <div style={{ fontSize:10,letterSpacing:2,color:"#1e3a5f",marginBottom:8 }}>LOCKED</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
              {unearned.map(b => (
                <div key={b.id} title={b.desc} style={{
                  display:"flex",alignItems:"center",gap:5,
                  padding:"4px 9px",borderRadius:20,
                  background:"#060d1a",border:"1px solid #0f2033",opacity:0.5,
                }}>
                  <span style={{ fontSize:13,filter:"grayscale(1)" }}>{b.icon}</span>
                  <span style={{ fontSize:10,color:"#334155" }}>{b.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Position Trainer — Phase 6 ───────────────────────────────────────────────
// 5-level progression: Table Awareness → Open Raising → Steal Spots →
//                      Blind Defense → 3-Bet Spots
// 6-max default, 9-max toggle. Plain-English terminology introduced gradually.

// ── Position definitions ──────────────────────────────────────────────────────
const POSITIONS_6MAX = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const POSITIONS_9MAX = ["UTG", "UTG+1", "UTG+2", "MP", "MP+1", "CO", "BTN", "SB", "BB"];

const POS_FULL_NAME = {
  "UTG":   "Under the Gun",
  "UTG+1": "Under the Gun +1",
  "UTG+2": "Under the Gun +2",
  "MP":    "Middle Position",
  "MP+1":  "Middle Position +1",
  "CO":    "Cutoff",
  "BTN":   "Button",
  "SB":    "Small Blind",
  "BB":    "Big Blind",
};

const POS_DESC = {
  "UTG":   "First to act before the flop. The toughest spot — you have no info on anyone yet. Play tight.",
  "UTG+1": "Second to act. Still early — nearly as tight as UTG.",
  "UTG+2": "Third to act. Still early position. Play solid hands only.",
  "MP":    "Middle Position. A step better than early — slightly more hands are playable.",
  "MP+1":  "Middle Position +1. Similar to MP, one spot closer to late position.",
  "CO":    "Cutoff — one seat right of the Button. A strong late position with only the Button acting after you.",
  "BTN":   "Button — the best seat at the table. You act last on every postflop street. Maximum info advantage.",
  "SB":    "Small Blind — you act first postflop, which is a disadvantage. Even though you have a partial investment, it's a tough spot.",
  "BB":    "Big Blind — you're last preflop but first postflop. You often get a good price to defend, but lose position after the flop.",
};

// How many seats act AFTER this position postflop (lower = better position)
const POS_ORDER_6MAX  = { "UTG":0, "MP":1, "CO":2, "BTN":3, "SB":4, "BB":5 };
const POSTFLOP_RANK   = { "BTN":0, "CO":1, "MP":2, "UTG":3, "BB":4, "SB":5 }; // 0=best position postflop

// ── Hand shorthand helper ─────────────────────────────────────────────────────
function handLabel(r1, r2, suited) {
  const hi = RANK_VAL[r1] >= RANK_VAL[r2] ? r1 : r2;
  const lo = RANK_VAL[r1] <  RANK_VAL[r2] ? r1 : r2;
  if (r1 === r2) return `${r1}${r2}`;
  return `${hi}${lo}${suited ? "s" : "o"}`;
}

// ── Table Diagram component ───────────────────────────────────────────────────
function TableDiagram({ positions, heroSeat, revealLabels, activeSeats }) {
  // Lay seats around an oval. 6-max: 6 seats. 9-max: 9 seats.
  const n = positions.length;
  const cx = 50, cy = 50, rx = 36, ry = 26;
  const seats = positions.map((pos, i) => {
    // Distribute seats: BTN at bottom-right (roughly 4 o'clock), go clockwise
    const startAngle = -Math.PI / 2 + (2 * Math.PI * (n - 1) / n); // BTN at bottom-right
    const angle = startAngle - (2 * Math.PI * i / n);
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    const isHero = i === heroSeat;
    const isActive = !activeSeats || activeSeats.includes(i);
    return { pos, x, y, isHero, isActive };
  });

  return (
    <div style={{ position:"relative", width:"100%", paddingBottom:"66%", userSelect:"none" }}>
      {/* Felt table oval */}
      <div style={{
        position:"absolute", inset:0,
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>
        <div style={{
          width:"58%", height:"52%",
          borderRadius:"50%",
          background:"radial-gradient(ellipse at center, #0d2a12 0%, #081a0a 100%)",
          border:"3px solid #1a4a20",
          boxShadow:"0 0 24px #00000088, inset 0 0 20px #00000044",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <div style={{ fontSize:10, color:"#1a4a20", letterSpacing:2, fontWeight:700 }}>HOLD'EM</div>
        </div>
      </div>

      {/* Seats */}
      {seats.map(({ pos, x, y, isHero, isActive }, i) => {
        // Show all labels except the hero's — they must identify their own seat
        const show = revealLabels || !isHero;
        return (
          <div key={i} style={{
            position:"absolute",
            left:`${x}%`, top:`${y}%`,
            transform:"translate(-50%,-50%)",
            display:"flex", flexDirection:"column", alignItems:"center", gap:2,
          }}>
            {/* Chip/seat circle */}
            <div style={{
              width: isHero ? 34 : 26,
              height: isHero ? 34 : 26,
              borderRadius:"50%",
              background: isHero
                ? "linear-gradient(135deg,#f59e0b,#d97706)"
                : isActive ? "#0f2744" : "#080e1a",
              border: isHero ? "2px solid #f59e0b" : `2px solid ${isActive ? "#1e3a5f" : "#0a1628"}`,
              boxShadow: isHero ? "0 0 12px #f59e0b66" : "none",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize: isHero ? 10 : 8,
              fontWeight:700,
              color: isHero ? "#000" : isActive ? "#475569" : "#1e3a5f",
            }}>
              {isHero ? "YOU" : isActive ? (i+1) : "–"}
            </div>
            {/* Position label */}
            <div style={{
              fontSize: isHero ? 11 : 9,
              fontWeight: isHero ? 800 : 600,
              color: show ? (isHero ? "#f59e0b" : "#94a3b8") : "#1e3a5f",
              letterSpacing: 0.5,
              background: show && isHero ? "#f59e0b22" : "transparent",
              padding: isHero ? "1px 4px" : "0",
              borderRadius: 4,
              whiteSpace:"nowrap",
            }}>
              {show ? pos : "?"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Scenario generators by level ──────────────────────────────────────────────

// Level 1 — Table Awareness: identify your position
function genPositionAwareness(tableSize) {
  const positions = tableSize === 9 ? POSITIONS_9MAX : POSITIONS_6MAX;
  const heroSeat = Math.floor(Math.random() * positions.length);
  const heroPos = positions[heroSeat];
  const wrongOptions = positions.filter(p => p !== heroPos);
  const shuffled = [heroPos, ...wrongOptions.slice(0,3)].sort(() => Math.random()-0.5);
  return {
    level: 1,
    concept: "Table Awareness — Position",
    tableSize,
    positions,
    heroSeat,
    revealAfter: true, // reveal all labels after answering
    question: `You're sitting at a ${tableSize}-max table. What position are you in?`,
    options: shuffled,
    correctIndex: shuffled.indexOf(heroPos),
    explanation: `You're in **${heroPos}** (${POS_FULL_NAME[heroPos]}). ${POS_DESC[heroPos]} At a ${tableSize}-max table the positions in order of action are: ${positions.join(" → ")}.`,
    termBox: {
      term: heroPos,
      def: POS_FULL_NAME[heroPos] + " — " + POS_DESC[heroPos],
    },
  };
}

// Level 2 — Open Raising: should I open from this position?
function genOpenRaising(tableSize) {
  const positions = tableSize === 9 ? POSITIONS_9MAX : POSITIONS_6MAX;
  // Pick a random non-blind position (don't open from blinds in this scenario)
  const openPositions = positions.filter(p => p !== "SB" && p !== "BB");
  const pos = openPositions[Math.floor(Math.random() * openPositions.length)];
  const heroSeat = positions.indexOf(pos);

  // Pick a hand and determine correct action
  const scenarios = [
    // Premium — always open
    { r1:"A", r2:"K", suited:false, action:"Raise — open for 2.5x the big blind", correct:true,
      reason:"AKo is a premium hand. Open-raise from any position. The standard open size is 2.5x the big blind — not more. Raising bigger (like 5x) just tells everyone you have a monster and they fold, winning you nothing. A smaller consistent raise keeps opponents guessing and builds a pot you're likely to win." },
    { r1:"A", r2:"A", suited:false, action:"Raise — open for 2.5x the big blind", correct:true,
      reason:"Pocket Aces are the best starting hand. Always raise — but keep it to the standard 2.5x. Raising 5x looks strong and everyone folds, winning tiny pot. Raising 2.5x looks the same as any other open raise, so opponents with decent hands will call and pay you off. You want action when you have Aces, not a walk." },
    { r1:"K", r2:"K", suited:false, action:"Raise — open for 2.5x the big blind", correct:true,
      reason:"Pocket Kings — the second best starting hand in poker, behind only Aces. Raise from anywhere. Use the standard 2.5x size, same as you'd raise with any other hand. Consistency is key: if you raise big only with big hands, smart opponents will fold every time and you'll never get paid. Raise the same amount with Kings as you would with 78s — let them guess." },
    // Solid — depends on position
    { r1:"7", r2:"8", suited:true, action: pos==="CO"||pos==="BTN" ? "Raise — open from late position" : "Fold — too speculative from early position", correct:true,
      reason: pos==="CO"||pos==="BTN"
        ? "Suited connectors like 78s play well from late position (CO or BTN). You have position after the flop and can semi-bluff or make straights and flushes."
        : "78s is a speculative hand that needs position to be profitable. From early position you'll often have to play it out of position postflop, which is costly. Fold." },
    { r1:"A", r2:"2", suited:true, action: pos==="CO"||pos==="BTN" ? "Raise — open from late position" : "Fold — too weak from early position", correct:true,
      reason: pos==="CO"||pos==="BTN"
        ? "A2s has flush potential and wheel (A-2-3-4-5) straight potential. It's playable from late position but not worth opening early."
        : "A2s is too weak to open from early or middle position. The flush draw needs position to realize its value. Fold." },
    { r1:"Q", r2:"J", suited:false, action: pos==="UTG"||pos==="UTG+1"||pos==="UTG+2" ? "Fold — too weak from UTG" : "Raise — playable from this position", correct:true,
      reason: pos==="UTG"||pos==="UTG+1"||pos==="UTG+2"
        ? "QJo is a decent hand but too many players act behind you from UTG. You'll often be dominated by AQ, AJ, KQ, or KJ. Fold and wait for a better spot."
        : "QJo is a solid hand from middle or late position. Fewer players behind you reduces the risk of running into a dominating hand." },
  ];

  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  const label = handLabel(scenario.r1, scenario.r2, scenario.suited);
  const suitedStr = scenario.suited ? "suited (same suit)" : "offsuit (different suits)";

  const options = [
    "Raise — open for 2.5x the big blind",
    "Fold — wait for a better spot",
    "Limp — just call the big blind",
    "Raise — open for 5x the big blind",
  ];
  const correct = scenario.action.startsWith("Raise") ? options[0] : options[1];

  return {
    level: 2,
    concept: "Open Raising — Position",
    tableSize,
    positions,
    heroSeat,
    revealAfter: false,
    hand: { r1: scenario.r1, r2: scenario.r2, suited: scenario.suited },
    question: `You're in ${pos} at a ${tableSize}-max table. Everyone has folded to you. You hold ${label} (${suitedStr}). What do you do?`,
    options,
    correctIndex: options.indexOf(correct),
    explanation: scenario.reason + (correct === options[2] ? "" : " Limping (just calling the big blind) is generally weak — it lets everyone behind you see a cheap flop and gives you no initiative."),
    termBox: {
      term: "Open Raise",
      def: "An open raise is the first raise before the flop. Standard size is 2.5x the big blind (e.g. BB is $1, you raise to $2.50). Why not raise bigger with strong hands? Because consistent sizing hides your hand strength — opponents can't tell if you have Aces or a steal attempt. Raising 5x only when you have premium hands is a tell that experienced players will exploit by folding every time.",
    },
  };
}

// Level 3 — Steal Spots: CO or BTN, folds to you, do you steal?
function genStealSpot(tableSize) {
  const positions = tableSize === 9 ? POSITIONS_9MAX : POSITIONS_6MAX;
  const stealPositions = ["CO", "BTN"];
  const pos = stealPositions[Math.floor(Math.random() * stealPositions.length)];
  const heroSeat = positions.indexOf(pos);

  const scenarios = [
    // Good steal candidates
    { r1:"K", r2:"7", suited:true, steal:true,
      reason:`K7s isn't strong enough to open from early position, but from the ${pos} with everyone folded, it's a solid steal. You only have the blinds to beat, and many players fold their blinds. Even if called, you have position postflop and a decent hand.` },
    { r1:"A", r2:"5", suited:false, steal:true,
      reason:`A5o is marginal, but stealing from the ${pos} is about fold equity — the chance your opponents fold. With just the blinds left and a hand with an Ace, this is a standard steal attempt.` },
    { r1:"J", r2:"T", suited:true, steal:true,
      reason:`JTs is a strong hand with great playability. From the ${pos}, you should definitely open. You have position, a connected suited hand, and only the blinds to get through.` },
    { r1:"9", r2:"4", suited:false, steal:false,
      reason:`94o is too weak even from the ${pos}. Steal attempts should have some value if called — 94o is hard to improve and easy to dominate. Save the steal for hands with at least some strength.` },
    { r1:"7", r2:"2", suited:false, steal:false,
      reason:`72o — the worst starting hand in poker. Even from the Button, this is a fold. The steal only works if everyone folds; if someone calls, you're in trouble with nothing.` },
    { r1:"Q", r2:"8", suited:false, steal:true,
      reason:`Q8o is marginal but playable as a steal from the ${pos}. You have a face card with decent blocker value. Standard open here — just don't over-invest if you face heavy resistance.` },
  ];

  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const label = handLabel(s.r1, s.r2, s.suited);
  const options = [
    `Raise — attempt the steal (2.5x BB)`,
    `Fold — the hand is too weak`,
    `Limp — just call the big blind`,
    `Raise big — 5x BB to force folds`,
  ];
  const correct = s.steal ? options[0] : options[1];

  return {
    level: 3,
    concept: "Steal Spots — Late Position",
    tableSize,
    positions,
    heroSeat,
    revealAfter: false,
    hand: { r1: s.r1, r2: s.r2, suited: s.suited },
    context: `Everyone has folded to you.`,
    question: `You're on the ${pos} at a ${tableSize}-max table. Everyone folds around to you. You hold ${label}. Do you steal?`,
    options,
    correctIndex: options.indexOf(correct),
    explanation: s.reason,
    termBox: {
      term: "Stealing the Blinds",
      def: "A 'steal' is a raise from late position (CO or BTN) when everyone before you has folded. The goal is to win the blinds (the forced bets posted by SB and BB) without a fight. It works because the only players left are the blinds, who often fold. Even a medium hand can be worth stealing with since you'll have position on any caller for the rest of the hand.",
    },
  };
}

// Level 4 — Blind Defense: in the BB, BTN raises, do you defend?
function genBlindDefense(tableSize) {
  const positions = tableSize === 9 ? POSITIONS_9MAX : POSITIONS_6MAX;
  const heroSeat = positions.indexOf("BB");
  const raiserPos = positions.indexOf("BTN");

  const scenarios = [
    // Defend
    { r1:"K", r2:"9", suited:false, defend:true,
      reason:`K9o is a reasonable defend from the BB against a BTN steal. You're getting good pot odds since you've already put in 1 BB, and K9o has enough high-card strength to continue. The downside: you'll be out of position postflop, so play cautiously on bad boards.` },
    { r1:"7", r2:"6", suited:true, defend:true,
      reason:`76s is a great BB defense hand. You're getting excellent pot odds, and suited connectors play well multiway and in 3-bet pots. You can flop strong draws and disguised made hands. Call.` },
    { r1:"A", r2:"4", suited:false, defend:false,
      reason:`A4o looks decent but is tricky out of position. If you flop an Ace you may be dominated by AK, AQ, AJ. If you miss, it's difficult to bluff profitably since you act first. This is a fold or a 3-bet — not a call.` },
    { r1:"Q", r2:"J", suited:true, defend:true,
      reason:`QJs is a strong defend. You have great equity vs a wide BTN stealing range, flush and straight potential, and decent showdown value. Call and play the flop in position.` },
    { r1:"5", r2:"3", suited:false, defend:false,
      reason:`53o doesn't have enough to justify calling out of position. The hand needs to improve significantly on the flop, and being first to act postflop makes it hard to realize that equity. Fold.` },
    { r1:"J", r2:"8", suited:false, defend:true,
      reason:`J8o is a borderline defend. The BTN is stealing wide, and J8o has enough high-card value to call once from the BB given your discount. Just play fit-or-fold on the flop — don't overcommit.` },
  ];

  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const label = handLabel(s.r1, s.r2, s.suited);
  const options = [
    "Call — defend your big blind",
    "Fold — not worth defending",
    "3-bet — raise back at them",
    "Limp — it's already paid",
  ];
  const correct = s.defend ? options[0] : options[1];

  return {
    level: 4,
    concept: "Blind Defense — BB vs BTN",
    tableSize,
    positions,
    heroSeat,
    revealAfter: false,
    hand: { r1: s.r1, r2: s.r2, suited: s.suited },
    context: `Everyone folds. BTN raises to 2.5x BB. Action is on you in the BB.`,
    question: `You're in the BB at a ${tableSize}-max table. The Button raises to 2.5x. You hold ${label}. Do you defend?`,
    options,
    correctIndex: options.indexOf(correct),
    explanation: s.reason + " Remember: being in the BB means you act first on every postflop street — that positional disadvantage is real and should make you cautious about calling with marginal hands.",
    termBox: {
      term: "Defending the Big Blind",
      def: "When someone raises and the action reaches the BB, you can 'defend' by calling. You get a discount since you've already put in 1 BB — if the raise is 2.5x, you only need to call 1.5 more BBs to see the flop. However, you'll be out of position (acting first) for all three postflop streets, which is a real disadvantage. Strong hands, suited connectors, and hands with pair potential are best to defend with.",
    },
  };
}

// Level 5 — 3-Bet Spots: facing a raise, in position, 3-bet/call/fold?
function genThreeBetSpot(tableSize) {
  const positions = tableSize === 9 ? POSITIONS_9MAX : POSITIONS_6MAX;
  // Hero is in BTN or CO, raiser is UTG or MP
  const latePositions = ["BTN", "CO"];
  const earlyPositions = positions.filter(p => ["UTG","UTG+1","MP"].includes(p));
  const heroPos = latePositions[Math.floor(Math.random() * latePositions.length)];
  const raiserPos = earlyPositions[Math.floor(Math.random() * earlyPositions.length)];
  const heroSeat = positions.indexOf(heroPos);

  const scenarios = [
    // 3-bet for value
    { r1:"A", r2:"A", suited:false, action:"3-bet",
      reason:`Pocket Aces — always 3-bet for value. You want to build a big pot and get money in while you're a massive favourite. Make it 3x the original raise (so if they raised to 3BB, you 3-bet to 9BB).` },
    { r1:"K", r2:"K", suited:false, action:"3-bet",
      reason:`Kings — 3-bet always. You're a big favourite over everything except Aces, and you want to thin the field and build a pot.` },
    { r1:"A", r2:"K", suited:true, action:"3-bet",
      reason:`AKs is too strong to just call. 3-bet for value — you want more money in preflop with the best non-pair hand in poker, and you'll often fold out weaker Aces that might outdraw you.` },
    // Call in position
    { r1:"J", r2:"T", suited:true, action:"call",
      reason:`JTs is a strong speculative hand that plays great in position, but isn't strong enough to 3-bet for value against an early position raise (UTG/MP raise usually means a strong hand). Call and play the flop — you have position and can pick up big pots when you hit.` },
    { r1:"9", r2:"9", suited:false, action:"call",
      reason:`99 against an early position raise is a tricky spot. You're likely flipping or behind AK/TT+. Just call in position and see a flop. You're hoping to flop a set (which happens ~12% of the time) or find out you're ahead on a safe board.` },
    { r1:"A", r2:"Q", suited:false, action:"call",
      reason:`AQo is strong but vulnerable to AK and KK/AA from early position. Calling keeps the pot manageable and lets you see the flop before committing heavily. If you flop top pair with top kicker, you can then build the pot.` },
    // Fold
    { r1:"7", r2:"6", suited:true, action:"fold",
      reason:`76s is a great hand to open yourself, but facing an early position raise it lacks the raw strength to call. You'll often be dominated and out of equity. Fold here — opening a hand and calling a raise are two different decisions.` },
    { r1:"K", r2:"J", suited:false, action:"fold",
      reason:`KJo is dominated by AK, AJ, KQ, and all the pairs a UTG/MP player raises. Against a tight early position range, fold even from BTN. Note: KJo is fine to open if no one has acted — opening a hand and calling a raise are two different decisions.` },
  ];

  const s = scenarios[Math.floor(Math.random() * scenarios.length)];
  const label = handLabel(s.r1, s.r2, s.suited);
  const options = [
    "3-bet — raise it up (3x the raise)",
    "Call — take a flop in position",
    "Fold — not worth it here",
  ];
  const actionMap = { "3-bet": options[0], "call": options[1], "fold": options[2] };
  const correct = actionMap[s.action];

  return {
    level: 5,
    concept: "3-Bet Spots — Value & Folds",
    tableSize,
    positions,
    heroSeat,
    revealAfter: false,
    hand: { r1: s.r1, r2: s.r2, suited: s.suited },
    context: `${raiserPos} raises to 3x BB. Folds to you on the ${heroPos}.`,
    question: `You're on the ${heroPos} at a ${tableSize}-max table. ${raiserPos} raises to 3x BB. You hold ${label}. What's your play?`,
    options,
    correctIndex: options.indexOf(correct),
    explanation: s.reason,
    termBox: {
      term: "3-Bet",
      def: "A 3-bet is the third bet in a sequence. The blinds are the first 'bet', an open raise is the second bet, and re-raising that open is a 3-bet. You 3-bet for two reasons: (1) for VALUE — you have a premium hand and want more money in the pot, or (2) as a BLUFF/semi-bluff — to steal the pot before the flop. Standard 3-bet size is 3x the original raise.",
    },
  };
}

// ── Master generator ──────────────────────────────────────────────────────────
const LEVEL_GENS = [
  genPositionAwareness,
  genOpenRaising,
  genStealSpot,
  genBlindDefense,
  genThreeBetSpot,
];

let positionQueue = [];
function getNextPositionScenario(level, tableSize) {
  // level: 1-5 or "all"
  const pool = level === "all"
    ? LEVEL_GENS
    : [LEVEL_GENS[parseInt(level) - 1]];
  if (positionQueue.length === 0) positionQueue = [...pool].sort(() => Math.random()-0.5);
  const gen = positionQueue.pop();
  try { return gen(tableSize); }
  catch(e) { return genPositionAwareness(tableSize); }
}

// ── Position Trainer Screen ───────────────────────────────────────────────────
function PositionTrainerScreen() {
  const [tableSize, setTableSize] = useState(6);
  const [level, setLevel] = useState("all");
  const [scenario, setScenario] = useState(null);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [showTerm, setShowTerm] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [showAiBox, setShowAiBox] = useState(false);
  const [score, setScore] = useState({ correct:0, total:0, streak:0, bestStreak:0 });
  const [history, setHistory] = useState([]);
  const [animKey, setAnimKey] = useState(0);
  const [lifetimeStats, setLifetimeStats] = useState(DEFAULT_STATS);
  const [showDashboard, setShowDashboard] = useState(false);
  const [newBadge, setNewBadge] = useState(null);

  useEffect(() => { loadStats().then(s => setLifetimeStats(s)); }, []);

  const next = useCallback(() => {
    setScenario(getNextPositionScenario(level, tableSize));
    setSelected(null); setAnswered(false); setShowTerm(false);
    setShowAiBox(false); setAiQuestion(""); setAiAnswer(null); setAiError(null);
    setAnimKey(k=>k+1);
  }, [level, tableSize]);

  useEffect(() => { next(); }, [level, tableSize]);

  const askAi = async () => {
    if (!aiQuestion.trim() || !scenario) return;
    setAiLoading(true); setAiAnswer(null); setAiError(null);
    const s = scenario;
    const context = [
      `The player is on the Positions trainer, Level ${s.level}: ${s.concept}.`,
      `Table: ${s.tableSize}-max. Hero seat: ${s.positions[s.heroSeat]} (${POS_FULL_NAME[s.positions[s.heroSeat]]}).`,
      s.hand ? `Hero's hand: ${handLabel(s.hand.r1, s.hand.r2, s.hand.suited)}.` : "",
      s.context ? `Situation: ${s.context}` : "",
      `Question asked: ${s.question}`,
      `Correct answer: ${s.options[s.correctIndex]}.`,
      answered ? `Player answered: ${s.options[selected]} (${selected === s.correctIndex ? "correct" : "incorrect"}).` : "Player has not answered yet.",
    ].filter(Boolean).join(" ");

    const prompt = `You are a friendly poker coach helping a beginner learn Texas Hold'em. Keep answers concise (2-4 sentences), use plain English, and define any poker terms you use. Never assume prior knowledge.

Context: ${context}

Player's question: "${aiQuestion}"

Answer directly and helpfully. If the question is unrelated to poker, gently redirect.`;

    try {
      const result = await callClaude(prompt);
      if (result.ok) setAiAnswer(result.text);
      else setAiError(result.text);
    } catch (e) {
      setAiError("Something went wrong. Please try again.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAnswer = async (idx) => {
    if (answered) return;
    setSelected(idx); setAnswered(true);
    const isCorrect = idx === scenario.correctIndex;
    const newStreak = isCorrect ? score.streak + 1 : 0;
    setScore(s => ({ correct:s.correct+(isCorrect?1:0), total:s.total+1, streak:newStreak, bestStreak:Math.max(s.bestStreak,newStreak) }));
    setHistory(h => [{ concept:scenario.concept, correct:isCorrect }, ...h].slice(0,5));
    const updated = updateStats(lifetimeStats, { category:"Position", concept:scenario.concept, correct:isCorrect, streak:newStreak });
    const fresh = checkNewBadges(updated);
    const withBadges = applyNewBadges(updated, fresh);
    setLifetimeStats(withBadges);
    await saveStats(withBadges);
    if (fresh.length > 0) { setNewBadge(fresh[0]); }
  };

  const LEVEL_LABELS = {
    "all": "All Levels",
    "1": "L1 · Position ID",
    "2": "L2 · Open Raising",
    "3": "L3 · Steal Spots",
    "4": "L4 · Blind Defense",
    "5": "L5 · 3-Bet Spots",
  };

  if (!scenario) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"60vh",color:"#475569" }}>Loading...</div>;

  const s = scenario;

  return (
    <div style={{ padding:"12px", maxWidth:600, margin:"0 auto" }}>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <BadgeToast badge={newBadge} onDismiss={()=>setNewBadge(null)} onViewAll={()=>{ setShowDashboard(true); setNewBadge(null); }} />
      {showDashboard && <ProgressDashboard stats={lifetimeStats} newBadge={null} onClose={()=>setShowDashboard(false)} />}
      {showRange && <RangeVisualizer defaultPos={scenario?.heroSeat||"BTN"} defaultTableSize={tableSize} onClose={()=>setShowRange(false)} />}

      {/* Controls row: table size + level filter */}
      <div style={{ display:"flex", gap:8, marginBottom:12, alignItems:"center", flexWrap:"wrap" }}>
        {/* Table size toggle */}
        <div style={{ display:"flex", borderRadius:8, overflow:"hidden", border:"1px solid #0f2033", flexShrink:0 }}>
          {[6,9].map(n => (
            <button key={n} onClick={()=>setTableSize(n)} style={{
              padding:"5px 12px", border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
              background: tableSize===n ? "#0f2744" : "transparent",
              color: tableSize===n ? "#f59e0b" : "#334155",
              borderRight: n===6 ? "1px solid #0f2033" : "none",
            }}>{n}-max</button>
          ))}
        </div>
        {/* Level filter */}
        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
          {Object.entries(LEVEL_LABELS).map(([k,v]) => (
            <button key={k} onClick={()=>setLevel(k)} style={{
              padding:"4px 10px", borderRadius:20, fontSize:10, fontWeight:700,
              border:`1px solid ${level===k?"#60a5fa":"#0f2033"}`,
              background: level===k ? "#60a5fa22" : "transparent",
              color: level===k ? "#60a5fa" : "#334155",
              cursor:"pointer", whiteSpace:"nowrap",
            }}>{v}</button>
          ))}
        </div>
      </div>

      {/* Score bar */}
      <div style={{ background:"#0a1628",border:"1px solid #0f2033",borderRadius:10,padding:"8px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <div style={{ display:"flex",gap:14 }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:16,fontWeight:900,color:"#4ade80" }}>{score.correct}</div>
            <div style={{ fontSize:9,color:"#334155",letterSpacing:1 }}>CORRECT</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:16,fontWeight:900,color:"#94a3b8" }}>{score.total}</div>
            <div style={{ fontSize:9,color:"#334155",letterSpacing:1 }}>TOTAL</div>
          </div>
          {score.total>0 && <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:16,fontWeight:900,color:"#f59e0b" }}>{Math.round(score.correct/score.total*100)}%</div>
            <div style={{ fontSize:9,color:"#334155",letterSpacing:1 }}>ACCURACY</div>
          </div>}
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          {score.streak>=2 && <div style={{ fontSize:12,color:"#f59e0b" }}>🔥 {score.streak}</div>}
          <button onClick={()=>{ setNewBadge(null); setShowDashboard(true); }} style={{
            padding:"4px 10px",borderRadius:8,border:"1px solid #f59e0b44",
            background:"#f59e0b11",color:"#f59e0b",cursor:"pointer",fontSize:11,fontWeight:700,
          }}>🏆 Progress</button>
        </div>
      </div>

      {/* Glossary overlay */}
      {showGlossary && (
        <div style={{ position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",background:"#00000088" }}
          onClick={()=>setShowGlossary(false)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:"#0a1628",border:"1px solid #1e3a5f",borderRadius:16,
            padding:"20px",maxWidth:400,width:"100%",maxHeight:"80vh",overflowY:"auto",
            animation:"fadeIn 0.2s ease",
          }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
              <div style={{ fontSize:13,fontWeight:800,color:"#60a5fa",letterSpacing:2 }}>POSITION GLOSSARY</div>
              <button onClick={()=>setShowGlossary(false)} style={{ background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:18,lineHeight:1 }}>✕</button>
            </div>
            {(s.tableSize === 9 ? POSITIONS_9MAX : POSITIONS_6MAX).map(pos => (
              <div key={pos} style={{ padding:"10px 0",borderBottom:"1px solid #0f2033" }}>
                <div style={{ display:"flex",alignItems:"baseline",gap:8,marginBottom:3 }}>
                  <span style={{ fontSize:13,fontWeight:800,color:"#f59e0b",minWidth:52 }}>{pos}</span>
                  <span style={{ fontSize:11,color:"#475569" }}>{POS_FULL_NAME[pos]}</span>
                </div>
                <div style={{ fontSize:12,color:"#94a3b8",lineHeight:1.6 }}>{POS_DESC[pos]}</div>
              </div>
            ))}
            <div style={{ marginTop:14,padding:"10px 12px",borderRadius:10,background:"#060d1a",border:"1px solid #0f2033" }}>
              <div style={{ fontSize:10,letterSpacing:2,color:"#475569",marginBottom:6 }}>ACTING ORDER (6-MAX)</div>
              <div style={{ fontSize:12,color:"#334155" }}>UTG → MP → CO → BTN → SB → BB (preflop)</div>
              <div style={{ fontSize:11,color:"#1e3a5f",marginTop:4 }}>Postflop: SB → BB → UTG → ... → BTN (BTN acts last = best position)</div>
            </div>
          </div>
        </div>
      )}

      {/* Scenario card */}
      <div key={animKey} style={{ position:"relative",background:"#0a1628",border:"1px solid #0f2033",borderRadius:14,padding:"16px",marginBottom:10,animation:"fadeIn 0.3s ease" }}>

        {/* Level badge + concept + ? button */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
          <div style={{ fontSize:10,letterSpacing:2,color:"#60a5fa",background:"#60a5fa11",padding:"3px 10px",borderRadius:10,border:"1px solid #60a5fa22" }}>
            {s.concept.toUpperCase()}
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <div style={{ fontSize:10,color:"#334155",letterSpacing:1 }}>LEVEL {s.level}</div>
            <button onClick={()=>setShowRange(true)} title="Range chart" style={{
              padding:"2px 8px",height:22,borderRadius:11,border:"1px solid #4ade8044",
              background:"#4ade8011",color:"#4ade80",cursor:"pointer",
              fontSize:9,fontWeight:800,letterSpacing:1,flexShrink:0,
              transition:"all 0.15s",
            }}>RANGES</button>
            <button onClick={()=>setShowGlossary(true)} title="Position glossary" style={{
              width:22,height:22,borderRadius:"50%",border:"1px solid #1e3a5f",
              background:"#0f2744",color:"#475569",cursor:"pointer",
              fontSize:12,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all 0.15s",flexShrink:0,
            }}>?</button>
          </div>
        </div>

        {/* Table diagram */}
        <TableDiagram
          positions={s.positions}
          heroSeat={s.heroSeat}
          revealLabels={s.revealAfter ? answered : true}
          activeSeats={null}
        />

        {/* Hand display (if applicable) */}
        {s.hand && (
          <div style={{ display:"flex",alignItems:"center",gap:10,margin:"10px 0 8px" }}>
            <div style={{ fontSize:9,letterSpacing:2,color:"#475569" }}>YOUR HAND</div>
            <div style={{ display:"flex",gap:5 }}>
              {[
                { rank:s.hand.r1, suit: s.hand.suited ? "♥" : "♥" },
                { rank:s.hand.r2, suit: s.hand.suited ? "♥" : "♠" },
              ].map((c,i) => (
                <Card key={i} rank={c.rank} suit={c.suit} size="md" />
              ))}
            </div>
            <div style={{ fontSize:11,color:"#475569" }}>{handLabel(s.hand.r1, s.hand.r2, s.hand.suited)}</div>
          </div>
        )}

        {/* Context line */}
        {s.context && (
          <div style={{ fontSize:12,color:"#475569",marginBottom:8,fontStyle:"italic" }}>
            {s.context}
          </div>
        )}

        {/* Question */}
        <div style={{ fontSize:14,fontWeight:600,color:"#e2e8f0",marginBottom:14,lineHeight:1.4 }}>
          {s.question}
        </div>

        {/* Options */}
        <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
          {s.options.map((opt,i) => {
            const isCorrect = i===s.correctIndex, isSel = i===selected;
            let bg="#060d1a",border="#1e3a5f",color="#94a3b8";
            if (answered) {
              if (isCorrect) { bg="#16a34a22"; border="#4ade80"; color="#4ade80"; }
              else if (isSel&&!isCorrect) { bg="#dc262622"; border="#f87171"; color="#f87171"; }
            } else if (isSel) { bg="#1e3a5f"; border="#f59e0b"; color="#f59e0b"; }
            return (
              <button key={i} onClick={()=>handleAnswer(i)} disabled={answered} style={{
                padding:"10px 14px",borderRadius:10,border:`2px solid ${border}`,
                background:bg,color,fontSize:13,fontWeight:600,textAlign:"left",
                cursor:answered?"default":"pointer",transition:"all 0.15s",touchAction:"manipulation",
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{ width:20,height:20,borderRadius:"50%",border:`2px solid ${border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,flexShrink:0 }}>
                  {answered&&isCorrect?"✓":answered&&isSel&&!isCorrect?"✗":String.fromCharCode(65+i)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback panel */}
      {answered && (
        <div style={{
          background:selected===s.correctIndex?"#0a1f0a":"#1a0a0a",
          border:`1px solid ${selected===s.correctIndex?"#1a3a1a":"#3a1a1a"}`,
          borderRadius:12,padding:"14px",marginBottom:10,animation:"fadeIn 0.25s ease",
        }}>
          <div style={{ fontSize:14,fontWeight:700,color:selected===s.correctIndex?"#4ade80":"#f87171",marginBottom:6 }}>
            {selected===s.correctIndex?"✓ Correct":`✗ Incorrect — ${s.options[s.correctIndex]}`}
          </div>
          <p style={{ margin:"0 0 12px",fontSize:13,color:"#94a3b8",lineHeight:1.7 }}>
            {s.explanation}
          </p>

          {/* Term box — expandable glossary entry */}
          {s.termBox && (
            <div style={{ marginBottom:12 }}>
              <button onClick={()=>setShowTerm(t=>!t)} style={{
                padding:"5px 12px",borderRadius:8,border:"1px solid #60a5fa44",
                background:"#60a5fa11",color:"#60a5fa",cursor:"pointer",fontSize:11,fontWeight:700,letterSpacing:1,
              }}>
                {showTerm ? "▾" : "▸"} DEFINE: {s.termBox.term.toUpperCase()}
              </button>
              {showTerm && (
                <div style={{ marginTop:8,padding:"10px 14px",borderRadius:10,background:"#060d1a",border:"1px solid #60a5fa22",fontSize:12,color:"#94a3b8",lineHeight:1.7,animation:"fadeIn 0.2s ease" }}>
                  <span style={{ color:"#60a5fa",fontWeight:700 }}>{s.termBox.term}: </span>
                  {s.termBox.def}
                </div>
              )}
            </div>
          )}

          {/* AI Ask Box */}
          <div style={{ marginTop:12,borderTop:"1px solid #0f2033",paddingTop:12 }}>
            {!showAiBox ? (
              <button onClick={()=>setShowAiBox(true)} style={{
                padding:"6px 14px",borderRadius:8,border:"1px solid #a78bfa44",
                background:"#a78bfa11",color:"#a78bfa",cursor:"pointer",fontSize:11,fontWeight:700,letterSpacing:1,
              }}>✦ Ask a question about this</button>
            ) : (
              <div style={{ animation:"fadeIn 0.2s ease" }}>
                <div style={{ fontSize:10,letterSpacing:2,color:"#a78bfa",marginBottom:8 }}>✦ AI COACH — ASK ANYTHING</div>
                <div style={{ display:"flex",gap:8,marginBottom:8 }}>
                  <input
                    value={aiQuestion}
                    onChange={e=>setAiQuestion(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&askAi()}
                    placeholder="e.g. Why does the Button have an advantage?"
                    style={{
                      flex:1,padding:"8px 12px",borderRadius:8,border:"1px solid #1e3a5f",
                      background:"#060d1a",color:"#e2e8f0",fontSize:12,outline:"none",
                    }}
                  />
                  <button onClick={askAi} disabled={aiLoading||!aiQuestion.trim()} style={{
                    padding:"8px 14px",borderRadius:8,border:"1px solid #a78bfa66",
                    background: aiLoading||!aiQuestion.trim() ? "#0f1f35" : "#a78bfa22",
                    color: aiLoading||!aiQuestion.trim() ? "#334155" : "#a78bfa",
                    cursor: aiLoading||!aiQuestion.trim() ? "default" : "pointer",
                    fontSize:12,fontWeight:700,flexShrink:0,
                  }}>{aiLoading ? "..." : "Ask"}</button>
                </div>
                {aiError && <div style={{ fontSize:12,color:"#f87171",marginBottom:8 }}>{aiError}</div>}
                {aiAnswer && (
                  <div style={{ padding:"10px 14px",borderRadius:10,background:"#0d0a1f",border:"1px solid #a78bfa22",fontSize:12,color:"#c4b5fd",lineHeight:1.7,animation:"fadeIn 0.2s ease" }}>
                    {aiAnswer}
                  </div>
                )}
                {(aiAnswer||aiError) && (
                  <button onClick={()=>{setAiQuestion("");setAiAnswer(null);setAiError(null);}} style={{
                    marginTop:8,padding:"4px 12px",borderRadius:6,border:"1px solid #1e3a5f",
                    background:"transparent",color:"#334155",cursor:"pointer",fontSize:11,
                  }}>Ask another</button>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop:12 }}>
            <button onClick={next} style={{
              padding:"9px 24px",borderRadius:10,border:"1px solid #60a5fa88",
              background:"linear-gradient(135deg,#001a2a,#000f1a)",
              color:"#60a5fa",cursor:"pointer",fontSize:13,fontWeight:700,letterSpacing:1,
            }}>Next Scenario →</button>
          </div>
        </div>
      )}

      {/* Recent history */}
      {history.length>0 && (
        <div style={{ background:"#0a1628",border:"1px solid #0f2033",borderRadius:12,padding:"10px 12px" }}>
          <div style={{ fontSize:11,letterSpacing:3,color:"#475569",marginBottom:6 }}>RECENT</div>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
            {history.map((h,i) => (
              <div key={i} style={{ padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,
                background:h.correct?"#16a34a22":"#dc262622",
                border:`1px solid ${h.correct?"#4ade8044":"#f8717144"}`,
                color:h.correct?"#4ade80":"#f87171",
              }}>
                {h.correct?"✓":"✗"} {h.concept}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Screen: Trainer Hub (Patterns + Positions) ──────────────────────────────
function TrainerScreen() {
  const [mode, setMode] = useState("patterns");
  return (
    <div>
      {/* Mode toggle */}
      <div style={{ maxWidth:600, margin:"0 auto", padding:"10px 12px 0" }}>
        <div style={{ display:"flex", borderRadius:10, overflow:"hidden", border:"1px solid #0f2033", marginBottom:2 }}>
          {[["patterns","🂠  Patterns"],["positions","📍  Positions"]].map(([id,label],i) => (
            <button key={id} onClick={()=>setMode(id)} style={{
              flex:1, padding:"9px 0", border:"none", cursor:"pointer",
              fontSize:12, fontWeight:700, letterSpacing:1,
              background: mode===id ? "#0f2744" : "transparent",
              color: mode===id ? "#f59e0b" : "#334155",
              borderRight: i===0 ? "1px solid #0f2033" : "none",
              transition:"all 0.15s",
            }}>{label}</button>
          ))}
        </div>
      </div>
      {mode === "patterns" ? <PatternTrainerScreen /> : <PositionTrainerScreen />}
    </div>
  );
}

// ─── Screen: Pattern Trainer (Phase 4) ────────────────────────────────────────
function PatternTrainerScreen() {
  const [question, setQuestion] = useState(null);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState({ correct:0, total:0, streak:0, bestStreak:0 });
  const [filter, setFilter] = useState("all");
  const [history, setHistory] = useState([]);
  const [animKey, setAnimKey] = useState(0);
  const [lifetimeStats, setLifetimeStats] = useState(DEFAULT_STATS);
  const [showDashboard, setShowDashboard] = useState(false);
  const [newBadge, setNewBadge] = useState(null);
  const [showRange, setShowRange] = useState(false);

  useEffect(() => { loadStats().then(s => setLifetimeStats(s)); }, []);

  const nextQuestion = useCallback(() => {
    setQuestion(getNextScenario(filter));
    setSelected(null); setAnswered(false); setAnimKey(k=>k+1);
  }, [filter]);
  useEffect(() => { nextQuestion(); }, [filter]);

  const handleAnswer = async (idx) => {
    if (answered) return;
    setSelected(idx); setAnswered(true);
    const isCorrect = idx === question.correctIndex;
    const newStreak = isCorrect ? score.streak + 1 : 0;
    setScore(s => ({ correct:s.correct+(isCorrect?1:0), total:s.total+1, streak:newStreak, bestStreak:Math.max(s.bestStreak,newStreak) }));
    setHistory(h => [{ concept:question.concept, correct:isCorrect, difficulty:question.difficulty }, ...h].slice(0,5));
    // persist to storage
    const updated = updateStats(lifetimeStats, { category:"Pattern", concept:question.concept, correct:isCorrect, streak:newStreak });
    const fresh = checkNewBadges(updated);
    const withBadges = applyNewBadges(updated, fresh);
    setLifetimeStats(withBadges);
    await saveStats(withBadges);
    if (fresh.length > 0) { setNewBadge(fresh[0]); }
  };

  if (!question) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"60vh",color:"#475569" }}>Loading...</div>;

  return (
    <div style={{ padding:"16px",maxWidth:600,margin:"0 auto" }}>
      <BadgeToast badge={newBadge} onDismiss={()=>setNewBadge(null)} onViewAll={()=>{ setShowDashboard(true); setNewBadge(null); }} />
      {showDashboard && <ProgressDashboard stats={lifetimeStats} newBadge={null} onClose={()=>setShowDashboard(false)} />}
      {showRange && <RangeVisualizer defaultPos="BTN" defaultTableSize={6} onClose={()=>setShowRange(false)} />}
      {/* Score bar */}
      <div style={{ background:"#0a1628",border:"1px solid #0f2033",borderRadius:10,padding:"10px 16px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <div style={{ display:"flex",gap:16 }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:18,fontWeight:900,color:"#4ade80" }}>{score.correct}</div>
            <div style={{ fontSize:9,color:"#334155",letterSpacing:1 }}>CORRECT</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:18,fontWeight:900,color:"#94a3b8" }}>{score.total}</div>
            <div style={{ fontSize:9,color:"#334155",letterSpacing:1 }}>TOTAL</div>
          </div>
          {score.total>0 && <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:18,fontWeight:900,color:"#f59e0b" }}>{Math.round(score.correct/score.total*100)}%</div>
            <div style={{ fontSize:9,color:"#334155",letterSpacing:1 }}>ACCURACY</div>
          </div>}
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          {score.streak>=2 && <div style={{ fontSize:12,color:"#f59e0b" }}>🔥 {score.streak}</div>}
          <button onClick={()=>{ setNewBadge(null); setShowDashboard(true); }} style={{
            padding:"4px 10px",borderRadius:8,border:"1px solid #f59e0b44",
            background:"#f59e0b11",color:"#f59e0b",cursor:"pointer",fontSize:11,fontWeight:700,
          }}>🏆 Progress</button>
        </div>
      </div>

      {/* Difficulty filter */}
      <div style={{ display:"flex",gap:6,marginBottom:14 }}>
        {["all","beginner","intermediate","advanced"].map(f => (
          <button key={f} onClick={()=>setFilter(f)} style={{
            padding:"5px 10px",borderRadius:20,fontSize:10,fontWeight:600,
            border:`1px solid ${filter===f?(DIFF_COLOR[f]||"#f59e0b"):"#0f2033"}`,
            background:filter===f?(DIFF_COLOR[f]||"#f59e0b")+"22":"transparent",
            color:filter===f?(DIFF_COLOR[f]||"#f59e0b"):"#334155",
            cursor:"pointer",textTransform:"capitalize",letterSpacing:0.5,
          }}>{f}</button>
        ))}
      </div>

      {/* Question card */}
      <div key={animKey} style={{ background:"#0a1628",border:"1px solid #0f2033",borderRadius:14,padding:"18px",marginBottom:12,animation:"fadeIn 0.3s ease" }}>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,paddingBottom:14,borderBottom:"1px solid #0f2033" }}>
          <div style={{ fontSize:10,letterSpacing:2,color:"#f59e0b",background:"#f59e0b11",padding:"3px 10px",borderRadius:10,border:"1px solid #f59e0b22" }}>
            {question.concept.toUpperCase()}
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            <div style={{ fontSize:10,letterSpacing:1,color:DIFF_COLOR[question.difficulty],textTransform:"uppercase" }}>
              {question.difficulty}
            </div>
            <button onClick={()=>setShowRange(true)} title="Range chart" style={{
              padding:"2px 8px",height:20,borderRadius:10,border:"1px solid #4ade8044",
              background:"#4ade8011",color:"#4ade80",cursor:"pointer",
              fontSize:9,fontWeight:800,letterSpacing:1,flexShrink:0,
            }}>RANGES</button>
          </div>
        </div>

        {/* Cards — shown whenever hole or board arrays exist */}
        {(question.hole?.length > 0 || question.board?.length > 0) && (
          <div style={{ display:"flex",gap:10,marginBottom:12,alignItems:"flex-end",flexWrap:"wrap" }}>
            {question.hole?.length > 0 && (
              <div>
                <div style={{ fontSize:9,color:"#334155",letterSpacing:2,marginBottom:5 }}>YOUR HAND</div>
                <div style={{ display:"flex",gap:6 }}>
                  {question.hole.map((c,i) => <Card key={i} rank={c.rank} suit={c.suit} size="lg" />)}
                </div>
              </div>
            )}
            {question.hole?.length > 0 && question.board?.length > 0 && (
              <div style={{ fontSize:16,color:"#1e3a5f",paddingBottom:6 }}>+</div>
            )}
            {question.board?.length > 0 && (
              <div>
                <div style={{ fontSize:9,color:"#334155",letterSpacing:2,marginBottom:5 }}>BOARD</div>
                <div style={{ display:"flex",gap:5 }}>
                  {question.board.map((c,i) => <Card key={i} rank={c.rank} suit={c.suit} size="md" />)}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Scenario context — always shown when present */}
        {question.scenario && (
          <div style={{ fontSize:12,color:"#64748b",marginBottom:12,padding:"8px 10px",borderRadius:8,background:"#060d1a",border:"1px solid #0f2033",lineHeight:1.6 }}>
            {question.scenario}
          </div>
        )}

        <div style={{ fontSize:14,fontWeight:600,color:"#e2e8f0",marginBottom:14,lineHeight:1.4 }}>
          {question.question}
        </div>

        <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
          {question.options.map((opt,i) => {
            const isCorrect = i===question.correctIndex, isSelected = i===selected;
            let bg="#060d1a",border="#1e3a5f",color="#94a3b8";
            if (answered) {
              if (isCorrect) { bg="#16a34a22"; border="#4ade80"; color="#4ade80"; }
              else if (isSelected&&!isCorrect) { bg="#dc262622"; border="#f87171"; color="#f87171"; }
            } else if (isSelected) { bg="#1e3a5f"; border="#f59e0b"; color="#f59e0b"; }
            return (
              <button key={i} onClick={()=>handleAnswer(i)} disabled={answered} style={{
                padding:"11px 14px",borderRadius:10,border:`2px solid ${border}`,
                background:bg,color,fontSize:13,fontWeight:600,textAlign:"left",
                cursor:answered?"default":"pointer",transition:"all 0.15s",touchAction:"manipulation",
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{ width:20,height:20,borderRadius:"50%",border:`2px solid ${border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,flexShrink:0,color }}>
                  {answered&&isCorrect?"✓":answered&&isSelected&&!isCorrect?"✗":String.fromCharCode(65+i)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback */}
      {answered && (
        <div style={{
          background:selected===question.correctIndex?"#0a1f0a":"#1a0a0a",
          border:`1px solid ${selected===question.correctIndex?"#1a3a1a":"#3a1a1a"}`,
          borderRadius:12,padding:"14px",marginBottom:12,animation:"fadeIn 0.25s ease",
        }}>
          <div style={{ fontSize:14,fontWeight:700,color:selected===question.correctIndex?"#4ade80":"#f87171",marginBottom:6 }}>
            {selected===question.correctIndex?"✓ Correct":`✗ Incorrect — ${question.options[question.correctIndex]}`}
          </div>
          <p style={{ margin:"0 0 10px",fontSize:13,color:"#94a3b8",lineHeight:1.7 }}>{question.explanation}</p>
          <button onClick={nextQuestion} style={{
            padding:"9px 24px",borderRadius:10,border:"1px solid #f59e0b88",
            background:"linear-gradient(135deg,#1a2a00,#0f1f00)",
            color:"#f59e0b",cursor:"pointer",fontSize:13,fontWeight:700,letterSpacing:1,
          }}>Next Question →</button>
        </div>
      )}

      {history.length>0 && (
        <div style={{ background:"#0a1628",border:"1px solid #0f2033",borderRadius:12,padding:"10px 8px" }}>
          <div style={{ fontSize:11,letterSpacing:3,color:"#475569",marginBottom:8 }}>RECENT</div>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
            {history.map((h,i) => (
              <div key={i} style={{ padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,
                background:h.correct?"#16a34a22":"#dc262622",
                border:`1px solid ${h.correct?"#4ade8044":"#f8717144"}`,
                color:h.correct?"#4ade80":"#f87171",
              }}>
                {h.correct?"✓":"✗"} {h.concept}
              </div>
            ))}
          </div>
        </div>
      )}

      {score.bestStreak>=3 && (
        <div style={{ textAlign:"center",marginTop:12,fontSize:11,color:"#f59e0b",letterSpacing:1 }}>
          🔥 Best streak: {score.bestStreak}
        </div>
      )}
    </div>
  );
}

// ─── Root App with Navigation ──────────────────────────────────────────────────
export default function PokerTrainer() {
  const [screen, setScreen] = useState("analyzer");

  const NAV = [
    { id: "analyzer", label: "Analyzer", icon: "🂠" },
    { id: "odds",     label: "Odds",     icon: "📊" },
    { id: "trainer",  label: "Trainer",  icon: "🎯" },
  ];

  const titles = {
    analyzer: "Hand Analyzer",
    odds: "Odds & AI Coach",
    trainer: "Training Grounds",
  };

  return (
    <div style={{ minHeight:"100vh", background:"#060d1a", fontFamily:"'DM Sans',sans-serif", color:"#e2e8f0", paddingBottom:"calc(70px + env(safe-area-inset-bottom))" }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        body { margin:0; overscroll-behavior:none; }
        input, textarea, button { font-family: inherit; }
        @media (max-width: 480px) {
          .card-grid { gap: 2px !important; }
        }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Top header */}
      <div style={{ background:"linear-gradient(180deg,#0a1628 0%,#060d1a 100%)", borderBottom:"1px solid #0f2033", padding:"10px 16px", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ maxWidth:600, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:9, letterSpacing:3, color:"#f59e0b", opacity:0.8 }}>TEXAS HOLD'EM</div>
            <div style={{ fontSize:17, fontWeight:900, fontFamily:"'Playfair Display',serif" }}>{titles[screen]}</div>
          </div>
          <div style={{ fontSize:18, opacity:0.4 }}>♠♥♦♣</div>
        </div>
      </div>

      {/* Screen content */}
      {screen === "analyzer" && <AnalyzerScreen />}
      {screen === "odds"     && <OddsScreen />}
      {screen === "trainer"  && <TrainerScreen />}

      {/* Bottom nav — with iOS safe area padding */}
      <div style={{
        position:"fixed", bottom:0, left:0, right:0,
        background:"#0a1628", borderTop:"1px solid #0f2033",
        display:"flex", zIndex:20,
        paddingBottom:"env(safe-area-inset-bottom)",
      }}>
        {NAV.map(({ id, label, icon }) => (
          <button key={id} onClick={()=>setScreen(id)} style={{
            flex:1, padding:"10px 0 8px", border:"none", cursor:"pointer",
            background: screen===id ? "#0f2744" : "transparent",
            color: screen===id ? "#f59e0b" : "#334155",
            display:"flex", flexDirection:"column", alignItems:"center", gap:2,
            transition:"all 0.15s", WebkitTapHighlightColor:"transparent",
            borderTop: screen===id ? "2px solid #f59e0b" : "2px solid transparent",
            touchAction:"manipulation",
          }}>
            <span style={{ fontSize:20 }}>{icon}</span>
            <span style={{ fontSize:9, fontWeight:700, letterSpacing:1 }}>{label.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
