import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  InputAdornment,
  Button,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Link,
  IconButton,
} from '@mui/material';
import {
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  Help as HelpIcon,
  MenuBook as GuideIcon,
  VideoLibrary as VideoIcon,
  Forum as ForumIcon,
  Email as EmailIcon,
  Chat as ChatIcon,
  Description as DocIcon,
  BugReport as BugIcon,
  School as TutorialIcon,
  Facebook as FacebookIcon,
  Twitter as TwitterIcon,
  YouTube as YouTubeIcon,
  LinkedIn as LinkedInIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';

const Help = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState(null);

  const handleAccordionChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : null);
  };

  const faqCategories = [
    {
      category: 'Getting Started',
      icon: <GuideIcon sx={{ color: 'primary.main' }} />,
      questions: [
        {
          q: 'How do I sign in to the starter?',
          a: 'Use credentials provided by your administrator and sign in from the login page. If your account does not exist, contact an administrator to create it.'
        },
        {
          q: 'What should I configure first after login?',
          a: 'Start with Hotels settings, then create users and assign roles. This ensures users have the correct permissions before they access admin pages.'
        },
        {
          q: 'How do I verify my access rights?',
          a: 'Open the sidebar and check which admin sections are visible. Route and menu access are permission-based, so hidden sections usually indicate missing permissions.'
        }
      ]
    },
    {
      category: 'Users and Hotels',
      icon: <DocIcon sx={{ color: 'success.main' }} />,
      questions: [
        {
          q: 'How do I create a user account?',
          a: 'Go to Administration > Users, click Add User, fill in required fields, choose a role, and save. The new user can sign in with the assigned credentials.'
        },
        {
          q: 'How do I deactivate or reactivate a user?',
          a: 'In the Users page, use the status action to deactivate or reactivate an account. Deactivated users cannot sign in until reactivated.'
        },
        {
          q: 'How do I manage hotels?',
          a: 'Go to Administration > Hotels to create and update hotel records. Access to this page requires MANAGE_HOTELS permission.'
        }
      ]
    },
    {
      category: 'Roles and Permissions',
      icon: <TutorialIcon sx={{ color: 'warning.main' }} />,
      questions: [
        {
          q: 'What is the difference between roles and permissions?',
          a: 'Roles group permissions into reusable access profiles. Permissions represent concrete capabilities like MANAGE_USERS or MANAGE_ROLES.'
        },
        {
          q: 'Why can\'t I see the Roles or Permissions pages?',
          a: 'Those pages require MANAGE_ROLES permission. If unavailable, ask a super admin to update your role permissions.'
        },
        {
          q: 'How do I change permissions for a role?',
          a: 'Open Administration > Roles or Permissions, select the target role, and update assigned permissions. Save changes and ask users to refresh their session.'
        }
      ]
    },
    {
      category: 'Authentication and Access',
      icon: <BugIcon sx={{ color: 'info.main' }} />,
      questions: [
        {
          q: 'What should I do if login fails?',
          a: 'Verify email and password first. If credentials are correct, check whether your account is active and confirm your hotel context with an administrator.'
        },
        {
          q: 'How can an admin reset a user password?',
          a: 'Use the server password reset utility script to update only password_hash for the selected user. This is intended for controlled administrative recovery.'
        },
        {
          q: 'Why am I redirected away from a page?',
          a: 'Protected routes enforce permission checks. If your account lacks required permissions, the app redirects you to an allowed page such as Users.'
        }
      ]
    }
  ];

  const resources = [
    { title: 'Starter Setup Guide', icon: <GuideIcon />, description: 'Environment and bootstrap steps', color: '#3b82f6' },
    { title: 'Admin Workflow Tutorials', icon: <VideoIcon />, description: 'User, role, and org management walkthroughs', color: '#f44336' },
    { title: 'Implementation Notes', icon: <ForumIcon />, description: 'Refactor decisions and migration notes', color: '#10b981' },
    { title: 'API Reference', icon: <DocIcon />, description: 'Authentication and admin endpoints', color: '#8b5cf6' },
  ];

  const supportChannels = [
    { name: 'Email Support', icon: <EmailIcon />, description: '24/7 email support', action: 'support@example.com' },
    { name: 'Live Chat', icon: <ChatIcon />, description: 'Chat with our team', action: 'Start Chat' },
    { name: 'Report a Bug', icon: <BugIcon />, description: 'Found an issue?', action: 'Submit Report' },
  ];

  const filteredFAQs = searchQuery
    ? faqCategories.map(cat => ({
        ...cat,
        questions: cat.questions.filter(
          q => q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
               q.a.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(cat => cat.questions.length > 0)
    : faqCategories;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ color: 'text.primary' }}>
          Help Center
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3 }}>
          Find answers to common questions and learn how to use xRaffle effectively
        </Typography>

        {/* Search Bar */}
        <Paper sx={{ p: 0.5, display: 'flex', alignItems: 'center', bgcolor: 'background.paper', maxWidth: 600 }}>
          <InputAdornment position="start" sx={{ ml: 2 }}>
            <SearchIcon sx={{ color: 'text.secondary' }} />
          </InputAdornment>
          <TextField
            fullWidth
            placeholder="Search for help articles..."
            variant="standard"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{ disableUnderline: true }}
            sx={{ ml: 1, flex: 1 }}
          />
          <Button variant="contained" sx={{ mr: 0.5, borderRadius: 1 }}>
            Search
          </Button>
        </Paper>
      </Box>

      <Grid container spacing={3}>
        {/* Main Content - FAQs */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, bgcolor: 'background.paper' }}>
            <Typography variant="h5" sx={{ color: 'text.primary', mb: 3 }}>
              Frequently Asked Questions
            </Typography>

            {filteredFAQs.length > 0 ? (
              filteredFAQs.map((category, catIndex) => (
                <Box key={catIndex} sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    {category.icon}
                    <Typography variant="h6" sx={{ color: 'text.primary' }}>
                      {category.category}
                    </Typography>
                  </Box>
                  
                  {category.questions.map((faq, faqIndex) => (
                    <Accordion
                      key={faqIndex}
                      expanded={expanded === `${catIndex}-${faqIndex}`}
                      onChange={handleAccordionChange(`${catIndex}-${faqIndex}`)}
                      sx={{
                        bgcolor: 'background.default',
                        color: 'text.primary',
                        mb: 1,
                        '&:before': { display: 'none' },
                        border: theme => `1px solid ${theme.palette.divider}`,
                        borderRadius: '8px !important',
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon sx={{ color: 'text.primary' }} />}
                        sx={{
                          '& .MuiAccordionSummary-content': {
                            color: 'text.primary',
                          },
                        }}
                      >
                        <Typography>{faq.q}</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Typography sx={{ color: 'text.secondary' }}>
                          {faq.a}
                        </Typography>
                      </AccordionDetails>
                    </Accordion>
                  ))}
                </Box>
              ))
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <HelpIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                <Typography sx={{ color: 'text.secondary' }}>
                  No results found for "{searchQuery}"
                </Typography>
                <Button 
                  onClick={() => setSearchQuery('')} 
                  sx={{ mt: 2, color: 'primary.main' }}
                >
                  Clear Search
                </Button>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Sidebar - Resources & Support */}
        <Grid item xs={12} md={4}>
          {/* Quick Resources */}
          <Paper sx={{ p: 3, bgcolor: 'background.paper', mb: 3 }}>
            <Typography variant="h6" sx={{ color: 'text.primary', mb: 2 }}>
              Quick Resources
            </Typography>
            <List>
              {resources.map((resource, index) => (
                <ListItem 
                  key={index}
                  button
                  sx={{
                    borderRadius: 1,
                    mb: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <ListItemIcon sx={{ color: resource.color, minWidth: 40 }}>
                    {resource.icon}
                  </ListItemIcon>
                  <ListItemText 
                    primary={resource.title}
                    secondary={resource.description}
                    primaryTypographyProps={{ sx: { color: 'text.primary' } }}
                    secondaryTypographyProps={{ sx: { color: 'text.secondary' } }}
                  />
                  <ArrowForwardIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                </ListItem>
              ))}
            </List>
          </Paper>

          {/* Support Channels */}
          <Paper sx={{ p: 3, bgcolor: 'background.paper', mb: 3 }}>
            <Typography variant="h6" sx={{ color: 'text.primary', mb: 2 }}>
              Starter Documentation
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              This is a template project. For support, see the README or starter docs in your repository.
            </Typography>
            <Button
              variant="contained"
              color="primary"
              href="https://github.com/bizetitech-web/auth-repo"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ mt: 1 }}
            >
              View Starter Docs
            </Button>
          </Paper>

          {/* System Status Placeholder Removed for Template */}
        </Grid>
      </Grid>

      {/* Still Need Help? */}
      <Paper sx={{ p: 4, bgcolor: 'background.paper', mt: 3, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ color: 'text.primary', mb: 2 }}>
          Still Need Help?
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3 }}>
          Our support team is available 24/7 to assist you
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Button variant="contained" startIcon={<ChatIcon />}>
            Start Live Chat
          </Button>
          <Button variant="outlined" startIcon={<EmailIcon />} sx={{ borderColor: 'divider', color: 'text.primary' }}>
            Email Support
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default Help;