import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Assessment as AssessmentIcon,
  Store as StoreIcon,
  Casino as CasinoIcon,
  Paid as PaidIcon,
  LocalBar as LocalBarIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import ReportsHeader, { REPORT_FILTER_WIDTHS } from '../../components/reports/ReportsHeader';
import { toLocalDateInputValue } from '../../utils/reportsDate';
import { useAuth } from '../../context/AuthContext';

const BranchDailyReport = () => {
  const { user } = useAuth();
  const [date, setDate] = useState(toLocalDateInputValue(new Date()));
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId),
    [branches, selectedBranchId]
  );

  const normalizedRoleName = (user?.role?.name || '').toLowerCase().replace(/[_\s-]/g, '');
  const isOperator = user?.role?.level === 3 || normalizedRoleName === 'operator';

  const operatorAssignedBranchId =
    user?.branch?.id || user?.branchId || user?.branch_id || '';

  const fetchBranches = async () => {
    setLoadingBranches(true);
    setError('');
    try {
      const response = await api.get('/reports/branches');
      const list = response.data || [];
      setBranches(list);

      if (isOperator) {
        if (!operatorAssignedBranchId) {
          setSelectedBranchId('');
          setReport(null);
          setError('Your operator account has no assigned branch. Please contact an administrator.');
          return;
        }

        const operatorBranch =
          (operatorAssignedBranchId && list.find((branch) => branch.id === operatorAssignedBranchId)) ||
          null;

        if (!operatorBranch) {
          setSelectedBranchId('');
          setReport(null);
          setError('Your assigned branch is not accessible in reports. Please contact an administrator.');
          return;
        }

        setSelectedBranchId(operatorBranch.id);
      } else if (!selectedBranchId && list.length > 0) {
        setSelectedBranchId(list[0].id);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load branches');
    } finally {
      setLoadingBranches(false);
    }
  };

  const fetchReport = async (branchId = selectedBranchId, targetDate = date) => {
    if (!branchId || !targetDate) {
      return;
    }

    setLoadingReport(true);
    setError('');
    try {
      const response = await api.get(`/reports/branches/${branchId}/daily`, {
        params: { date: targetDate },
      });
      setReport(response.data);
    } catch (err) {
      setReport(null);
      setError(err.response?.data?.error || 'Failed to load branch daily report');
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    fetchBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOperator, operatorAssignedBranchId, selectedBranchId]);

  useEffect(() => {
    if (selectedBranchId) {
      fetchReport(selectedBranchId, date);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  const handleRefresh = () => {
    fetchReport(selectedBranchId, date);
  };

  const metricCards = [
    {
      title: 'Games Played',
      value: Number(report?.gamesPlayed || 0).toLocaleString(),
      icon: <AssessmentIcon />,
    },
    {
      title: 'Cards Sold',
      value: Number(report?.cardsSold || 0).toLocaleString(),
      icon: <CasinoIcon />,
    },
    {
      title: 'Sales Revenue',
      value: Number(report?.salesRevenue || 0).toLocaleString(),
      icon: <PaidIcon />,
    },
    {
      title: 'Beers Distributed',
      value: Number(report?.beersDistributed || 0),
      icon: <LocalBarIcon />,
    },
    {
      title: 'Wallet Deductions',
      value: Number(report?.walletDeductions || 0).toLocaleString(),
      icon: <AccountBalanceWalletIcon />,
    },
    {
      title: 'Operator Profit',
      value: (
        (() => {
          const revenue = Number(report?.salesRevenue || 0);
          const beers = Number(report?.beersDistributed || 0);
          // Prefer server-provided operatorProfit if available
          if (report?.operatorProfit !== undefined && report?.beerCost !== undefined) {
            return (
              <Stack spacing={0.2}>
                <Typography sx={{ fontWeight: 700 }}>{Number(report.operatorProfit).toLocaleString()} ETB</Typography>
                <Typography variant="caption" color="text.secondary">(computed using beer cost: {Number(report.beerCost).toLocaleString()} ETB)</Typography>
              </Stack>
            );
          }

          const profit90 = revenue - (beers * 90);
          const profit100 = revenue - (beers * 100);
          return (
            <Stack spacing={0.2}>
              <Typography sx={{ fontWeight: 700 }}>{profit90.toLocaleString()} ETB</Typography>
              <Typography variant="caption" color="text.secondary">(at 90 ETB/beer)</Typography>
              <Typography sx={{ fontWeight: 700 }}>{profit100.toLocaleString()} ETB</Typography>
              <Typography variant="caption" color="text.secondary">(at 100 ETB/beer)</Typography>
            </Stack>
          );
        })()
      ),
      icon: <LocalBarIcon />,
    },
  ];

  return (
    <Box>
      <ReportsHeader
        title="Branch Daily Report"
        subtitle="Daily operational metrics for a selected branch."
        loading={loadingReport}
        onRefresh={handleRefresh}
        refreshDisabled={loadingBranches || !selectedBranchId}
        rightContent={
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            {selectedBranch ? (
              <Chip icon={<StoreIcon />} label={selectedBranch.company_name || 'Branch'} />
            ) : null}
            {isOperator && selectedBranch ? (
              <>
                <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
                <Chip
                  size="small"
                  variant="outlined"
                  color="primary"
                  label={`Operator scope: ${selectedBranch.name}`}
                />
              </>
            ) : null}
          </Stack>
        }
        background="linear-gradient(120deg, rgba(8,145,178,0.14) 0%, rgba(245,158,11,0.12) 55%, rgba(22,163,74,0.12) 100%)"
      >
        <TextField
          select
          label="Branch"
          value={selectedBranchId}
          onChange={(event) => setSelectedBranchId(event.target.value)}
          size="small"
          sx={{ minWidth: REPORT_FILTER_WIDTHS.select }}
          disabled={loadingBranches || isOperator}
          helperText={isOperator ? 'Branch is locked to your assigned branch' : ''}
        >
          {branches.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.name} ({branch.branch_code})
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Date"
          type="date"
          size="small"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: REPORT_FILTER_WIDTHS.date }}
        />
      </ReportsHeader>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {!loadingBranches && branches.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          No branches available for reporting.
        </Alert>
      )}

      <Grid container spacing={2}>
        {metricCards.map((item) => (
          <Grid item xs={12} sm={6} lg={4} xl={2.4} key={item.title}>
            <Card sx={{ borderRadius: 3, height: '100%' }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Box sx={{ color: 'primary.main', display: 'flex', alignItems: 'center' }}>{item.icon}</Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    {item.title}
                  </Typography>
                </Stack>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {item.title === 'Beers Distributed'
                    ? (() => {
                        const totalBeers = Number(item.value || 0);
                        const crateCount = Math.floor(totalBeers / 24);
                        const singleBeers = totalBeers % 24;
                        return (
                          <Stack spacing={0.6}>
                            <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.15 }}>
                              {totalBeers.toLocaleString()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              📦 {crateCount} crate{crateCount === 1 ? '' : 's'} + 🍺 {singleBeers} beer{singleBeers === 1 ? '' : 's'}
                            </Typography>
                          </Stack>
                        );
                      })()
                    : item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default BranchDailyReport;
