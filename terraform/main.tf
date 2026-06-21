terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
}

resource "google_service_account" "github_deploy" {
  project      = var.project_id
  account_id   = var.service_account_id
  display_name = "GitHub Actions Firebase Deploy"
}

resource "google_project_iam_member" "github_deploy_hosting_admin" {
  project = var.project_id
  role    = "roles/firebasehosting.admin"
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_service_account_key" "github_deploy_key" {
  service_account_id = google_service_account.github_deploy.name
}
