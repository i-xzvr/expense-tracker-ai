# V4 cloud setup

No provider credentials are committed. Configure .env.local on this laptop, then restart V4. Do not send secrets in chat.

## Installed OneDrive folder (selected first integration)

V4 automatically uses the installed personal OneDrive folder from OneDriveConsumer/OneDrive environment variables; V4_ONEDRIVE_ROOT is a server-only override for an already configured sync root. Verify your desktop client is installed and signed in on the destination machine. No application registration or new sign-in grant is needed for this path.

Select Installed OneDrive sync folder in Export Data, preview the records and confirm. Files go to Expense Tracker V4/Reports. Combined backups go to Expense Tracker V4/Backups and require a separate confirmation because they include receipts/chats. Unique names preserve earlier files; the local bytes are read back and SHA256 verified. Folder junctions resolving outside the configured root are rejected.

Status is queued-for-sync, not confirmed cloud delivery. The app checks folder availability, not OneDrive cloud acknowledgement or account quota. Use the desktop tray/File Explorer sync indicators for completion/errors: [Microsoft's sync icons](https://support.microsoft.com/en-us/onedrive/what-do-the-onedrive-icons-mean). The folder may exist while sync is paused/offline. Backups are unencrypted; credentials, schedules and worktrees are excluded. Files are not automatically pruned.

Weekly local and OneDrive backup schedules copy a captured, validated combined snapshot. Recapture after changes. Local files stay in data/v4-scheduled-backups; source captures are retained in ignored data/v4-backup-snapshots. Removing a schedule prevents later attempts but does not delete files already created or retained captures.

## OneDrive API (optional later connection)

Register a Microsoft public-client application for the intended account type, enable public-client/device authorization, and authorize delegated Files.ReadWrite plus offline_access. Put the public application ID in V4_MS_CLIENT_ID. V4_MS_TENANT defaults to consumers for personal accounts; use an appropriate tenant ID/common setting for work accounts.

In your own Entra tenant: **Entra ID → App registrations → New registration**, select the intended supported account types, and copy **Application (client) ID**. For personal OneDrive choose a registration supporting personal accounts and tenant `consumers`. Enable public-client flows under the app's Authentication settings, add Microsoft Graph delegated `Files.ReadWrite`, and follow any required user/admin consent policy. No client secret or web callback URL is used by this device flow. Registration requires the relevant account/tenant permissions; the installed sync-folder adapter avoids this prerequisite. [Microsoft registration guide](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).

Use Integrations -> Connect OneDrive, complete Microsoft's sign-in yourself, then Check sign-in. Access/refresh tokens are protected by Windows DPAPI and stored in ignored data/v4-cloud.dpapi; they are usable only under that Windows user's context. Combined backups exclude them. Copying this file to another machine does not transfer authorization.

Create the destination folder in OneDrive first (default: Expense Exports). Delivery uses Microsoft Graph's content upload API and requires a returned file ID. Uploads are not publicly shared. Each attempt adds a unique suffix to the chosen filename, preserving earlier exports. An interrupted response remains unconfirmed; inspect the destination before retrying.

Primary sources: [device authorization](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code), [Graph file upload](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0).

## Google Sheets

Use your own Google OAuth application with spreadsheet write access. Server configuration supports V4_GOOGLE_ACCESS_TOKEN (short-lived), or V4_GOOGLE_CLIENT_ID, V4_GOOGLE_CLIENT_SECRET and V4_GOOGLE_REFRESH_TOKEN together. Keep secrets only in .env.local. This release has no Google sign-in UI.

One manual setup route is Google's own [OAuth Playground](https://developers.google.com/oauthplayground/):

1. In your Google Cloud project enable **Google Sheets API**, configure the OAuth consent screen/audience, and add your account as a test user if the application is in testing.
2. Create a **Web application** OAuth client and add `https://developers.google.com/oauthplayground` as its authorized redirect URI.
3. In Playground's settings choose Google endpoints, server-side flow, offline access, and **Use your own OAuth credentials**; enter your client ID/secret there. These credentials are provided to Google's own tool, not this repository.
4. Authorize `https://www.googleapis.com/auth/spreadsheets` with the intended account, exchange the authorization code, and retain the returned refresh token locally. The Playground's shared-client refresh tokens are revoked after 24 hours; using your own client avoids that Playground limit. Your own consent/token policies can still require reauthorization.
5. Enter the three values through Setup-V4's masked secret prompts or ignored `.env.local`, restart V4, and test a synthetic export to a spreadsheet that account can edit. Do not share Playground links containing credentials/tokens.

The spreadsheet ID is the part between `/d/` and `/edit` in its URL. Credentials stay on your own machine and must be reacquired/configured after moving to another computer.

Select a spreadsheet you can edit. Enter its ID, preview the selected rows and confirm delivery. A new worksheet is created for each attempt; values are RAW, so formula-looking descriptions remain text. A failure after worksheet creation is reported as partial delivery and may leave an empty worksheet. Review before retrying. Sheets exports detail cells rather than uploading a PDF file.

Primary sources: [Sheets values update](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update), [scopes](https://developers.google.com/workspace/sheets/api/scopes).

## Other course features

Email prepares a local draft for manual attachment and sending. This matches a simulated/handoff workflow; it is not an SMTP sender. Local sharing/QR uses an expiring local link, not a public share. Dropbox is unconnected; the implemented real adapters are OneDrive and Google Sheets. If a provider is unavailable, its status and errors remain visible rather than simulating successful cloud delivery.

Recurring exports use captured snapshots, not future browser edits. They run while V4 services and the laptop are awake/online. They advance the next attempt before delivery to avoid a restart silently repeating an uncertain attempt. Automatic retries are deliberately absent until provider-level idempotency and reconciliation are implemented.
