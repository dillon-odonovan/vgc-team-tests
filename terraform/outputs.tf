output "service_account_email" {
  description = "Email of the created service account"
  value       = google_service_account.github_deploy.email
}

output "private_key" {
  description = "Base64-encoded JSON key for the service account. Decode with: terraform output -raw private_key | base64 -d"
  value       = google_service_account_key.github_deploy_key.private_key
  sensitive   = true
}
