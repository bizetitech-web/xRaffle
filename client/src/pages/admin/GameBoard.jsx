import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Stack,
  TextField,
  ToggleButton,
  Typography,
} from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useSnackbar } from 'notistack';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  archiveGameTemplate,
  createGameSession,
  getGameSession,
  listBoardCards,
  listBoardPrizes,
  listGameSessions,
  listGameTemplates,
  resumeGameSession,
  sellBoardCard,
  startGameSession,
  updateGameTemplate,
  unsellBoardCard,
  bulkBoardAction,
  createGameCharge,
} from '../../services/api';

const statusColor = (status) => {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'DRAWING') return 'info';
  return 'default';
};

export default function GameBoard() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { hasPermission, isSuperAdmin } = useAuth();
  const muiTheme = useMuiTheme();
  const isDarkMode = muiTheme.palette.mode === 'dark';

  const boardSurfaceGradient = isDarkMode
    ? 'linear-gradient(160deg, #1f2937 0%, #111827 100%)'
    : 'linear-gradient(160deg, #ffffff 0%, #f8f9fb 100%)';

  const boardSelectedGradient = isDarkMode
    ? 'linear-gradient(160deg, #1e3a8a 0%, #1d4ed8 100%)'
    : 'linear-gradient(160deg, #eef2ff 0%, #e0e7ff 100%)';

  const boardSoldGradient = isDarkMode
    ? 'linear-gradient(160deg, #14532d 0%, #166534 100%)'
    : 'linear-gradient(160deg, #eaf7ef 0%, #d8f0e0 100%)';

  const boardNeutralShadow = isDarkMode
    ? 'inset 0 0 0 1px rgba(255,255,255,0.14)'
    : 'inset 0 0 0 1px rgba(0,0,0,0.06)';

  const boardSelectedShadow = isDarkMode
    ? '0 6px 18px rgba(37,99,235,0.34)'
    : '0 6px 18px rgba(59,130,246,0.14)';

  const boardSoldShadow = isDarkMode
    ? '0 6px 14px rgba(22,163,74,0.4)'
    : '0 6px 14px rgba(56, 142, 60, 0.24)';

  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [compactLayout, setCompactLayout] = useState(() => {
    try {
      const raw = localStorage.getItem('gameboard.compact');
      if (raw === null) return true;
      return raw === 'true';
    } catch (e) {
      return true;
    }
  });
  const [session, setSession] = useState(null);
  const [cards, setCards] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [version, setVersion] = useState(undefined);
  const [totals, setTotals] = useState(null);
  const [sessionsPlayedCount, setSessionsPlayedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [chargeAmountInput, setChargeAmountInput] = useState('');
  const [busyCardNumber, setBusyCardNumber] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkDialogAction, setBulkDialogAction] = useState(null);
  const [autoCreateEnabled, setAutoCreateEnabled] = useState(true);
  // When true, clicking a card to sell/unsell will not show the sell/unsell toast messages.
  const [suppressCardToastsOnClick] = useState(true);
  // Selected cards for bulk operations / UI selection
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [editTemplateForm, setEditTemplateForm] = useState({
    templateCode: '',
    title: '',
    cardPrice: 0,
    totalCards: 0,
    totalNumbersPool: 100,
    numbersPerCard: 4,
    secondsPerCall: 5,
    generationMode: 'SEQUENTIAL',
    isDefault: false,
  });

  const canSellCards = hasPermission('SELL_CARDS');
  const canRunDraws = hasPermission('RUN_DRAWS');
  const canManageGames = hasPermission('MANAGE_GAMES');
  const currentSessionId = session?.sessionId || session?.id || sessionId;

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const boardColumns = useMemo(() => {
    const totalCards = Number(session?.totalCards || cards.length || 0);
    if (totalCards === 30) return 6;
    if (totalCards === 25) return 5;
    return 5;
  }, [session?.totalCards, cards.length]);

  const hasSoldCards = useMemo(() => {
    try {
      const soldFromTotals = Number((totals && totals.sold) || 0);
      if (soldFromTotals > 0) return true;
      return (cards || []).some((c) => String(c.status || '').toUpperCase() === 'SOLD');
    } catch (e) {
      return false;
    }
  }, [cards, totals]);

  const isIncompleteSession = (status) => !['COMPLETED', 'CANCELLED', 'ENDED'].includes(String(status || '').toUpperCase());

  const { enqueueSnackbar } = useSnackbar();
  const showError = (text) => {
    setError(text);
    if (text) enqueueSnackbar(text, { variant: 'error' });
  };
  const showMessage = (text) => {
    setMessage(text);
    if (text) enqueueSnackbar(text, { variant: 'success' });
  };

  useEffect(() => {
    try {
      localStorage.setItem('gameboard.compact', String(compactLayout));
    } catch (e) {
      // ignore
    }
  }, [compactLayout]);

  const pickSessionForTemplate = (sessions, template) => {
    const filtered = (sessions || []).filter((item) => isIncompleteSession(item.status));

    // Prefer explicit template linkage when available.
    const byTemplateId = filtered.find((item) => item.templateId && item.templateId === template.id);
    if (byTemplateId) {
      return byTemplateId;
    }

    // Fallback for current schema where games do not store template_id.
    const byTitle = filtered.find((item) => String(item.title || '').trim() === String(template.title || '').trim());
    if (byTitle) {
      return byTitle;
    }

    return filtered[0] || null;
  };

  const hydrateSession = async (resolvedSessionId) => {
    const [sessionRes, cardsRes, prizesRes] = await Promise.all([
      getGameSession(resolvedSessionId),
      listBoardCards(resolvedSessionId, { pageSize: 300 }),
      listBoardPrizes(resolvedSessionId),
    ]);

    const sessionData = sessionRes?.data || sessionRes;
    const boardData = cardsRes?.data || cardsRes;
    const prizeData = prizesRes?.data || prizesRes;

    setSession(sessionData);
    setCards(boardData?.items || []);
    setTotals(boardData?.totals || null);
    setPrizes(prizeData?.prizes || []);
    setVersion(boardData?.version || sessionData?.version);
  };

  const ensureSessionFromTemplate = async (template) => {
    const sessionsRes = await listGameSessions({ templateId: template.id });
    const sessions = sessionsRes?.data || sessionsRes || [];

    let target = pickSessionForTemplate(sessions, template);
    if (!target) {
      const createdRes = await createGameSession({ templateId: template.id });
      target = createdRes?.data || createdRes;
      showMessage(`Session ${target.sessionCode || ''} created from selected template.`.trim());
    }

    const resolvedSessionId = target.sessionId || target.id;
    if (!resolvedSessionId) {
      throw new Error('Session id was not returned by server.');
    }

    if (sessionId !== resolvedSessionId) {
      navigate(`/admin/games/${resolvedSessionId}/board`, { replace: true });
    }

    await hydrateSession(resolvedSessionId);
  };

  const loadTemplatesAndResolveSession = async () => {
    const templatesRes = await listGameTemplates();
    const allTemplates = (templatesRes?.data || templatesRes || []).filter((template) => template.isActive);
    setTemplates(allTemplates);

    if (allTemplates.length === 0) {
      throw new Error('No active game templates found. Create one to continue.');
    }

    let initialTemplate = allTemplates.find((template) => Number(template.isDefault) === 1) || allTemplates[0];
    if (sessionId) {
      const sessionRes = await getGameSession(sessionId);
      const existingSession = sessionRes?.data || sessionRes;
      initialTemplate = allTemplates.find((item) => item.id === existingSession.templateId)
        || allTemplates.find((item) => String(item.title || '').trim() === String(existingSession.title || '').trim())
        || allTemplates[0];

      await hydrateSession(sessionId);
    } else {
      await ensureSessionFromTemplate(initialTemplate);
    }

    setSelectedTemplateId(initialTemplate.id);
  };

  const loadBoard = async () => {
    setLoading(true);
    setError('');
    try {
      if (!selectedTemplateId || sessionId) {
        await loadTemplatesAndResolveSession();
      } else if (selectedTemplate) {
        await ensureSessionFromTemplate(selectedTemplate);
      }
    } catch (err) {
      const detail = err?.response?.data?.message || err?.response?.data?.error || 'Failed to load board.';
      showError(detail);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, [sessionId]);

  // fetch number of game sessions played so far for the current template, including the current one
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listGameSessions({ pageSize: 500 });
        const rows = (res?.data?.items) || (res?.data) || [];
        const currentTemplateId = session?.templateId || selectedTemplate?.id || null;
        const currentTitle = String(session?.title || selectedTemplate?.title || '').trim();

        const matching = (rows || []).filter((s) => {
          if (currentTemplateId && s.templateId) {
            return s.templateId === currentTemplateId;
          }
          return String(s.title || '').trim() === currentTitle;
        });

        const hasCurrent = matching.some((s) => (s.sessionId || s.id) === currentSessionId);
        const count = hasCurrent || !currentSessionId ? matching.length : matching.length + 1;
        if (!cancelled) setSessionsPlayedCount(count);
      } catch (e) {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, currentSessionId, session?.templateId, session?.title, selectedTemplate?.id, selectedTemplate?.title]);

  // Poll for session status changes and auto-create new session on terminal state
  useEffect(() => {
    if (!autoCreateEnabled || !currentSessionId || !selectedTemplate) {
      return;
    }

    const isTerminalStatus = (status) => ['COMPLETED', 'CANCELLED', 'ENDED'].includes(String(status || '').toUpperCase());
                    

    const pollInterval = setInterval(async () => {
      try {
        const sessionRes = await getGameSession(currentSessionId);
        const currentSession = sessionRes?.data || sessionRes;
        
        if (currentSession && isTerminalStatus(currentSession.status) && session && !isTerminalStatus(session.status)) {
          // Status changed to terminal state, auto-create new session
          setSession(currentSession);
          showMessage(`Session ${currentSession.status}. Creating new session automatically...`);
          
          try {
            const createdRes = await createGameSession({ templateId: selectedTemplate.id });
            const newSession = createdRes?.data || createdRes;
            const newSessionId = newSession.sessionId || newSession.id;
            
            if (newSessionId) {
              navigate(`/admin/games/${newSessionId}/board`, { replace: true });
              showMessage(`New session ${newSession.sessionCode || ''} created automatically.`.trim());
            }
          } catch (createErr) {
            const detail = createErr?.response?.data?.message || createErr?.response?.data?.error || 'Failed to auto-create new session.';
            showError(detail);
          }
        } else if (currentSession && currentSession.status !== session?.status) {
          // Status changed but not terminal, just update
          setSession(currentSession);
        }
      } catch (err) {
        // Silently ignore polling errors to avoid notification spam
        console.debug('Session status poll error:', err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [autoCreateEnabled, currentSessionId, selectedTemplate, session, navigate]);

  const handleTemplateChange = async (templateId) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');
    try {
      await ensureSessionFromTemplate(template);
      showMessage('Template selected. Session loaded for board operations.');
    } catch (err) {
      const detail = err?.response?.data?.message || err?.response?.data?.error || 'Failed to switch template session.';
      showError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleStartSession = async () => {
    setError('');
    setMessage('');
    try {
      const response = await startGameSession(currentSessionId, version ? { expectedVersion: version } : {});
      const data = response?.data || response;
      setVersion(data?.version || version);
      await loadBoard();
    } catch (err) {
      const detail = err?.response?.data?.message || err?.response?.data?.error || 'Failed to start session.';
      showError(detail);
    }
  };

  const allSelected = selectedCardIds.length > 0 && selectedCardIds.length === (cards?.length || 0);

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedCardIds((cards || []).map((c) => c.cardId));
    } else {
      setSelectedCardIds([]);
    }
  };

  const toggleSelectCard = (cardId) => {
    setSelectedCardIds((prev) => {
      const set = new Set(prev || []);
      if (set.has(cardId)) {
        set.delete(cardId);
      } else {
        set.add(cardId);
      }
      return Array.from(set);
    });
  };

  const openBulkConfirm = (action) => {
    if (!selectedCardIds || selectedCardIds.length === 0) return;
    setBulkDialogAction(action);
    setBulkDialogOpen(true);
  };

  const closeBulkDialog = () => {
    setBulkDialogOpen(false);
    setBulkDialogAction(null);
  };

  const confirmBulkAction = async () => {
    // close dialog and perform action
    setBulkDialogOpen(false);
    try {
      await handleBulkAction(bulkDialogAction);
    } finally {
      setBulkDialogAction(null);
    }
  };

  // prune selections when cards list changes
  useEffect(() => {
    if (!cards || cards.length === 0) {
      setSelectedCardIds([]);
      return;
    }
    setSelectedCardIds((prev) => (prev || []).filter((id) => cards.find((c) => c.cardId === id)));
  }, [cards]);

  // Compute totals for currently selected cards (if any). Falls back to server totals when no selection.
  const selectedTotals = useMemo(() => {
    if (!selectedCardIds || selectedCardIds.length === 0) return null;
    const price = Number(session?.cardPrice || selectedTemplate?.cardPrice || editTemplateForm.cardPrice || 0);
    const selectedCards = (cards || []).filter((c) => selectedCardIds.includes(c.cardId));
    const sold = selectedCards.filter((c) => c.status === 'SOLD').length;
    const available = selectedCards.length - sold;
    const revenue = sold * price;
    return { available, sold, revenue };
  }, [selectedCardIds, cards, session, selectedTemplate, editTemplateForm]);

  const handleResumeSession = async () => {
    setError('');
    setMessage('');
    try {
      const response = await resumeGameSession(currentSessionId, version ? { expectedVersion: version } : {});
      const data = response?.data || response;
      setVersion(data?.version || version);
      showMessage('Session resumed. Proceed to playground to continue draws.');
      await loadBoard();
    } catch (err) {
      const detail = err?.response?.data?.message || err?.response?.data?.error || 'Failed to resume session.';
      showError(detail);
    }
  };

  const toggleCard = async (card) => {
    if (!canSellCards) {
      return;
    }

    setBusyCardNumber(card.cardNumber);
    setError('');
    setMessage('');
    try {
      let response;
      if (card.status === 'SOLD') {
        response = await unsellBoardCard(currentSessionId, {
          cardId: card.cardId,
          expectedVersion: version,
        });
        if (!suppressCardToastsOnClick) showMessage(`Card ${card.cardNumber} marked as unsold.`);
      } else {
        response = await sellBoardCard(currentSessionId, {
          cardId: card.cardId,
          expectedVersion: version,
        });
        if (!suppressCardToastsOnClick) showMessage(`Card ${card.cardNumber} sold and recorded.`);
      }

      const data = response?.data || response;
      if (data?.version) {
        setVersion(data.version);
      }
      if (data?.totals) {
        setTotals(data.totals);
      }

      await hydrateSession(currentSessionId);
    } catch (err) {
      const detail = err?.response?.data?.message || err?.response?.data?.error || 'Failed to update card.';
      showError(detail);
    } finally {
      setBusyCardNumber(null);
    }
  };

  const handleBulkAction = async (action) => {
    if (!canSellCards) return;
    if (!selectedCardIds || selectedCardIds.length === 0) return;

    setLoading(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        action: String(action).toUpperCase() === 'SELL' || action === 'sell' ? 'SELL' : 'UNSELL',
        cardIds: selectedCardIds,
        expectedVersion: version,
      };

      const actedCardIds = Array.isArray(selectedCardIds) ? [...selectedCardIds] : [];
      const res = await bulkBoardAction(currentSessionId, payload);
      const data = res?.data || res;

      // update local state from response
      if (data?.version) setVersion(data.version);
      if (data?.totals) setTotals(data.totals);

      // refresh board data
      await hydrateSession(currentSessionId);
      // clear selection
      setSelectedCardIds([]);

      // show snackbar with Undo action
      const label = `${action === 'sell' ? 'Sold' : 'Marked as unsold'} ${data.processedCount || 0} selected card(s).`;
      const opposite = action === 'sell' ? 'UNSELL' : 'SELL';
      enqueueSnackbar(label, {
        variant: 'success',
        autoHideDuration: 8000,
        action: (key) => (
          <Button
            size="small"
            onClick={async () => {
              enqueueSnackbar.closeSnackbar(key);
              try {
                setLoading(true);
                // call opposite action without expectedVersion to avoid version conflicts
                const undoRes = await bulkBoardAction(currentSessionId, { action: opposite, cardIds: actedCardIds });
                const undoData = undoRes?.data || undoRes;
                if (undoData?.version) setVersion(undoData.version);
                if (undoData?.totals) setTotals(undoData.totals);
                await hydrateSession(currentSessionId);
                showMessage('Undo successful.');
              } catch (e) {
                const detail = e?.response?.data?.message || e?.message || 'Undo failed.';
                showError(detail);
              } finally {
                setLoading(false);
              }
            }}
          >
            Undo
          </Button>
        ),
      });
    } catch (err) {
      const detail = err?.response?.data?.message || err?.message || 'Bulk update failed.';
      showError(detail);
    } finally {
      setLoading(false);
    }
  };

  const openEditTemplateDialog = () => {
    if (!selectedTemplate) {
      return;
    }

    setEditTemplateForm({
      templateCode: selectedTemplate.templateCode || '',
      title: selectedTemplate.title || '',
      cardPrice: Number(selectedTemplate.cardPrice || 0),
      totalCards: Number(selectedTemplate.totalCards || 0),
      totalNumbersPool: Number(selectedTemplate.totalNumbersPool || 100),
      numbersPerCard: Number(selectedTemplate.numbersPerCard || 4),
      secondsPerCall: Number(selectedTemplate.secondsPerCall || 5),
      generationMode: selectedTemplate.generationMode || 'SEQUENTIAL',
      isDefault: Number(selectedTemplate.isDefault) === 1 || selectedTemplate.isDefault === true,
    });
    setTemplateDialogOpen(true);
  };

  const saveTemplate = async () => {
    if (!selectedTemplate) {
      return;
    }

    setSavingTemplate(true);
    setError('');
    try {
      await updateGameTemplate(selectedTemplate.id, {
        ...editTemplateForm,
      });
      setTemplateDialogOpen(false);
      showMessage('Template updated.');
      await loadBoard();
    } catch (err) {
      const detail = err?.response?.data?.message || err?.response?.data?.error || 'Failed to update template.';
      showError(detail);
    } finally {
      setSavingTemplate(false);
    }
  };

  const archiveSelectedTemplate = async () => {
    if (!selectedTemplate) {
      return;
    }

    setError('');
    setMessage('');
    try {
      await archiveGameTemplate(selectedTemplate.id);
      showMessage('Template archived.');
      setSelectedTemplateId('');
      await loadBoard();
    } catch (err) {
      const detail = err?.response?.data?.message || err?.response?.data?.error || 'Failed to archive template.';
      showError(detail);
    }
  };

  return (
    <Box>
      
      

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>

          {cards.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No cards found for this session.</Typography>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gap: 0.75,
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  sm: `repeat(${Math.min(4, boardColumns)}, minmax(0, 1fr))`,
                  md: `repeat(${boardColumns}, minmax(0, 1fr))`,
                },
              }}
            >
              {cards.map((card) => {
                const isSold = card.status === 'SOLD';
                const isSelected = selectedCardIds.includes(card.cardId);
                const toggleDisabled = (
                  loading
                  || busyCardNumber === card.cardNumber
                  || !canSellCards
                  || session?.status !== 'ACTIVE'
                );

                return (
                  <Box
                    key={card.cardId || card.cardNumber}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSold}
                    onClick={() => { if (!toggleDisabled) toggleCard(card); }}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !toggleDisabled) { e.preventDefault(); toggleCard(card); } }}
                    sx={{
                      border: '2px solid',
                      borderColor: isSold ? 'success.main' : isSelected ? 'primary.main' : 'divider',
                      borderRadius: 2,
                      p: compactLayout ? 0.35 : 0.5,
                      minHeight: compactLayout ? 80 : 100,
                      background: isSold
                        ? boardSoldGradient
                        : isSelected
                          ? boardSelectedGradient
                          : boardSurfaceGradient,
                      boxShadow: isSold ? boardSoldShadow : isSelected ? boardSelectedShadow : boardNeutralShadow,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      cursor: toggleDisabled ? 'default' : 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    

                    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <Typography
                        sx={{
                          fontSize: compactLayout ? { xs: '1.9rem', md: '2.6rem' } : { xs: '2.25rem', md: '3.1rem' },
                          fontWeight: 900,
                          lineHeight: 1,
                          letterSpacing: 0.3,
                          textAlign: 'center',
                          mb: compactLayout ? 0 : 0.1,
                          color: isDarkMode ? '#ffffff' : (isSold ? 'success.dark' : 'text.primary'),
                        }}
                      >
                        {card.cardNumber}
                      </Typography>

                      {!compactLayout && (
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ justifyContent: 'center', flexWrap: 'wrap', rowGap: 0.2 }}>
                          <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                            {(card.numbers || []).map((num) => (
                              <ToggleButton
                                key={`${card.cardId}-${num}`}
                                value={num}
                                selected={isSold}
                                disabled
                                size="small"
                                onClick={(e) => e.stopPropagation()}
                                sx={{
                                  minWidth: compactLayout ? 0 : 30,
                                  height: compactLayout ? 0 : 24,
                                  fontSize: compactLayout ? 0 : 11,
                                  fontWeight: 700,
                                  px: compactLayout ? 0 : 0.4,
                                  borderRadius: 1,
                                }}
                              >
                                {num}
                              </ToggleButton>
                            ))}
                          </Box>
                        </Stack>
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', md: 'center' }}
          spacing={1.5}
          sx={{ mb: 2 }}
        >
          <Box sx={{ width: { xs: '100%', md: 'auto' } }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ overflowX: 'auto', pb: 0.5 }}>
              {prizes.length === 0 ? null : prizes.map((prize) => (
                <Box
                  key={prize.drawPosition}
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', px: 0.5 }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>#{prize.drawPosition}</Typography>
                  <Typography variant="h6" sx={{ lineHeight: 1 }}>{'🍺'.repeat(Math.max(1, Math.min(5, prize.beerQuantity)))}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>

            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              sx={{ rowGap: 1, width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
                <Chip label={session?.status || 'UNKNOWN'} color={statusColor(session?.status)} />
                <Button
                  variant="outlined"
                  onClick={handleStartSession}
                  disabled={!canRunDraws || session?.status !== 'PENDING'}
                >
                  Start Session
                </Button>
                {isSuperAdmin() && (
                  <>
                    <TextField
                      size="small"
                      type="number"
                      label="Game Fee"
                      value={chargeAmountInput}
                      onChange={(e) => setChargeAmountInput(e.target.value)}
                      sx={{ width: 140 }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={async () => {
                        if (!session?.id && !session?.sessionId) return;
                        const gid = session?.id || session?.sessionId;
                        setLoading(true);
                        try {
                          const res = await createGameCharge(gid, { chargeAmount: Number(chargeAmountInput) });
                          enqueueSnackbar('Game fee saved', { variant: 'success' });
                          setChargeAmountInput('');
                        } catch (err) {
                          const d = err?.response?.data?.message || err?.message || 'Failed to save charge';
                          enqueueSnackbar(d, { variant: 'error' });
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={!canRunDraws || !chargeAmountInput || loading}
                    >
                      Save Fee
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      color="secondary"
                      onClick={async () => {
                        if (!session) return;
                        setLoading(true);
                        try {
                          await createHotelChargeTemplate({ branchId: session.branchId, companyId: session.companyId, chargeAmount: Number(chargeAmountInput) });
                          enqueueSnackbar('Saved hotel charge template', { variant: 'success' });
                        } catch (err) {
                          const d = err?.response?.data?.message || err?.message || 'Failed to save hotel template';
                          enqueueSnackbar(d, { variant: 'error' });
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={!isSuperAdmin() || !chargeAmountInput || loading}
                    >
                      Save Hotel Template
                    </Button>
                  </>
                )}
                {/* Resume Session button intentionally removed from UI */}
              </Stack>

              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
                <FormControlLabel
                  control={(
                    <Checkbox
                      checked={allSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      size="small"
                      sx={{
                        color: '#ff6b6b',
                        '&.Mui-checked': { color: '#ff6b6b' },
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  label="All"
                />

                <Button variant="outlined" size="small" onClick={() => openBulkConfirm('sell')} disabled={!canSellCards || selectedCardIds.length === 0 || loading || session?.status !== 'ACTIVE'}>
                  Sell Selected
                </Button>
                <Button variant="outlined" size="small" onClick={() => openBulkConfirm('unsell')} disabled={!canSellCards || selectedCardIds.length === 0 || loading || session?.status !== 'ACTIVE'}>
                  Unsell Selected
                </Button>

                <Button
                  variant="contained"
                  size="small"
                  onClick={() => navigate(`/admin/games/${session?.sessionId || session?.id}/playground`)}
                  disabled={(!session?.id && !session?.sessionId) || session?.status === 'PENDING' || !hasSoldCards}
                >
                  Playground
                </Button>
              </Stack>
            </Stack>
        </Stack>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 280 } }}>
              <InputLabel id="template-select-label">Template</InputLabel>
              <Select
                labelId="template-select-label"
                label="Template"
                value={selectedTemplateId}
                onChange={(event) => handleTemplateChange(event.target.value)}
              >
                {templates.map((template) => (
                  <MenuItem key={template.id} value={template.id}>
                    {template.templateCode} - {template.title}{Number(template.isDefault) === 1 ? ' (Default)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ rowGap: 1 }}>
              <FormControlLabel
                control={(
                  <Switch
                    checked={Boolean(compactLayout)}
                    onChange={(e) => setCompactLayout(Boolean(e.target.checked))}
                    size="small"
                  />
                )}
                label="Compact"
              />
              <FormControlLabel
                control={(
                  <Switch
                    checked={Boolean(autoCreateEnabled)}
                    onChange={(e) => setAutoCreateEnabled(Boolean(e.target.checked))}
                    size="small"
                  />
                )}
                label="Auto-create"
              />
              <Button variant="text" onClick={loadBoard}>
                Refresh Session
              </Button>
            </Stack>
          </Stack>

          {(selectedTotals || totals) && (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 2, rowGap: 1 }}>
              <Typography variant="body2">Available: {(selectedTotals || totals).available}</Typography>
              <Typography variant="body2">Sold: {(selectedTotals || totals).sold}</Typography>
              <Typography variant="body2">Revenue: {(selectedTotals || totals).revenue}</Typography>
            </Stack>
          )}

          <Box sx={{ mt: 1.5 }}>
            <Typography variant="h6">{session?.title || 'Session'}</Typography>
            <Typography variant="body2" color="text.secondary">Code: {session?.sessionCode || '-'} {session?.sessionCode ? ` • Rounds: ${sessionsPlayedCount}` : ''}</Typography>
          </Box>
        </CardContent>
      </Card>

      

      <Dialog open={templateDialogOpen} onClose={() => setTemplateDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit Template</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Template Code" value={editTemplateForm.templateCode} onChange={(e) => setEditTemplateForm((prev) => ({ ...prev, templateCode: e.target.value }))} />
            <TextField label="Title" value={editTemplateForm.title} onChange={(e) => setEditTemplateForm((prev) => ({ ...prev, title: e.target.value }))} />
            <TextField label="Card Price" type="number" value={editTemplateForm.cardPrice} onChange={(e) => setEditTemplateForm((prev) => ({ ...prev, cardPrice: Number(e.target.value || 0) }))} />
            <TextField label="Total Cards" type="number" value={editTemplateForm.totalCards} onChange={(e) => setEditTemplateForm((prev) => ({ ...prev, totalCards: Number(e.target.value || 0) }))} />
            <TextField label="Numbers Per Card" type="number" value={editTemplateForm.numbersPerCard} onChange={(e) => setEditTemplateForm((prev) => ({ ...prev, numbersPerCard: Number(e.target.value || 0) }))} />
            <TextField label="Total Numbers Pool" type="number" value={editTemplateForm.totalNumbersPool} onChange={(e) => setEditTemplateForm((prev) => ({ ...prev, totalNumbersPool: Number(e.target.value || 0) }))} />
            <TextField label="Seconds Per Call" type="number" value={editTemplateForm.secondsPerCall} onChange={(e) => setEditTemplateForm((prev) => ({ ...prev, secondsPerCall: Number(e.target.value || 0) }))} />
            <FormControl>
              <InputLabel id="generation-mode-label">Generation Mode</InputLabel>
              <Select
                labelId="generation-mode-label"
                label="Generation Mode"
                value={editTemplateForm.generationMode}
                onChange={(e) => setEditTemplateForm((prev) => ({ ...prev, generationMode: e.target.value }))}
              >
                <MenuItem value="SEQUENTIAL">SEQUENTIAL</MenuItem>
                <MenuItem value="RANDOM">RANDOM</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(editTemplateForm.isDefault)}
                  onChange={(e) => setEditTemplateForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
                />
              }
              label="Set as default template"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
          <Button onClick={saveTemplate} variant="contained" disabled={savingTemplate}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={bulkDialogOpen} onClose={closeBulkDialog} fullWidth maxWidth="xs">
        <DialogTitle>{bulkDialogAction === 'sell' ? 'Confirm Sell Selected' : 'Confirm Unsell Selected'}</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to {bulkDialogAction === 'sell' ? 'sell' : 'mark as unsold'} {selectedCardIds.length} selected card(s)?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBulkDialog}>Cancel</Button>
          <Button variant="contained" color={bulkDialogAction === 'sell' ? 'primary' : 'secondary'} onClick={confirmBulkAction} disabled={loading}>
            {bulkDialogAction === 'sell' ? 'Yes, Sell' : 'Yes, Unsell'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
