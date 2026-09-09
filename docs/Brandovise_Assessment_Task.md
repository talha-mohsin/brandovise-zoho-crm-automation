# Technical Assessment — CRM & Automation Developer

**Brandovise GmbH** · Tariq Road, Karachi

Time allowed: **7 days** from the date you receive this

---

## 1. The scenario

Brandovise builds CRM and automation systems for German insurance and finance brokers.

A broker approaches us in a very common situation. Their customer and contract data lives in spreadsheets exported from an old system. They want it in **Zoho CRM**, and they want their agents to work from a simple web tool rather than from Zoho's own screens.

What they ask for:

> *"Get our customers and their contracts into Zoho. Then give the team one screen where they can see which contracts are running out, set a follow-up, and add a new contract when a customer signs — without having to learn Zoho itself."*

That is the task. Two CSV files are attached:

- **`kontakte_export.csv`** — 30 customers
- **`vertraege_export.csv`** — 53 contracts, each referencing a customer by `Kundennummer`

Names and figures are fictional.

---

## 2. Before you start — your Zoho environment

Sign up for a **Zoho One 30-day free trial**:
👉 https://www.zoho.com/one/signup.html

No credit card required. It includes Zoho CRM with custom modules and full API access, which is everything this task needs. This is the environment our clients actually run.

Use **your own** account. You will not be given access to any Brandovise or client system.

Two practical notes that will save you time:

- **Data centre.** Zoho runs separate data centres (`.com`, `.eu`, `.in`, and others). Your API base URL and your OAuth token URL must both match the one your account was created in. This is the single most common cause of first-time integration failures.
- **The clock.** Your trial lasts 30 days and **your environment must still be working at the interview**, so you can demo it live. Start early.

---

## 3. What to build

### Part 1 — Model the data in Zoho CRM

Set up the structure that will hold this data:

- Customers belong in a suitable module — use the standard **Contacts** module or justify a different choice.
- Contracts need a **custom module**, with fields appropriate to what is in the file.
- A contract must be **linked to its customer**, so that opening a customer in Zoho shows their contracts. Use a lookup relationship — do not just copy the customer's name into a text field.
- Include a field that records whether a renewal follow-up has already been created for that contract.

You may create the module and fields through the Zoho UI or through the API — your choice.

### Part 2 — Import, driven from your web app

**The import must run from your web application, not from a script you run on your laptop and not from Zoho's import screen.** We want to see a person using a browser to get this data into Zoho.

Your app must:

1. Accept both CSV files (upload, or read them from the repo — your choice, but the user triggers it).
2. **Show a preview before anything is written** — how many customers and contracts were read, and what will be created.
3. **Report problems it found in the data**, clearly enough that a non-technical person could understand what needs deciding.
4. On confirmation, create the records in Zoho **through the API**, customers first, then contracts linked to the right customer.
5. Show a result summary — what was created, what was skipped, and why.

Running the import twice should not silently produce two copies of everything. How you prevent that is your decision; explain it in your README.

### Part 3 — The contract console

One screen the broker's team works from. Framework is entirely your choice. Visual design is not assessed — clarity and whether it works are.

**It must show:**

- All contracts, with the customer's name and contact details visible
- A filter by **Makler** (the responsible agent)
- A filter or selector for **expiry window** — for example contracts ending in the next 30 / 90 / 180 days
- A clear visual indication of urgency, so the most pressing contracts stand out
- Which contracts already have a renewal follow-up, distinguished from those that do not

**It must do — this is the heart of the task:**

**Create a renewal follow-up.** A button on a contract creates a **Task in Zoho CRM**:
- A sensible subject, e.g. `Renewal call — Müller, Andreas (VN-2021-0417)`
- Due **30 days before** the contract's expiry date
- Linked to the contract record, and to the customer
- Assigned to the responsible Makler

Then update the contract record in Zoho to record that the follow-up exists, and reflect both changes in the UI **without a full page reload**.

A read-only dashboard does not meet the brief. This action must write real data into Zoho, and your interface must stay in step with what Zoho returns.

### Part 4 — Security

Your Zoho **client secret and refresh token must stay server-side**. They must never be reachable from the browser, and they must not be committed to your repository.

### Part 5 — Deploy it

Deploy the application somewhere publicly reachable — Render, Railway, Fly.io, Vercel or similar. Free tiers are expected and completely fine.

**Send us a URL we can open.** If it does not load when we click it, the task is not complete.

---

## 4. About the data

These are realistic exports, not clean samples. Read them properly before you write your parser.

Both files contain inconsistencies. **Finding them is part of the task.** Some are obvious, some are not. For each one, decide how to handle it and **write down what you decided and why**.

We would much rather see a submission that catches the problems and makes defensible choices — even conservative ones, like refusing to import a row and flagging it for a human — than one that imports everything and quietly produces wrong data. In real projects, silent data corruption is the expensive kind.

---

## 5. Optional extras

Only if everything above is finished and working. Three solid parts beat six broken ones.

- Bulk action: create follow-ups for everything expiring within 30 days in one click
- A short German talking point per renewal, generated with an LLM, for the agent to use on the call
- An overview per Makler: how many contracts they hold, total annual premium, how many need attention
- Editing an existing contract from your app

---

## 6. What to send us

1. **The live URL.**
2. **Your code**, as a Git repository — public, or shared with us.
3. **A README** covering:
   - How to run it locally
   - How you handled Zoho authentication, and where the secrets live
   - How you modelled Contacts and Contracts in Zoho, and why
   - How you linked contracts to customers
   - What you found wrong in each CSV, and what you decided to do about it
   - How you handled the import being run more than once
   - What you would do differently with more time
4. **A screen recording of about 5 minutes** (Loom or similar) walking through the running application and your code. Please show your face and talk through your reasoning — not a silent screen capture.

---

## 7. Rules

- This is an **unpaid assessment task**. Completing it does not guarantee an offer.
- Use **your own** Zoho account and your own infrastructure.
- Use **only the attached data**. It is synthetic.
- **You may use ChatGPT, Claude or any other AI tool.** We use them every day and have no objection at all.
  What we ask is that you do not hand the task to someone who already knows these systems. You will be asked to explain your decisions in the walkthrough and at the interview, so the work needs to be genuinely yours.
- **Questions are welcome at any point.** Asking a good question is a positive signal, not a negative one. If something in this brief is ambiguous, tell us how you interpreted it and carry on — that is what we would want on a real project.

---

## 8. How we assess it

| Area | What we look for |
|---|---|
| **Data model** | Sensible modules and fields; a real lookup relationship between contract and customer; reasoning you can defend |
| **Import** | Runs from the browser; previews before writing; reports problems clearly; safe to run twice |
| **Write operations** | Task creation and the contract update genuinely work; failures are surfaced, not swallowed |
| **The console** | Expiring contracts are obvious at a glance; filters behave; the UI stays in step with Zoho |
| **Authentication** | OAuth working with token refresh; secrets server-side and out of the repo |
| **Data judgement** | You found the problems in the files and made defensible decisions |
| **Deployment** | It is live, and it stays up |
| **Communication** | README and walkthrough explain the *why*, not just the *what* |

We are not expecting a flawless submission in a week. We want to see how you think, what you prioritise when time is short, and how clearly you can explain your reasoning — because that is most of what this job actually is.

Good luck.

**Jibran Shahid** · Automation & AI Consultant
jshahid@brandovise.com · www.brandovise.com
