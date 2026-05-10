# Supabase Edge Function Deployment Script
# This script deploys the Edge Function without requiring the Supabase CLI

# Configuration
$ProjectRef = "mqbgntwneggfjnhrdjfa"
$FunctionName = "send-push-notification"
$FunctionPath = "supabase/functions/send-push-notification/index.ts"

# You need to get your access token from Supabase Dashboard
# Go to https://supabase.com/dashboard/project/mqbgntwneggfjnhrdjfa/settings/api
# Copy the service_role key (NOT the anon key)
$AccessToken = "YOUR_SERVICE_ROLE_KEY_HERE"

# Read the function file
$FunctionContent = Get-Content -Path $FunctionPath -Raw -Encoding UTF8

# Deploy the function
$Url = "https://api.supabase.com/v1/projects/$ProjectRef/functions/$FunctionName"

$Headers = @{
    "Authorization" = "Bearer $AccessToken"
    "Content-Type" = "application/json"
}

$Body = @{
    "name" = $FunctionName
    "files" = @(
        @{
            "name" = "index.ts"
            "content" = $FunctionContent
        }
    )
} | ConvertTo-Json -Depth 10

Write-Host "Deploying Edge Function..."
try {
    $Response = Invoke-RestMethod -Uri $Url -Method POST -Headers $Headers -Body $Body
    Write-Host "Edge Function deployed successfully!"
    Write-Host "Function URL: https://mqbgntwneggfjnhrdjfa.supabase.co/functions/v1/$FunctionName"
} catch {
    Write-Host "Error deploying function: $_"
    Write-Host "Please deploy manually through Supabase Dashboard"
}

# Set environment variables for the function
$EnvUrl = "https://api.supabase.com/v1/projects/$ProjectRef/functions/$FunctionName/secrets"

$EnvBody = @{
    "secrets" = @(
        @{
            "name" = "VAPID_PUBLIC_KEY"
            "value" = "BIFqUGnDErvda7CWI3EkGy399S1IxBTKJvKfUj8Kpm37KWtKWaYsbRG5YpxhBOJR1FkET6tg8TlU-0_8Ijyh01c"
        },
        @{
            "name" = "VAPID_PRIVATE_KEY"
            "value" = "SSJhg_bn2R5wye718Ec9nAdtIkrvAVNcNW7d7yG-0pE"
        }
    )
} | ConvertTo-Json

Write-Host "Setting environment variables..."
try {
    $EnvResponse = Invoke-RestMethod -Uri $EnvUrl -Method POST -Headers $Headers -Body $EnvBody
    Write-Host "Environment variables set successfully!"
} catch {
    Write-Host "Error setting environment variables: $_"
    Write-Host "Please set them manually in Supabase Dashboard"
}
