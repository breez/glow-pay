# Glow Pay

The simplest way to accept Bitcoin payments on your website. Non-custodial Lightning payments powered by Breez SDK.

## Features

- **Non-Custodial**: Funds go directly to your wallet - you control your keys
- **Integrated Wallet**: Create your Lightning wallet directly in Glow Pay
- **Lightning Fast**: Instant payments via Lightning Network
- **Easy Integration**: Create payment links in seconds
- **No Setup Fees**: Everything runs in your browser

## How It Works

1. **Setup Wizard**: Create your Lightning wallet with a 12-word recovery phrase
2. **Get Your Address**: Choose a username to get your `@breez.cash` Lightning address
3. **Start Accepting Payments**: Create payment links or use the API

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- **Breez SDK (WASM)** - Full Lightning wallet in the browser
- LNURL-pay protocol
- BIP39 mnemonic generation

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        GLOW PAY                              │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Setup Wizard │  │  Dashboard   │  │ Payment Pages│       │
│  │              │  │              │  │              │       │
│  │ - Generate   │  │ - Settings   │  │ - QR Code    │       │
│  │   mnemonic   │  │ - Payments   │  │ - Polling    │       │
│  │ - Register   │  │ - Create     │  │ - Redirect   │       │
│  │   username   │  │   Links      │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                          │                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Breez SDK (WASM)                          │  │
│  │                                                        │  │
│  │  - Wallet creation/restore                             │  │
│  │  - Lightning address registration                      │  │
│  │  - Send/receive payments                               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Lightning Network
                          ▼
              ┌───────────────────────┐
              │  breez.cash           │
              │  Lightning Address    │
              │  Server               │
              └───────────────────────┘
```

## Payment Flow

1. **Merchant Setup**: Complete the setup wizard to create wallet and register Lightning address
2. **Create Payment**: Generate a payment link from the dashboard
3. **Customer Pays**: Customer scans QR code and pays with any Lightning wallet
4. **Verification**: Glow Pay verifies payment via LNURL-verify
5. **Redirect**: Customer is redirected to merchant's success URL with payment details

## Security Notes

- Recovery phrase is stored in localStorage (browser)
- For production use, consider additional encryption for sensitive data
- Never share your 12-word recovery phrase with anyone
- API key is currently hardcoded for demo purposes

## Based On

This project integrates wallet functionality from [breez/glow-web](https://github.com/breez/glow-web), a demo app showing Breez SDK WebAssembly integration.

## License

MIT
