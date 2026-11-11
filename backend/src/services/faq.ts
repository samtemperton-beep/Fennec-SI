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
      { q: "My KiwiSaver provider won't connect through Akahu (it asks me to turn off two-factor).", a: "Some providers, like Generate, can only be connected by Akahu if two-factor sign-in is off on your provider account, and some won't let you turn it off. Keep it on: instead, open the KiwiSaver page, choose Edit, then Read a screenshot. Upload a screenshot of your balance from your provider's app or website, or a statement, and Fennec fills in your provider, fund and balance for you to check and save. The image isn't kept. Do it again whenever you'd like to update your balance." },
      { q: 'How do I set or change my password?', a: "Settings → Password. Enter a new password twice and save. It works if you signed up with Google or an email link too, and adds a password so you can also sign in with your email. Passwords are stored scrambled, so nobody can show you your current one; if you've forgotten it, just set a new one." },
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
      { q: "Why aren't today's transactions showing?", a: "Two reasons. Akahu fetches from your bank about once a day, and Fennec then checks Akahu every few hours. And banks only share a card purchase once it has settled, usually 1 to 3 working days later, so pending purchases don't show yet. Settings → Akahu Sync → Connection health shows when Akahu last heard from each bank, and has a button to ask Akahu to fetch now." },
      { q: "My transactions have stopped updating. What do I check?", a: "Open Settings → Akahu Sync and look at Connection health. It tells you what's wrong and what to do: a bank that needs reconnecting at my.akahu.nz (banks ask you to sign in again from time to time), tokens Akahu no longer accepts (save fresh ones from my.akahu.nz/developers), or a bank Akahu hasn't heard from lately (tap Ask Akahu to fetch now, then Sync a few minutes later). You can also ask the fox, which can see the same health check. If it still doesn't make sense, tap Send a report to the Fennec team." },
      { q: 'How do I categorise transactions?', a: 'On Transactions, pick a category for a transaction. Fennec then offers a rule: a word or two from the description, like "pak n save". It shows how many other transactions contain it, and saving the rule categorises those and every new one from then on. Tick "Also change the ones already in another category" to move those too. Use a short keyword that appears in every version of the description, without the branch name or reference numbers.' },
      { q: 'Where do interest and withholding tax go?', a: 'In the Interest and Withholding tax categories. Interest is what your bank pays you; withholding tax (RWT) is the tax your bank takes off it before you get it. Fennec puts them there automatically when the bank says "credit interest" or "withholding tax"; for other wording, pick the category once and save the rule.' },
      { q: 'What does the Savings page show?', a: 'Finance → Savings has two parts, switched at the top: Growth and Goals. Growth shows your savings and term deposit accounts, the interest they paid over the last year and the RWT taken, the rate that works out to, and how much you add each month. It projects your savings 5 or 10 years ahead from what you add (weekly, fortnightly or monthly), your interest rate and your RWT rate, and compares savings, investing and KiwiSaver on one chart: total wealth, or what each earns a year. Your choices are saved. It\'s an estimate, not a forecast, and general information, not financial advice.' },
      { q: 'Why are some transactions already categorised?', a: 'Fennec keeps a shared list of common merchants, like Woolworths for Groceries or Z Energy for Transport, checked by the team before it\'s used. These show "auto" on the category. Your own rules always come first. If one\'s wrong, tap the category and choose "Not right? Stop matching", and Fennec won\'t use that match for you again.' },
      { q: 'How does the budget work?', a: "On Budget, the Monthly budget section has a limit for each spending category, compared with what you've spent this month. Income (Income, Interest and any income categories you make) has its own section: set what you expect each month and see what has come in. Income is never counted in your budget, and Fennec shows how much of your expected income is left unbudgeted." },
      { q: 'How do I work out what to budget?', a: "On Budget, press Suggest budgets. From my spending averages what you spent in each category over your last full months. A few questions asks how many adults and children are in your household, your take-home pay, your rent or mortgage and whether you run a car, and gives rough starting points from typical New Zealand costs, trimmed to fit your pay. Untick any you don't want, change the amounts, then save." },
      { q: 'Where do goal ideas come from?', a: "On Finance → Savings → Goals, Goal ideas suggests goals from what you said you're working towards, your age range and your spending: for example an emergency fund of three months' spending, clearing a credit card, or a first home deposit. Add one with a tap and change the amount or date. Ask Fennec for ideas opens the fox to talk them through." },
      { q: 'Can I make my own categories?', a: "Yes. Choose New category when you pick a category for a transaction, or on the Budget page. Give it a name and say whether it's spending or income." },
      { q: 'Can Fennec show my home\'s value?', a: 'The Home Loan page looks up your property\'s council rating valuation (CV). For councils that publish their valuations as open data it appears automatically; for everyone else, upload your rates notice or revaluation letter and Fennec reads the CV off it. Both are saved, so you only do this once; upload a newer notice after your council revalues. A CV is set every three years and isn\'t a market valuation. Recent sale prices aren\'t public data in New Zealand, so Fennec can\'t show them.' },
      { q: 'What are bills and goals?', a: 'Bills are recurring costs like power or insurance, with reminders before they\'re due. Goals are savings targets, with contributions you add as you save. They are under Finance → Savings → Goals. Premium can also find bills in your Gmail, from the Email Inbox on the Bills page.' },
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
      { q: 'What notifications does Fennec send?', a: "Bills due in the next two days, budgets that are 90% used or over, goals reached or past their date, overdue invoices, bank connections that need fixing, price alerts, big moves in your holdings, watchlist AI ratings, earnings dates, and replies to your community posts. They appear on the bell at the top of every page and on the Notifications page. Each kind can be switched off in Notifications → Preferences." },
      { q: 'How do I change or stop Fennec emails?', a: "Emails are off unless you turn them on. Choose in Settings → Email updates, or Notifications → Preferences: a Weekly round-up on Monday mornings, a Daily morning summary at about 7am, or As things happen. Price alerts are emailed straight away unless emails are off. Emails include amounts, such as what a bill is for." },
      { q: 'What are Wins, points and badges?', a: "Budget → Wins. You earn points for each week (Monday to Sunday) your spending stays under budget, each month under budget, and each week you keep a pledge, plus badges for milestones like a 4-week streak or your first goal reached. Points build your level, from Kit up to Golden Fox. Fennec checks for new wins every morning. Spending counts against your budget when it's in a budgeted category, so keep transactions sorted." },
      { q: 'What is a pledge?', a: "Budget → Pledges. A pledge is somewhere you've decided not to spend, like Lotto, betting, Uber Eats or buy now, pay later. Pick one or make your own with words that appear on your bank statement. Fennec shows what you spent there in the last 3 months, then checks new transactions: if spending there turns up, you get a notification (and your buddy does, if you have one). Each day without a slip builds your streak." },
      { q: 'What is an accountability buddy, and what can they see?', a: "A friend you invite by email on Budget → Pledges. They have to accept, and if they aren't on Fennec yet they can sign up free with that email. Once they accept, they see your pledges, how many days you've kept each one, your level and streak, and get a heads-up when you slip. You choose whether they also see slip amounts, budgets you go over (category names only) and goals that pass their date. They never see your accounts, balances or other spending. Either of you can end it at any time." },
      { q: 'How do price alerts work?', a: 'On Notifications → Price alerts, choose New alert, type a share code and pick the market. Many NZX codes are also a different US company (FPH is Fisher & Paykel Healthcare on the NZX but Five Point Holdings in the US), so Fennec shows every market the code is on, marked NZX, ASX or US, with the company name and price. The target is in that market\'s currency. Fennec checks price alerts about every 15 minutes and emails you when one is hit, unless emails are turned off. Prices can be delayed by up to 20 minutes. Alerts made before markets were shown are on the US listing; delete and re-create them if you meant the NZX one.' },
      { q: 'What is the overseas shares (FIF) card?', a: "On My Portfolio, it adds up roughly what you paid for your overseas shares in NZ dollars and shows how close that is to the NZ$50,000 limit, under which individuals don't have to use the foreign investment fund (FIF) tax rules. Budget 2026 proposed raising the limit to NZ$100,000, which isn't law yet, so both are shown. NZX shares don't count, and ASX shares are listed separately because some are exempt. It uses today's exchange rate, so it's approximate. General information, not tax advice." },
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
      { q: 'Can the Fennec team see my finances?', a: "The admin page shows only usernames, emails, plans, how many AI uses each account has made, and community posts that have been reported. It doesn't show anyone's accounts, transactions or portfolio." },
      { q: 'Where is my data stored?', a: 'In Fennec\'s database, hosted by Supabase on Amazon Web Services in Sydney, Australia. Connections are encrypted. Bank and Gmail connection keys, IRD, GST and bank account numbers, and your home address are encrypted with a key kept separately from the database, so a copy of the database alone wouldn\'t show them. For KiwiSaver, Fennec keeps only the month and year you were born.' },
      { q: 'Why are my amounts showing as dots?', a: 'For your privacy, Fennec starts with your own dollar amounts hidden: balances, spending, bills, goals, KiwiSaver, home loan and portfolio values. Market figures, like share prices on Today\'s Picks, Discover, Watchlist, News and Events, always show. Tap the eye in the top bar to show your amounts; they stay shown until you close Fennec, or until you\'ve been away for 5 minutes. IRD, GST and bank account numbers, your home address and property title details stay hidden until you tap the eye next to them. You can change all of this in Settings → Security & privacy.' },
      { q: 'What security settings can I change?', a: 'In Settings → Security & privacy: hide amounts when Fennec opens, hide them again after 5 minutes away, hide personal details until tapped, and sign out after 15 minutes, 30 minutes (the default), 1 hour, 4 hours or never without activity. Everything starts on; turn down whatever gets in your way. Two-factor sign-in is set up just below. Encryption, read-only bank access and keeping your data private to you are always on and can\'t be turned off.' },
      { q: 'Why was I signed out?', a: 'Fennec signs you out after 30 minutes without activity, to protect your account if you leave a device unattended. You get a minute\'s warning first. Change the time, or turn it off, in Settings → Security & privacy.' },
      { q: 'Does Fennec sell my data?', a: 'No. Fennec doesn\'t sell data or use it for advertising.' },
      { q: 'What is sent to the AI?', a: 'When you use an AI feature, your question and a summary of the relevant figures are sent to the AI provider (Anthropic or Google) to produce the answer. Your password and bank login are never sent.' },
      { q: 'What do other users see on Community and the leaderboard?', a: 'Your username, avatar, badges, whether your portfolio is verified, and the posts and replies you publish. The leaderboard shows username and percentage performance only, never dollar amounts.' },
      { q: 'How do I report a post or block someone?', a: "Tap the flag on a post or reply to report it. Reports are anonymous and go to the Fennec team, and a post reported by several people is hidden until we have looked at it. To block someone, tap their name, then Block: you won't see their posts or replies, and their replies won't notify you." },
      { q: 'Is Community financial advice?', a: "No. Posts are members' own opinions, not financial advice, and Fennec doesn't check them. Do your own research before you invest, and be wary of anyone talking up a share they might sell." },
      { q: 'How do I make my account more secure?', a: 'Turn on two-factor sign-in in Settings. After that, signing in, and reading your data, needs a code from your authenticator app as well as your password. Keep the other settings in Settings → Security & privacy switched on, especially on a shared or work device, and use a strong password you don\'t use anywhere else.' },
      { q: 'How do I delete my account?', a: 'Settings, then Delete account. This permanently removes your data. If you\'re linked with a partner, bills and goals you shared stay with them.' },
    ],
  },
  {
    topic: 'Help',
    items: [
      { q: 'Something isn\'t working. What should I do?', a: 'Press the Feedback button in the bottom-left corner (or Send feedback in the account menu), describe what happened, and add a screenshot if you can. It goes straight to the team.' },
      { q: 'Can the fox help with technical problems?', a: "Yes. Ask it things like \"why aren't my transactions updating?\" It can see your bank connection health (when each bank last sent data, and any errors) and knows the common fixes. It can't see inside your Akahu or bank accounts, or change anything for you." },
      { q: 'What does a connection report send?', a: "Only if you press Send a report (Settings → Akahu Sync): your username and email, which banks and accounts are connected, their connection status, when Akahu last got data from each bank, the date of your newest transaction in each, any error messages, and your note. No balances, transactions or tokens. The team replies by email." },
    ],
  },
];

/** The FAQ as plain text, for the chat's instructions. */
export const FAQ_TEXT = FAQ.map(t =>
  `${t.topic.toUpperCase()}\n` + t.items.map(i => `Q: ${i.q}\nA: ${i.a}`).join('\n'),
).join('\n\n');
