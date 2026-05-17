import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccountBalanceWallet as AccountBalanceWalletIcon,
  Business as BusinessIcon,
  Paid as PaidIcon,
  TrendingDown as TrendingDownIcon,
  ReceiptLong as ReceiptLongIcon,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import ReportsHeader, { REPORT_FILTER_WIDTHS } from '../../components/reports/ReportsHeader';
import { defaultRange } from '../../utils/reportsDate';

const CompanyWalletReport = () => {
  const { user, hasPermission } = useAuth();
  const [range, setRange] = useState(defaultRange(7));
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  const canViewGlobal = hasPermission('VIEW_GLOBAL_REPORTS');

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId),
    [companies, selectedCompanyId]
  );

  const fetchCompanies = async () => {
    setLoadingCompanies(true);
    setError('');

    try {
      if (canViewGlobal) {
        const response = await api.get('/admin/hotel_companies');
        const list = response.data || [];
        setCompanies(list);
        if (!selectedCompanyId && list.length > 0) {
          setSelectedCompanyId(list[0].id);
        }
      } else {
        const ownCompanyId = user?.organization?.id || user?.hotelCompanyId || '';
        const ownCompanyName = user?.organization?.name || user?.companyName || 'My Company';

        if (!ownCompanyId) {
          setError('Could not determine your company context for wallet reporting.');
          setCompanies([]);
        } else {
          setCompanies([{ id: ownCompanyId, name: ownCompanyName }]);
          setSelectedCompanyId(ownCompanyId);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load companies');
      setCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  };

  const fetchReport = async (companyId = selectedCompanyId, from = range.from, to = range.to) => {
    if (!companyId || !from || !to) {
      return;
    }

    setLoadingReport(true);
    setError('');

    try {
      const response = await api.get(`/reports/companies/${companyId}/wallet`, {
        params: { from, to },
      });
      setReport(response.data);
    } catch (err) {
      setReport(null);
      setError(err.response?.data?.error || 'Failed to load company wallet report');
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchReport(selectedCompanyId, range.from, range.to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  const handleRangeChange = (event) => {
    const { name, value } = event.target;
    setRange((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRefresh = () => {
    fetchReport(selectedCompanyId, range.from, range.to);
  };

  const fmt = (value) => Number(value || 0).toLocaleString();

  const metricCards = [
    {
      title: 'Opening Balance',
      value: fmt(report?.openingBalance),
      icon: <AccountBalanceWalletIcon />,
      caption: 'Balance at range start',
    },
    {
      title: 'Closing Balance',
      value: fmt(report?.closingBalance),
      icon: <BusinessIcon />,
      caption: 'Balance at range end',
    },
    {
      title: 'Topups',
      value: fmt(report?.topups),
      icon: <PaidIcon />,
      caption: 'Inbound wallet funding',
    },
    {
      title: 'Game Fees',
      value: fmt(report?.gameFees),
      icon: <TrendingDownIcon />,
      caption: 'Platform deductions',
    },
    {
      title: 'Transactions',
      value: fmt(report?.transactions),
      icon: <ReceiptLongIcon />,
      caption: 'Rows in selected range',
    },
  ];

  return (
    <Box>
      <ReportsHeader
        title="Company Wallet Range"
        subtitle="Opening and closing wallet balances with transaction totals across a date range."
        loading={loadingReport}
        onRefresh={handleRefresh}
        refreshDisabled={loadingCompanies || !selectedCompanyId}
        rightContent={
          selectedCompany ? <Chip icon={<BusinessIcon />} label={selectedCompany.name} /> : null
        }
        background="linear-gradient(120deg, rgba(2,132,199,0.14) 0%, rgba(22,163,74,0.12) 55%, rgba(217,119,6,0.12) 100%)"
      >
        <TextField
          select
          label="Company"
          value={selectedCompanyId}
          onChange={(event) => setSelectedCompanyId(event.target.value)}
          size="small"
          sx={{ minWidth: REPORT_FILTER_WIDTHS.select }}
          disabled={loadingCompanies || companies.length === 0 || !canViewGlobal}
        >
          {companies.map((company) => (
            <MenuItem key={company.id} value={company.id}>
              {company.name}
            </MenuItem>
          ))}
        </TextField>

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

      {!loadingCompanies && companies.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          No companies available for wallet reporting.
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
                  {item.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.caption}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 2.5, borderRadius: 3, mt: 2 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          Breakdown
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} flexWrap="wrap">
          <Chip label={`Refunds: ${fmt(report?.refunds)}`} />
          <Chip label={`Adjustments: ${fmt(report?.adjustments)}`} />
          <Chip label={`Bonuses: ${fmt(report?.bonuses)}`} />
          <Chip label={`Reversals: ${fmt(report?.reversals)}`} />
        </Stack>
      </Paper>
    </Box>
  );
};

export default CompanyWalletReport;
