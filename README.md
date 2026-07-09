# PlayTonight

PlayTonight is a fast and simple utility to find common multiplayer games among a group of friends on Steam. No more asking "what do you guys have installed?" for an hour in Discord.

## Features

- **Instant Game Matching**: Enter up to 5 Steam profiles or URLs to instantly see which games you all own.
- **Pile of Shame**: See how many games your group owns collectively but has never played.
- **Top Player Stats**: Discover who has the most playtime and who is the biggest "carry" in specific games.
- **Discord Integration**: Generate an instant text summary to copy-paste into your Discord server and rally the squad.

## Screenshots

*(To be added: Drop a screenshot of the main dashboard here)*

*(To be added: Drop a screenshot of the game collection grid here)*

## Getting Started

1. Clone this repository
2. Install dependencies with `npm install`
3. Create a `.env.local` file and add your Steam Web API Key:
   ```
   STEAM_API_KEY=your_key_here
   ```
4. Run the development server: `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Tech Stack

- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Framer Motion](https://www.framer.com/motion/)
- Steam Web API

## Contributing

Contributions, issues and feature requests are welcome. Feel free to check issues page if you want to contribute.

## License

This project is licensed under the MIT License.
