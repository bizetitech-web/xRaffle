import React, { createContext, useState, useContext, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { lightTheme, darkTheme } from '../theme';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // Check localStorage for saved theme preference
  const savedTheme = localStorage.getItem('theme');
  const savedCompactView = localStorage.getItem('compactView') === 'true';
  const savedReducedAnimations = localStorage.getItem('reducedAnimations') === 'true';
  const [mode, setMode] = useState(savedTheme || 'dark');
  const [compactView, setCompactView] = useState(savedCompactView);
  const [reducedAnimations, setReducedAnimations] = useState(savedReducedAnimations);

  useEffect(() => {
    localStorage.setItem('theme', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('compactView', String(compactView));
    document.body.classList.toggle('compact-view', compactView);
  }, [compactView]);

  useEffect(() => {
    localStorage.setItem('reducedAnimations', String(reducedAnimations));
    document.body.classList.toggle('reduced-animations', reducedAnimations);
  }, [reducedAnimations]);

  const toggleTheme = () => {
    setMode(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleCompactView = () => {
    setCompactView((prev) => !prev);
  };

  const toggleReducedAnimations = () => {
    setReducedAnimations((prev) => !prev);
  };

  const theme = mode === 'light' ? lightTheme : darkTheme;

  return (
    <ThemeContext.Provider
      value={{
        mode,
        toggleTheme,
        compactView,
        toggleCompactView,
        reducedAnimations,
        toggleReducedAnimations,
      }}
    >
      <MuiThemeProvider theme={theme}>
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};