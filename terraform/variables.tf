variable "project_id" {
  description = "GCP/Firebase project ID"
  type        = string
  default     = "vgc-team-tests"
}

variable "service_account_id" {
  description = "Account ID (the part before @) for the GitHub Actions deploy service account"
  type        = string
  default     = "github-deploy"
}
