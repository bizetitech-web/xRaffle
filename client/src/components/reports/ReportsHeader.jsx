import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';

const defaultBackground =
  'linear-gradient(120deg, rgba(30,109,235,0.16) 0%, rgba(255,138,0,0.12) 55%, rgba(16,185,129,0.12) 100%)';

export const REPORT_FILTER_WIDTHS = {
  select: 280,
  date: 180,
};

const ReportsHeader = ({
  title,
  subtitle,
  loading = false,
  onRefresh,
  refreshDisabled = false,
  refreshLabel = 'Refresh',
  presets = [],
  onPresetSelect,
  rightContent = null,
  background = defaultBackground,
  children,
}) => {
  return (
    <Paper
      sx={{
        p: 3,
        mb: 3,
        borderRadius: 3,
        background,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {subtitle}
        </Typography>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
        {children}

        {onRefresh && (
          <Button
            variant="contained"
            onClick={onRefresh}
            disabled={loading || refreshDisabled}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
          >
            {loading ? 'Refreshing...' : refreshLabel}
          </Button>
        )}

        {presets.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ ml: { md: 'auto' } }}>
            {presets.map((days) => (
              <Chip
                key={days}
                label={`${days}D`}
                onClick={() => onPresetSelect && onPresetSelect(days)}
                disabled={!onPresetSelect}
              />
            ))}
          </Stack>
        )}

        {rightContent && (
          <Box sx={{ ml: { md: 'auto' }, display: 'flex', alignItems: 'center' }}>
            {rightContent}
          </Box>
        )}
      </Stack>
    </Paper>
  );
};

export default ReportsHeader;
