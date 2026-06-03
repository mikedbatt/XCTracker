# Firestore automated backups — one-time setup

Goal: nightly export of all Firestore data to a Google Cloud Storage bucket
so we can roll back if a bug/incident corrupts the database. Kept for 30
days, then aged out automatically.

This is a one-time setup. After completion, backups run automatically.

## Prerequisites

- `gcloud` CLI installed and authenticated as the project owner
  (`gcloud auth login`)
- `gcloud config set project xctracker-a2532`

## 1. Create the backup bucket

```bash
# Bucket name must be globally unique; project-id prefix keeps it tidy.
gsutil mb -l us-central1 gs://xctracker-a2532-backups
```

## 2. Add a 30-day lifecycle policy

So we don't accumulate backups forever.

```bash
cat > /tmp/lifecycle.json <<'EOF'
{
  "lifecycle": {
    "rule": [
      { "action": { "type": "Delete" }, "condition": { "age": 30 } }
    ]
  }
}
EOF
gsutil lifecycle set /tmp/lifecycle.json gs://xctracker-a2532-backups
```

## 3. Grant the Firestore service account access to the bucket

```bash
# Get the Firestore service account email
SA="service-$(gcloud projects describe xctracker-a2532 --format='value(projectNumber)')@gcp-sa-firestore.iam.gserviceaccount.com"

gsutil iam ch serviceAccount:$SA:roles/storage.admin gs://xctracker-a2532-backups
```

## 4. Schedule the daily export via Cloud Scheduler

Cloud Scheduler can trigger Firestore exports via the REST API.

```bash
# Enable the Cloud Scheduler API if not already enabled
gcloud services enable cloudscheduler.googleapis.com appengine.googleapis.com

# If the project has no App Engine app yet, create one (Scheduler requires it)
gcloud app create --region=us-central

# Create the daily job — runs at 2am Eastern (07:00 UTC)
gcloud scheduler jobs create http firestore-nightly-export \
  --location=us-central1 \
  --schedule="0 7 * * *" \
  --time-zone="Etc/UTC" \
  --uri="https://firestore.googleapis.com/v1/projects/xctracker-a2532/databases/(default):exportDocuments" \
  --http-method=POST \
  --oauth-service-account-email="$(gcloud projects describe xctracker-a2532 --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
  --message-body='{"outputUriPrefix":"gs://xctracker-a2532-backups"}'
```

## 5. Test it

```bash
gcloud scheduler jobs run firestore-nightly-export --location=us-central1
# Wait 2-5 minutes
gsutil ls gs://xctracker-a2532-backups
# Should see a timestamped folder
```

## Restoring from a backup

If you ever need to restore (e.g., after a botched migration):

```bash
# Find the backup folder you want
gsutil ls gs://xctracker-a2532-backups

# Import — this WIPES existing collections that overlap with the backup.
# Test in a separate Firebase project first if it's a serious restore.
gcloud firestore import gs://xctracker-a2532-backups/2026-06-15T07:00:00_12345
```

Reference: https://firebase.google.com/docs/firestore/manage-data/export-import
