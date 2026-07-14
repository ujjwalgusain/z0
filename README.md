This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## AI Models

The agent runtime uses an OpenAI-compatible gateway. The default low-cost model is `openai/gpt-4o-mini` via AICredits:

```env
OPENAI_BASE_URL=https://api.aicredits.in/v1
OPENAI_API_KEY=sk-...
AI_MODEL=openai/gpt-4o-mini
GEMINI_MODEL=google/gemini-2.5-flash
```

Set `AI_MODEL=google/gemini-2.5-flash` if you want to switch the active model to Gemini through the same gateway.

## Vercel Deploy

This app builds successfully for production with `next build` and is suitable for a hobby deployment on Vercel.

### 1. Required environment variables

Copy the keys from [`.env.example`](C:/Users/ujjwa/Desktop/z0/.env.example) into your Vercel project settings:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
DATABASE_URL=
E2B_API_KEY=
OPENAI_BASE_URL=https://api.aicredits.in/v1
OPENAI_API_KEY=
AI_MODEL=openai/gpt-4o-mini
GEMINI_MODEL=google/gemini-2.5-flash
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

Do not set `INNGEST_DEV=1` in production.

### 2. Service setup

- Create a Vercel project and import this repository.
- Add the environment variables in Vercel before the first production deploy.
- In Clerk, add your Vercel production domain to the allowed redirect / origin settings.
- In Inngest, connect the Vercel app or sync the app endpoint at `/api/inngest`.
- Make sure your Neon/Postgres database allows the Vercel deployment to connect using the `DATABASE_URL`.

### 3. Deploy

```bash
npm install -g vercel
vercel
vercel --prod
```

After deployment, open the app, sign in, create a project, and send one prompt to confirm Clerk, Prisma, Inngest, E2B, and the AI gateway are all working together.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
