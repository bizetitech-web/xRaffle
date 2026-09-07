import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { getBranches, getCompanies } from '../../services/api';
import { createHotelChargeTemplate, getHotelChargeTemplate } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function HotelChargeTemplates() {
  const { user, isSuperAdmin } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [branches, setBranches] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargePercentage, setChargePercentage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [error, setError] = useState('');
  const [allBranches, setAllBranches] = useState([]);

  const ownCompanyId = user?.organization?.id || user?.hotelCompanyId || '';
  const isSuper = isSuperAdmin();

  useEffect(() => {
    (async () => {
      try {
        const [bRes, cRes] = await Promise.all([getBranches(), getCompanies()]);
        const branchList = bRes?.data || bRes || [];
        const companyList = cRes?.data || cRes || [];
        setAllBranches(branchList);

        if (isSuper) {
          setBranches(branchList);
          setCompanies(companyList);
          if (ownCompanyId && companyList.some((c) => c.id === ownCompanyId)) {
            setCompanyId(ownCompanyId);
          }
        } else {
          const scopedBranches = branchList.filter((b) => !ownCompanyId || b.company_id === ownCompanyId || b.companyId === ownCompanyId);
          const scopedCompany = companyList.find((c) => c.id === ownCompanyId);
          setBranches(scopedBranches);
          setCompanies(scopedCompany ? [scopedCompany] : []);
          setCompanyId(ownCompanyId || '');
        }
      } catch (err) {
        setError('Failed to load company/branch scope');
      }
    })();
  }, [isSuper, ownCompanyId]);

  useEffect(() => {
    if (!companyId) {
      if (isSuper) {
        setBranches(allBranches);
      }
      return;
    }

    const filtered = allBranches.filter((b) => (b.company_id || b.companyId) === companyId);
    setBranches(filtered);

    const isCurrentBranchInCompany = filtered.some((b) => b.id === branchId);
    if (!isCurrentBranchInCompany) {
      setBranchId('');
    }
  }, [companyId, allBranches, branchId, isSuper]);

  useEffect(() => {
    if (companyId && !branchId) {
      const first = branches[0];
      if (first?.id) {
        setBranchId(first.id);
      }
    }
  }, [companyId, branchId, branches]);

  const loadTemplate = async () => {
    setError('');
    setLoadingTemplate(true);
    try {
      const params = {
        branchId: branchId || undefined,
        companyId: companyId || undefined,
      };
      const res = await getHotelChargeTemplate(params);
      const data = res?.data?.data || res?.data || res || null;

      setChargeAmount(data?.chargeAmount ?? '');
      setChargePercentage(data?.chargePercentage ?? '');
      enqueueSnackbar(data ? 'Template loaded' : 'No template found for this scope', { variant: data ? 'success' : 'info' });
    } catch (err) {
      const detail = err?.response?.data?.error || err?.message || 'Failed to load template';
      setError(detail);
      enqueueSnackbar(detail, { variant: 'error' });
    } finally {
      setLoadingTemplate(false);
    }
  };

  const saveTemplate = async () => {
    setError('');

    const amount = chargeAmount === '' ? null : Number(chargeAmount);
    const percentage = chargePercentage === '' ? null : Number(chargePercentage);
    if (amount === null && percentage === null) {
      setError('Enter charge amount or percentage before saving');
      return;
    }

    if (amount !== null && amount < 0) {
      setError('Charge amount must be >= 0');
      return;
    }

    if (percentage !== null && (percentage < 0 || percentage > 100)) {
      setError('Charge percentage must be between 0 and 100');
      return;
    }

    if (!branchId && !companyId) {
      setError('Select a branch or company scope before saving');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        branchId: branchId || null,
        companyId: companyId || null,
      };
      if (amount !== null) payload.chargeAmount = amount;
      if (percentage !== null) payload.chargePercentage = percentage;
      await createHotelChargeTemplate(payload);
      enqueueSnackbar('Template saved', { variant: 'success' });
      await loadTemplate();
    } catch (err) {
      const d = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Save failed';
      setError(d);
      enqueueSnackbar(d, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const canSave = !loading && !loadingTemplate;

  return (
    <Box>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography variant="h6">Hotel Charge Templates</Typography>
        <Typography variant="body2" color="text.secondary">
          Manage default fee templates by branch or company scope.
        </Typography>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={5}>
              <TextField
                select
                label="Company"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                fullWidth
                disabled={!isSuper || loading || loadingTemplate}
              >
                <MenuItem value="">-- Select company (optional) --</MenuItem>
                {companies.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} md={5}>
              <TextField
                select
                label="Branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                fullWidth
                disabled={loading || loadingTemplate}
              >
                <MenuItem value="">-- Select branch (optional) --</MenuItem>
                {branches.map((b) => (
                  <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid item xs={12} md={2}>
              <Button variant="outlined" fullWidth onClick={loadTemplate} disabled={loading || loadingTemplate}>
                {loadingTemplate ? 'Loading...' : 'Load'}
              </Button>
            </Grid>

            <Grid item xs={12} md={5}>
              <TextField
                label="Charge Amount"
                type="number"
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value)}
                inputProps={{ min: 0, step: '0.01' }}
                fullWidth
                disabled={loading || loadingTemplate}
              />
            </Grid>

            <Grid item xs={12} md={5}>
              <TextField
                label="Charge Percentage"
                type="number"
                value={chargePercentage}
                onChange={(e) => setChargePercentage(e.target.value)}
                inputProps={{ min: 0, max: 100, step: '0.01' }}
                fullWidth
                disabled={loading || loadingTemplate}
              />
            </Grid>

            <Grid item xs={12} md={2}>
              <Button variant="contained" fullWidth onClick={saveTemplate} disabled={!canSave}>
                {loading ? 'Saving...' : 'Save Template'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
