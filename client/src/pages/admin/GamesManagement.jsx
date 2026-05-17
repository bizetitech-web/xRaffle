import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Casino as CasinoIcon,
  EmojiEvents as EmojiEventsIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
  Sell as SellIcon,
  SportsScore as SportsScoreIcon,
  ViewList as ViewListIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import api from '../../services/api';

const DEFAULT_CREATE_FORM = {
  branchId: '',
  title: '',
  cardPrice: 50,
  totalCards: 25,
  numbersPerCard: 4,
  totalPrizeBeers: 10,
  totalNumbersPool: 100,
};

const DEFAULT_SALE_FORM = {
  cardNumber: '',
  amount: '',
  paymentMethod: 'CASH',
  customerName: '',
  customerPhone: '',
  note: '',
};

const statusColor = (status) => {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'DRAWING':
      return 'warning';
    case 'COMPLETED':
      return 'info';
    case 'CANCELLED':
      return 'error';
    default:
      return 'default';
  }
};

const GamesManagement = () => {
  const [branches, setBranches] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedGameId, setSelectedGameId] = useState('');
  const [gameDetail, setGameDetail] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState(DEFAULT_CREATE_FORM);

  const [prizesJson, setPrizesJson] = useState(
    JSON.stringify(
      [
        { drawPosition: 1, beerQuantity: 3 },
        { drawPosition: 2, beerQuantity: 2 },
        { drawPosition: 3, beerQuantity: 2 },
        { drawPosition: 4, beerQuantity: 3 },
      ],
      null,
      2
    )
  );

  const [seed, setSeed] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [saleForm, setSaleForm] = useState(DEFAULT_SALE_FORM);
  const [forceNumber, setForceNumber] = useState('');
  const [claimedFilter, setClaimedFilter] = useState('all');
  const [winners, setWinners] = useState([]);
  const [winnersLoading, setWinnersLoading] = useState(false);

  const selectedBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId),
    [branches, selectedBranchId]
  );

  const selectedGame = useMemo(
    () => games.find((g) => g.id === selectedGameId),
    [games, selectedGameId]
  );

  const fetchBranches = async () => {
    const response = await api.get('/admin/hotel_branches');
    const nextBranches = response.data || [];
    setBranches(nextBranches);
    if (!selectedBranchId && nextBranches.length > 0) {
      setSelectedBranchId(nextBranches[0].id);
      setCreateForm((prev) => ({ ...prev, branchId: nextBranches[0].id }));
    }
  };

  const fetchGames = async (branchId = selectedBranchId) => {
    setListLoading(true);
    try {
      const params = {};
      if (branchId) {
        params.branchId = branchId;
      }
      const response = await api.get('/games', { params });
      const list = response.data?.items || [];
      setGames(list);
      if (list.length > 0 && !list.some((item) => item.id === selectedGameId)) {
        setSelectedGameId(list[0].id);
      }
      if (list.length === 0) {
        setSelectedGameId('');
        setGameDetail(null);
      }
    } finally {
      setListLoading(false);
    }
  };

  const fetchGameDetail = async (gameId = selectedGameId) => {
    if (!gameId) {
      setGameDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await api.get(`/games/${gameId}`);
      setGameDetail(response.data);
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchWinners = async (gameId = selectedGameId, filter = claimedFilter) => {
    if (!gameId) {
      setWinners([]);
      return;
    }

    setWinnersLoading(true);
    try {
      const params = {};
      if (filter === 'claimed') {
        params.claimed = true;
      } else if (filter === 'unclaimed') {
        params.claimed = false;
      }
      const response = await api.get(`/games/${gameId}/winners`, { params });
      setWinners(response.data?.items || []);
    } finally {
      setWinnersLoading(false);
    }
  };

  const init = async () => {
    setLoading(true);
    setError('');
    try {
      await fetchBranches();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load games workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchGames(selectedBranchId).catch((err) => {
        setError(err.response?.data?.error || 'Failed to load games list');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, loading]);

  useEffect(() => {
    fetchGameDetail(selectedGameId).catch((err) => {
      setError(err.response?.data?.error || 'Failed to load game details');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameId]);

  useEffect(() => {
    if (activeTab === 4) {
      fetchWinners(selectedGameId, claimedFilter).catch((err) => {
        setError(err.response?.data?.error || 'Failed to load winners');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, claimedFilter, selectedGameId]);

  const withAction = async (action, okMessage, refreshWinners = false) => {
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(okMessage);
      await Promise.all([fetchGames(), fetchGameDetail()]);
      if (refreshWinners) {
        await fetchWinners();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed');
    }
  };

  const createGame = async () => {
    await withAction(
      async () => {
        const payload = {
          branchId: createForm.branchId,
          title: createForm.title,
          cardPrice: Number(createForm.cardPrice),
          totalCards: Number(createForm.totalCards),
          numbersPerCard: Number(createForm.numbersPerCard),
          totalPrizeBeers: Number(createForm.totalPrizeBeers),
          totalNumbersPool: Number(createForm.totalNumbersPool),
        };
        const response = await api.post('/games', payload);
        setOpenCreate(false);
        setSelectedGameId(response.data?.id || '');
      },
      'Game created successfully.'
    );
  };

  const configurePrizes = async () => {
    if (!selectedGameId) {
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(prizesJson);
      if (!Array.isArray(parsed)) {
        throw new Error('Prizes payload must be an array.');
      }
    } catch (err) {
      setError(err.message || 'Invalid prizes JSON payload');
      return;
    }

    await withAction(
      () => api.post(`/games/${selectedGameId}/prizes`, { prizes: parsed }),
      'Prize matrix configured.'
    );
  };

  const chargeGame = async () => {
    if (!selectedGameId || !feeAmount) {
      return;
    }

    await withAction(
      () =>
        api.post(`/games/${selectedGameId}/charge`, {
          feeAmount: Number(feeAmount),
          description: 'Game fee from Admin Games UI',
        }),
      'Game fee charged.'
    );
  };

  const generateCards = async () => {
    if (!selectedGameId) {
      return;
    }

    await withAction(
      () => api.post(`/games/${selectedGameId}/cards/generate`, { seed: seed || undefined }),
      'Cards generated successfully.'
    );
  };

  const activateGame = async () => {
    if (!selectedGameId) {
      return;
    }

    await withAction(() => api.post(`/games/${selectedGameId}/activate`, {}), 'Game activated.');
  };

  const sellCard = async () => {
    if (!selectedGameId || !saleForm.cardNumber) {
      return;
    }

    await withAction(
      () =>
        api.post(`/games/${selectedGameId}/sales`, {
          cardNumber: Number(saleForm.cardNumber),
          amount: saleForm.amount ? Number(saleForm.amount) : undefined,
          paymentMethod: saleForm.paymentMethod,
          customerName: saleForm.customerName || undefined,
          customerPhone: saleForm.customerPhone || undefined,
          note: saleForm.note || undefined,
        }),
      'Card sold successfully.'
    );
  };

  const startDraw = async () => {
    if (!selectedGameId) {
      return;
    }

    await withAction(() => api.post(`/games/${selectedGameId}/draw/start`, {}), 'Draw started.');
  };

  const drawNext = async () => {
    if (!selectedGameId) {
      return;
    }

    await withAction(
      () =>
        api.post(`/games/${selectedGameId}/draw/next`, {
          forceNumber: forceNumber ? Number(forceNumber) : undefined,
        }),
      'Next draw executed.',
      true
    );
  };

  const completeGame = async () => {
    if (!selectedGameId) {
      return;
    }

    await withAction(() => api.post(`/games/${selectedGameId}/complete`, {}), 'Game completed.');
  };

  const claimWinner = async (winnerId) => {
    await withAction(
      () => api.post(`/winners/${winnerId}/claim`, {}),
      'Winner claimed successfully.',
      true
    );
  };

  const gameColumns = [
    { field: 'gameCode', headerName: 'Game Code', flex: 1.1, minWidth: 150 },
    { field: 'title', headerName: 'Title', flex: 1.2, minWidth: 170, valueGetter: (params) => params.row.title || '-' },
    {
      field: 'status',
      headerName: 'Status',
      flex: 0.8,
      minWidth: 120,
      renderCell: (params) => (
        <Chip size="small" label={params.row.status} color={statusColor(params.row.status)} variant="outlined" />
      ),
    },
    {
      field: 'cards',
      headerName: 'Cards',
      flex: 0.6,
      minWidth: 100,
      valueGetter: (params) => Number(params.row.totalCards || 0),
    },
    {
      field: 'prizes',
      headerName: 'Prize Beers',
      flex: 0.8,
      minWidth: 120,
      valueGetter: (params) => Number(params.row.totalPrizeBeers || 0),
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      flex: 0.9,
      minWidth: 150,
      valueGetter: (params) =>
        params.row.createdAt ? new Date(params.row.createdAt).toLocaleDateString() : '-',
    },
  ];

  const winnersColumns = [
    { field: 'drawPosition', headerName: 'Draw #', width: 90 },
    { field: 'winningNumber', headerName: 'Winning #', width: 110 },
    { field: 'cardNumber', headerName: 'Card #', width: 90 },
    { field: 'beerQuantity', headerName: 'Beer Qty', width: 100 },
    {
      field: 'isClaimed',
      headerName: 'Claimed',
      width: 110,
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.row.isClaimed ? 'Yes' : 'No'}
          color={params.row.isClaimed ? 'success' : 'default'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 140,
      sortable: false,
      renderCell: (params) => (
        <Button
          size="small"
          variant="outlined"
          disabled={params.row.isClaimed}
          onClick={() => claimWinner(params.row.id)}
        >
          Claim
        </Button>
      ),
    },
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Admin Games
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage game lifecycle and inspect winners using existing backend endpoints.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          <Button
            startIcon={<RefreshIcon />}
            variant="outlined"
            onClick={() => {
              fetchGames().catch((err) => setError(err.response?.data?.error || 'Failed to refresh games'));
              fetchGameDetail().catch((err) => setError(err.response?.data?.error || 'Failed to refresh game'));
            }}
          >
            Refresh
          </Button>
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOpenCreate(true)}>
            New Game
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} lg={5}>
          <Paper sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
              <TextField
                select
                label="Branch"
                size="small"
                value={selectedBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
                sx={{ minWidth: 220 }}
              >
                {branches.map((branch) => (
                  <MenuItem key={branch.id} value={branch.id}>
                    {branch.name} ({branch.branch_code})
                  </MenuItem>
                ))}
              </TextField>
              {selectedBranch && <Chip label={selectedBranch.company_name || 'Branch Scope'} />}
            </Stack>

            <DataGrid
              autoHeight
              density="compact"
              rows={games}
              columns={gameColumns}
              loading={listLoading}
              getRowId={(row) => row.id}
              pageSizeOptions={[5, 10]}
              initialState={{ pagination: { paginationModel: { pageSize: 5, page: 0 } } }}
              onRowClick={(params) => setSelectedGameId(params.row.id)}
              sx={{
                '& .MuiDataGrid-row': { cursor: 'pointer' },
                '& .MuiDataGrid-row.Mui-selected': { backgroundColor: 'action.selected' },
              }}
            />
          </Paper>
        </Grid>

        <Grid item xs={12} lg={7}>
          <Paper sx={{ p: 2, borderRadius: 3, minHeight: 560 }}>
            {!selectedGameId ? (
              <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ minHeight: 420 }}>
                <ViewListIcon color="action" fontSize="large" />
                <Typography variant="h6">Select a game to view details</Typography>
                <Typography variant="body2" color="text.secondary">
                  Pick a game from the list or create a new game.
                </Typography>
              </Stack>
            ) : (
              <>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {gameDetail?.title || selectedGame?.title || 'Untitled Game'}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip size="small" label={gameDetail?.gameCode || selectedGame?.gameCode || '-'} />
                      <Chip size="small" label={gameDetail?.status || selectedGame?.status || 'PENDING'} color={statusColor(gameDetail?.status || selectedGame?.status)} />
                    </Stack>
                  </Box>
                  {detailLoading && <CircularProgress size={20} />}
                </Stack>

                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  <Grid item xs={6} md={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">Cards</Typography>
                        <Typography variant="h6">{Number(gameDetail?.totalCards || selectedGame?.totalCards || 0)}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">Prize Beers</Typography>
                        <Typography variant="h6">{Number(gameDetail?.totalPrizeBeers || selectedGame?.totalPrizeBeers || 0)}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">Configured Positions</Typography>
                        <Typography variant="h6">{Number(gameDetail?.configuredPrizePositions || 0)}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="caption" color="text.secondary">Configured Beers</Typography>
                        <Typography variant="h6">{Number(gameDetail?.configuredPrizeBeers || 0)}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                <Tabs
                  value={activeTab}
                  onChange={(_, value) => setActiveTab(value)}
                  variant="scrollable"
                  allowScrollButtonsMobile
                  sx={{ mb: 2 }}
                >
                  <Tab icon={<SportsScoreIcon />} iconPosition="start" label="Prizes" />
                  <Tab icon={<CasinoIcon />} iconPosition="start" label="Cards" />
                  <Tab icon={<SellIcon />} iconPosition="start" label="Sales" />
                  <Tab icon={<PlayArrowIcon />} iconPosition="start" label="Draws" />
                  <Tab icon={<EmojiEventsIcon />} iconPosition="start" label="Winners" />
                </Tabs>

                {activeTab === 0 && (
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Configure prize matrix JSON
                    </Typography>
                    <TextField
                      multiline
                      minRows={8}
                      value={prizesJson}
                      onChange={(event) => setPrizesJson(event.target.value)}
                      fullWidth
                    />
                    <Button variant="contained" onClick={configurePrizes} sx={{ alignSelf: 'flex-start' }}>
                      Save Prizes
                    </Button>
                  </Stack>
                )}

                {activeTab === 1 && (
                  <Stack spacing={2}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Generate cards and card numbers for this game.
                    </Typography>
                    <TextField
                      label="Seed (optional)"
                      value={seed}
                      onChange={(event) => setSeed(event.target.value)}
                      size="small"
                      sx={{ maxWidth: 320 }}
                    />
                    <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap>
                      <TextField
                        label="Fee Amount"
                        type="number"
                        value={feeAmount}
                        onChange={(event) => setFeeAmount(event.target.value)}
                        size="small"
                        sx={{ maxWidth: 180 }}
                      />
                      <Button variant="outlined" onClick={chargeGame} disabled={!feeAmount}>
                        Charge Fee
                      </Button>
                      <Button variant="contained" onClick={generateCards}>
                        Generate Cards
                      </Button>
                      <Button variant="outlined" onClick={activateGame}>
                        Activate Game
                      </Button>
                    </Stack>
                  </Stack>
                )}

                {activeTab === 2 && (
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Sell cards during ACTIVE status.
                    </Typography>
                    <Grid container spacing={1.5}>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Card Number"
                          type="number"
                          value={saleForm.cardNumber}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, cardNumber: event.target.value }))}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Amount"
                          type="number"
                          value={saleForm.amount}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, amount: event.target.value }))}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Payment</InputLabel>
                          <Select
                            label="Payment"
                            value={saleForm.paymentMethod}
                            onChange={(event) => setSaleForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}
                          >
                            <MenuItem value="CASH">CASH</MenuItem>
                            <MenuItem value="TELEBIRR">TELEBIRR</MenuItem>
                            <MenuItem value="CBEBIRR">CBEBIRR</MenuItem>
                            <MenuItem value="BANK">BANK</MenuItem>
                            <MenuItem value="OTHER">OTHER</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Customer Name"
                          value={saleForm.customerName}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, customerName: event.target.value }))}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          label="Customer Phone"
                          value={saleForm.customerPhone}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, customerPhone: event.target.value }))}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          label="Note"
                          value={saleForm.note}
                          onChange={(event) => setSaleForm((prev) => ({ ...prev, note: event.target.value }))}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                    </Grid>
                    <Button variant="contained" onClick={sellCard} sx={{ alignSelf: 'flex-start' }}>
                      Sell Card
                    </Button>
                  </Stack>
                )}

                {activeTab === 3 && (
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Start draw, execute next draw, and complete game.
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Button variant="outlined" onClick={startDraw}>
                        Start Draw
                      </Button>
                      <TextField
                        label="Force Number"
                        type="number"
                        size="small"
                        value={forceNumber}
                        onChange={(event) => setForceNumber(event.target.value)}
                        sx={{ maxWidth: 170 }}
                      />
                      <Button variant="contained" onClick={drawNext}>
                        Draw Next
                      </Button>
                      <Button variant="outlined" color="success" onClick={completeGame}>
                        Complete Game
                      </Button>
                    </Stack>
                  </Stack>
                )}

                {activeTab === 4 && (
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1}>
                      <FormControl size="small" sx={{ minWidth: 170 }}>
                        <InputLabel>Claim Filter</InputLabel>
                        <Select
                          label="Claim Filter"
                          value={claimedFilter}
                          onChange={(event) => setClaimedFilter(event.target.value)}
                        >
                          <MenuItem value="all">All</MenuItem>
                          <MenuItem value="claimed">Claimed</MenuItem>
                          <MenuItem value="unclaimed">Unclaimed</MenuItem>
                        </Select>
                      </FormControl>
                      <Button variant="outlined" onClick={() => fetchWinners()}>
                        Reload Winners
                      </Button>
                    </Stack>

                    <DataGrid
                      autoHeight
                      density="compact"
                      rows={winners}
                      loading={winnersLoading}
                      columns={winnersColumns}
                      getRowId={(row) => row.id}
                      pageSizeOptions={[5, 10]}
                      initialState={{ pagination: { paginationModel: { pageSize: 5, page: 0 } } }}
                    />
                  </Stack>
                )}
              </>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={openCreate} onClose={() => setOpenCreate(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create Game</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              select
              label="Branch"
              value={createForm.branchId}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, branchId: event.target.value }))}
              fullWidth
              size="small"
            >
              {branches.map((branch) => (
                <MenuItem key={branch.id} value={branch.id}>
                  {branch.name} ({branch.branch_code})
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Title"
              value={createForm.title}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
              fullWidth
              size="small"
            />

            <Divider />

            <Grid container spacing={1.5}>
              <Grid item xs={6}>
                <TextField
                  label="Card Price"
                  type="number"
                  value={createForm.cardPrice}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, cardPrice: event.target.value }))}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Total Cards"
                  type="number"
                  value={createForm.totalCards}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, totalCards: event.target.value }))}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Numbers Per Card"
                  type="number"
                  value={createForm.numbersPerCard}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, numbersPerCard: event.target.value }))}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Total Prize Beers"
                  type="number"
                  value={createForm.totalPrizeBeers}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, totalPrizeBeers: event.target.value }))}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Total Numbers Pool"
                  type="number"
                  value={createForm.totalNumbersPool}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, totalNumbersPool: event.target.value }))}
                  fullWidth
                  size="small"
                />
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCreate(false)}>Cancel</Button>
          <Button variant="contained" onClick={createGame} disabled={!createForm.branchId}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GamesManagement;
