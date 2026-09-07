-- Add hotel_charge_templates table to store per-hotel (branch/company) charge templates
CREATE TABLE IF NOT EXISTS hotel_charge_templates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  company_id CHAR(36) NULL,
  branch_id CHAR(36) NULL,
  charge_amount DECIMAL(10,2) NULL,
  charge_percentage DECIMAL(5,2) NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hct_company (company_id),
  INDEX idx_hct_branch (branch_id),
  CONSTRAINT fk_hct_company FOREIGN KEY (company_id) REFERENCES hotel_companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_hct_branch FOREIGN KEY (branch_id) REFERENCES hotel_branches(id) ON DELETE CASCADE
);
