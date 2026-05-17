import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Divider,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Public as PublicIcon,
  Apartment as ApartmentIcon,
  Casino as CasinoIcon,
  AccountBalanceWallet as WalletIcon,
  EmojiEvents as TrophyIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../../services/api';
import ReportsHeader, { REPORT_FILTER_WIDTHS } from '../../components/reports/ReportsHeader';
import { defaultRange } from '../../utils/reportsDate';

const GlobalOverviewReport = () => {
  const [range, setRange] = useState(defaultRange(7));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const kpis = data?.kpis || {};
  const points = data?.trend?.points || [];

  const fetchReport = async (from = range.from, to = range.to) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/reports/global/overview', {
        params: { from, to },
      });
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load global overview report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport(range.from, range.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRangeChange = (event) => {
    const { name, value } = event.target;
    setRange((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleApply = () => {
    fetchReport(range.from, range.to);
  };

  const handlePreset = (days) => {
    const next = defaultRange(days);
    setRange(next);
    fetchReport(next.from, next.to);
  };

  const currency = (value) => Number(value || 0).toLocaleString();

  const summaryCards = useMemo(
    () => [
      {
        label: 'Companies',
        value: `${Number(kpis.totalCompanies || 0).toLocaleString()}`,
        caption: `${Number(kpis.activeCompanies || 0).toLocaleString()} active`,
        icon: <PublicIcon />, 
      },
      {
        label: 'Branches',
        value: `${Number(kpis.totalBranches || 0).toLocaleString()}`,
        caption: `${Number(kpis.activeGames || 0).toLocaleString()} active games`,
        icon: <ApartmentIcon />, 
      },
      {
        label: 'Cards Sold',
        value: `${Number(kpis.cardsSold || 0).toLocaleString()}`,
        caption: `${currency(kpis.salesRevenue)} revenue`,
        icon: <CasinoIcon />, 
      },
      {
        label: 'Wallet Flow',
        value: `${currency(kpis.walletTopups)} topups`,
        caption: `${currency(kpis.walletGameFees)} game fees`,
        icon: <WalletIcon />, 
      },
      {
        label: 'Completed Games',
        value: `${Number(kpis.completedGames || 0).toLocaleString()}`,
        caption: `${Number(kpis.claims || 0).toLocaleString()} claims`,
        icon: <CheckCircleIcon />, 
      },
      {
        label: 'Winners',
        value: `${Number(kpis.winners || 0).toLocaleString()}`,
        caption: `${Number(kpis.claims || 0).toLocaleString()} claimed`,
        icon: <TrophyIcon />, 
      },
    ],
    [kpis]
  );

  return (
    <Box>
      <ReportsHeader
        title="Global Overview"
        subtitle="Cross-company KPI and trend intelligence for platform operations."
        loading={loading}
        onRefresh={handleApply}
        presets={[7, 14, 30]}
        onPresetSelect={handlePreset}
        background="linear-gradient(110deg, rgba(30,109,235,0.16) 0%, rgba(255,138,0,0.12) 55%, rgba(16,185,129,0.12) 100%)"
      >
        <TextField
          label="From"
          name="from"
          type="date"
          value={range.from}
          onChange={handleRangeChange}
          size="small"
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: REPORT_FILTER_WIDTHS.date }}
        />
        <TextField
          label="To"
          name="to"
          type="date"
          value={range.to}
          onChange={handleRangeChange}
          size="small"
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: REPORT_FILTER_WIDTHS.date }}
        />
      </ReportsHeader>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {summaryCards.map((item) => (
          <Grid item xs={12} sm={6} lg={4} key={item.label}>
            <Card sx={{ height: '100%', borderRadius: 3 }}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>{item.icon}</Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    {item.label}
                  </Typography>
                </Stack>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {item.value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.caption}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={7}>
          <Paper sx={{ p: 2.5, borderRadius: 3, height: 360 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Revenue and Wallet Trend
            </Typography>
            <ResponsiveContainer width="100%" height="88%">
              <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="salesRevenue" stroke="#1E6DEB" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="topups" stroke="#10B981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="gameFees" stroke="#FF8A00" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Paper sx={{ p: 2.5, borderRadius: 3, height: 360 }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              Operations Trend
            </Typography>
            <ResponsiveContainer width="100%" height="88%">
              <BarChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="cardsSold" fill="#D9480F" radius={[6, 6, 0, 0]} />
                <Bar dataKey="completedGames" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2.5, borderRadius: 3, mt: 2 }}>
        <Typography variant="h6">Daily Points</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Granularity: day
        </Typography>
        <Divider sx={{ mb: 2 }} />

        <Box sx={{ maxHeight: 260, overflow: 'auto' }}>
          {points.length === 0 && !loading ? (
            <Typography variant="body2" color="text.secondary">
              No trend data in this range.
            </Typography>
          ) : (
            points.map((p) => (
              <Stack
                key={p.date}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                justifyContent="space-between"
                sx={{ py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}
              >
                <Typography variant="subtitle2">{p.date}</Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <Typography variant="caption">Cards: {Number(p.cardsSold || 0).toLocaleString()}</Typography>
                  <Typography variant="caption">Revenue: {currency(p.salesRevenue)}</Typography>
                  <Typography variant="caption">Topups: {currency(p.topups)}</Typography>
                  <Typography variant="caption">Fees: {currency(p.gameFees)}</Typography>
                  <Typography variant="caption">Completed: {Number(p.completedGames || 0).toLocaleString()}</Typography>
                </Stack>
              </Stack>
            ))
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default GlobalOverviewReport;
