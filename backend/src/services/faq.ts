// Frequently asked questions. One list, used in two places: the public FAQ page
// (served by GET /api/faq) and the Fennec chat's knowledge (services/appGuide.ts).
// Keep answers short, true for the app as it is today, and in step with plans.ts.

export interface FaqItem { q: string; a: string }
export interface FaqTopic { topic: string; items: FaqItem[] }

export const FAQ: FaqTopic[] = [
  {
    topic: 'Getting started',
    items: [
      { q: 'What is Fennec?', a: 'Fennec SI (short for Save & Invest) is a New Zealand app for saving and investing in one place: bank accounts, budgets, bills, savings goals, KiwiSaver and your share portfolio, with an AI assistant (the fox) that knows your numbers.' },
      { q: 'How do I sign in?', a: 'With your email and a password, a one-time sign-in link sent to your email, or your Google account.' },
      { q: 'I forgot my password.', a: 'On the sign-in page, choose "Forgot password?" and enter your email. Open the link in the email to choose a new password. You can also sign in with a one-time email link instead.' },
      { q: 'Where should I start?', a: 'The Getting started card on the Dashboard walks you through it: connect your bank, add your investments, set a budget, add a bill or goal, ask the fox a question, and check your security settings.' },
      { q: 'Is there a phone app?', a: 'Fennec runs in your phone\'s web browser. There isn\'t an App Store or Play Store app yet.' },
      { q: 'Fennec is in testing. What does that mean for me?', a: 'Most things work, but you may hit bugs or rough edges, and features are changing often. Use the Feedback button (bottom-left) to report anything broken or confusing.' },
    ],
  },
  {
    topic: 'Bank accounts and spending',
    items: [
      { q: 'How do I connect my bank?', a: 'Through Akahu, a New Zealand open-banking service, either during sign-up or later in Settings → Akahu Sync (tap "Not sure how? Show me step by step"). You create a free Akahu account, connect your bank there, then make a free "personal app" on Akahu\'s Developers page, which gives you two codes (an App ID Token and a User Access Token) to paste into Fennec. It takes about 10 minutes. Akahu asks you to set up an authenticator app, and it\'s easiest on a computer because you copy the codes between two websites. Each box shows a green tick when a code looks right. You can also add accounts by hand on the Accounts page.' },
      { q: 'Is connecting my bank safe?', a: 'Akahu gives Fennec read-only access: Fennec can see balances and transactions but can\'t move money or make payments. You never give Fennec your bank password, and you can revoke access at any time in Settings or through Akahu.' },
      { q: 'Which banks work?', a: 'Most major New Zealand banks and many investment platforms that Akahu supports. Akahu lists them when you connect.' },
      { q: 'Why aren\'t today\'s transactions showing?', a: 'Banks usually send new data to Akahu about once a day, so recent transactions can take until the next day to appear. Fennec checks for new data automatically during the day.' },
      { q: 'How do I categorise transactions?', a: 'On Transactions, pick a category for a transaction. Choose "create a rule" to categorise every matching transaction automatically, now and in future.' },
      { q: 'Why are some transactions already categorised?', a: 'Fennec keeps a shared list of common merchants, like Woolworths for Groceries or Z Energy for Transport, checked by the team before it\'s used. These show "auto" on the category. Your own rules always come first. If one\'s wrong, tap the category and choose "Not right? Stop matching", and Fennec won\'t use that match for you again.' },
      { q: 'How does the budget work?', a: 'On Budget, set a monthly limit for the categories you care about. Fennec compares this month\'s spending in each category against its limit.' },
      { q: 'Can Fennec show my home\'s value?', a: 'The Home Loan page looks up your property\'s council rating valuation (CV). For councils that publish their valuations as open data it appears automatically; for everyone else, upload your rates notice or revaluation letter and Fennec reads the CV off it. A CV is set every three years and isn\'t a market valuation. Recent sale prices aren\'t public data in New Zealand, so Fennec can\'t show them.' },
      { q: 'What are bills and goals?', a: 'Bills are recurring costs like power or insurance, with reminders before they\'re due. Goals are savings targets, with contributions you add as you save. Premium can also find bills in your Gmail, from the Email Inbox on the Bills page.' },
      { q: 'How does the Home Loan page work out my repayments?', a: 'If your home loan account is connected, Fennec reads its transactions: repayments coming in show how much and how often you pay (weekly, fortnightly or monthly), and the bank\'s interest charges show your actual rate. Without enough history it uses the details you enter in Edit. It then projects your payoff date and the interest still to pay.' },
      { q: 'What can the KiwiSaver page do?', a: 'It shows your balance (synced from your provider through Akahu, or entered by hand) and projects it to retirement, including employer and government contributions. A salary calculator works out your annual salary from an hourly rate or a pay amount before or after tax, and "What if" shows the effect of changing your contribution rate, fund or top-ups. Nothing in "What if" is saved.' },
    ],
  },
  {
    topic: 'Investing',
    items: [
      { q: 'How do I add my investments?', a: 'On My Portfolio, add holdings by hand, import a CSV or a screenshot from your broker, or sync supported platforms through Akahu.' },
      { q: 'Which markets are covered?', a: 'NZX, ASX and US shares and ETFs. Values are shown in NZD.' },
      { q: 'Are prices live?', a: 'Prices come from market data feeds and can be delayed, especially during trading hours. Don\'t use them to time trades.' },
      { q: 'What are Today\'s Picks and Discover?', a: 'AI-generated stock ideas: Today\'s Picks is a daily top 10, and Discover looks for less obvious opportunities. They\'re a starting point for your own research, not recommendations.' },
      { q: 'What is the Stock Analyzer signal?', a: 'An AI buy, hold or sell view on a holding, based on its price, valuation and recent movement, adjusted for the risk level you choose. It\'s general information, not advice.' },
      { q: 'How do price alerts work?', a: 'On Notifications, choose New alert, type a share code and pick the market. Many NZX codes are also a different US company (FPH is Fisher & Paykel Healthcare on the NZX but Five Point Holdings in the US), so Fennec shows every market the code is on, marked NZX, ASX or US, with the company name and price. The target is in that market\'s currency. Fennec checks price alerts about every 15 minutes and emails you when one is hit. Prices can be delayed by up to 20 minutes. Alerts made before markets were shown are on the US listing; delete and re-create them if you meant the NZX one.' },
      { q: 'What is portfolio verification?', a: 'A Premium feature: Fennec checks a statement from your broker, then gives your portfolio a verified badge and a place on the leaderboard.' },
    ],
  },
  {
    topic: 'The fox (Fennec AI)',
    items: [
      { q: 'What can the fox help with?', a: 'Questions about your spending, budget, goals, KiwiSaver and portfolio, NZ personal finance and investing in general, and how to use Fennec. It sees a summary of your own figures to answer.' },
      { q: 'Is the fox giving financial advice?', a: 'No. It gives general information and analysis, not regulated financial advice. For big decisions, talk to a licensed financial adviser.' },
      { q: 'Why did the fox say I\'ve hit a limit?', a: 'The free plan includes 10 AI uses a day, shared across the fox and other AI features. It resets each day. Premium has no daily limit.' },
      { q: 'Can the fox be wrong?', a: 'Yes. AI can make mistakes or misread figures. Check anything important before acting on it.' },
    ],
  },
  {
    topic: 'Plans',
    items: [
      { q: 'What does the free plan include?', a: 'Portfolio tracking for up to 10 holdings, bank sync, budgets, bills, goals, the KiwiSaver and home loan tools, the fox and other AI features up to 10 uses a day, previews of Discover, the community and partner sharing.' },
      { q: 'What does Premium add?', a: 'Unlimited AI and holdings, every Discover pick, Deep Dive research, AI post drafts, Gmail bill scanning, the Business section (invoices, GST and tax) and a verified portfolio badge.' },
      { q: 'How do I get Premium?', a: 'Premium isn\'t on sale yet. Press "Request Premium" (on any Premium feature, or in Settings) and the team will be in touch.' },
    ],
  },
  {
    topic: 'Sharing with a partner',
    items: [
      { q: 'How do I link with my partner?', a: 'In Settings, under Partner, create an invite link and send it to them. They open it, sign in to their own Fennec account (or create one), and accept.' },
      { q: 'What does my partner see?', a: 'Only what you choose. On Accounts, each account is Private (the default), Balance only, or Balance + transactions. Bills and goals you mark "Shared with partner" are visible to and editable by both of you. Everything else, including your budget, categories and investments, stays private.' },
      { q: 'How do I unlink?', a: 'In Settings, under Partner, choose Unlink. Either of you can do it, and every account goes back to Private straight away.' },
    ],
  },
  {
    topic: 'Privacy and security',
    items: [
      { q: 'Who can see my data?', a: 'Only you. Your data is stored under your account, and the database only lets a signed-in person read or change their own records. Other Fennec users can\'t see it. The exceptions are what you choose to share with a linked partner, and anything you post in Community.' },
      { q: 'Can the Fennec team see my finances?', a: 'The admin page shows only usernames, emails, plans and how many AI uses each account has made. It doesn\'t show anyone\'s accounts, transactions or portfolio.' },
      { q: 'Where is my data stored?', a: 'In Fennec\'s database, hosted by Supabase on Amazon Web Services in Sydney, Australia. Connections are encrypted. Bank and Gmail connection keys, IRD, GST and bank account numbers, and your home address are encrypted with a key kept separately from the database, so a copy of the database alone wouldn\'t show them. For KiwiSaver, Fennec keeps only the month and year you were born.' },
      { q: 'Why are my amounts showing as dots?', a: 'For your privacy, Fennec starts with your own dollar amounts hidden: balances, spending, bills, goals, KiwiSaver, home loan and portfolio values. Market figures, like share prices on Today\'s Picks, Discover, Watchlist, News and Events, always show. Tap the eye in the top bar to show your amounts; they stay shown until you close Fennec, or until you\'ve been away for 5 minutes. IRD, GST and bank account numbers, your home address and property title details stay hidden until you tap the eye next to them. You can change all of this in Settings → Security & privacy.' },
      { q: 'What security settings can I change?', a: 'In Settings → Security & privacy: hide amounts when Fennec opens, hide them again after 5 minutes away, hide personal details until tapped, and sign out after 15 minutes, 30 minutes (the default), 1 hour, 4 hours or never without activity. Everything starts on; turn down whatever gets in your way. Two-factor sign-in is set up just below. Encryption, read-only bank access and keeping your data private to you are always on and can\'t be turned off.' },
      { q: 'Why was I signed out?', a: 'Fennec signs you out after 30 minutes without activity, to protect your account if you leave a device unattended. You get a minute\'s warning first. Change the time, or turn it off, in Settings → Security & privacy.' },
      { q: 'Does Fennec sell my data?', a: 'No. Fennec doesn\'t sell data or use it for advertising.' },
      { q: 'What is sent to the AI?', a: 'When you use an AI feature, your question and a summary of the relevant figures are sent to the AI provider (Anthropic or Google) to produce the answer. Your password and bank login are never sent.' },
      { q: 'What do other users see on Community and the leaderboard?', a: 'Your posts and username. The leaderboard shows username and percentage performance only, never dollar amounts.' },
      { q: 'How do I make my account more secure?', a: 'Turn on two-factor sign-in in Settings. After that, signing in, and reading your data, needs a code from your authenticator app as well as your password. Keep the other settings in Settings → Security & privacy switched on, especially on a shared or work device, and use a strong password you don\'t use anywhere else.' },
      { q: 'How do I delete my account?', a: 'Settings, then Delete account. This permanently removes your data. If you\'re linked with a partner, bills and goals you shared stay with them.' },
    ],
  },
  {
    topic: 'Help',
    items: [
      { q: 'Something isn\'t working. What should I do?', a: 'Press the Feedback button in the bottom-left corner (or Send feedback in the account menu), describe what happened, and add a screenshot if you can. It goes straight to the team.' },
    ],
  },
];

/** The FAQ as plain text, for the chat's instructions. */
export const FAQ_TEXT = FAQ.map(t =>
  `${t.topic.toUpperCase()}\n` + t.items.map(i => `Q: ${i.q}\nA: ${i.a}`).join('\n'),
).join('\n\n');
