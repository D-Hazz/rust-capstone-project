This is a local Bitcoin Core regtest payment dashboard built with Next.js. It requires Node.js 22.13 or newer. The server persists payment invoices in `web/.data/payment-invoices.sqlite` using Node.js' built-in SQLite API. Keep the `.data` directory on a persistent disk if invoices must survive restarts.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Invoice state is stored on the server in SQLite, not in browser local storage. The UI refreshes invoice history from `/api/payments?invoices=1`.

## Payment lifecycle tests

Run unit tests for status rules and SQLite settlement reservations:

```bash
npm test
```

With Bitcoin Core on `regtest` and the dashboard running, run the integration test. It sends small test payments, mines blocks, settles the invoices and waits one minute to verify expiry:

```bash
npm run test:payments
```

The integration test mutates the local regtest chain and wallet balances. Do not run it against a real Bitcoin network.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
