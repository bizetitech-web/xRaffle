import {
  createUserService,
  listUsersService,
  updateUserService,
  updateUserStatusService
} from '../../services/onboardingService.js';
// User onboarding controller stubs
export async function createUser(req, res) {
  try {
    const user = await createUserService(req.body);
    res.status(201).json(user);
  } catch (err) {
    // Treat validation-like errors as 400
    const msg = err.message || '';
    if (msg.match(/required|exists|already/i)) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
}

export async function listUsers(req, res) {
  try {
    // --- LOGGING FOR DEBUGGING ---
    console.log('[ONBOARDING LIST USERS] Incoming request:', {
      query: req.query,
      user: req.user
    });
    // --- END LOGGING ---
    const { company_id } = req.query;
    let users;
    if (!company_id) {
      // No company_id: return all users (for super admin)
      users = await listUsersService();
    } else {
      users = await listUsersService(company_id);
    }
    res.json(users);
  } catch (err) {
    console.error('[ONBOARDING LIST USERS] Error:', err);
    res.status(500).json({ error: err.message });
  }
}

export async function updateUser(req, res) {
  try {
    const user = await updateUserService(req.params.id, req.body);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateUserStatus(req, res) {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    const result = await updateUserStatusService(req.params.id, status);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
