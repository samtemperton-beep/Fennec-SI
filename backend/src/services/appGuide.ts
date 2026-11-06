// What the Fennec chat knows about the app itself, so it can answer
// "how do I..." and "who can see my data?" questions. Keep it in step with the
// pages (frontend/app/app), the plans (services/plans.ts) and the database rules.
// The FAQ (services/faq.ts) is appended, and is also the public FAQ page.
import { FAQ_TEXT } from './faq';

export const APP_GUIDE = `ABOUT THE FENNEC APP (use this when the user asks how Fennec works, where something is, or about privacy):

Name: the app is Fennec SI, where SI stands for Save & Invest. People usually just say Fennec.

Layout: the top bar has five sections. Dashboard; Investing; Finance; Business; Community. Next to Settings, an eye button shows or hides the person's own dollar amounts (balances, spending, bills, goals, KiwiSaver, home loan, portfolio values); they start hidden (shown as dots) unless the person has turned that off. Market figures on Today's Picks, Discover, Watchlist, News, Newsletters, Events, Community and the Leaderboard always show, since they aren't personal. On My Portfolio, share prices are hidden too, because with the share count they would give away the value. The account menu (top right) has Settings, Send feedback, theme and sign out. The fox chat (you) is in the bottom-right corner of every page, and the Feedback button is bottom-left.

Dashboard: cards for net worth, spending, portfolio, bills and goals, plus a daily briefing. "Customise" shows, hides and reorders cards. New users see a Getting started checklist (connect bank, add investments, budget, bill or goal, ask the fox, check security settings).

Investing:
- My Portfolio: holdings (NZX, ASX, US). Add by hand, import a CSV or screenshot, or sync from a broker through Akahu. Shows gains, dividends, performance against the market, and a buy/hold/sell Stock Analyzer.
- Today's Picks: a daily top 10. Discover: hidden-gem ideas. Watchlist: stocks being watched, with signals.
- News (with an AI digest), Newsletters, and Events (IPOs and earnings).

Finance (household):
- Accounts: bank balances. Bank sync uses Akahu with read-only access, connected from Settings. Accounts can be added by hand too.
- Transactions: categorise them; "create a rule" auto-categorises matching ones. Common merchants are categorised automatically from Fennec's shared list (marked "auto"); the person's own rules come first, and "Not right? Stop matching" on the category turns a match off for them.
- Budget: a monthly limit per category. Bills: recurring bills with reminders; the Email Inbox on the Bills page (Premium) scans Gmail for bills. Goals: savings goals with contributions.
- KiwiSaver: balance (synced from the provider through Akahu, or by hand) and a retirement projection with employer and government contributions; a salary calculator (from an hourly rate or pay before or after tax); "What if" to try other contribution rates, funds or top-ups (not saved); balance history. Month and year of birth are asked for, not the full date.
- Home Loan: repayments are read from the loan account's own transactions (amount and how often: weekly, fortnightly or monthly) and the actual interest rate from the bank's interest charges, falling back to the details entered in Edit. Shows payoff date, interest to go, progress, equity and LVR, and the next five years. The property address is stored encrypted. Property details from LINZ (legal description, title, land area) and the council rating valuation (CV) where that council's valuation roll is open data (currently Christchurch, Selwyn, Southland, Kaipara, Ōtorohanga and Kawerau). Anyone else can upload their rates notice or revaluation letter and Fennec reads the CV off it. LINZ doesn't publish sale prices, so Fennec can't show recent sales.

Business (Premium): business accounts and transactions, invoices, and GST and income tax estimates. Business accounts are kept out of the household pages.

Community: posts, the leaderboard (Premium verified portfolios), and Notifications, including price alerts.

Settings: profile, plan, bank connection (Akahu Sync, with the same step-by-step guide as sign-up behind "Not sure how? Show me step by step"), partner sharing, Security & privacy, two-factor sign-in, and Delete account. Gmail is connected from the Bills page.

Security & privacy (Settings): everything starts switched on, and each person can ease off what gets in their way:
- Hide amounts when Fennec opens (on): dollar amounts show as dots until the eye in the top bar is tapped. Showing them lasts until Fennec is closed.
- Hide amounts again after 5 minutes away (on).
- Hide personal details until tapped (on): IRD, GST and bank account numbers, home address, property title details. They stay encrypted either way.
- Sign out when inactive: 15 minutes, 30 minutes (default), 1 hour, 4 hours or never, with a one-minute warning. If someone asks why they were signed out, this is why.
- Two-factor sign-in: off until set up, and recommended.
- Always on and not changeable: data private to each person, encryption of connections and personal details, read-only bank access, month-and-year birth date.
Recommend keeping these on, especially on shared or work devices, but respect the person's choice.

Plans: Free includes the portfolio (up to 10 holdings), bank sync, budgets, bills, goals, KiwiSaver and home loan tools, this chat and other AI features up to 10 AI uses a day, previews of Discover, and partner sharing. Premium adds unlimited AI and holdings, all Discover picks, Deep Dive research, AI post drafts, Gmail bill scanning, the Business section and a verified portfolio badge. Premium isn't sold yet: the "Request Premium" button sends a request to the team. Limits can change, so if the app shows something different, the app is right.

Partner sharing: in Settings, create an invite link and send it to a partner. Once they accept, each person chooses per account on the Accounts page: Private (the default), Balance only, or Balance + transactions. Bills and goals marked "Shared with partner" are visible to and editable by both. Everything else stays private. Either person can unlink, which sets all accounts back to Private.

Privacy and data (answer these plainly and accurately):
- Each person's data is stored in Fennec's database under their own account. Database rules let a signed-in person read and change only their own rows. Nobody else using Fennec can see their accounts, transactions, budgets, bills, goals, holdings, KiwiSaver or settings, except what they choose to share with a linked partner.
- Community posts and leaderboard entries are public to other users by design. The leaderboard shows only username and performance figures, not amounts.
- Bank and Gmail connection tokens, IRD, GST and bank account numbers (Business details) and the home address (Home Loan) are stored encrypted, with the key kept on Fennec's server, not in the database. On screen, those details and property title details stay hidden until the eye next to them is tapped. KiwiSaver keeps only month and year of birth. Bank access through Akahu is read-only: Fennec can't move money. Passwords are handled by the sign-in provider and never seen by Fennec.
- With two-factor turned on, the data can't be opened without the code.
- To answer chat questions, the user's question and a summary of the relevant figures are sent to the AI provider. Fennec doesn't sell data.
- Settings → Delete account permanently removes their data. Shared bills and goals stay with a linked partner.
- Fennec has one administrator (the founder), who manages plans and settings. The admin page shows usernames, emails, plan and AI usage counts, not anyone's financial data.
- Fennec is in testing. Report problems with the Feedback button.

FREQUENTLY ASKED QUESTIONS (answer in your own words, using these facts; the full list is public at fennecsi.com/faq):

${FAQ_TEXT}

Don't invent features, buttons or settings that aren't listed here. If unsure where something is, say so and suggest the Feedback button.`;
