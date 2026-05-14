import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  Divider,
  Switch,
  FormControlLabel,
  Alert,
  Avatar,
  Tab,
  Tabs,
  useMediaQuery,
} from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import {
  Save as SaveIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Notifications as NotificationsIcon,
  Security as SecurityIcon,
  Palette as PaletteIcon,
  PhotoCamera as PhotoCameraIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useTheme as useAppTheme } from '../context/ThemeContext';
import api from '../services/api';

const TabPanel = ({ children, value, index }) => (
  <div hidden={value !== index}>
    {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
  </div>
);

const getProfileFromUser = (user) => ({
  firstName: user?.firstName || user?.name?.split(' ')[0] || '',
  lastName: user?.lastName || user?.name?.split(' ').slice(1).join(' ') || '',
  email: user?.email || '',
  phone: user?.phone || '',
  jobTitle: user?.jobTitle || '',
});

const getOrganizationFromUser = (user) => ({
  name: user?.organization?.name || '',
  email: user?.organization?.email || '',
  phone: user?.organization?.phone || '',
  address: user?.organization?.address || '',
  city: user?.organization?.city || '',
  state: user?.organization?.state || '',
  country: user?.organization?.country || '',
  postalCode: user?.organization?.postalCode || '',
  taxId: user?.organization?.taxId || '',
});

const Settings = () => {
  const { user, fetchProfile } = useAuth();
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('sm'));
  const {
    mode,
    toggleTheme,
    compactView,
    toggleCompactView,
    reducedAnimations,
    toggleReducedAnimations,
  } = useAppTheme();
  const [tabValue, setTabValue] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  
  const [profileData, setProfileData] = useState(() => getProfileFromUser(user));

  const [organizationData, setOrganizationData] = useState(() => getOrganizationFromUser(user));

  const [notificationSettings, setNotificationSettings] = useState({
    emailAlerts: true,
    accessAlerts: true,
    adminActionUpdates: true,
    systemAnnouncements: true,
  });

  useEffect(() => {
    setProfileData(getProfileFromUser(user));
    setOrganizationData(getOrganizationFromUser(user));
  }, [user]);

  const handleProfileChange = (e) => {
    setProfileData({ ...profileData, [e.target.name]: e.target.value });
  };

  const handleOrgChange = (e) => {
    setOrganizationData({ ...organizationData, [e.target.name]: e.target.value });
  };

  const handleNotificationChange = (e) => {
    setNotificationSettings({ ...notificationSettings, [e.target.name]: e.target.checked });
  };

  const handleSave = async () => {
    if (tabValue !== 0) {
      return;
    }

    setSaveError('');
    setSaving(true);

    try {
      await api.put('/auth/profile', {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        email: profileData.email,
        phone: profileData.phone,
      });

      await fetchProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error?.response?.data?.error || 'Failed to save profile settings');
    } finally {
      setSaving(false);
    }
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: 'background.default',
    },
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ color: 'text.primary' }}>
        Settings
      </Typography>
      <Typography variant="body1" sx={{ color: 'text.secondary', mb: 4 }}>
        Manage your account, organization, and preferences
      </Typography>

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Settings saved successfully!
        </Alert>
      )}

      {saveError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {saveError}
        </Alert>
      )}

      <Paper sx={{ bgcolor: 'background.paper' }}>
        <Tabs
          value={tabValue}
          onChange={(e, v) => setTabValue(v)}
          variant={isMobile ? 'scrollable' : 'standard'}
          scrollButtons={isMobile ? 'auto' : false}
          allowScrollButtonsMobile
          sx={{
            borderBottom: '1px solid',
            borderColor: 'divider',
            '& .Mui-selected': { color: 'primary.main' },
            '& .MuiTabs-indicator': { bgcolor: 'primary.main' },
            '& .MuiTab-root': isMobile
              ? { minWidth: 56, px: 1.25, color: 'text.secondary' }
              : { color: 'text.secondary' },
          }}
        >
          <Tab icon={<PersonIcon />} label="Profile" aria-label="Profile" iconPosition="start" />
          <Tab icon={<BusinessIcon />} label="Organization" aria-label="Organization" iconPosition="start" />
          <Tab icon={<NotificationsIcon />} label="Notifications" aria-label="Notifications" iconPosition="start" />
          <Tab icon={<SecurityIcon />} label="Security" aria-label="Security" iconPosition="start" />
          <Tab icon={<PaletteIcon />} label="Appearance" aria-label="Appearance" iconPosition="start" />
        </Tabs>

        {/* Profile Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
              <Avatar
                sx={{ width: 80, height: 80, bgcolor: 'primary.main', mr: 3 }}
              >
                {(profileData.firstName?.[0] || '') + (profileData.lastName?.[0] || '') || 'U'}
              </Avatar>
              <Box>
                <Button
                  variant="outlined"
                  startIcon={<PhotoCameraIcon />}
                  sx={{ borderColor: 'divider', color: 'text.primary' }}
                >
                  Change Photo
                </Button>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                  JPG, GIF or PNG. Max size 2MB.
                </Typography>
              </Box>
            </Box>

            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="First Name"
                  name="firstName"
                  value={profileData.firstName}
                  onChange={handleProfileChange}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Last Name"
                  name="lastName"
                  value={profileData.lastName}
                  onChange={handleProfileChange}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email Address"
                  name="email"
                  type="email"
                  value={profileData.email}
                  onChange={handleProfileChange}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Phone Number"
                  name="phone"
                  value={profileData.phone}
                  onChange={handleProfileChange}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Job Title"
                  name="jobTitle"
                  value={profileData.jobTitle}
                  onChange={handleProfileChange}
                  sx={inputSx}
                />
              </Grid>
            </Grid>
          </Box>
        </TabPanel>

        {/* Organization Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Organization Name"
                  name="name"
                  value={organizationData.name}
                  onChange={handleOrgChange}
                  InputProps={{ readOnly: true }}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Organization Email"
                  name="email"
                  type="email"
                  value={organizationData.email}
                  onChange={handleOrgChange}
                  InputProps={{ readOnly: true }}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Organization Phone"
                  name="phone"
                  value={organizationData.phone}
                  onChange={handleOrgChange}
                  InputProps={{ readOnly: true }}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Address"
                  name="address"
                  value={organizationData.address}
                  onChange={handleOrgChange}
                  InputProps={{ readOnly: true }}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="City"
                  name="city"
                  value={organizationData.city}
                  onChange={handleOrgChange}
                  InputProps={{ readOnly: true }}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="State/Province"
                  name="state"
                  value={organizationData.state}
                  onChange={handleOrgChange}
                  InputProps={{ readOnly: true }}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Country"
                  name="country"
                  value={organizationData.country}
                  onChange={handleOrgChange}
                  InputProps={{ readOnly: true }}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Postal Code"
                  name="postalCode"
                  value={organizationData.postalCode}
                  onChange={handleOrgChange}
                  InputProps={{ readOnly: true }}
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Tax ID / VAT Number"
                  name="taxId"
                  value={organizationData.taxId}
                  onChange={handleOrgChange}
                  InputProps={{ readOnly: true }}
                  sx={inputSx}
                />
              </Grid>
            </Grid>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
              Organization details are read-only on this page.
            </Typography>
          </Box>
        </TabPanel>

        {/* Notifications Tab */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ color: 'text.primary', mb: 2 }}>
              Email Notifications
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={notificationSettings.emailAlerts}
                  onChange={handleNotificationChange}
                  name="emailAlerts"
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: 'primary.main' },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: 'primary.main' },
                  }}
                />
              }
              label="Receive email alerts for important updates"
              sx={{ color: 'text.primary', display: 'block', mb: 2 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={notificationSettings.accessAlerts}
                  onChange={handleNotificationChange}
                  name="accessAlerts"
                />
              }
              label="Access and permission alerts"
              sx={{ color: 'text.primary', display: 'block', mb: 2 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={notificationSettings.adminActionUpdates}
                  onChange={handleNotificationChange}
                  name="adminActionUpdates"
                />
              }
              label="Admin action updates"
              sx={{ color: 'text.primary', display: 'block', mb: 2 }}
            />
            
            <Divider sx={{ borderColor: 'divider', my: 3 }} />
            
            <Typography variant="h6" sx={{ color: 'text.primary', mb: 2 }}>
              Report Notifications
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={notificationSettings.systemAnnouncements}
                  onChange={handleNotificationChange}
                  name="systemAnnouncements"
                />
              }
              label="System announcements and updates"
              sx={{ color: 'text.primary', display: 'block', mb: 2 }}
            />
          </Box>
        </TabPanel>

        {/* Security Tab */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ color: 'text.primary', mb: 3 }}>
              Change Password
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="password"
                  label="Current Password"
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="password"
                  label="New Password"
                  sx={inputSx}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="password"
                  label="Confirm New Password"
                  sx={inputSx}
                />
              </Grid>
            </Grid>

            <Divider sx={{ borderColor: 'divider', my: 4 }} />

            <Typography variant="h6" sx={{ color: 'text.primary', mb: 3 }}>
              Two-Factor Authentication
            </Typography>
            <Button variant="outlined" sx={{ borderColor: 'divider', color: 'text.primary' }}>
              Enable Two-Factor Authentication
            </Button>
          </Box>
        </TabPanel>

        {/* Appearance Tab */}
        <TabPanel value={tabValue} index={4}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ color: 'text.primary', mb: 3 }}>
              Theme Settings
            </Typography>
            <FormControlLabel
              control={<Switch checked={mode === 'dark'} onChange={toggleTheme} />}
              label={mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
              sx={{ color: 'text.primary', display: 'block', mb: 2 }}
            />
            <FormControlLabel
              control={<Switch checked={compactView} onChange={toggleCompactView} />}
              label="Compact View"
              sx={{ color: 'text.primary', display: 'block', mb: 2 }}
            />
            <FormControlLabel
              control={<Switch checked={reducedAnimations} onChange={toggleReducedAnimations} />}
              label="Reduced Animations"
              sx={{ color: 'text.primary', display: 'block', mb: 2 }}
            />
          </Box>
        </TabPanel>

        {/* Save Button (shown in all tabs) */}
        <Box sx={{ p: 3, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            size="large"
            disabled={saving || tabValue !== 0}
          >
            {saving ? 'Saving...' : tabValue === 0 ? 'Save Profile' : 'Save Changes'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;