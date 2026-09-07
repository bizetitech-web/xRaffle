import React from 'react';
import { Box, Paper, Typography, Grid, Chip } from '@mui/material';

const CardBox = ({ card }) => (
  <Paper variant="outlined" sx={{ p: 1, minWidth: 120 }}>
    <Typography variant="subtitle2">#{card.cardNumber}</Typography>
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
      {card.numbers.map((n) => (
        <Chip key={n} label={n} size="small" />
      ))}
    </Box>
  </Paper>
);

export default function TemplatePreview({ cards = [] }) {
  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>Card Generation Preview</Typography>
      <Grid container spacing={2}>
        {cards.slice(0, 12).map((c) => (
          <Grid item xs={12} sm={6} md={3} key={c.cardNumber}>
            <CardBox card={c} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
