import { createTheme } from '@mui/material/styles';

// Light Theme (Professional / Business look)
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1E6DEB', // Primary Blue
      light: '#4A8FF0',
      dark: '#1557C0',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#34C759', // Accent Green
      light: '#5FD77B',
      dark: '#2A9E48',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#FF8A00', // Highlight Orange
      light: '#FFA133',
      dark: '#CC6E00',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F7F9FC',
      paper: '#FFFFFF',
      card: '#FFFFFF',
      sidebar: '#FFFFFF',
      navbar: '#FFFFFF',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#6B7280',
      disabled: '#9CA3AF',
    },
    divider: '#E5E7EB',
    success: {
      main: '#34C759',
    },
    error: {
      main: '#DC2626',
    },
    info: {
      main: '#1E6DEB',
    },
    action: {
      active: '#1E6DEB',
      hover: '#F3F4F6',
      selected: '#EFF6FF',
      disabled: '#D1D5DB',
      disabledBackground: '#F3F4F6',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: "#E5E7EB #F7F9FC",
          "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
            backgroundColor: "#F7F9FC",
            width: 8,
          },
          "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
            borderRadius: 8,
            backgroundColor: "#E5E7EB",
            minHeight: 24,
            border: "2px solid #F7F9FC",
          },
          "&::-webkit-scrollbar-thumb:focus, & *::-webkit-scrollbar-thumb:focus": {
            backgroundColor: "#D1D5DB",
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          color: '#1A1A1A',
          borderBottom: '1px solid #E5E7EB',
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid #E5E7EB',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          },
        },
        containedPrimary: {
          backgroundColor: '#1E6DEB',
          '&:hover': {
            backgroundColor: '#1557C0',
          },
        },
        containedWarning: {
          backgroundColor: '#FF8A00',
          '&:hover': {
            backgroundColor: '#CC6E00',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: '#F3F4F6',
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&.Mui-selected': {
            backgroundColor: '#EFF6FF',
            color: '#1E6DEB',
            '&:hover': {
              backgroundColor: '#DBEAFE',
            },
            '& .MuiListItemIcon-root': {
              color: '#1E6DEB',
            },
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: '#6B7280',
          minWidth: 40,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#E5E7EB',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: '#E5E7EB',
            },
            '&:hover fieldset': {
              borderColor: '#1E6DEB',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#1E6DEB',
            },
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          color: '#6B7280',
          '&.Mui-checked': {
            color: '#1E6DEB',
          },
          '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: '#1E6DEB',
          },
        },
        track: {
          backgroundColor: '#E5E7EB',
        },
      },
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
      fontSize: '1.75rem',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.5rem',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.25rem',
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8,
  },
});

// Dark Theme (Modern / Developer style)
export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#2F80ED', // Primary Blue for dark mode
      light: '#5A9CF0',
      dark: '#1D4ED8',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#2ECC71', // Accent Green for dark mode
      light: '#5FD77B',
      dark: '#25A65F',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#FF9F1C', // Highlight Orange for dark mode
      light: '#FFB24A',
      dark: '#CC7F16',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#0F172A',
      paper: '#1E293B',
      card: '#1E293B',
      sidebar: '#0F172A',
      navbar: '#0F172A',
    },
    text: {
      primary: '#F1F5F9',
      secondary: '#94A3B8',
      disabled: '#64748B',
    },
    divider: '#334155',
    success: {
      main: '#2ECC71',
    },
    error: {
      main: '#EF4444',
    },
    info: {
      main: '#2F80ED',
    },
    action: {
      active: '#2F80ED',
      hover: '#334155',
      selected: '#1E293B',
      disabled: '#475569',
      disabledBackground: '#1E293B',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: "#334155 #0F172A",
          "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
            backgroundColor: "#0F172A",
            width: 8,
          },
          "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
            borderRadius: 8,
            backgroundColor: "#334155",
            minHeight: 24,
            border: "2px solid #0F172A",
          },
          "&::-webkit-scrollbar-thumb:focus, & *::-webkit-scrollbar-thumb:focus": {
            backgroundColor: "#475569",
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#0F172A',
          color: '#F1F5F9',
          borderBottom: '1px solid #334155',
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#0F172A',
          borderRight: '1px solid #334155',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1E293B',
          border: '1px solid #334155',
          borderRadius: 12,
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.2)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          },
        },
        containedPrimary: {
          backgroundColor: '#2F80ED',
          '&:hover': {
            backgroundColor: '#1D4ED8',
          },
        },
        containedWarning: {
          backgroundColor: '#FF9F1C',
          '&:hover': {
            backgroundColor: '#CC7F16',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: '#F1F5F9',
          '&:hover': {
            backgroundColor: '#334155',
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&.Mui-selected': {
            backgroundColor: '#1E293B',
            color: '#2F80ED',
            '&:hover': {
              backgroundColor: '#334155',
            },
            '& .MuiListItemIcon-root': {
              color: '#2F80ED',
            },
          },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          color: '#94A3B8',
          minWidth: 40,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: '#334155',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            color: '#F1F5F9',
            '& fieldset': {
              borderColor: '#334155',
            },
            '&:hover fieldset': {
              borderColor: '#2F80ED',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#2F80ED',
            },
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          color: '#64748B',
          '&.Mui-checked': {
            color: '#2F80ED',
          },
          '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: '#2F80ED',
          },
        },
        track: {
          backgroundColor: '#334155',
        },
      },
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
      fontSize: '1.75rem',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.5rem',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.25rem',
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8,
  },
});