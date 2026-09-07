import React, { useEffect, useState, useRef } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, Typography, IconButton, Switch, FormControlLabel, TextField } from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { drawNextNumber, getGameSession, getPlaygroundPool, getPlaygroundHistory, listBoardCards, listGameSessions, setPlaygroundAutoDraw, startGameSession, beginDrawGameSession, pauseGameSession, resumeGameSession, endGameSession, completeGameSession, createGameSession } from '../../services/api';
import { useSnackbar } from 'notistack';
import audioService from '../../services/audio';

const statusColor = (status) => {
  if (status === 'DRAWING') return 'info';
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'PAUSED') return 'warning';
  return 'default';
};

export default function Playground() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const muiTheme = useMuiTheme();
  const isDarkMode = muiTheme.palette.mode === 'dark';

  const [session, setSession] = useState(null);
  const [pool, setPool] = useState(null);
  const [dailyRoundsCount, setDailyRoundsCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [autoDraw, setAutoDraw] = useState(false);
  const [autoSeconds, setAutoSeconds] = useState(5);
  const autoDelayTimeoutRef = useRef(null);
  const autoLoopGenerationRef = useRef(0);
  const autoLoopRunningRef = useRef(false);
  const autoDrawEnabledRef = useRef(false);
  const autoSecondsRef = useRef(5);
  const isPoolExhaustedRef = useRef(false);
  const sessionStatusRef = useRef(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [lastErrorDetails, setLastErrorDetails] = useState(null);
  const [highlightedNumber, setHighlightedNumber] = useState(null);
  const [shuffleHighlights, setShuffleHighlights] = useState([]);
  const [shuffleActive, setShuffleActive] = useState(false);
  const shuffleAudioRef = useRef(null);
  const shuffleIntervalRef = useRef(null);
  const [shuffleRounds, setShuffleRounds] = useState(3);
  const [visualShuffledRemaining, setVisualShuffledRemaining] = useState(null);
  const audioCtxRef = useRef(null);
  const audioBufferRef = useRef(null);
  const poolRef = useRef(null);
  const soldCardNumbersCacheRef = useRef([]);
  const soldCardCacheSessionRef = useRef(null);
  const soldCardCacheLoadPromiseRef = useRef(null);
  // audioService used for playback
  const audioSourceRef = useRef(null);
  const rafRef = useRef(null);
  const boardRef = useRef(null);
  const drawnListRef = useRef(null);
  const drawInFlightRef = useRef(false);

  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);
  useEffect(() => {
    autoSecondsRef.current = Math.max(1, Number(autoSeconds) || 1);
  }, [autoSeconds]);

  useEffect(() => {
    autoDrawEnabledRef.current = Boolean(autoDraw);
  }, [autoDraw]);

  useEffect(() => {
    isPoolExhaustedRef.current = Boolean(pool && pool.prizeCount > 0 && pool.currentRound >= pool.prizeCount);
  }, [pool]);

  useEffect(() => {
    sessionStatusRef.current = session?.status || null;
  }, [session?.status]);

  const clearSoldCardCache = () => {
    soldCardNumbersCacheRef.current = [];
    soldCardCacheSessionRef.current = null;
    soldCardCacheLoadPromiseRef.current = null;
  };

  const loadSoldCardNumbersCache = async ({ force = false } = {}) => {
    const hasValidCache = (
      !force
      && soldCardCacheSessionRef.current === sessionId
      && Array.isArray(soldCardNumbersCacheRef.current)
      && soldCardNumbersCacheRef.current.length > 0
    );
    if (hasValidCache) {
      return soldCardNumbersCacheRef.current;
    }

    if (soldCardCacheLoadPromiseRef.current && !force) {
      return soldCardCacheLoadPromiseRef.current;
    }

    const loadPromise = (async () => {
      const pageSize = 500;
      let page = 1;
      let total = 0;
      const soldCards = [];

      do {
        // eslint-disable-next-line no-await-in-loop
        const cardsRes = await listBoardCards(sessionId, { status: 'SOLD', page, pageSize });
        const cardsData = cardsRes?.data || cardsRes || {};
        const items = Array.isArray(cardsData.items) ? cardsData.items : [];
        soldCards.push(...items);
        total = Number(cardsData.total || soldCards.length);
        if (items.length === 0) break;
        page += 1;
      } while (soldCards.length < total);

      soldCardNumbersCacheRef.current = soldCards
        .map((card) => (Array.isArray(card?.numbers) ? card.numbers.map(Number) : []))
        .filter((nums) => nums.length > 0);
      soldCardCacheSessionRef.current = sessionId;

      return soldCardNumbersCacheRef.current;
    })();

    soldCardCacheLoadPromiseRef.current = loadPromise;
    try {
      return await loadPromise;
    } finally {
      if (soldCardCacheLoadPromiseRef.current === loadPromise) {
        soldCardCacheLoadPromiseRef.current = null;
      }
    }
  };

  const getSameCardHitMilestoneFromCache = async (latestCalledNumber) => {
    const latest = Number(latestCalledNumber);
    if (!Number.isFinite(latest)) return 0;

    let soldCardNumbers = soldCardNumbersCacheRef.current;
    if (!Array.isArray(soldCardNumbers) || soldCardNumbers.length === 0 || soldCardCacheSessionRef.current !== sessionId) {
      soldCardNumbers = await loadSoldCardNumbersCache();
    }

    if (!Array.isArray(soldCardNumbers) || soldCardNumbers.length === 0) return 0;

    const calledSet = new Set([
      ...Array.from(poolRef.current?.calledNumbers || []).map(Number),
      latest,
    ]);

    let milestone = 0;
    for (const cardNumbers of soldCardNumbers) {
      if (!cardNumbers.includes(latest)) continue;
      const calledOnCard = cardNumbers.reduce((acc, n) => acc + (calledSet.has(n) ? 1 : 0), 0);
      if (calledOnCard === 3) {
        milestone = 3;
        break;
      }
      if (calledOnCard === 2) {
        milestone = Math.max(milestone, 2);
      }
    }

    return milestone;
  };

  useEffect(() => {
    clearSoldCardCache();
  }, [sessionId]);

  useEffect(() => {
    if (session?.status === 'DRAWING') {
      loadSoldCardNumbersCache().catch(() => {
        // fallback: cache will be lazily loaded during draw when needed
      });
      return;
    }
    clearSoldCardCache();
  }, [session?.status, sessionId]);

  const clearAutoDelayTimeout = () => {
    if (autoDelayTimeoutRef.current) {
      clearTimeout(autoDelayTimeoutRef.current);
      autoDelayTimeoutRef.current = null;
    }
  };

  const waitMs = (ms) => new Promise((resolve) => {
    autoDelayTimeoutRef.current = setTimeout(() => {
      autoDelayTimeoutRef.current = null;
      resolve();
    }, ms);
  });

  const stopAutoLoop = () => {
    autoLoopGenerationRef.current += 1;
    autoLoopRunningRef.current = false;
    clearAutoDelayTimeout();
  };

  const startAutoLoop = async () => {
    if (autoLoopRunningRef.current) return;
    const generation = autoLoopGenerationRef.current;
    autoLoopRunningRef.current = true;

    while (autoLoopGenerationRef.current === generation && autoDrawEnabledRef.current) {
      if (isPoolExhaustedRef.current || sessionStatusRef.current !== 'DRAWING') {
        break;
      }

      await handleDrawNext();

      if (autoLoopGenerationRef.current !== generation || !autoDrawEnabledRef.current) {
        break;
      }

      const delayMs = autoSecondsRef.current * 1000;
      await waitMs(delayMs);
    }

    if (autoLoopGenerationRef.current === generation) {
      autoLoopRunningRef.current = false;
    }
  };

  const stopLocalAutoDraw = () => {
    stopAutoLoop();
    setAutoDraw(false);
  };

  const { enqueueSnackbar } = useSnackbar();

  const canRunDraws = hasPermission('RUN_DRAWS');
  const canDrawNext = Boolean(
    pool &&
    session?.status === 'DRAWING' &&
    pool.prizeCount > 0 &&
    pool.currentRound < pool.prizeCount
  );
  const canEndSession = Boolean(
    canRunDraws &&
    pool &&
    session &&
    ['DRAWING', 'PAUSED'].includes(session.status) &&
    pool.prizeCount > 0 &&
    pool.currentRound >= pool.prizeCount
  );

  const isPoolExhausted = Boolean(pool && pool.prizeCount > 0 && pool.currentRound >= pool.prizeCount);

  const boardOuterBg = isDarkMode ? '#111827' : '#ECECEC';
  const boardInnerRing = isDarkMode ? '#4B5563' : '#282F44';
  const boardAccentRing = isDarkMode ? '#3B82F6' : '#9ED8FF';
  const calledCellBg = isDarkMode
    ? '#007542'
    : '#007542';
  const idleCellBg = isDarkMode
    ? 'linear-gradient(160deg, #1F2937 0%, #111827 100%)'
    : 'linear-gradient(160deg, #ffffff 0%, #f8f9fb 100%)';
  const calledCellBorder = '3px solid rgba(0,117,66,0.95)';
  const idleCellBorder = isDarkMode ? '1px solid rgba(148,163,184,0.45)' : '1px solid #282F44';
  const boardGlassBg = isDarkMode ? 'rgba(15,23,42,0.55)' : 'rgba(255,255,255,0.55)';
  const boardGlassBorder = isDarkMode ? '1px solid rgba(148,163,184,0.28)' : '1px solid rgba(255,255,255,0.35)';
  const boardGlassShadow = isDarkMode ? 'inset 0 6px 18px rgba(0,0,0,0.35)' : 'inset 0 6px 18px rgba(0,0,0,0.08)';
  const drawnNumberColor = isDarkMode ? '#93C5FD' : '#1e3a8a';

  // When session leaves DRAWING, ensure auto-draw is stopped locally and on server
  useEffect(() => {
    if (session?.status !== 'DRAWING' && autoDraw) {
      stopLocalAutoDraw();
      setAutoDraw(false);
      (async () => {
        try {
          await setPlaygroundAutoDraw(sessionId, { enabled: false });
        } catch (e) {
          // ignore server-side errors here
        }
      })();
    }
  }, [session?.status]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [sessionRes, poolRes] = await Promise.all([
        getGameSession(sessionId),
        getPlaygroundPool(sessionId),
      ]);

      setSession(sessionRes?.data || sessionRes);
      setPool(poolRes?.data || poolRes);
    } catch (err) {
      const detail = err?.response?.data?.message || err?.response?.data?.error || 'Failed to load playground data.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      loadData();
    }
  }, [sessionId]);

  // fetch how many game sessions were played today, including the current one
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listGameSessions({ pageSize: 500 });
        const rows = (res?.data?.items) || (res?.data) || [];
        const today = new Date();
        const todayY = today.getFullYear();
        const todayM = today.getMonth();
        const todayD = today.getDate();

        const todaysSessions = (rows || []).filter((s) => {
          const created = new Date(s.createdAt || s.created_at);
          return created.getFullYear() === todayY && created.getMonth() === todayM && created.getDate() === todayD;
        });

        const hasCurrent = todaysSessions.some((s) => (s.sessionId || s.id) === sessionId);
        const count = hasCurrent || !sessionId ? todaysSessions.length : todaysSessions.length + 1;
        if (!cancelled) setDailyRoundsCount(count);
      } catch (e) {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // When a number is highlighted (just drawn), scroll it into view on the board and in the drawn list, and animate a pulse
  useEffect(() => {
    if (!highlightedNumber) return undefined;
    const n = Number(highlightedNumber);
    // scroll board cell into center
    try {
      const cell = boardRef?.current?.querySelector && boardRef.current.querySelector(`[data-cell="${n}"]`);
      if (cell && cell.scrollIntoView) cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    } catch (e) { /* ignore */ }

    // animate drawn list item
    try {
      const drawnEl = drawnListRef?.current?.querySelector && drawnListRef.current.querySelector(`[data-drawn="${n}"]`);
      if (drawnEl && drawnEl.animate) {
        drawnEl.animate([
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(1.12)', opacity: 1 },
          { transform: 'scale(1)', opacity: 1 }
        ], { duration: 900, easing: 'cubic-bezier(.2,.9,.2,1)' });
      }
    } catch (e) { /* ignore */ }

    return undefined;
  }, [highlightedNumber]);

  useEffect(() => {
    return () => {
      stopAutoLoop();
    };
  }, []);

  const handleDrawNext = async () => {
    if (drawInFlightRef.current) return;
    drawInFlightRef.current = true;
    setDrawing(true);
    setError('');
    setMessage('');
    // perform a visual shuffle before actually drawing
    try {
      if (!isPoolExhausted && !shuffleActive) {
        await handleShuffle();
      }
    } catch (e) {
      // ignore shuffle failures and proceed to draw
    }

    // Play draw-position cue for draws 1..15 using /audio/draw-<n>.wav
    try {
      const upcomingDraw = Number(poolRef.current?.currentRound || 0) + 1;
      if (upcomingDraw >= 1 && upcomingDraw <= 15) {
        const drawCueUrl = `/audio/draw-${upcomingDraw}.wav`;
        const hasCue = await audioService.preload(drawCueUrl);
        if (hasCue) {
          try { await audioService.playAndWait(drawCueUrl); } catch (e) { /* ignore play errors */ }
        }
      }
    } catch (e) {
      // ignore audio errors
    }

    try {
      const response = await drawNextNumber(sessionId, {});
      const draw = response?.data || response;
      const calledNumber = Number(draw.calledNumber);
      const msgText = `Draw #${draw.drawPosition}: number ${draw.calledNumber}`;
      setMessage(msgText);
      enqueueSnackbar(msgText, { variant: 'success' });
      // animate highlight for the drawn number
      setHighlightedNumber(calledNumber);
      // spawn confetti for tiered prizes (top 3)
      if (draw?.drawPosition && draw.drawPosition <= 3) {
        try { spawnConfettiForNumber(calledNumber, draw.drawPosition); } catch (e) { /* ignore */ }
      }

      // Conditional sequence by same-card called-count milestone.
      try {
        const sameCardMilestone = await getSameCardHitMilestoneFromCache(calledNumber);
        if (sameCardMilestone >= 2) {
          const afakereUrl = '/audio/afakere.wav';
          const hasAfakere = await audioService.preload(afakereUrl);
          if (hasAfakere) {
            try { await audioService.playAndWait(afakereUrl); } catch (e) { /* ignore */ }
          }
        }
        if (sameCardMilestone >= 3) {
          const bingoUrl = '/audio/bingo.wav';
          const hasBingo = await audioService.preload(bingoUrl);
          if (hasBingo) {
            try { await audioService.playAndWait(bingoUrl); } catch (e) { /* ignore */ }
          }
        }
      } catch (e) {
        // ignore milestone-audio errors
      }

      // Play called number after draw cue; wait until audio ends before allowing next sequence.
      try {
        const numUrl = `/audio/shared/${calledNumber}.wav`;
        const buf2 = await audioService.preload(numUrl);
        if (buf2) {
          try { await audioService.playAndWait(numUrl); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        // ignore
      }
      // clear highlight after a short time
      setTimeout(() => setHighlightedNumber(null), 1400);
      await loadData();
    } catch (err) {
      const code = err?.response?.data?.code;
      const detail = err?.response?.data?.message || err?.response?.data?.error || 'Failed to draw next number.';
      if (code === 'DRAW_POOL_EXHAUSTED') {
        stopLocalAutoDraw();
        // mark last error details so UI can react
        setLastErrorDetails(err?.response?.data?.details || null);
        await loadData();
        enqueueSnackbar(detail, { variant: 'warning' });
      } else {
        setError(detail);
      }
    } finally {
      setDrawing(false);
      drawInFlightRef.current = false;
    }
  };

  const playDrawSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.stop(ctx.currentTime + 0.55);
      // close context shortly after
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 800);
    } catch (err) {
      // ignore (autoplay policy etc.)
    }
  };

  const handleAutoToggle = async (enabled) => {
    if (enabled && isPoolExhausted) {
      enqueueSnackbar('Auto draw cannot be enabled once all configured prizes have been drawn.', { variant: 'warning' });
      setAutoDraw(false);
      return;
    }

    setAutoDraw(enabled);
    try {
      await setPlaygroundAutoDraw(sessionId, { enabled, secondsPerCall: enabled ? autoSeconds : null });
    } catch (err) {
      // ignore server error for now
    }

    if (enabled) {
      stopAutoLoop();
      // Start only when session is in DRAWING; run toggle handlers also call this after transitions.
      if (session?.status === 'DRAWING') {
        startAutoLoop();
      }
    } else {
      stopAutoLoop();
    }
  };

  // Keep loop lifecycle aligned with live auto-toggle and session state.
  useEffect(() => {
    if (autoDraw && session?.status === 'DRAWING' && !isPoolExhausted) {
      startAutoLoop();
      return;
    }
    if (!autoDraw || session?.status !== 'DRAWING' || isPoolExhausted) {
      stopAutoLoop();
    }
  }, [autoDraw, session?.status, isPoolExhausted]);

  // Effect: when pool becomes exhausted, stop auto and disable draw controls
  useEffect(() => {
    if (isPoolExhausted) {
      stopLocalAutoDraw();
      // notify user via toast instead of top Alert
      enqueueSnackbar('All configured prizes have been drawn.', { variant: 'info' });
    }
  }, [isPoolExhausted]);

  const handleShuffle = () => {
    // purely visual shuffle of remaining numbers order - reload pool to reflect server state
    if (!pool) return;
    const remaining = [];
    const used = new Set(pool.calledNumbers || []);
    for (let i = 1; i <= pool.totalNumbersPool; i += 1) {
      if (!used.has(i)) remaining.push(i);
    }
    // shuffle array
    for (let i = remaining.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    // create a new pseudo-pool ordering for UI convenience (won't affect server)
    // we will run the shuffle animation `shuffleRounds` times; each round we'll reshuffle the remaining order
    const rounds = Math.max(1, Number(shuffleRounds) || 1);
    const runRounds = async () => {
      for (let r = 0; r < rounds; r += 1) {
        // reshuffle remaining
        for (let i = remaining.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
        }
        // set visual-only shuffled order so we don't mutate the actual pool/order
        setVisualShuffledRemaining(remaining.slice());
        // await the animation for this round
        // eslint-disable-next-line no-await-in-loop
        await triggerShuffleAnimation();
      }
      // clear visual shuffle so underlying order remains unchanged after animation
      setVisualShuffledRemaining(null);
      return true;
    };

    // play shuffle audio and animate random highlights for the audio duration
    // return the promise so callers can await the visual/audio shuffle
    return runRounds();
  };

  const SHUFFLE_AUDIO_PATH = '/audio/A_shuffle.wav';

  // Preload via shared audioService (best-effort)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await audioService.preload(SHUFFLE_AUDIO_PATH);
      } catch (e) {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Play shuffle sound via shared audioService (returns {duration, analyser})
  const playShuffleSound = async () => {
    try {
      const res = await audioService.play(SHUFFLE_AUDIO_PATH);
      if (res == null) return { duration: 1.0, analyser: null };
      if (typeof res === 'number') return { duration: res, analyser: null };
      return res; // { duration, analyser }
    } catch (e) {
      return { duration: 1.0, analyser: null };
    }
  };

  // short clink sound for cheers popup
  const playClinkSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.connect(ctx.destination);

      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'triangle'; o2.type = 'sine';
      o1.frequency.setValueAtTime(880, now);
      o2.frequency.setValueAtTime(1320, now + 0.01);
      o1.connect(gain); o2.connect(gain);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      o1.start(now); o2.start(now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o1.stop(now + 0.2); o2.stop(now + 0.2);
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 400);
    } catch (e) {
      // ignore autoplay errors
    }
  };

  const [beerPopup, setBeerPopup] = useState(null);
  const [confetti, setConfetti] = useState(null);

  const showBeerPopupForNumber = async (num, event) => {
    try {
      // fetch history and find beerQuantity for the clicked number
      const res = await getPlaygroundHistory(sessionId, { pageSize: 500 });
      const items = (res?.data?.items) || (res?.data) || [];
      const found = Array.isArray(items) ? items.find((it) => Number(it.winningNumber || it.calledNumber) === Number(num)) : null;
      const beerQty = found ? (found.beerQuantity || found.beer_quantity || 0) : 0;
      const drawPos = found ? (found.drawPosition || found.draw_position || null) : null;

      const count = Math.max(0, Number(beerQty || 0));
      if (count === 0) {
        // show a small pulse indicating no beers
        setBeerPopup({ beers: [], message: 'No prize beers', expiresAt: Date.now() + 1400 });
        setTimeout(() => setBeerPopup(null), 1400);
        return;
      }

      const maxShow = Math.min(count, 30);
      const colorMap = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
      const color = (drawPos && colorMap[drawPos]) || '#FFB547';

      // origin: center of the numbers board (fallback to screen center)
      let originX = Math.round(window.innerWidth / 2);
      let originY = Math.round(window.innerHeight / 2);
      try {
        const rect = boardRef?.current?.getBoundingClientRect && boardRef.current.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          originX = Math.round(rect.left + rect.width / 2);
          originY = Math.round(rect.top + rect.height / 2);
        }
      } catch (e) {
        // fallback already set
      }

      const beers = new Array(maxShow).fill(0).map(() => ({
        leftPx: originX + (Math.random() * 220 - 110),
        topPx: originY + (Math.random() * 60 - 30),
        delay: Math.random() * 0.35,
        size: 120 + Math.floor(Math.random() * 120),
        color,
      }));

      // generate sparkles when multiple beers
      const sparkles = count >= 2 ? new Array(Math.min(8, Math.floor(count / 1))).fill(0).map(() => ({
        x: originX + (Math.random() * 120 - 60),
        y: originY + (Math.random() * 40 - 20),
        delay: Math.random() * 0.4,
        size: 10 + Math.floor(Math.random() * 14),
      })) : [];

      const DURATION_MS = 5000; // show for 5 seconds
      setBeerPopup({ beers, count, drawPos, color, sparkles, originX, originY, expiresAt: Date.now() + DURATION_MS, durationMs: DURATION_MS });
      try { playClinkSound(); } catch (e) {}

      // confetti burst when clicked
      const confCount = Math.min(60, 10 + Math.floor(count * 2));
      const colors = ['#FFD700','#C0C0C0','#CD7F32','#FFB547','#FF6B6B','#6BCB77'];
      const confettiParticles = new Array(confCount).fill(0).map(() => ({
        x: originX + (Math.random() * 200 - 100),
        y: originY + (Math.random() * 80 - 40),
        delay: Math.random() * 0.3,
        rot: Math.floor(Math.random() * 360),
        size: 6 + Math.floor(Math.random() * 12),
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 400,
        vy: -200 - Math.random() * 200,
      }));
      setConfetti({ particles: confettiParticles, durationMs: DURATION_MS, expiresAt: Date.now() + DURATION_MS });
      setTimeout(() => setConfetti(null), DURATION_MS + 120);
    } catch (e) {
      // ignore
    }
  };

  // Spawn confetti particles centered on a specific cell number
  const spawnConfettiForNumber = (num, tier) => {
    try {
      const cell = boardRef?.current?.querySelector && boardRef.current.querySelector(`[data-cell="${num}"]`);
      let originX = Math.round(window.innerWidth / 2);
      let originY = Math.round(window.innerHeight / 2);
      if (cell) {
        const rect = cell.getBoundingClientRect();
        originX = Math.round(rect.left + rect.width / 2);
        originY = Math.round(rect.top + rect.height / 2);
      } else if (boardRef?.current) {
        const rect = boardRef.current.getBoundingClientRect();
        originX = Math.round(rect.left + rect.width / 2);
        originY = Math.round(rect.top + rect.height / 2);
      }

      const confCount = 60;
      const colors = tier === 1 ? ['#E6AF2E', '#FFD700', '#FFF3C4'] : tier === 2 ? ['#C0C0C0', '#E6E6E6'] : ['#CD7F32', '#FFB547'];
      const particles = new Array(confCount).fill(0).map(() => ({
        x: originX + (Math.random() * 140 - 70),
        y: originY + (Math.random() * 80 - 40),
        delay: Math.random() * 0.25,
        rot: Math.floor(Math.random() * 360),
        size: 6 + Math.floor(Math.random() * 10),
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 400,
        vy: -200 - Math.random() * 240,
      }));

      const DURATION_MS = 1400;
      setConfetti({ particles, durationMs: DURATION_MS, expiresAt: Date.now() + DURATION_MS });
      setTimeout(() => setConfetti(null), DURATION_MS + 120);
    } catch (e) {
      // ignore
    }
  };

  // RAF-driven shuffle animation tied to actual audio duration
  const triggerShuffleAnimation = async () => {
    if (shuffleActive) return; // already animating
    // accessibility: respect reduced motion
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      // quick visual cue without animation
      setShuffleActive(true);
      setShuffleHighlights([]);
      setTimeout(() => setShuffleActive(false), 300);
      return;
    }

    setShuffleActive(true);
    // disable previous raf/playing source
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    try { audioService.stop(); } catch (e) {}

    // prepare remaining list once for efficiency
    const used = new Set(pool?.calledNumbers || []);
    const remaining = [];
    for (let i = 1; i <= (pool?.totalNumbersPool || 0); i += 1) if (!used.has(i)) remaining.push(i);
    if (remaining.length === 0) {
      setShuffleActive(false);
      return;
    }

    const { duration, analyser } = await playShuffleSound();
    const startTime = performance.now();
    const endTime = startTime + Math.max(0.5, duration) * 1000;

    const minInterval = 40; // ms fastest
    const maxInterval = 260; // ms slowest
    let lastChange = 0;
    let freqData = null;
    if (analyser && analyser.frequencyBinCount) freqData = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      const now = performance.now();
      const t = Math.min(1, (now - startTime) / (endTime - startTime));

      let intervalMs;
      if (freqData && analyser) {
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i += 1) sum += freqData[i];
        const avg = sum / freqData.length;
        const norm = Math.min(1, Math.max(0, avg / 255));
        // higher energy -> faster highlights (smaller interval)
        intervalMs = Math.max(minInterval, maxInterval - norm * (maxInterval - minInterval));
      } else {
        // fallback: ease from fast -> slow over time
        intervalMs = minInterval + (maxInterval - minInterval) * t;
      }

      if (now - lastChange >= intervalMs) {
        lastChange = now;
        // pick 25% of remaining numbers randomly to highlight at once
        const pct = 0.25;
        const count = Math.max(1, Math.floor(remaining.length * pct));
        // pick unique random indices
        const picks = [];
        const remCopy = remaining.slice();
        for (let k = remCopy.length - 1; k > 0 && picks.length < count; k -= 1) {
          const j = Math.floor(Math.random() * (k + 1));
          // swap
          const tmp = remCopy[k];
          remCopy[k] = remCopy[j];
          remCopy[j] = tmp;
        }
        for (let i = 0; i < Math.min(count, remCopy.length); i += 1) picks.push(remCopy[i]);
        setShuffleHighlights(picks);
      }

      if (now < endTime) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setTimeout(() => setShuffleHighlights([]), 80);
        setShuffleActive(false);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    // await the duration of the shuffle so callers can sequence actions (e.g., draw) after it
    await new Promise((resolve) => setTimeout(resolve, Math.max(400, Math.max(0.5, duration) * 1000) + 80));

    return duration;
  };

  const handleRunToggle = async () => {
    if (!canRunDraws) return;
    setLoading(true);
    setError('');
    try {
      if (session?.status === 'DRAWING') {
        // pause drawing
        await pauseGameSession(sessionId);
        // stop local auto loop
        stopAutoLoop();
      } else if (session?.status === 'PAUSED') {
        // resume drawing
        await resumeGameSession(sessionId);
        // resume auto-draw locally if enabled using completion-driven loop
        if (autoDraw) {
          try { await setPlaygroundAutoDraw(sessionId, { enabled: true, secondsPerCall: autoSeconds || 5 }); } catch (e) {}
          stopAutoLoop();
          startAutoLoop();
        }
      } else if (session?.status === 'PENDING') {
        // valid transition: PENDING -> ACTIVE
        await startGameSession(sessionId);
        // if auto-draw is enabled, inform server and start local loop when drawing begins
        if (autoDraw) {
          try { await setPlaygroundAutoDraw(sessionId, { enabled: true, secondsPerCall: autoSeconds || 5 }); } catch (e) {}
          stopAutoLoop();
        }
      } else if (session?.status === 'ACTIVE') {
        // Transition ACTIVE -> DRAWING via beginDraw endpoint, then start auto-draw if enabled
        await beginDrawGameSession(sessionId);
        if (autoDraw) {
          try { await setPlaygroundAutoDraw(sessionId, { enabled: true, secondsPerCall: autoSeconds || 5 }); } catch (e) {}
          stopAutoLoop();
          startAutoLoop();
        }
      }
      await loadData();
    } catch (err) {
      console.error('session state change error', err);
      const respData = err?.response?.data;
      const detail = respData?.message || respData?.error || (respData ? JSON.stringify(respData) : 'Failed to change session state.');
      setError(detail);
      setLastErrorDetails(respData || { message: detail });
    } finally {
      setLoading(false);
    }
  };

  // cleanup audio/raf on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { audioService.stop(); } catch (e) {}
      stopAutoLoop();
    };
  }, []);

  const runButtonLabel = (() => {
    if (session?.status === 'DRAWING') return 'Pause';
    if (session?.status === 'PAUSED') return 'Resume';
    if (session?.status === 'PENDING') return 'Start';
    if (session?.status === 'ACTIVE') return 'Begin Draw';
    return 'Start';
  })();

  const runButtonIcon = session?.status === 'DRAWING' ? <PauseIcon /> : <PlayArrowIcon />;
  // Only show the run/pause button while appropriate. If the session has just entered DRAWING
  // but no draws have been made yet (currentRound === 0), hide the Pause button per UX request.
  // Hide the run/pause button UI entirely while the session is actively drawing.
  const showRunButton = (() => {
    if (!canRunDraws) return false;
    if (['ENDED','COMPLETED','CANCELLED'].includes(session?.status)) return false;
    // Per UX: remove Pause UI — do not show the run button while DRAWING
    if (session?.status === 'DRAWING') return false;
    return true;
  })();

  const handleEndSession = async () => {
    if (!canRunDraws) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await endGameSession(sessionId);
      const endStatus = response?.data?.status || response?.status;

      if (endStatus === 'ENDED') {
        await completeGameSession(sessionId);
      }

      // create new game session from the same template as the current session
      try {
        const templateId = session?.templateId || session?.template_id || null;
        if (templateId) {
          const createdRes = await createGameSession({ templateId });
          const created = createdRes?.data || createdRes;
          const newId = created?.sessionId || created?.id;
          if (newId) {
            navigate(`/admin/games/${newId}/board`);
            return;
          }
        }
      } catch (createErr) {
        // ignore creation error and fallback to navigating back to current board
      }

      navigate(`/admin/games/${sessionId}/board`);
    } catch (err) {
      const detail = err?.response?.data?.message || err?.response?.data?.error || 'Failed to end session.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card
        variant="outlined"
        sx={{
          mb: 2,
          border: '2px solid #E6AF2E',
          boxShadow: `inset 0 0 0 4px ${boardInnerRing}, inset 0 0 0 8px ${boardAccentRing}`,
          borderRadius: 1,
          backgroundColor: boardOuterBg,
        }}
      >
        <CardContent>
          <Box sx={{ width: '100%', overflowX: shuffleActive ? 'visible' : 'auto', overflowY: shuffleActive ? 'visible' : 'hidden' }}>
            {pool && (
              (() => {
                const total = Number(pool.totalNumbersPool || 100);
                let rows = 10;
                let cols = 0;
                if (total === 100) {
                  rows = 5;
                  cols = 20;
                } else if (total === 120) {
                  rows = 6;
                  cols = 20;
                } else {
                  rows = 10;
                  cols = Math.ceil(total / rows);
                }
                const used = new Set(pool.calledNumbers || []);
                const shuffled = visualShuffledRemaining || pool._shuffledRemaining || [];

                // Build render order: if shuffled remaining is present and matches remaining count, use that order
                const totalNums = total;
                const calledArr = Array.from(pool.calledNumbers || []).map(Number);
                const remainingSet = new Set();
                for (let i = 1; i <= totalNums; i += 1) if (!used.has(i)) remainingSet.add(i);
                let renderOrder = [];
                if (Array.isArray(shuffled) && shuffled.length === remainingSet.size && shuffled.every((n) => remainingSet.has(n))) {
                  // place shuffled remaining first, then the called numbers
                  renderOrder = shuffled.concat(calledArr.filter((n) => !shuffled.includes(n)));
                } else {
                  // default sequential order
                  for (let i = 1; i <= total; i += 1) renderOrder.push(i);
                }

                const cells = [];
                const isLargePool = total >= 100;
                // Increased card sizes: ~1.5x larger for better visibility
                const cellMinSize = isLargePool ? 48 : 60;
                const cellMaxSize = isLargePool ? 72 : 84;
                const cellGap = isLargePool ? 0.75 : 1.0;
                // Fewer columns on mobile so the board wraps into rows instead of scrolling wide
                const mobileCols = cols >= 20 ? 10 : Math.max(5, Math.ceil(cols / 2));

                // map called number -> draw position (1-based)
                const positionMap = new Map((pool.calledNumbers || []).map((n, i) => [Number(n), i + 1]));

                for (let pos = 0; pos < renderOrder.length; pos += 1) {
                  const displayNumber = renderOrder[pos];
                  const isCalled = used.has(displayNumber);
                  const isHighlighted = highlightedNumber === displayNumber;
                  const isShuffleHighlighted = Array.isArray(shuffleHighlights) && shuffleHighlights.includes(displayNumber);
                  const bg = isCalled ? calledCellBg : idleCellBg;
                  cells.push(
                    <Box
                      key={`cell-${displayNumber}`}
                      data-cell={displayNumber}
                      sx={{
                        width: '100%',
                        aspectRatio: '1',
                        minWidth: { xs: 0, sm: cellMinSize },
                        maxWidth: { xs: 64, sm: cellMaxSize },
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 1,
                        position: 'relative',
                        border: isCalled ? calledCellBorder : isShuffleHighlighted ? '3px solid #1e40af' : idleCellBorder,
                        background: isShuffleHighlighted ? 'linear-gradient(160deg, #2563eb 0%, #3b82f6 100%)' : bg,
                        transformStyle: 'preserve-3d',
                        transform: isHighlighted ? 'scale(1.06)' : isShuffleHighlighted ? 'scale(1.03)' : 'scale(1)',
                        transition: 'transform 220ms ease, box-shadow 220ms ease, background 120ms ease, color 120ms ease',
                        boxShadow: isHighlighted ? '0 0 18px rgba(255,215,0,0.9)' : isShuffleHighlighted ? '0 0 18px rgba(59,130,246,0.35)' : undefined,
                        '@keyframes drawFlash': {
                          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 rgba(255,215,0,0)' },
                          '50%': { transform: 'scale(1.12)', boxShadow: '0 0 28px rgba(255,215,0,0.95)' },
                          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 rgba(255,215,0,0)' },
                        },
                        '@keyframes flipReveal': {
                          '0%': { transform: 'rotateX(90deg) scale(0.96)', opacity: 0 },
                          '60%': { transform: 'rotateX(-10deg) scale(1.08)', opacity: 1 },
                          '100%': { transform: 'rotateX(0deg) scale(1.06)', opacity: 1 },
                        },
                        animation: isHighlighted ? 'flipReveal 700ms cubic-bezier(.2,.8,.2,1), drawFlash 900ms ease-in-out' : undefined,
                      }}
                    >
                      <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.8rem', sm: isLargePool ? '1.25rem' : '1.4rem' }, color: isShuffleHighlighted || isCalled ? '#fff' : undefined }}>{displayNumber}</Typography>

                      {/* Winner badge for top tiers */}
                      {positionMap.get(displayNumber) && positionMap.get(displayNumber) <= 3 && (
                        (() => {
                          const tier = positionMap.get(displayNumber);
                          const color = tier === 1 ? '#E6AF2E' : tier === 2 ? '#C0C0C0' : '#CD7F32';
                          return (
                            <Box sx={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 800, fontSize: '0.85rem', transform: 'scale(0)', animation: 'badgePop 420ms cubic-bezier(.2,.9,.2,1) forwards' }}>
                              <Box component="span">{tier}</Box>
                            </Box>
                          );
                        })()
                      )}
                    </Box>
                  );
                }

                return (
                  <Box
                    ref={boardRef}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: `repeat(${mobileCols}, minmax(0, 1fr))`,
                        sm: `repeat(${cols}, minmax(${cellMinSize}px, 1fr))`,
                      },
                      gap: { xs: 0.5, sm: cellGap },
                      width: '100%',
                      borderRadius: 1,
                      overflow: 'hidden',
                      perspective: 800,
                      backgroundColor: boardGlassBg,
                      WebkitBackdropFilter: 'blur(6px)',
                      backdropFilter: 'blur(6px)',
                      boxShadow: boardGlassShadow,
                      border: boardGlassBorder,
                    }}
                  >
                    {cells}
                  </Box>
                );
              })()
            )}
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mb: 2, borderRadius: 2 }}>
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={1.5}
            sx={{ mb: 2 }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{session?.title || 'Session'}</Typography>
              <Chip label={session?.status || 'UNKNOWN'} color={statusColor(session?.status)} size="small" />
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
              <Chip variant="outlined" size="small" label={`Code: ${session?.sessionCode || '-'}`} />
              <Chip variant="outlined" size="small" label={`Rounds: ${dailyRoundsCount}`} />
            </Stack>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ mb: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1, mb: 1 }}>
              <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>Drawn Numbers</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
                <Chip size="small" label={`Remaining: ${pool?.remainingCount ?? '-'}`} />
                <Chip size="small" label={`Drawn: ${pool?.currentRound ?? '-'} / ${pool?.prizeCount ?? '-'}`} />
              </Stack>
            </Stack>
            <Box ref={drawnListRef} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', overflowX: 'auto', py: 1 }}>
              {Array.isArray(pool?.calledNumbers) && pool.calledNumbers.length > 0 ? (
                pool.calledNumbers.map((num, idx) => (
                  <Box
                    key={`drawn-${idx}`}
                    data-drawn={num}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: { xs: 64, sm: 100, md: 144 }, px: 1, cursor: 'pointer' }}
                    onClick={(e) => showBeerPopupForNumber(num, e)}
                  >
                    <Typography sx={{ fontWeight: 900, fontSize: { xs: '1.8rem', sm: '3rem', md: '4.8rem' }, lineHeight: 1, color: drawnNumberColor, transform: Number(highlightedNumber) === Number(num) ? 'scale(1.08)' : 'scale(1)', transition: 'transform 300ms cubic-bezier(.2,.9,.2,1)' }}>{num}</Typography>
                  </Box>
                ))
              ) : (
                <Typography color="text.secondary">No numbers drawn yet</Typography>
              )}
            </Box>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', md: 'center' }}
            spacing={1.5}
          >
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
              {session?.status === 'DRAWING' && !isPoolExhausted && (
                <FormControlLabel control={<Switch checked={autoDraw} onChange={(e) => handleAutoToggle(e.target.checked)} />} label="Auto draw" />
              )}
              {!autoDraw && !isPoolExhausted && (
                <Button variant="contained" onClick={handleDrawNext} disabled={!canDrawNext || loading || drawing}>
                  Draw Next
                </Button>
              )}
              {showRunButton && (
                <Button
                  startIcon={runButtonIcon}
                  variant="outlined"
                  onClick={handleRunToggle}
                  disabled={!canRunDraws || isPoolExhausted}
                >
                  {runButtonLabel}
                </Button>
              )}
              <Button
                variant="outlined"
                color="error"
                onClick={handleEndSession}
                disabled={!canEndSession || loading}
              >
                End
              </Button>

              {autoDraw && !isPoolExhausted && <Chip label="Auto" color="info" size="small" />}
              {!canEndSession && (
                (!canRunDraws ? (
                  <Chip label="Missing RUN_DRAWS" color="error" size="small" />
                ) : (
                  <Chip label="Can Run Draws" color="success" size="small" />
                ))
              )}
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
              {import.meta.env.DEV && lastErrorDetails && (
                <Button size="small" variant="text" onClick={() => console.log('Begin-draw error details', lastErrorDetails)}>
                  Show error details
                </Button>
              )}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <IconButton size="small" onClick={handleShuffle} disabled={shuffleActive || isPoolExhausted} title={shuffleActive ? 'Shuffling...' : 'Shuffle'}>
                  <ShuffleIcon fontSize="small" />
                </IconButton>
                <TextField
                  size="small"
                  type="number"
                  inputProps={{ min: 1, max: 10, step: 1 }}
                  value={shuffleRounds}
                  onChange={(e) => setShuffleRounds(Math.max(1, Math.min(10, Number(e.target.value || 1))))}
                  sx={{ width: 76 }}
                  label="Rounds"
                />
              </Box>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={1.5}
        sx={{ mt: 2 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Playground</Typography>
        </Box>
        <Box sx={{ width: { xs: '100%', md: 'auto' } }}>
          <Button
            variant="outlined"
            fullWidth
            sx={{ width: { xs: '100%', md: 'auto' } }}
            onClick={() => navigate(`/admin/games/${sessionId}/board`)}
          >
            Back to Board
          </Button>
        </Box>
      </Stack>

      {beerPopup && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 1400, pointerEvents: 'none' }}>
              <Box sx={{ position: 'absolute', left: 0, right: 0, top: '18%', height: 0 }}>
                {beerPopup.beers && beerPopup.beers.map((b, i) => {
                  const durationMs = beerPopup?.durationMs || Math.max(1000, (beerPopup.expiresAt || Date.now()) - Date.now());
                  const anim = `bottleRise ${durationMs}ms cubic-bezier(.12,.75,.24,1) ${b.delay}s forwards`;
                  return (
                    <Box
                      key={`beer-${i}`}
                      component="span"
                      sx={{
                        position: 'absolute',
                        left: `${Math.round(b.leftPx)}px`,
                        top: `${Math.round(b.topPx)}px`,
                        width: b.size,
                        height: b.size * 1.6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: 'translateY(0)',
                        animation: anim,
                        pointerEvents: 'none',
                      }}
                    >
                      <svg width={b.size} height={Math.round(b.size * 1.6)} viewBox="0 0 64 100" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <defs>
                          <linearGradient id={`g-${i}`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
                            <stop offset="60%" stopColor={b.color} stopOpacity="1" />
                            <stop offset="100%" stopColor={b.color} stopOpacity="1" />
                          </linearGradient>
                        </defs>
                        <g transform="translate(16,8)">
                          <rect x="0" y="36" width="32" height="52" rx="6" fill={`url(#g-${i})`} stroke="rgba(0,0,0,0.08)" />
                          <rect x="10" y="10" width="12" height="28" rx="6" fill="#3b382f" />
                          <ellipse cx="16" cy="36" rx="16" ry="6" fill="#fff8e6" opacity="0.9" />
                        </g>
                      </svg>
                    </Box>
                  );
                })}
                  {beerPopup.sparkles && beerPopup.sparkles.map((s, idx) => {
                    const dur = beerPopup?.durationMs ? Math.min(beerPopup.durationMs, 1200) : Math.max(800, (beerPopup.expiresAt || Date.now()) - Date.now());
                    const a = `sparklePop ${dur}ms cubic-bezier(.2,.9,.2,1) ${s.delay}s forwards`;
                    return (
                      <Box key={`sp-${idx}`} component="span" sx={{ position: 'absolute', left: `${Math.round(s.x)}px`, top: `${Math.round(s.y)}px`, width: s.size, height: s.size, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: a }}>
                        <svg width={s.size} height={s.size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 2 L13.8 8.2 L20 9.2 L15 13.6 L16.4 19.6 L12 16.6 L7.6 19.6 L9 13.6 L4 9.2 L10.2 8.2 Z" fill="#FFF9C4" stroke="#FFE082" strokeWidth="0.6" />
                        </svg>
                      </Box>
                    );
                  })}
              </Box>
              {/* confetti layer (full-screen rendered from confetti state) */}
              {confetti && confetti.particles && (
                <Box sx={{ position: 'fixed', left: 0, right: 0, top: 0, bottom: 0, pointerEvents: 'none', zIndex: 1401 }}>
                  {confetti.particles.map((c, i) => (
                    <Box key={`conf-${i}`} component="span" sx={{ position: 'absolute', left: `${Math.round(c.x)}px`, top: `${Math.round(c.y)}px`, width: c.size, height: c.size, transform: `translateY(0) rotate(${c.rot}deg)`, animation: `confettiAnim ${confetti.durationMs || 1500}ms linear ${c.delay}s forwards`, opacity: 1 }}>
                      <Box sx={{ width: '100%', height: '100%', backgroundColor: c.color, transform: 'rotate(20deg)', borderRadius: '2px' }} />
                    </Box>
                  ))}
                </Box>
              )}
              <Box sx={{
                '@keyframes bottleRise': {
                  '0%': { transform: 'translateY(0) scale(0.96)', opacity: 1 },
                  '30%': { transform: 'translateY(-120px) rotate(-8deg) scale(1.12)', opacity: 0.98 },
                  '65%': { transform: 'translateY(-220px) rotate(6deg) scale(1.04)', opacity: 0.7 },
                  '100%': { transform: 'translateY(-340px) rotate(6deg) scale(0.98)', opacity: 0 },
                },
                '@keyframes sparklePop': {
                  '0%': { transform: 'scale(0.2)', opacity: 0 },
                  '30%': { transform: 'scale(1.1)', opacity: 1 },
                  '100%': { transform: 'scale(0.9) translateY(-120px)', opacity: 0 },
                }
                ,
                '@keyframes confettiAnim': {
                  '0%': { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
                  '60%': { transform: 'translateY(160px) rotate(240deg)', opacity: 1 },
                  '100%': { transform: 'translateY(420px) rotate(480deg)', opacity: 0 },
                }
              }} />
        </Box>
      )}
    </Box>
  );
}
