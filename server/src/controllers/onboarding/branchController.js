import {
  createBranchService,
  listBranchesService,
  updateBranchService,
  deleteBranchService
} from '../../services/onboardingService.js';
// Branch onboarding controller stubs
export async function createBranch(req, res) {
  try {
    const branch = await createBranchService(req.body);
    res.status(201).json(branch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function listBranches(req, res) {
  try {
    const { company_id } = req.query;
    // If no company_id provided, return all branches (for super admin)
    const branches = await listBranchesService(company_id);
    res.json(branches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateBranch(req, res) {
  try {
    const branch = await updateBranchService(req.params.id, req.body);
    res.json(branch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteBranch(req, res) {
  try {
    await deleteBranchService(req.params.id);
    res.json({ id: req.params.id, deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
