# Red Dragons

Crew site for **discord.gg/reddragons**. Deploys to Render as a Node web service.

## What's in it

- **Live member + online counts** — pulled from Discord's invite API via a server-side proxy (browsers can't hit Discord directly, CORS).
- **War Teams** — Z / Y / X / A, each color-coded, each with captain + record.
- **Roles** — 8 role cards (IGL, Fragger, Sniper, Support, Flex, Grinder, Scout, Recruiter) + rank ladder.
- **Wars / Clips / Events** — full sections.
- One static page, no framework, no build step for the frontend.

## Local dev

```bash
npm install
npm start
# http://localhost:3000
