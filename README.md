# WoW Admin – AzerothCore SOAP Console

A desktop application (Electron + Node.js) for remotely administering an
[AzerothCore](https://www.azerothcore.org/) World of Warcraft server via its
built-in SOAP interface.

## Features

- Connect to any AzerothCore worldserver with SOAP enabled
- Execute any server console command remotely
- Quick-command sidebar for common operations
- Command history (↑ / ↓ arrow keys)
- Color-coded success/error responses

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js** ≥ 18 | https://nodejs.org |
| **AzerothCore worldserver** | SOAP must be enabled (see below) |

### Enable SOAP on your worldserver

In your `worldserver.conf`, set:

```ini
SOAP.Enabled  = 1
SOAP.IP       = "127.0.0.1"
SOAP.Port     = 7878
```

You also need an account with security level **3** (or higher) to
authenticate. You can set this in the `account` table or with:

```
.account set sec <account> 3
```

## Getting Started

```bash
# Install dependencies
npm install

# Launch the app
npm start
```

## Usage

1. Enter the **Host**, **Port**, **Username**, and **Password** in the
   connection bar.
2. Click **Connect** — the app will run `server info` to verify the
   connection.
3. Type commands in the console input or use the **Quick Commands** sidebar.
4. Press **Enter** or click **Send** to execute.

## Project Structure

```
wow-admin/
├── package.json
├── README.md
├── src/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Context bridge (IPC)
│   └── soap-client.js   # Raw SOAP/HTTP client for AzerothCore
└── renderer/
    ├── index.html        # App UI
    ├── styles.css        # Styling
    └── app.js            # Frontend logic
```

## License

MIT
