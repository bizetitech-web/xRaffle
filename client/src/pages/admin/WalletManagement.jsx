import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Grid,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Alert,
  useMediaQuery,
  Chip,
} from '@mui/material';
import { Money as MoneyIcon, AccountBalanceWallet as WalletIcon } from '@mui/icons-material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import api, { getWallet, topupWallet, getWalletTransactions } from '../../services/api';
import { useSnackbar } from 'notistack';

// use authenticated api instance from services/api

const WalletManagement = () => {
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery('(max-width:600px)');
  const [hotel_companies, setOrganizations] = useState([]);
  const [selectedWalletOrgId, setSelectedWalletOrgId] = useState('');
  const [walletInfo, setWalletInfo] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletSubmitting, setWalletSubmitting] = useState(false);
  const [topupData, setTopupData] = useState({ amount: '', paymentMethod: 'CASH', referenceNumber: '' });
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [walletPagination, setWalletPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => { fetchOrganizations(); }, []);

  const fetchOrganizations = async () => {
    try {
      const response = await api.get('/admin/hotel_companies');
      setOrganizations(response.data || []);
      if (response.data && response.data.length > 0) setSelectedWalletOrgId(response.data[0].id);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to fetch hotels';
      console.error('Failed to fetch hotels', err);
      setError(msg);
    }
  };

  useEffect(() => {
    if (selectedWalletOrgId) fetchWalletData(selectedWalletOrgId);
    else {
      setWalletInfo(null);
      setWalletTransactions([]);
    }
  }, [selectedWalletOrgId]);

  const fetchWalletData = async (companyId) => {
    try {
      setWalletLoading(true);
      const walletRes = await getWallet(companyId);
      setWalletInfo(walletRes.data);
      // fetch recent transactions (first page)
      try {
        const txRes = await getWalletTransactions(companyId, walletPagination.page, walletPagination.pageSize);
        setWalletTransactions(txRes.data.items || []);
        setWalletPagination((prev) => ({ ...prev, total: txRes.data.total || 0 }));
      } catch (txErr) {
        // silently ignore transactions fetch errors but log
        // console.error('Failed to fetch wallet transactions', txErr);
        setWalletTransactions([]);
        setWalletPagination((prev) => ({ ...prev, total: 0 }));
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch wallet data');
    } finally { setWalletLoading(false); }
  };

  const handleTopupChange = (e) => {
    const { name, value } = e.target;
    setTopupData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTopupSubmit = async () => {
    if (!selectedWalletOrgId) { setError('Please select a hotel first'); return; }
    const amount = Number(topupData.amount);
    if (!amount || amount <= 0) { setError('Top-up amount must be greater than 0'); return; }
    try {
      setWalletSubmitting(true);
      setError(null);
      await topupWallet(selectedWalletOrgId, amount, topupData.paymentMethod, topupData.referenceNumber);
      const msg = 'Wallet topped up successfully';
      setSuccess(msg);
      enqueueSnackbar(msg, { variant: 'success' });
      setTopupData({ amount: '', paymentMethod: 'CASH', referenceNumber: '' });
      await fetchWalletData(selectedWalletOrgId);
      await fetchOrganizations();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to top up wallet';
      setError(msg);
      enqueueSnackbar(msg, { variant: 'error' });
    } finally { setWalletSubmitting(false); }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ color: 'text.primary', fontWeight: 600 }}>
            {isMobile ? 'Wallets' : 'Wallet Management'}
          </Typography>
          {!isMobile && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              View and top up hotel wallets
            </Typography>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Paper sx={{ bgcolor: 'background.paper', p: { xs: 2, md: 3 }, mt: 1 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between', gap: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WalletIcon sx={{ color: '#FF8A00' }} />
            <Typography variant="h6">{isMobile ? 'Wallet' : 'Wallet Management'}</Typography>
          </Box>
          <FormControl sx={{ minWidth: { xs: '100%', md: 280 } }} fullWidth={isMobile}>
            <InputLabel>Hotel</InputLabel>
            <Select value={selectedWalletOrgId} label="Hotel" onChange={(e) => setSelectedWalletOrgId(e.target.value)}>
              {hotel_companies.map((org) => (<MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>))}
            </Select>
          </FormControl>
        </Box>

        {walletLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : (
          <>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={4}><Paper sx={{ p: 2 }}><Typography variant="caption">Current Balance</Typography><Typography variant={isMobile ? 'h5' : 'h4'} sx={{ color: '#10b981' }}>{(walletInfo?.balance||0).toLocaleString()} {walletInfo?.currency||'ETB'}</Typography></Paper></Grid>
              <Grid item xs={12} md={4}><Paper sx={{ p: 2 }}><Typography variant="caption">Wallet Status</Typography><Chip label={walletInfo?.isActive ? 'Active' : 'Inactive'} size="small" sx={{ mt:1 }} /></Paper></Grid>
              <Grid item xs={12} md={4}><Paper sx={{ p: 2 }}><Typography variant="caption">Transactions</Typography><Typography variant={isMobile ? 'h5' : 'h4'} sx={{ color: '#3b82f6' }}>{walletPagination.total||0}</Typography></Paper></Grid>
            </Grid>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{xs:12, md:3}}><TextField fullWidth label="Top-up Amount" name="amount" type="number" value={topupData.amount} onChange={handleTopupChange} InputProps={{ startAdornment: (<InputAdornment position="start"><MoneyIcon /></InputAdornment>) }} /></Grid>
              <Grid size={{xs:12, md:3}}><FormControl fullWidth><InputLabel>Payment Method</InputLabel><Select name="paymentMethod" value={topupData.paymentMethod} onChange={handleTopupChange}><MenuItem value="CASH">Cash</MenuItem><MenuItem value="TELEBIRR">Telebirr</MenuItem><MenuItem value="CBEBIRR">CBEBirr</MenuItem><MenuItem value="BANK">Bank</MenuItem><MenuItem value="OTHER">Other</MenuItem></Select></FormControl></Grid>
              <Grid size={{xs:12, md:3}}><TextField fullWidth label="Reference Number (optional)" name="referenceNumber" value={topupData.referenceNumber} onChange={handleTopupChange} /></Grid>
              <Grid size={{xs:12, md:3}}><Button fullWidth variant="contained" onClick={handleTopupSubmit} disabled={walletSubmitting || !selectedWalletOrgId} sx={{ height: { xs: '48px', md: '56px' }, bgcolor: '#FF8A00' }}>{walletSubmitting ? 'Processing...' : 'Top Up'}</Button></Grid>
            </Grid>

            <Typography variant="subtitle1" sx={{ mb: 1 }}>Recent Transactions</Typography>
            <Paper sx={{ bgcolor: 'background.default', maxHeight: { xs: 240, md: 320 }, overflow: 'auto' }}>
              {walletTransactions.length === 0 ? (
                <Typography sx={{ color: 'text.secondary', p: 2 }}>No wallet transactions found for this hotel.</Typography>
              ) : (
                <Box>
                  {walletTransactions.map((tx) => (
                    <Box
                      key={tx.id}
                      sx={{
                        p: { xs: 1, md: 1.5 },
                        borderBottom: `1px solid ${muiTheme.palette.divider}`,
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        justifyContent: 'space-between',
                        alignItems: { xs: 'flex-start', sm: 'center' },
                        gap: 1,
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{tx.transaction_type || tx.transactionType || 'TOPUP'}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{new Date(tx.created_at || tx.createdAt).toLocaleString()} | Ref: {tx.reference_number || tx.referenceNumber || tx.reference_id || tx.referenceId || 'N/A'}</Typography>
                      </Box>
                      <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                        <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 700 }}>+{Number(tx.amount || tx.value || 0).toLocaleString()} ETB</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{Number(tx.balance_before || tx.balanceBefore || 0).toLocaleString()} {'->'} {Number(tx.balance_after || tx.balanceAfter || 0).toLocaleString()}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          </>
        )}
      </Paper>
    </Box>
  );
};

export default WalletManagement;
