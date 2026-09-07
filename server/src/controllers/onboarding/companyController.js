import {
  createCompanyService,
  listCompaniesService,
  updateCompanyService
} from '../../services/onboardingService.js';
// Company onboarding controller stubs
export async function createCompany(req, res) {
  try {
    const company = await createCompanyService(req.body);
    res.status(201).json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function listCompanies(req, res) {
  try {
    const companies = await listCompaniesService();
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateCompany(req, res) {
  try {
    const company = await updateCompanyService(req.params.id, req.body);
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
