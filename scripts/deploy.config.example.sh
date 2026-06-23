# Copy this to scripts/deploy.config.sh and fill in your Azure VM details.
# scripts/deploy.config.sh is git-ignored (contains host/user info).

# SSH connection
export DEPLOY_HOST="your-vm.eastus.cloudapp.azure.com"   # Azure VM public DNS or IP
export DEPLOY_USER="azureuser"                            # SSH user
export DEPLOY_SSH_KEY="$HOME/.ssh/zook_azure.pem"         # path to private key
export DEPLOY_SSH_PORT="22"

# Remote app location
export DEPLOY_PATH="/home/azureuser/zook_backend"         # repo dir on the server
export DEPLOY_BRANCH="develop"                            # branch to deploy

# PM2 process name (must match ecosystem.config.js -> apps[].name)
export PM2_APP_NAME="zook-backend"
