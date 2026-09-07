import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, TextField, Button, Grid, Select, MenuItem, FormControl, InputLabel, IconButton, Alert, FormControlLabel, Switch } from '@mui/material';
import { Add as AddIcon, Remove as RemoveIcon } from '@mui/icons-material';
import TemplatePreview from '../../components/common/TemplatePreview';
import { createGameTemplate, generateTemplatePreview, getGameTemplate, updateGameTemplate } from '../../services/api';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';

const defaultPrize = { drawPosition: 1, beerQuantity: 1 };

export default function GameTemplateWizard() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    templateCode: 'RFL-BEER-001', title: 'Raffle Beer', companyId: user?.organization?.id || user?.hotelCompanyId || '', branchId: '', cardPrice: 50, totalCards: 25, totalNumbersPool: 100, numbersPerCard: 4, secondsPerCall: 5, generationMode: 'SEQUENTIAL', totalPrizeBeers: 0, isDefault: false, prizes: [defaultPrize],
  });
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [createError, setCreateError] = useState('');

  const handleChange = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const addPrize = () => setForm((s) => ({ ...s, prizes: [...s.prizes, { drawPosition: s.prizes.length + 1, beerQuantity: 1 }] }));
  const removePrize = (idx) => setForm((s) => ({ ...s, prizes: s.prizes.filter((_, i) => i !== idx) }));

  const doPreview = async () => {
    setLoadingPreview(true);
    setPreviewError('');
    try {
      const res = await generateTemplatePreview({ totalCards: form.totalCards, numbersPerCard: form.numbersPerCard, totalNumbersPool: form.totalNumbersPool, generationMode: form.generationMode });
      setPreview(res.data || res);
      setStep(2);
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || 'Failed to generate preview. Please check your inputs.';
      setPreviewError(message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCreate = async () => {
    setCreateError('');
    try {
      if (id) {
        await updateGameTemplate(id, form);
        enqueueSnackbar('Template updated', { variant: 'success' });
        navigate('/admin/game-templates');
      } else {
        await createGameTemplate(form);
        enqueueSnackbar('Template created', { variant: 'success' });
        navigate('/admin/game-templates');
      }
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || 'Create failed';
      setCreateError(message);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        const res = await getGameTemplate(id);
        const t = (res?.data || res || {});
        setForm((s) => ({
          ...s,
          templateCode: t.templateCode || s.templateCode,
          title: t.title || s.title,
          cardPrice: Number(t.cardPrice || s.cardPrice),
          totalCards: Number(t.totalCards || s.totalCards),
          totalNumbersPool: Number(t.totalNumbersPool || s.totalNumbersPool),
          numbersPerCard: Number(t.numbersPerCard || s.numbersPerCard),
          secondsPerCall: Number(t.secondsPerCall || s.secondsPerCall),
          generationMode: t.generationMode || s.generationMode,
          isDefault: Number(t.isDefault) === 1 || t.isDefault === true,
          prizes: t.prizes || s.prizes,
        }));
      } catch (e) {
        // ignore
      }
    };

    load();
  }, [id]);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Create Game Template</Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        {step === 0 && (
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}><TextField label="Template Code" fullWidth value={form.templateCode} onChange={handleChange('templateCode')} /></Grid>
            <Grid item xs={12} md={6}><TextField label="Title" fullWidth value={form.title} onChange={handleChange('title')} /></Grid>
            <Grid item xs={12} md={4}><TextField label="Card Price" type="number" fullWidth value={form.cardPrice} onChange={handleChange('cardPrice')} /></Grid>
            <Grid item xs={12} md={4}><TextField label="Total Cards" type="number" fullWidth value={form.totalCards} onChange={handleChange('totalCards')} /></Grid>
            <Grid item xs={12} md={4}><TextField label="Numbers Pool" type="number" fullWidth value={form.totalNumbersPool} onChange={handleChange('totalNumbersPool')} /></Grid>
            <Grid item xs={12} md={4}><TextField label="Numbers Per Card" type="number" fullWidth value={form.numbersPerCard} onChange={handleChange('numbersPerCard')} inputProps={{ min: 1 }} /></Grid>
            <Grid item xs={12} md={4}><FormControl fullWidth><InputLabel>Generation</InputLabel><Select value={form.generationMode} label="Generation" onChange={handleChange('generationMode')}><MenuItem value="RANDOM">Random</MenuItem><MenuItem value="SEQUENTIAL">Sequential</MenuItem></Select></FormControl></Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={Boolean(form.isDefault)}
                    onChange={(e) => setForm((s) => ({ ...s, isDefault: e.target.checked }))}
                  />
                }
                label="Set as default template"
              />
            </Grid>
            <Grid item xs={12}><Box sx={{ display: 'flex', gap: 1 }}><Button variant="contained" onClick={() => setStep(1)}>Next: Prizes</Button></Box></Grid>
          </Grid>
        )}

        {step === 1 && (
          <Box>
            <Typography variant="h6">Prizes</Typography>
            {previewError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {previewError}
              </Alert>
            )}
            {form.prizes.map((p, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
                <TextField label="Draw Position" type="number" value={p.drawPosition} onChange={(e) => { const v = Number(e.target.value); setForm((s) => { const copy = { ...s }; copy.prizes[i].drawPosition = v; return copy; }); }} />
                <TextField label="Beers" type="number" value={p.beerQuantity} onChange={(e) => { const v = Number(e.target.value); setForm((s) => { const copy = { ...s }; copy.prizes[i].beerQuantity = v; return copy; }); }} />
                <IconButton onClick={() => removePrize(i)}><RemoveIcon /></IconButton>
              </Box>
            ))}
            <Button startIcon={<AddIcon />} onClick={addPrize} sx={{ mt: 2 }}>Add Prize</Button>
            <Box sx={{ mt: 2 }}>
              <Button variant="contained" onClick={doPreview} disabled={loadingPreview}>{loadingPreview ? 'Generating...' : 'Generate Preview'}</Button>
            </Box>
          </Box>
        )}

        {step === 2 && (
          <Box>
            {createError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {createError}
              </Alert>
            )}
            <TemplatePreview cards={(preview && preview.cards) || []} />
            <Box sx={{ mt: 2 }}>
              <Button onClick={() => setStep(0)} sx={{ mr: 1 }}>Back</Button>
              <Button variant="contained" onClick={handleCreate}>Create Template</Button>
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
