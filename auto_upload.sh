#!/bin/bash

# This script automatically adds, commits, and pushes changes to GitHub.
# It uses a generic commit message with a timestamp.

echo "Starting automatic upload..."

# Add all changes
git add .

# Check if there are any changes to commit
if git diff-index --quiet HEAD --; then
    echo "No changes to upload."
else
    # Commit changes
    git commit -m "Auto-upload: $(date '+%Y-%m-%d %H:%M:%S')"
    
    # Push to origin main
    echo "Pushing to GitHub..."
    git push origin main
    
    if [ $? -eq 0 ]; then
        echo "Upload successful!"
    else
        echo "Upload failed. Please check your internet connection or GitHub authentication."
        echo "If you see a login error, you might need to use a Personal Access Token (PAT)."
    fi
fi
