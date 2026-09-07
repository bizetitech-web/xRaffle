import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Grid,
  Snackbar,
  Stack,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  Save as SaveIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createGameSession, listGameSessions, listGameTemplates, setGameBeerPrice } from '../../services/api';

const toMoney = (value) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Games() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [templates, setTemplates] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [creatingTemplateId, setCreatingTemplateId] = useState('');
  const [sessionBeerPriceInputs, setSessionBeerPriceInputs] = useState({});
  const [savingSessionId, setSavingSessionId] = useState('');

  const canCreateSession = hasPermission('MANAGE_GAMES');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [templatesRes, sessionsRes] = await Promise.all([
        listGameTemplates(),
        listGameSessions(),
      ]);

      setTemplates(templatesRes?.data || templatesRes || []);
      setSessions(sessionsRes?.data || sessionsRes || []);
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || 'Failed to load games data.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const statusColor = (status) => {
    if (status === 'ACTIVE' || status === 'DRAWING') return 'success';
    if (status === 'PENDING') return 'warning';
    if (status === 'COMPLETED') return 'default';
    return 'default';
  };

  const handleCreateSession = async (templateId) => {
    setActionError('');
    setSuccessMessage('');
    setCreatingTemplateId(templateId);
    try {
      const response = await createGameSession({ templateId });
      const created = response?.data || response || {};
      const code = created.sessionCode ? ` (${created.sessionCode})` : '';
      setSuccessMessage(`Session created successfully${code}. Redirecting to board...`);

      if (created?.sessionId) {
        navigate(`/admin/games/${created.sessionId}/board`);
        return;
      }

      await loadData();
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || 'Failed to create session.';
      setActionError(message);
    } finally {
      setCreatingTemplateId('');
    }
  };

  const activeSessions = useMemo(() => sessions.filter((s) => ['PENDING', 'ACTIVE', 'DRAWING'].includes(s.status)), [sessions]);

  const getSessionGameId = (session) => session.sessionId || session.id;

  const handleSessionBeerInput = (session, value) => {
    const key = getSessionGameId(session);
    setSessionBeerPriceInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveSessionBeerPrice = async (session, clear = false) => {
    const gameId = getSessionGameId(session);
    if (!gameId) {
      setActionError('Cannot determine game id for this session.');
      return;
    }

    let payloadPrice = null;
    if (!clear) {
      const raw = sessionBeerPriceInputs[gameId];
      const parsed = raw === '' || raw === undefined || raw === null ? 90 : Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setActionError('Enter a valid beer price greater than 0.');
        return;
      }
      payloadPrice = parsed;
    }

    setSavingSessionId(gameId);
    setActionError('');
    setSuccessMessage('');
    try {
      await setGameBeerPrice(gameId, payloadPrice);
      setSuccessMessage(clear ? 'Beer price override cleared.' : `Beer price override set to ${payloadPrice} ETB.`);
      await loadData();
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || 'Failed to update beer price override.';
      setActionError(message);
    } finally {
      setSavingSessionId('');
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Games</Typography>
          <Typography variant="body2" color="text.secondary">
            View templates, create sessions, and monitor active games.
          </Typography>
        </Box>
        <Button variant="contained" onClick={() => navigate('/admin/game-templates/new')}>
          Create Template
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">Templates</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{templates.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">Sessions</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{sessions.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="overline" color="text.secondary">Active/Pending</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{activeSessions.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1.5 }}>Templates</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Title</TableCell>
                <TableCell align="right">Cards</TableCell>
                <TableCell align="right">Card Price</TableCell>
                <TableCell>Mode</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary">No templates yet. Create your first template.</Typography>
                  </TableCell>
                </TableRow>
              )}
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>{template.templateCode}</TableCell>
                  <TableCell>{template.title}</TableCell>
                  <TableCell align="right">{template.totalCards}</TableCell>
                  <TableCell align="right">{toMoney(template.cardPrice)}</TableCell>
                  <TableCell>{template.generationMode}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={template.isActive ? 'ACTIVE' : 'ARCHIVED'}
                      color={template.isActive ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!canCreateSession || creatingTemplateId === template.id || !template.isActive}
                      onClick={() => handleCreateSession(template.id)}
                    >
                      {creatingTemplateId === template.id ? 'Creating...' : 'Create Session'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1.5 }}>Sessions</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Session Code</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Cards</TableCell>
                <TableCell align="right">Card Price</TableCell>
                <TableCell align="right">Beer Cost</TableCell>
                <TableCell>Beer Cost Override</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography variant="body2" color="text.secondary">No sessions yet.</Typography>
                  </TableCell>
                </TableRow>
              )}
              {sessions.map((session) => (
                <TableRow key={session.sessionId || session.id}>
                  <TableCell>{session.sessionCode}</TableCell>
                  <TableCell>{session.title}</TableCell>
                  <TableCell>
                    <Chip size="small" label={session.status} color={statusColor(session.status)} />
                  </TableCell>
                  <TableCell align="right">{session.totalCards}</TableCell>
                  <TableCell align="right">{toMoney(session.cardPrice)}</TableCell>
                  <TableCell align="right">
                    {session.beerPrice ?? session.beer_price ?? 90}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        size="small"
                        type="number"
                        placeholder="90"
                        inputProps={{ min: 1, step: 1 }}
                        value={sessionBeerPriceInputs[getSessionGameId(session)] ?? 90}
                        onChange={(event) => handleSessionBeerInput(session, event.target.value)}
                        sx={{ width: 100 }}
                        disabled={!canCreateSession || savingSessionId === getSessionGameId(session)}
                      />
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleSaveSessionBeerPrice(session, false)}
                        disabled={!canCreateSession || savingSessionId === getSessionGameId(session)}
                        title="Save override"
                      >
                        <SaveIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="warning"
                        onClick={() => handleSaveSessionBeerPrice(session, true)}
                        disabled={!canCreateSession || savingSessionId === getSessionGameId(session)}
                        title="Clear override"
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </TableCell>
                  <TableCell>{new Date(session.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {loading && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Refreshing...</Typography>}

      <Snackbar
        open={Boolean(successMessage)}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={() => setSuccessMessage('')} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
